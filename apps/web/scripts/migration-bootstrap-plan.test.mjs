import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readProvenanceInputs } from "./migration-baseline-provenance.mjs";
import {
  BASELINE_FIXTURE,
  COLUMN_PREREQUISITES,
  DURABLE_RUNS_FIXTURE,
  PLATFORM_CONFIG_FIXTURE,
  PLATFORM_TOKENS_FIXTURE,
  REVENUE_SNAPSHOTS_FIXTURE,
  extractPlatformConfigTable,
  extractPlatformTokensSchema,
  planCanonicalBootstrap,
  SUPPLEMENTAL_FIXTURES,
} from "./migration-bootstrap-plan.mjs";
import { sha256 } from "./migration-replay-preflight.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const inputs = readProvenanceInputs(repo);
const codes = (plan) => plan.blockers.map((b) => b.code).sort();

test("revenue snapshots is a pinned schema-only fixture after projects and before first canonical use", () => {
  const plan = planCanonicalBootstrap(inputs);
  const path = "supabase/migrations/20260602_stripe_intelligence_revenue_snapshots.sql";
  const source = inputs.legacy.find((f) => f.name === REVENUE_SNAPSHOTS_FIXTURE.name);
  assert.equal(sha256(source.sql), "941d578548f895e5087c201502bcc34c8cf9e8b90f422d7b35dbcffc764e833e");
  const fixture = plan.fixtures.find((f) => f.path === path);
  assert.ok(fixture);
  assert.equal(fixture.lfSha256, sha256(source.sql));
  assert.deepEqual(fixture.provides, ["revenue_snapshots"]);
  assert.deepEqual(fixture.requires, ["projects"]);
  assert.equal(fixture.position, 0); // projects already exists in the preceding baseline.
  const at = plan.sequence.findIndex((s) => s.path === path);
  assert.ok(at > plan.sequence.findIndex((s) => s.path === BASELINE_FIXTURE));
  assert.ok(at < plan.sequence.findIndex((s) => s.name === "20261002190000_survival_input_epoch.sql"));
  assert.equal(plan.sequence.filter((s) => s.path === path).length, 1);
  assert.equal(plan.replayReady, false);
  assert.match(plan.disclaimer, /not clean-bootstrap or production readiness/);
});

test("revenue fixture refuses missing source, byte drift and repinned unexpected SQL or semantics", () => {
  const source = inputs.legacy.find((f) => f.name === "20260602_stripe_intelligence_revenue_snapshots.sql");
  for (const sql of [null, source.sql + "\n-- drift"]) {
    const legacy = inputs.legacy.flatMap((f) => f !== source ? [f] : sql === null ? [] : [{ ...f, sql }]);
    const result = planCanonicalBootstrap({ ...inputs, legacy });
    assert.ok(codes(result).includes(sql === null ? "fixture_source_missing" : "fixture_sha_mismatch"));
    assert.ok(!result.fixtures.some((f) => f.path.endsWith(source.name)));
  }
  for (const sql of [
    source.sql + "\ninsert into public.revenue_snapshots default values;",
    source.sql + "\nupdate public.projects set name = 'changed';",
    source.sql + "\ndelete from public.revenue_snapshots;",
    source.sql + "\nselect net.http_get('https://example.invalid');",
    source.sql + "\ngrant all on public.revenue_snapshots to anon;",
    source.sql.replace("on delete set null", "on delete cascade"),
    source.sql.replace("numeric(12,2)", "numeric(12,4)"),
    source.sql.replace("default 'sek'", "default 'usd'"),
    source.sql.replace("snapshot_date desc", "snapshot_date"),
    source.sql.replace("enable row level security", "disable row level security"),
  ]) {
    const result = planCanonicalBootstrap({ ...inputs,
      legacy: inputs.legacy.map((f) => f === source ? { ...f, sql } : f),
      supplemental: SUPPLEMENTAL_FIXTURES.map((pin) => pin.name === source.name ? { ...pin, lfSha256: sha256(sql) } : pin),
    });
    assert.ok(codes(result).includes("fixture_statement_mismatch"), JSON.stringify(result.blockers));
    assert.ok(!result.fixtures.some((f) => f.path.endsWith(source.name)));
  }
});

test("revenue fixture waits for canonical projects creation or refuses an unavailable prerequisite", () => {
  const source = inputs.legacy.find((f) => f.name === REVENUE_SNAPSHOTS_FIXTURE.name);
  const early = { name: "20260528_agent_decisions.sql", sql: "select 1;" };
  const projects = { name: "20260930_projects.sql", sql: "create table public.projects(id uuid primary key);" };
  const use = { name: "20261002190000_survival_input_epoch.sql", sql: "select 1 from public.revenue_snapshots;" };
  const result = plan([early, projects, use], [source], [REVENUE_SNAPSHOTS_FIXTURE]);
  assert.deepEqual(result.fixtures[0].requires, ["projects"]);
  assert.equal(result.fixtures[0].after, projects.name);
  assert.equal(result.fixtures[0].before, use.name);
  const missing = plan([early, use], [source], [REVENUE_SNAPSHOTS_FIXTURE]);
  assert.ok(codes(missing).includes("fixture_unplaceable"));
  assert.ok(!missing.sequence.some((s) => s.path?.endsWith(source.name)));
  const drift = plan([early, projects, { ...use, name: "20261001_unreviewed_first_use.sql" }], [source], [REVENUE_SNAPSHOTS_FIXTURE]);
  assert.ok(codes(drift).includes("fixture_first_use_mismatch"));
});

test("platform_tokens extracts exactly four DDL statements, never the credential backfill", () => {
  const source = inputs.legacy.find((f) => f.name === "20260602_g1_multitenant_platform_tokens.sql").sql;
  const { extracted, body } = extractPlatformTokensSchema(source);
  assert.equal(extracted, `alter table public.platform_tokens add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table public.platform_tokens add column if not exists account_id text;
alter table public.platform_tokens drop constraint if exists platform_tokens_platform_token_type_key;
create unique index if not exists platform_tokens_project_platform_type_key
  on public.platform_tokens (project_id, platform, token_type);
`);
  assert.equal(extracted.split(";").length, 5);
  assert.equal(sha256(extracted), "232551356dbbf8f28409890de69bd784ab6d11aef4241d1f717f3e1d35eef543");
  assert.ok(body.endsWith(extracted));
  assert.match(body, /^LOCK TABLE ONLY public\.platform_tokens IN ACCESS EXCLUSIVE MODE;/);
  assert.ok(body.indexOf("IF EXISTS (SELECT 1 FROM ONLY public.platform_tokens)") < body.indexOf(extracted));
  assert.match(body, /expected old platform_tokens schema/);
  assert.match(body, /rolsuper OR r.rolbypassrls OR c.relowner = r.oid/);
  assert.match(body, /relrowsecurity AND NOT c.relforcerowsecurity/);
  assert.match(body, /names IS DISTINCT FROM ARRAY\['id','platform','token_type','access_token','expires_at','refreshed_at','created_at'\]/);
  assert.match(body, /defaults IS DISTINCT FROM ARRAY/);
  assert.match(body, /c.conname = 'platform_tokens_platform_token_type_key'.*c.conkey = ARRAY\[2,3\]/);
  assert.match(body, /pg_catalog.pg_policy/);
  assert.match(body, /pg_catalog.pg_inherits/);
  assert.doesNotMatch(body, /update\s+public\.platform_tokens|ai-media-automation|select\s+(?:\*|access_token)\s+from|GRANT\s|REVOKE\s|DISABLE ROW LEVEL SECURITY/i);
  assert.throws(() => extractPlatformTokensSchema(source + "\n-- changed"), /source.*SHA/i);
  assert.deepEqual(extractPlatformTokensSchema(source.replace(/\r?\n/g, "\r\n")), { extracted, body });
});

test("platform_tokens synthetic prerequisite follows creation and preserves canonical credential guards", () => {
  const plan = planCanonicalBootstrap(inputs);
  const at = plan.sequence.findIndex((s) => s.path === PLATFORM_TOKENS_FIXTURE.path);
  assert.ok(at > plan.sequence.findIndex((s) => s.name === "20260527_platform_tokens.sql"));
  assert.deepEqual(plan.sequence[at], PLATFORM_TOKENS_FIXTURE);
  assert.equal(plan.sequence[at + 1].name, "20260914120300_platform_tokens_project_binding.sql");
  assert.ok(plan.sequence.findIndex((s) => s.name === "20260914090000_platform_tokens_client_revoke.sql") < at);
  assert.ok(!plan.sequence.some((s) => s.kind === "fixture" && s.path === PLATFORM_TOKENS_FIXTURE.sourcePath));
  for (const changed of [null, (sql) => sql + "\n-- drift"]) {
    const legacy = inputs.legacy.flatMap((f) => f.name !== "20260602_g1_multitenant_platform_tokens.sql" ? [f] : changed ? [{ ...f, sql: changed(f.sql) }] : []);
    const result = planCanonicalBootstrap({ ...inputs, legacy });
    assert.ok(codes(result).includes("synthetic_fixture_refused"));
    assert.ok(!result.sequence.some((s) => s.path === PLATFORM_TOKENS_FIXTURE.path));
  }
  const noBase = planCanonicalBootstrap({ ...inputs, canonical: inputs.canonical.filter((m) => m.name !== "20260527_platform_tokens.sql") });
  assert.ok(codes(noBase).includes("synthetic_fixture_refused"));
  assert.ok(!noBase.sequence.some((s) => s.path === PLATFORM_TOKENS_FIXTURE.path));
});

test("platform_config extracts only the pinned CREATE and qualifies it with strict absence semantics", () => {
  const source = inputs.legacy.find((f) => f.name === "20260528_pass_a_safeguards.sql").sql;
  const { extracted, body } = extractPlatformConfigTable(source);
  assert.equal(sha256(extracted), "6d79a5b176cb70f544c6e149693b01f1349262847d27d3c98b5250f22c7bfe18");
  assert.equal(body, `CREATE TABLE public.platform_config (
  id                   INT PRIMARY KEY DEFAULT 1,
  automation_paused    BOOLEAN     NOT NULL DEFAULT FALSE,
  max_daily_renders    INT         NOT NULL DEFAULT 4,
  max_retry_attempts   INT         NOT NULL DEFAULT 3,
  paused_at            TIMESTAMPTZ,
  paused_reason        TEXT,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);
`);
  assert.equal(body.split(";").length, 2);
  assert.doesNotMatch(body, /IF NOT EXISTS|UPDATE |INSERT |ALTER |POLICY|GRANT|REVOKE|media_scripts|runs\b/i);
  assert.throws(() => extractPlatformConfigTable(source + "\n-- drift"), /source.*SHA/i);
  assert.throws(() => extractPlatformConfigTable(source.replace("DEFAULT 4", "DEFAULT 40")), /source.*SHA/i);
  assert.deepEqual(extractPlatformConfigTable(source.replace(/\r?\n/g, "\r\n")), { extracted, body });
});

test("platform_config synthetic step precedes budgets without applying the full legacy file", () => {
  const plan = planCanonicalBootstrap(inputs);
  const at = plan.sequence.findIndex((s) => s.path === PLATFORM_CONFIG_FIXTURE.path);
  assert.ok(at > 0);
  assert.deepEqual(plan.sequence[at], PLATFORM_CONFIG_FIXTURE);
  assert.equal(plan.sequence[at + 1].path, "synthetic/platform_config_security_only");
  assert.equal(plan.sequence[at + 2].name, "20260831_budget_scopes.sql");
  assert.ok(!plan.sequence.some((s) => s.kind === "fixture" && s.path === PLATFORM_CONFIG_FIXTURE.sourcePath));
  assert.match(plan.sequence[at].limitation, /No row seeding.*RLS.*ACL/);
  for (const changed of [null, (sql) => sql + "\n-- drift"]) {
    const legacy = inputs.legacy.flatMap((f) => f.name !== "20260528_pass_a_safeguards.sql" ? [f] : changed ? [{ ...f, sql: changed(f.sql) }] : []);
    const refused = planCanonicalBootstrap({ ...inputs, legacy });
    assert.ok(codes(refused).includes("synthetic_fixture_refused"));
    assert.ok(!refused.sequence.some((s) => s.path === PLATFORM_CONFIG_FIXTURE.path));
  }
  const preexisting = planCanonicalBootstrap({ ...inputs, candidates: inputs.candidates.map((c) => c.path !== BASELINE_FIXTURE ? c : {
    ...c, sql: c.sql + "\ncreate table public.platform_config(id int);"
  }) });
  assert.ok(codes(preexisting).includes("synthetic_fixture_refused"));
  const unsafe = planCanonicalBootstrap({ ...inputs, supplemental: [
    ...SUPPLEMENTAL_FIXTURES,
    { name: "20260528_pass_a_safeguards.sql", lfSha256: PLATFORM_CONFIG_FIXTURE.sourceLfSha256 },
  ] });
  assert.ok(codes(unsafe).includes("synthetic_fixture_refused"));
  assert.ok(!unsafe.sequence.some((s) => s.kind === "fixture" && s.path === PLATFORM_CONFIG_FIXTURE.sourcePath));
});

test("full durable runs fixture follows pg_cron and precedes every canonical function replacement", () => {
  const plan = planCanonicalBootstrap(inputs);
  const path = "supabase/migrations/20260603_durable_runs.sql";
  const at = (name) => plan.sequence.findIndex((s) => (s.path ?? s.name) === name);
  const fixture = plan.fixtures.find((f) => f.path === path);
  assert.ok(fixture, "durable runs must be an explicit full fixture");
  assert.equal(fixture.lfSha256, "a189659945447189022e96bb8a26a5cb4e0e26fb321c9f56a02d0b6e44da7ee4");
  assert.deepEqual(fixture.providesColumns, ["runs.attempts", "runs.claimed_at", "runs.error_history", "runs.last_error", "runs.lease_until", "runs.max_attempts"]);
  assert.deepEqual(fixture.providesFunctions, ["public.claim_runs", "omnira_cron.reap_stuck_runs"]);
  assert.deepEqual(fixture.schedules, ["omnira_runs_drain", "omnira_runs_reaper"]);
  assert.ok(at("supabase/migrations/20260528_pg_cron_setup.sql") < at(path));
  assert.ok(at(path) < at("20260614091000_h1p5_runs_claim_id.sql"));
  for (const migration of inputs.canonical.filter((m) => /create or replace function (?:public.claim_runs|omnira_cron.reap_stuck_runs)\(/i.test(m.sql))) {
    assert.ok(at(path) < at(migration.name), migration.name);
    assert.equal(plan.sequence[at(migration.name)].lfSha256, sha256(migration.sql));
  }
  assert.equal(plan.sequence.filter((s) => s.path === path).length, 1);
});

test("durable runs missing, changed bytes or missing pg_cron prerequisite refuse the plan", () => {
  for (const [name, change, expected] of [
    ["20260603_durable_runs.sql", null, "fixture_source_missing"],
    ["20260603_durable_runs.sql", (sql) => sql + "\n-- drift", "fixture_sha_mismatch"],
    ["20260528_pg_cron_setup.sql", null, "fixture_source_missing"],
    ["20260528_pg_cron_setup.sql", (sql) => sql + "\n-- drift", "full_fixture_mismatch"],
  ]) {
    const legacy = inputs.legacy.flatMap((f) => f.name !== name ? [f] : change ? [{ ...f, sql: change(f.sql) }] : []);
    const plan = planCanonicalBootstrap({ ...inputs, legacy });
    assert.ok(codes(plan).includes(expected), JSON.stringify(plan.blockers));
    assert.ok(!plan.sequence.some((s) => s.path === "supabase/migrations/20260603_durable_runs.sql"));
  }
});

test("full fixture contract rejects column, function, schedule and baseline drift even with a matching supplied digest", () => {
  const original = inputs.legacy.find((f) => f.name === DURABLE_RUNS_FIXTURE.name);
  for (const sql of [
    original.sql.replace("max_attempts  integer", "wrong_column  integer"),
    original.sql.replace("public.claim_runs(", "public.wrong_function("),
    original.sql.replace("'omnira_runs_drain'", "'wrong_schedule'"),
  ]) {
    const result = planCanonicalBootstrap({
      ...inputs,
      legacy: inputs.legacy.map((f) => f === original ? { ...f, sql } : f),
      durableRunsFixture: { ...DURABLE_RUNS_FIXTURE, lfSha256: sha256(sql) },
    });
    assert.ok(codes(result).includes("full_fixture_mismatch"));
    assert.ok(!result.sequence.some((s) => s.path?.endsWith("/20260603_durable_runs.sql")));
  }
  const result = planCanonicalBootstrap({
    ...inputs,
    candidates: inputs.candidates.map((c) => c.path === BASELINE_FIXTURE ? {
      ...c, sql: c.sql.replace("CREATE TABLE IF NOT EXISTS runs (", "CREATE TABLE IF NOT EXISTS runs (max_attempts integer,")
    } : c),
  });
  assert.ok(codes(result).includes("full_fixture_mismatch"));
});

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
    "supabase/migrations/20260602_stripe_intelligence_revenue_snapshots.sql",
    "supabase/migrations/20260603_cron_heartbeat.sql",
    "supabase/migrations/20260603_durable_runs.sql",
    "supabase/migrations/20260609_dream_issues_ledger.sql",
    "supabase/migrations/20260609_manager_task_dream_link.sql",
    "synthetic/20260605071529_media_insights_multiplatform",
    "synthetic/20260605213648_media_insights_retention",
    "synthetic/cron_heartbeat_security_only",
    "synthetic/platform_config_security_only",
    "synthetic/platform_config_table_only",
    "synthetic/platform_tokens_schema_only",
    "synthetic/runs_dispatch_schema_only",
  ]);
  const cron = byPath["supabase/migrations/20260528_pg_cron_setup.sql"];
  assert.deepEqual([cron.provides, cron.requires, cron.preexisting, cron.supplemental], [["omnira_cron"], [], true, false]);
  const insights = byPath["supabase/migrations/20260601_media_insights.sql"];
  assert.deepEqual(insights.provides, ["media_insights"]);
  assert.deepEqual(insights.requires, ["media_scripts", "projects"]);
  assert.equal(insights.preexisting, false);
  assert.equal(insights.after, "20260520_media_tables.sql");
  // Pinned post-window fixture: unmodified legacy SQL, placed before the canonical backfill that reads it.
  const pinned = (name) => SUPPLEMENTAL_FIXTURES.find((f) => f.name === name).lfSha256;
  const heartbeat = byPath["supabase/migrations/20260603_cron_heartbeat.sql"];
  assert.equal(heartbeat.supplemental, true);
  assert.equal(heartbeat.lfSha256, pinned("20260603_cron_heartbeat.sql"));
  assert.equal(heartbeat.lfSha256, sha256(inputs.legacy.find((f) => f.name === "20260603_cron_heartbeat.sql").sql));
  assert.deepEqual([heartbeat.provides, heartbeat.requires], [["cron_heartbeat"], []]);
  assert.deepEqual([heartbeat.position, heartbeat.preexisting], [0, true]);
  const dream = byPath["supabase/migrations/20260609_dream_issues_ledger.sql"];
  assert.equal(dream.supplemental, true);
  assert.equal(dream.lfSha256, pinned("20260609_dream_issues_ledger.sql"));
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
  // Heartbeat's cron.schedule calls omnira_cron, so it lands after pg_cron_setup and before its canonical seed.
  assert.ok(at((s) => s.path === cron.path) < at((s) => s.path === heartbeat.path));
  assert.ok(at((s) => s.path === heartbeat.path) < at((s) => s.name === "20260623_150300_atlas_collector_cron.sql"));
  assert.equal(plan.sequence.filter((s) => s.path === heartbeat.path).length, 1);
  // Column-only prerequisite: creates no relation, adds manager_tasks columns the baseline lacks and that
  // canonical 20260820_manager_tasks_work_packages.sql uses first (replay v3 stopped there without them).
  const link = byPath["supabase/migrations/20260609_manager_task_dream_link.sql"];
  const pre = COLUMN_PREREQUISITES.find((f) => f.name === "20260609_manager_task_dream_link.sql");
  assert.equal(link.lfSha256, pre.lfSha256);
  assert.equal(link.lfSha256, sha256(inputs.legacy.find((f) => f.name === pre.name).sql));
  assert.deepEqual(
    [link.provides, link.providesColumns, link.requires, link.supplemental],
    [[], ["manager_tasks.owner", "manager_tasks.source", "manager_tasks.source_key"], ["manager_tasks"], true],
  );
  assert.deepEqual([link.position, link.preexisting], [0, true]);
  assert.ok(at((s) => s.path === link.path) < at((s) => s.name === "20260820_manager_tasks_work_packages.sql"));
  assert.equal(plan.sequence.filter((s) => s.path === link.path).length, 1);
  for (const f of plan.fixtures.filter((f) => f.kind !== "synthetic" && f !== link && !f.path.endsWith("/20260603_durable_runs.sql"))) assert.deepEqual(f.providesColumns, []);

  assert.deepEqual(codes(plan), [
    "execution_not_run",
    "fixture_interleaved",
    ...Array(15).fill("fixture_untracked"),
  ]);
});

test("plan is deterministic for identical inputs", () => {
  assert.deepEqual(planCanonicalBootstrap(inputs), planCanonicalBootstrap(inputs));
});

const base = [{ path: "base.sql", tracked: false, sql: "create table if not exists p (id uuid);" }];
const plan = (canonical, legacy, supplemental = [], columnPrerequisites = []) =>
  planCanonicalBootstrap({ canonical, legacy, candidates: base, baselinePath: "base.sql", supplemental, columnPrerequisites, durableRunsFixture: null });

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

test("a pinned column prerequisite is placed before its first canonical use only when SQL, baseline and use agree", () => {
  const sql = "-- adds c\nalter table public.p add column if not exists c   text;\ncreate index if not exists p_c on public.p (id, c);\n";
  const legacy = [{ name: "20260609_c.sql", sql }];
  const pre = {
    name: "20260609_c.sql",
    lfSha256: sha256(sql),
    table: "p",
    columns: ["c"],
    indexes: [{ name: "p_c", columns: ["id", "c"] }],
    firstUsedBy: "20260820_use.sql",
  };
  const early = { name: "20260528_agent_decisions.sql", sql: "-- c appears only in this comment\nselect 1 from p where id::text <> 'c';" };
  const use = { name: "20260820_use.sql", sql: "alter table public.p add constraint p_c_check check (c <> '');" };
  const result = plan([early, use], legacy, [], [pre]);
  const [c] = result.fixtures;
  assert.deepEqual(
    [c.provides, c.providesColumns, c.requires, c.position, c.preexisting, c.supplemental],
    [[], ["p.c"], ["p"], 0, true, true],
  );
  assert.deepEqual(result.sequence.map((s) => s.path ?? s.name), [
    "base.sql",
    "supabase/migrations/20260609_c.sql",
    "20260528_agent_decisions.sql",
    "20260820_use.sql",
  ]);
  assert.deepEqual(codes(result), ["execution_not_run", "fixture_untracked", "fixture_untracked"]);
  assert.equal(result.ok, false);

  // Explicit metadata only: without a declaration the column-only file is never inferred as a fixture.
  assert.deepEqual(plan([early, use], legacy).fixtures, []);

  const rejected = (r) => {
    assert.deepEqual(r.fixtures, []);
    assert.equal(r.ok, false);
    return codes(r);
  };
  assert.ok(rejected(plan([early, use], legacy, [], [{ ...pre, lfSha256: "0".repeat(64) }])).includes("fixture_sha_mismatch"));
  assert.ok(rejected(plan([early, use], [], [], [pre])).includes("fixture_source_missing"));
  const mismatch = (canonical, files, declared) => {
    const found = rejected(plan(canonical, files, [], [declared]));
    assert.ok(found.includes("column_prerequisite_mismatch"), found.join(", "));
  };
  const repinned = (text) => [[{ name: pre.name, sql: text }], { ...pre, lfSha256: sha256(text) }];
  // The file also creates a relation, or adds a column with a default: not a bare column prerequisite.
  mismatch([early, use], ...repinned(`${sql}create table if not exists q (id uuid);`));
  mismatch([early, use], ...repinned(sql.replace("c   text", "c text default 'x'")));
  // Declaration drifts from the SQL.
  mismatch([early, use], legacy, { ...pre, columns: ["c", "d"] });
  mismatch([early, use], legacy, { ...pre, indexes: [] });
  mismatch([early, use], legacy, { ...pre, table: "zz" });
  // Canonical first use is earlier, absent, or the first user adds the column itself.
  mismatch([{ ...early, sql: "select c from p;" }, use], legacy, pre);
  mismatch([early, { ...use, sql: "select 1 from p;" }], legacy, pre);
  mismatch([early, { ...use, sql: "alter table public.p\n  add column if not exists   c text;" }], legacy, pre);
  // The baseline already has the column, so the prerequisite would hide a real difference.
  const wide = planCanonicalBootstrap({
    canonical: [early, use],
    legacy,
    candidates: [{ path: "base.sql", tracked: false, sql: "create table if not exists p (id uuid, c text);" }],
    baselinePath: "base.sql",
    supplemental: [],
    columnPrerequisites: [pre],
  });
  assert.ok(rejected(wide).includes("column_prerequisite_mismatch"));
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
