import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectMigrationDependencyInventory } from "./migration-dependency-inventory.mjs";
import { readProvenanceInputs } from "./migration-baseline-provenance.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const inspect = (canonical, extra = {}) => inspectMigrationDependencyInventory({ canonical, ...extra });
const row = (name, sql) => ({ name, sql });
const byName = (report, name) => report.relations.find((r) => r.relation === `public.${name}`);

test("walks all files in replay order, with exact file-level first use and earlier creations", () => {
  const report = inspect([
    row("20260103_use.sql", "select * from t; alter table missing add column x int;"),
    row("20260101_create.sql", "create table t (id uuid);"),
    row("20260102_use.sql", "insert into t values (1);"),
  ]);
  assert.equal(report.inventoryComplete, true);
  assert.deepEqual(report.migrations.map((m) => m.name), ["20260101_create.sql", "20260102_use.sql", "20260103_use.sql"]);
  assert.deepEqual(byName(report, "t").firstUse, { file: "20260102_use.sql", index: 1 });
  assert.equal(byName(report, "t").uses[0].availability, "earlier_canonical_creation");
  assert.equal(byName(report, "t").potentialMissingBaseline, false);
  assert.equal(byName(report, "missing").potentialMissingBaseline, true);
  assert.equal(report.replayReady, false);
  assert.equal(report.fullReplayValidated, false);
});

test("separates deferred first use from immediate first use and later canonical providers", () => {
  const report = inspect([
    row("20260101_fn.sql", "create function f() returns int language plpgsql as $$ begin perform 1 from late; perform 1 from absent; end $$;"),
    row("20260102_create.sql", "create table late (id uuid);"),
    row("20260103_use.sql", "select * from late; select * from absent;"),
  ]);
  const late = byName(report, "late");
  assert.deepEqual(late.firstDeferredUse, { file: "20260101_fn.sql", index: 0 });
  assert.deepEqual(late.firstImmediateUse, { file: "20260103_use.sql", index: 2 });
  assert.equal(late.deferredDependencyReview, true);
  assert.equal(late.potentialMissingBaseline, false);
  assert.deepEqual(late.canonicalProviders.map((p) => p.file), ["20260102_create.sql"]);
  assert.equal(byName(report, "absent").potentialMissingBaseline, true);
});

test("reports all legacy and baseline candidates without treating any as applied", () => {
  const report = inspect([row("20260102_use.sql", "select * from x; select * from unknown;")], {
    legacy: [row("20260101_b.sql", "create table x (id uuid);"), row("20251201_a.sql", "create table if not exists x (id uuid);")],
    candidates: [{ path: "base.sql", sql: "create table x (id uuid);" }, { path: "absent.sql", sql: null }],
  });
  const x = byName(report, "x");
  assert.equal(x.potentialMissingBaseline, true);
  assert.deepEqual(x.legacyProviders.map((p) => p.file), ["20251201_a.sql", "20260101_b.sql"]);
  assert.deepEqual(x.baselineProviders.map((p) => p.path), ["base.sql"]);
  assert.equal(x.uses[0].availability, "no_canonical_creation_yet");
  assert.deepEqual(byName(report, "unknown").legacyProviders, []);
  assert.deepEqual(byName(report, "unknown").baselineProviders, []);
  assert.equal(report.baselineCandidates.find((c) => c.path === "absent.sql").present, false);
});

test("same-file creation is explicitly uncertain, including read-before-create and self references", () => {
  const report = inspect([row("20260101_same.sql", "select * from t; create table t (id uuid, parent uuid references t(id));")]);
  const t = byName(report, "t");
  assert.equal(t.uses[0].availability, "same_file_creation_order_unchecked");
  assert.equal(t.sameFileOrderReview, true);
  assert.match(report.limitations.join(" "), /statement order/);
});

test("a later view provider cannot satisfy an earlier immediate reference", () => {
  const report = inspect([
    row("20260101_use.sql", "select * from late_view;"),
    row("20260102_view.sql", "create view late_view as select 1;"),
  ]);
  const relation = byName(report, "late_view");
  assert.equal(relation.potentialMissingBaseline, true);
  assert.deepEqual(relation.canonicalProviders, [{ file: "20260102_view.sql", index: 1, ifNotExists: false }]);
  assert.deepEqual(relation.firstImmediateUse, { file: "20260101_use.sql", index: 0 });
});

test("DO-block references retain shared-parser uncertainty instead of claiming DDL validity", () => {
  const report = inspect([row("20260101_do.sql", "do $$ begin perform 1 from missing_in_do; end $$;")]);
  const relation = byName(report, "missing_in_do");
  assert.equal(relation.firstImmediateUse, null);
  assert.equal(relation.deferredDependencyReview, true);
  assert.match(report.limitations.join(" "), /immediate DO blocks/);
  assert.equal(report.fullReplayValidated, false);
});

test("the bounded scan refuses excessive source counts without a partial success", () => {
  const report = inspect(Array.from({ length: 2049 }, (_, i) => row(`20260101_${i}.sql`, "")));
  assert.equal(report.inventoryComplete, false);
  assert.deepEqual(report.migrations, []);
  assert.equal(report.blockers[0].code, "inventory_input_refused");
});

test("ignores comments, literals, CTE names, set-returning functions and non-public relations", () => {
  const report = inspect([row("20260101_use.sql", `
    -- select * from comment_secret;
    /* alter table ghost add column x int; */
    select 'literal_secret from ghost2';
    with local_rows as (select 1) select * from local_rows;
    select * from generate_series(1, 2);
    select * from auth.users;
    select * from public.real_rows;
  `)]);
  assert.deepEqual(report.relations.map((r) => r.relation), ["public.real_rows"]);
  assert.deepEqual(report.excludedSchemas, ["auth"]);
  assert.ok(!JSON.stringify(report).includes("literal_secret"));
  assert.ok(!JSON.stringify(report).includes("comment_secret"));
});

test("empty input and refused pinned ordering never produce a complete inventory", () => {
  for (const canonical of [[], [row("20260520_media_images.sql", "select 1;")], [row("x.sql", ""), row("x.sql", "")]]) {
    const report = inspect(canonical);
    assert.equal(report.inventoryComplete, false);
    assert.equal(report.replayReady, false);
    assert.equal(report.migrations.length, 0);
    assert.ok(report.blockers.length > 0);
  }
});

test("input order does not change deterministic JSON", () => {
  const canonical = [row("20260102_b.sql", "select * from a;"), row("20260101_a.sql", "create table a (id uuid);")];
  const legacy = [row("20250102_b.sql", "create table a (id uuid);"), row("20250101_a.sql", "create table a (id uuid);")];
  const candidates = [{ path: "b.sql", sql: null }, { path: "a.sql", sql: "create table a (id uuid);" }];
  assert.equal(JSON.stringify(inspect(canonical, { legacy, candidates })),
    JSON.stringify(inspect([...canonical].reverse(), { legacy: [...legacy].reverse(), candidates: [...candidates].reverse() })));
});

test("repository inventories all 174 canonical files, including dependencies after the early provenance window", () => {
  const inputs = readProvenanceInputs(repo);
  const report = inspectMigrationDependencyInventory(inputs);
  assert.equal(inputs.canonical.length, 174);
  assert.equal(report.inventoryComplete, true);
  assert.equal(report.migrations.length, 174);
  assert.equal(new Set(report.migrations.map((m) => m.name)).size, 174);
  assert.equal(report.migrations[0].name, "20260520_media_tables.sql");
  assert.deepEqual(report.migrations.map((m) => m.name).sort(), inputs.canonical.map((m) => m.name).sort());
  const insights = byName(report, "media_insights");
  assert.equal(insights.firstUse.file, "20260602_atlas_bi_foundation.sql");
  assert.ok(insights.legacyProviders.some((p) => p.file === "20260601_media_insights.sql"));
  const config = byName(report, "platform_config");
  assert.deepEqual(config.firstUse, { file: "20260831_budget_scopes.sql", index: 69 });
  assert.deepEqual(config.legacyProviders.map((p) => p.file), ["20260528_pass_a_safeguards.sql"]);
  assert.deepEqual(config.baselineProviders, []);
  assert.equal(config.potentialMissingBaseline, true);
  assert.ok(report.limitations.some((s) => /columns/.test(s)));
  assert.equal(report.replayReady, false);
  assert.equal(report.fullReplayValidated, false);
});

test("CLI emits deterministic metadata-only JSON without a readiness claim", () => {
  const script = resolve(repo, "apps/web/scripts/migration-dependency-inventory.mjs");
  const output = execFileSync(process.execPath, [script], { encoding: "utf8" });
  const report = JSON.parse(output);
  assert.equal(report.inventoryComplete, true);
  assert.equal(report.migrations.length, 174);
  assert.equal(report.replayReady, false);
  assert.equal(output, execFileSync(process.execPath, [script], { encoding: "utf8" }));
});
