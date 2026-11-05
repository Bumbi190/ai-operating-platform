import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readProvenanceInputs } from "./migration-baseline-provenance.mjs";
import { BASELINE_FIXTURE, planCanonicalBootstrap, SUPPLEMENTAL_FIXTURES } from "./migration-bootstrap-plan.mjs";
import { sha256 } from "./migration-replay-preflight.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const inputs = readProvenanceInputs(repo);
const codes = (plan) => plan.blockers.map((b) => b.code).sort();

test("repository: canonical bootstrap needs an interleaved legacy fixture, so no preexisting baseline exists", () => {
  const plan = planCanonicalBootstrap(inputs);
  assert.equal(plan.ok, false);
  assert.equal(plan.replayReady, false);
  assert.equal(plan.executionValidated, false);
  assert.match(plan.disclaimer, /not clean-bootstrap or production readiness evidence/);

  const byPath = Object.fromEntries(plan.fixtures.map((f) => [f.path, f]));
  assert.deepEqual(Object.keys(byPath).sort(), [
    "supabase/migrations/20260528_pg_cron_setup.sql",
    "supabase/migrations/20260601_media_insights.sql",
    "supabase/migrations/20260609_dream_issues_ledger.sql",
  ]);
  const cron = byPath["supabase/migrations/20260528_pg_cron_setup.sql"];
  assert.deepEqual([cron.provides, cron.requires, cron.preexisting, cron.supplemental], [["omnira_cron"], [], true, false]);
  const insights = byPath["supabase/migrations/20260601_media_insights.sql"];
  assert.deepEqual(insights.provides, ["media_insights"]);
  assert.deepEqual(insights.requires, ["media_scripts", "projects"]);
  assert.equal(insights.preexisting, false);
  assert.equal(insights.after, "20260520_media_tables.sql");
  // Pinned post-window fixture: unmodified legacy SQL, placed before the canonical backfill that reads it.
  const dream = byPath["supabase/migrations/20260609_dream_issues_ledger.sql"];
  assert.equal(dream.supplemental, true);
  assert.equal(dream.lfSha256, SUPPLEMENTAL_FIXTURES[0].lfSha256);
  assert.equal(dream.lfSha256, sha256(inputs.legacy.find((f) => f.name === "20260609_dream_issues_ledger.sql").sql));
  assert.deepEqual(dream.provides, ["dream_issues"]);
  assert.deepEqual(dream.requires, ["manager_tasks", "memories", "projects"]);
  assert.deepEqual([dream.position, dream.preexisting], [0, true]);

  // Every canonical file appears exactly once, unmodified, in replay order; fixtures are hashed sources.
  const canonicalSteps = plan.sequence.filter((s) => s.kind === "canonical");
  assert.equal(canonicalSteps.length, inputs.canonical.length);
  for (const step of canonicalSteps)
    assert.equal(step.lfSha256, sha256(inputs.canonical.find((m) => m.name === step.name).sql));
  assert.deepEqual(plan.sequence[0], {
    kind: "fixture",
    path: BASELINE_FIXTURE,
    lfSha256: sha256(inputs.candidates.find((c) => c.path === BASELINE_FIXTURE).sql),
  });
  const at = (pred) => plan.sequence.findIndex(pred);
  assert.ok(at((s) => s.path === cron.path) < at((s) => s.name === "20260520_media_tables.sql"));
  assert.ok(at((s) => s.name === "20260520_media_tables.sql") < at((s) => s.path === insights.path));
  assert.ok(at((s) => s.path === insights.path) < at((s) => s.name === "20260602_atlas_bi_foundation.sql"));
  assert.ok(at((s) => s.path === dream.path) < at((s) => s.name === "20260617160200_backfill_dream_issues.sql"));
  assert.equal(plan.sequence.filter((s) => s.path === dream.path).length, 1);

  assert.deepEqual(codes(plan), [
    "execution_not_run",
    "fixture_interleaved",
    "fixture_untracked",
    "fixture_untracked",
    "fixture_untracked",
    "fixture_untracked",
  ]);
});

test("plan is deterministic for identical inputs", () => {
  assert.deepEqual(planCanonicalBootstrap(inputs), planCanonicalBootstrap(inputs));
});

const base = [{ path: "base.sql", tracked: false, sql: "create table if not exists p (id uuid);" }];
const plan = (canonical, legacy, supplemental = []) =>
  planCanonicalBootstrap({ canonical, legacy, candidates: base, baselinePath: "base.sql", supplemental });

test("a fixture whose dependencies exist before replay is preexisting; one needing canonical tables is interleaved", () => {
  const canonical = [
    { name: "20260501_s.sql", sql: "create table s (id uuid);" },
    { name: "20260528_agent_decisions.sql", sql: "select 1 from x; select 1 from y;" },
  ];
  const result = plan(canonical, [
    { name: "20260510_x.sql", sql: "create table if not exists x (s uuid references s(id));" },
    { name: "20260511_y.sql", sql: "create table if not exists y (p uuid references p(id));" },
  ]);
  const [x, y] = result.fixtures;
  assert.deepEqual([x.position, x.after, x.before, x.preexisting], [1, "20260501_s.sql", "20260528_agent_decisions.sql", false]);
  assert.deepEqual([y.position, y.preexisting], [0, true]);
  assert.deepEqual(result.sequence.map((s) => s.path ?? s.name), [
    "base.sql",
    "supabase/migrations/20260511_y.sql",
    "20260501_s.sql",
    "supabase/migrations/20260510_x.sql",
    "20260528_agent_decisions.sql",
  ]);
  assert.deepEqual(codes(result), ["execution_not_run", "fixture_interleaved", "fixture_untracked", "fixture_untracked", "fixture_untracked"]);
  assert.equal(result.ok, false);
});

test("a fixture needing a table created only after first use is unplaceable", () => {
  const result = plan(
    [
      { name: "20260528_agent_decisions.sql", sql: "select 1 from x;" },
      { name: "20260601_z.sql", sql: "create table z (id uuid);" },
    ],
    [{ name: "20260510_x.sql", sql: "create table if not exists x (z uuid references z(id));" }],
  );
  assert.equal(result.fixtures[0].position, -1);
  assert.ok(codes(result).includes("fixture_unplaceable"));
});

test("a SHA-pinned post-window fixture is placed at its earliest safe position before first use, or fails closed", () => {
  const canonical = [
    { name: "20260528_agent_decisions.sql", sql: "create table t (id uuid);" },
    { name: "20260610_late.sql", sql: "select 1 from d;" },
  ];
  const legacy = [{ name: "20260609_d.sql", sql: "create table if not exists d (t uuid references t(id));" }];
  const pin = [{ name: "20260609_d.sql", lfSha256: sha256(legacy[0].sql) }];
  const result = plan(canonical, legacy, pin);
  const [d] = result.fixtures;
  assert.deepEqual([d.provides, d.requires, d.position, d.after, d.supplemental], [["d"], ["t"], 1, "20260528_agent_decisions.sql", true]);
  assert.deepEqual(result.sequence.map((s) => s.path ?? s.name), [
    "base.sql",
    "20260528_agent_decisions.sql",
    "supabase/migrations/20260609_d.sql",
    "20260610_late.sql",
  ]);
  assert.deepEqual(codes(result), ["execution_not_run", "fixture_interleaved", "fixture_untracked", "fixture_untracked"]);
  assert.equal(result.ok, false);

  const drifted = plan(canonical, legacy, [{ name: "20260609_d.sql", lfSha256: "0".repeat(64) }]);
  assert.deepEqual(drifted.fixtures, []);
  assert.ok(codes(drifted).includes("fixture_sha_mismatch"));
  assert.ok(codes(plan(canonical, [], pin)).includes("fixture_source_missing"));
});

test("missing or ambiguous legacy sources and a missing baseline fail closed", () => {
  const canonical = [{ name: "20260528_agent_decisions.sql", sql: "select 1 from x;" }];
  assert.ok(codes(plan(canonical, [])).includes("fixture_source_missing"));
  const twice = [
    { name: "20260510_a.sql", sql: "create table if not exists x (id uuid);" },
    { name: "20260511_b.sql", sql: "create table if not exists x (id uuid);" },
  ];
  assert.ok(codes(plan(canonical, twice)).includes("fixture_source_ambiguous"));
  const missing = planCanonicalBootstrap({ canonical, candidates: [{ path: "base.sql", sql: null }], baselinePath: "base.sql" });
  assert.deepEqual(codes(missing), ["baseline_candidate_missing"]);
  assert.deepEqual(codes(planCanonicalBootstrap({ canonical: [{ name: "20270101_x.sql", sql: "" }], candidates: base })), [
    "provenance_incomplete",
  ]);
});
