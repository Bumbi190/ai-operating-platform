import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  inspectBaselineProvenance,
  readProvenanceInputs,
  relationRefs,
} from "./migration-baseline-provenance.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const inputs = readProvenanceInputs(repo);
const codes = (report) => report.blockers.map((b) => b.code).sort();
const SCHEMA = "packages/db/schema.sql";
const FULL = "packages/db/full_schema_run_in_supabase.sql";

test("repository: early canonical window depends on an untracked baseline that neither candidate fully provides", () => {
  const report = inspectBaselineProvenance(inputs);
  assert.equal(report.ok, false);
  assert.equal(report.fullReplayValidated, false);
  assert.match(report.disclaimer, /does not establish full replay validity/);
  assert.equal(report.earlyWindow.files[0], "20260520_media_tables.sql");
  assert.equal(report.earlyWindow.boundary, "20260615_migration_guard_fn.sql");

  const firstUse = Object.fromEntries(report.dependencies.map((d) => [d.table, d.firstUsedBy]));
  assert.deepEqual(firstUse, {
    agents: "20260528_agent_decisions.sql",
    media_insights: "20260602_atlas_bi_foundation.sql",
    memories: "20260528_agent_decisions.sql",
    outputs: "20260614090000_h1p5_outputs_run_id_unique.sql",
    projects: "20260520_media_tables.sql",
    run_logs: "20260528_agent_decisions.sql",
    runs: "20260520_media_tables.sql",
    workflows: "20260613_h1p1_execution_policy_foundation.sql",
  });
  const byTable = Object.fromEntries(report.dependencies.map((d) => [d.table, d]));
  for (const table of ["projects", "runs"]) {
    assert.deepEqual(byTable[table].fkColumns, ["id"]);
    assert.deepEqual(byTable[table].laterCanonicalCreators, []);
  }
  assert.deepEqual(byTable.media_insights.laterCanonicalCreators, []);
  assert.deepEqual(byTable.media_insights.legacyCreators, ["20260601_media_insights.sql"]);
  assert.deepEqual(
    report.platformDependencies.map((p) => p.relation),
    ["storage.buckets", "supabase_migrations.schema_migrations"],
  );
  assert.deepEqual(report.schemaDependencies, [
    {
      schema: "omnira_cron",
      firstUsedBy: "20260614091000_h1p5_runs_claim_id.sql",
      legacyCreators: ["20260528_pg_cron_setup.sql"],
    },
  ]);

  const [schema, full] = report.candidates;
  assert.deepEqual([schema.path, full.path], [SCHEMA, FULL]);
  for (const candidate of report.candidates) {
    assert.equal(candidate.present, true);
    assert.equal(candidate.tracked, false);
    assert.match(candidate.lfSha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(candidate.uncovered, ["media_insights"]);
    assert.deepEqual(candidate.uncoveredSchemas, ["omnira_cron"]);
    assert.deepEqual(candidate.missingColumns, []);
    assert.ok(candidate.platformDependencies.includes("auth.users"));
  }
  assert.equal(schema.hazards.nonIdempotentPolicies, 10);
  assert.deepEqual(schema.hazards.storageWrites, []);
  assert.equal(full.hazards.nonIdempotentPolicies, 0);
  assert.deepEqual(full.hazards.storageWrites, ["storage.buckets"]);

  assert.deepEqual(report.candidateDrift.onlyIn[SCHEMA], []);
  assert.deepEqual(report.candidateDrift.onlyIn[FULL], [
    "agent_messages",
    "approvals",
    "conversation_messages",
    "conversations",
    "daily_notes",
    "manager_tasks",
    "planning_items",
    "sprints",
  ]);
  assert.deepEqual(report.candidateDrift.columnMismatch, []);
  assert.deepEqual(codes(report), [
    "baseline_untracked",
    "baseline_untracked",
    "early_dependency_uncovered",
    "early_dependency_uncovered",
    "early_schema_uncovered",
    "early_schema_uncovered",
  ]);
});

test("report is deterministic for identical inputs", () => {
  assert.deepEqual(inspectBaselineProvenance(inputs), inspectBaselineProvenance(inputs));
});

const early = (sql) => [{ name: "20260528_agent_decisions.sql", sql }];

test("a tracked candidate covering every dependency clears blockers but never claims full replay", () => {
  const report = inspectBaselineProvenance({
    canonical: early("create table d (id uuid, p uuid references projects(id)); alter table runs add column x int;"),
    candidates: [{ path: "baseline.sql", tracked: true, sql: "create table projects (id uuid); create table runs (id uuid);" }],
  });
  assert.deepEqual(report.blockers, []);
  assert.equal(report.ok, true);
  assert.equal(report.fullReplayValidated, false);
});

test("comments, literals, CTEs, function calls, roles and own creations are not dependencies", () => {
  const sql = `
    -- alter table ghost_a add column x int;
    /* select * from ghost_b */
    comment on table t is 'rows from ghost_c';
    create table t (id uuid);
    create view v as with w as (select 1) select * from w, generate_series(1, 2) join t on true;
    revoke all on function f() from public, anon;
    select extract(epoch from created_at) from t;`;
  assert.deepEqual(inspectBaselineProvenance({ canonical: early(sql), candidates: [] }).dependencies, []);
});

test("references inside function bodies are flagged deferred-only; qualified platform relations are separated", () => {
  const sql = "create function f() returns int language plpgsql as $fn$ begin perform 1 from late_t; end $fn$;\n" +
    "insert into storage.buckets (id) values ('x');";
  const report = inspectBaselineProvenance({ canonical: early(sql), candidates: [] });
  assert.deepEqual(report.dependencies.map((d) => [d.table, d.deferredOnly]), [["late_t", true]]);
  assert.deepEqual(report.platformDependencies.map((p) => p.relation), ["storage.buckets"]);
  assert.deepEqual(
    relationRefs("update public.runs set a = 1").map((r) => [r.schema, r.name, r.kind]),
    [["public", "runs", "update"]],
  );
});

test("a schema used before any migration creates it must come from the baseline", () => {
  const sql = "create function cron_x.f() returns int language sql as $$ select 1 $$;";
  const without = inspectBaselineProvenance({ canonical: early(sql), candidates: [{ path: "a.sql", tracked: true, sql: "" }] });
  assert.deepEqual(without.schemaDependencies, [{ schema: "cron_x", firstUsedBy: "20260528_agent_decisions.sql", legacyCreators: [] }]);
  assert.deepEqual(codes(without), ["early_schema_uncovered"]);
  const covered = inspectBaselineProvenance({
    canonical: early(sql),
    candidates: [{ path: "a.sql", tracked: true, sql: "create schema if not exists cron_x;" }],
  });
  assert.equal(covered.ok, true);
  const selfCreated = inspectBaselineProvenance({ canonical: early("create schema cron_x;\n" + sql), candidates: [] });
  assert.deepEqual(selfCreated.schemaDependencies, []);
});

test("missing FK target column, missing dependency and missing candidate file are blockers", () => {
  const report = inspectBaselineProvenance({
    canonical: early("create table d (p uuid references projects(slug), r uuid references runs(id));"),
    candidates: [
      { path: "a.sql", tracked: true, sql: "create table projects (id uuid, unique(id));" },
      { path: "missing.sql", sql: null },
    ],
  });
  assert.deepEqual(codes(report), ["baseline_candidate_missing", "baseline_column_missing", "early_dependency_uncovered"]);
  assert.deepEqual(report.candidates[0].missingColumns, [{ table: "projects", columns: ["slug"] }]);
  assert.equal(report.candidateDrift, null);
});

test("drift between candidates and later canonical re-creation are reported", () => {
  const report = inspectBaselineProvenance({
    canonical: [
      ...early("select 1 from projects;"),
      { name: "20270101_recreate.sql", sql: "create table if not exists projects (id uuid);" },
    ],
    candidates: [
      { path: "a.sql", tracked: true, sql: "create table if not exists projects (id uuid, name text);" },
      { path: "b.sql", tracked: true, sql: "create table projects (id uuid); create table extra (id uuid);" },
    ],
  });
  assert.deepEqual(report.candidateDrift.onlyIn, { "a.sql": [], "b.sql": ["extra"] });
  assert.deepEqual(report.candidateDrift.columnMismatch, [{ table: "projects", "a.sql": ["id", "name"], "b.sql": ["id"] }]);
  assert.deepEqual(report.candidates[0].laterCanonicalCreates, [
    { table: "projects", file: "20270101_recreate.sql", ifNotExists: true },
  ]);
  assert.deepEqual(report.candidates[1].hazards.createsWithoutIfNotExists, ["extra", "projects"]);
});

test("no grandfathered migration or refused order fails closed", () => {
  const none = inspectBaselineProvenance({ canonical: [{ name: "20270101_x.sql", sql: "" }], candidates: [] });
  assert.deepEqual(codes(none), ["early_window_undefined"]);
  const orphan = inputs.canonical.filter((m) => m.name === "20260520_media_images.sql");
  assert.deepEqual(codes(inspectBaselineProvenance({ canonical: orphan, candidates: [] })), ["replay_order_refused"]);
});

test("CLI prints JSON blockers and exits non-zero", () => {
  let result;
  try {
    execFileSync(process.execPath, [resolve(here, "migration-baseline-provenance.mjs")], { encoding: "utf8" });
    assert.fail("expected non-zero exit");
  } catch (error) {
    assert.equal(error.status, 1);
    result = JSON.parse(error.stdout);
  }
  assert.equal(result.fullReplayValidated, false);
  assert.ok(result.blockers.some((b) => b.code === "early_dependency_uncovered"));
});
