import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readProvenanceInputs } from "./migration-baseline-provenance.mjs";
import { BASELINE_FIXTURE, PLATFORM_CONFIG_FIXTURE, PLATFORM_TOKENS_FIXTURE, planCanonicalBootstrap } from "./migration-bootstrap-plan.mjs";
import {
  LABEL,
  LABEL_KEY,
  containerProblems,
  dockerRunArgs,
  loadVerifiedSequence,
  localDockerProblems,
  planProblems,
  receiptPathProblems,
  runBootstrapReplay,
} from "./migration-bootstrap-replay-local.mjs";
import { sha256 } from "./migration-replay-preflight.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const repoPlan = planCanonicalBootstrap(readProvenanceInputs(repo));

test("platform_tokens synthetic pins and full-file prohibition fail closed before Docker", async () => {
  const step = PLATFORM_TOKENS_FIXTURE;
  const disk = (path) => readFileSync(resolve(repo, path), "utf8");
  for (const key of ["sourceLfSha256", "extractedLfSha256", "lfSha256"]) {
    const changed = { ...step, [key]: "0".repeat(64) };
    assert.throws(() => loadVerifiedSequence([changed], disk), /synthetic|pin/i);
    const fake = fakeDocker();
    const receipt = await run(fake, { plan: synthetic({ sequence: [synthetic().sequence[0], changed] }) });
    assert.equal(receipt.refusal?.code, "plan_not_executable");
    assert.deepEqual(fake.calls, []);
  }
  const fake = fakeDocker();
  const receipt = await run(fake, {
    plan: synthetic({ sequence: [synthetic().sequence[0], step] }),
    read: (path) => path === step.sourcePath ? disk(path) + "\n-- drift" : read(path),
  });
  assert.equal(receipt.refusal?.code, "sequence_unreadable");
  assert.deepEqual(fake.calls, []);
  assert.throws(() => loadVerifiedSequence([{ kind: "fixture", path: step.sourcePath, lfSha256: step.sourceLfSha256 }], disk), /not allowed/);
});

test("token lock, catalog/empty guard and DDL are one single-transaction psql call with pinned receipt", async () => {
  const step = PLATFORM_TOKENS_FIXTURE;
  const fake = fakeDocker({ failOn: "NEVER_MATCHES" });
  const receipt = await run(fake, {
    plan: synthetic({ sequence: [synthetic().sequence[0], step] }),
    read: (path) => path === step.sourcePath ? readFileSync(resolve(repo, path), "utf8") : read(path),
  });
  assert.equal(receipt.completed, true);
  const bodies = fake.sql.filter((s) => s.startsWith("LOCK TABLE ONLY public.platform_tokens"));
  assert.equal(bodies.length, 1);
  assert.match(bodies[0], /ACCESS EXCLUSIVE MODE;[\s\S]*IF EXISTS \(SELECT 1 FROM ONLY public.platform_tokens\)[\s\S]*alter table public.platform_tokens add column/);
  for (const args of fake.calls.filter((a) => a.includes("psql"))) {
    assert.ok(args.includes("--single-transaction"));
    assert.ok(args.includes("ON_ERROR_STOP=1"));
  }
  assert.equal(receipt.applied[1].sourcePath, step.sourcePath);
  assert.equal(receipt.applied[1].extractedLfSha256, step.extractedLfSha256);
  assert.equal(receipt.cleanup, "removed");
});

test("any token guard SQL error stops replay and cleans up without a backfill fallback", async () => {
  const step = PLATFORM_TOKENS_FIXTURE;
  const fake = fakeDocker({ failOn: "LOCK TABLE ONLY public.platform_tokens" });
  const receipt = await run(fake, {
    plan: synthetic({ sequence: [synthetic().sequence[0], step, synthetic().sequence[1]] }),
    read: (path) => path === step.sourcePath ? readFileSync(resolve(repo, path), "utf8") : read(path),
  });
  assert.equal(receipt.failure?.kind, "synthetic");
  assert.equal(receipt.applied.length, 1);
  assert.equal(receipt.completed, false);
  assert.ok(!fake.sql.includes(files["apps/web/supabase/migrations/20260520_a.sql"]));
  assert.equal(receipt.cleanup, "removed");
});

test("synthetic fixture verifies every pin before Docker and never loads full legacy SQL as a fixture", async () => {
  const disk = (path) => readFileSync(resolve(repo, path), "utf8");
  const step = PLATFORM_CONFIG_FIXTURE;
  const [loaded] = loadVerifiedSequence([step], disk);
  assert.match(loaded.body, /^CREATE TABLE public\.platform_config \(/);
  assert.doesNotMatch(loaded.body, /UPDATE |INSERT |ALTER |POLICY|GRANT|media_scripts|runs\b/i);
  for (const key of ["sourceLfSha256", "extractedLfSha256", "lfSha256"]) {
    const changed = { ...step, [key]: "0".repeat(64) };
    assert.throws(() => loadVerifiedSequence([changed], disk), /synthetic|pin/i);
    const fake = fakeDocker();
    const receipt = await run(fake, { plan: synthetic({ sequence: [synthetic().sequence[0], changed] }) });
    assert.equal(receipt.refusal?.code, "plan_not_executable");
    assert.deepEqual(fake.calls, []);
  }
  assert.throws(() => loadVerifiedSequence([step], (path) => disk(path) + "\n-- changed source"), /SHA|sha/);
  const drifted = fakeDocker();
  const refused = await run(drifted, {
    plan: synthetic({ sequence: [synthetic().sequence[0], step] }),
    read: (path) => path === step.sourcePath ? disk(path) + "\n-- changed source" : read(path),
  });
  assert.equal(refused.refusal?.code, "sequence_unreadable");
  assert.deepEqual(drifted.calls, []);
  const full = { kind: "fixture", path: step.sourcePath, lfSha256: step.sourceLfSha256 };
  assert.throws(() => loadVerifiedSequence([full], disk), /not allowed/);
  assert.ok(planProblems(synthetic({ sequence: [synthetic().sequence[0], full] })).some((p) => /not allowed/.test(p)));
});

test("synthetic receipt preserves extraction provenance and omitted row/RLS/ACL limitation", async () => {
  const step = PLATFORM_CONFIG_FIXTURE;
  const plan = synthetic({ sequence: [synthetic().sequence[0], step] });
  const fake = fakeDocker({ failOn: "NEVER_MATCHES" });
  const receipt = await run(fake, { plan, read: (path) => path === step.sourcePath ? readFileSync(resolve(repo, path), "utf8") : read(path) });
  assert.equal(receipt.completed, true);
  assert.equal(receipt.replayReady, false);
  assert.equal(receipt.applied[1].sourceLfSha256, step.sourceLfSha256);
  assert.equal(receipt.applied[1].extractedLfSha256, step.extractedLfSha256);
  assert.match(receipt.applied[1].limitation, /No row seeding.*RLS.*ACL/);
  const create = fake.sql.filter((s) => s.startsWith("CREATE TABLE public.platform_config"));
  assert.equal(create.length, 1);
  assert.equal(create[0].split(";").length, 2);
  assert.equal(receipt.cleanup, "removed");
});

test("synthetic CREATE failure stops replay and preserves cleanup without any fallback SQL", async () => {
  const step = PLATFORM_CONFIG_FIXTURE;
  const fake = fakeDocker({ failOn: "CREATE TABLE public.platform_config" });
  const receipt = await run(fake, {
    plan: synthetic({ sequence: [synthetic().sequence[0], step, synthetic().sequence[1]] }),
    read: (path) => path === step.sourcePath ? readFileSync(resolve(repo, path), "utf8") : read(path),
  });
  assert.equal(receipt.failure?.kind, "synthetic");
  assert.equal(receipt.completed, false);
  assert.equal(receipt.applied.length, 1);
  assert.ok(!fake.sql.includes(files["apps/web/supabase/migrations/20260520_a.sql"]));
  assert.equal(receipt.cleanup, "removed");
});

test("repository plan is executable in shape and every pinned file SHA verifies from disk", () => {
  assert.deepEqual(planProblems(repoPlan), []);
  const steps = loadVerifiedSequence(repoPlan.sequence, (path) => readFileSync(resolve(repo, path), "utf8"));
  assert.equal(steps.length, repoPlan.sequence.length);
  assert.equal(steps[0].path, BASELINE_FIXTURE);
  assert.ok(steps.some((s) => s.path === "supabase/migrations/20260601_media_insights.sql"));
});

// Synthetic plan: baseline, one interleaved legacy fixture, two canonical files.
const files = {
  [BASELINE_FIXTURE]: "create table p (id uuid);\r\n",
  "apps/web/supabase/migrations/20260520_a.sql": "create table a (id uuid);\n",
  "supabase/migrations/20260601_f.sql": "create table f (a uuid);\n",
  "apps/web/supabase/migrations/20260602_b.sql": "select 'FAIL_HERE';\n",
};
const lf = (path) => sha256(files[path]);
const synthetic = (overrides = {}) => ({
  schema: "omnira.migration-bootstrap-plan.v1",
  ok: false,
  replayReady: false,
  baseline: BASELINE_FIXTURE,
  sequence: [
    { kind: "fixture", path: BASELINE_FIXTURE, lfSha256: lf(BASELINE_FIXTURE) },
    { kind: "canonical", name: "20260520_a.sql", lfSha256: lf("apps/web/supabase/migrations/20260520_a.sql") },
    { kind: "fixture", path: "supabase/migrations/20260601_f.sql", lfSha256: lf("supabase/migrations/20260601_f.sql") },
    { kind: "canonical", name: "20260602_b.sql", lfSha256: lf("apps/web/supabase/migrations/20260602_b.sql") },
  ],
  blockers: [{ code: "fixture_interleaved" }, { code: "fixture_untracked" }, { code: "execution_not_run" }],
  ...overrides,
});
const read = (path) => {
  if (!(path in files)) throw new Error("ENOENT");
  return files[path];
};
const storageBody = "create schema if not exists storage;\n";
const storagePrerequisites = [["0002-storage-schema.sql", sha256(storageBody)]];

function fakeDocker({ endpoint = "npipe:////./pipe/docker_engine", inspect = {}, label = LABEL, failOn = "FAIL_HERE", cron = "off", cronReadable = true, cronRuns = "0", cronRunsReadable = true, catalog = "[]", catalogThrows = false, catalogStatus = 0 } = {}) {
  const calls = [];
  const sql = [];
  const ok = (stdout = "") => ({ status: 0, stdout, stderr: "" });
  const docker = (args, input) => {
    calls.push(args);
    const [cmd] = args;
    if (cmd === "context") return ok(endpoint + "\n");
    if (cmd === "image" || cmd === "rm") return ok();
    if (cmd === "run") return ok(args.includes("--rm") ? storageBody : "container-id\n");
    if (cmd === "inspect" && args[1] === "--format") return ok(label + "\n");
    if (cmd === "inspect")
      return ok(
        JSON.stringify([
          {
            HostConfig: { NetworkMode: "none", PortBindings: {}, Privileged: false, ...inspect.HostConfig },
            Mounts: inspect.Mounts ?? [],
            Config: { Labels: { [LABEL_KEY]: label } },
          },
        ]),
      );
    if (cmd === "exec" && args.includes("psql")) {
      sql.push(input);
      if (input.startsWith("SELECT COALESCE(json_agg(catalog")) {
        if (catalogThrows) throw new Error("secret query error");
        return { status: catalogStatus, stdout: catalog, stderr: "secret catalog error" };
      }
      if (input.includes("cron.launch_active_jobs")) return cronReadable ? ok(cron + "\n") : { status: 3, stdout: "", stderr: "cannot read cron setting" };
      if (input.includes("cron.job_run_details")) return cronRunsReadable ? ok(cronRuns + "\n") : { status: 3, stdout: "", stderr: "cannot read job_run_details" };
      if (input.includes(failOn)) return { status: 3, stdout: "", stderr: "psql:<stdin>:1: ERROR:  boom" };
      return ok();
    }
    if (cmd === "exec" && args.includes("/proc/1/comm")) return ok("postgres\n");
    if (cmd === "exec") return ok();
    throw new Error(`unexpected docker ${args.join(" ")}`);
  };
  return { docker, calls, sql };
}
const run = (fake, extra = {}) =>
  runBootstrapReplay({ plan: synthetic(), read, docker: fake.docker, storagePrerequisites, sleep: async () => {}, name: "omnira-bootstrap-replay-test", ...extra });

test("container is local-only: --pull=never, --network none, owned label, no mounts or ports, cron launching off", () => {
  const args = dockerRunArgs("n");
  assert.ok(args.includes("--pull=never"));
  assert.deepEqual(args.slice(args.indexOf("--network"), args.indexOf("--network") + 2), ["--network", "none"]);
  assert.ok(args.includes(`${LABEL_KEY}=${LABEL}`));
  assert.ok(args.includes("cron.launch_active_jobs=off"));
  for (const flag of ["-p", "--publish", "-P", "-v", "--volume", "--mount", "--privileged", "--env-file"]) assert.ok(!args.includes(flag), flag);
  assert.deepEqual(localDockerProblems({ endpoint: "npipe:////./pipe/docker_engine" }), []);
  assert.equal(localDockerProblems({ endpoint: "tcp://10.0.0.5:2376" }).length, 1);
  assert.equal(localDockerProblems({ endpoint: "unix:///var/run/docker.sock", env: { DOCKER_HOST: "ssh://host" } }).length, 1);
  assert.deepEqual(containerProblems({ HostConfig: { NetworkMode: "none" }, Mounts: [], Config: { Labels: { [LABEL_KEY]: LABEL } } }), []);
  assert.equal(containerProblems({ HostConfig: { NetworkMode: "bridge", PortBindings: { "5432/tcp": [{}] } }, Mounts: [{}], Config: {} }).length, 4);
});

test("applies prerequisites then the sequence in order, stops at the first failure, cleans up, keeps replayReady false", async () => {
  const fake = fakeDocker();
  const receipt = await run(fake);
  assert.equal(receipt.replayReady, false);
  assert.equal(receipt.completed, false);
  assert.deepEqual(receipt.applied.map((s) => s.path), [
    BASELINE_FIXTURE,
    "apps/web/supabase/migrations/20260520_a.sql",
    "supabase/migrations/20260601_f.sql",
  ]);
  assert.deepEqual(receipt.failure, {
    phase: "sequence",
    index: 3,
    kind: "canonical",
    path: "apps/web/supabase/migrations/20260602_b.sql",
    lfSha256: lf("apps/web/supabase/migrations/20260602_b.sql"),
    error: "psql:<stdin>:1: ERROR:  boom",
  });
  assert.deepEqual(receipt.coverage, { planned: 4, verified: 4, limit: null, attempted: 4, applied: 3, bounded: false });
  assert.deepEqual(receipt.prerequisites.map((p) => p.ref), [
    "platform-stubs",
    "public-default-privileges",
    "public.ecr.aws/supabase/storage-api:v1.79.36/0002-storage-schema.sql",
    "storage-schema-usage",
  ]);
  // The executed body is the LF-normalized, hash-verified file; every psql call stops on error.
  assert.ok(fake.sql.includes("create table p (id uuid);\n"));
  for (const args of fake.calls.filter((a) => a.includes("psql"))) assert.ok(args.includes("ON_ERROR_STOP=1"));
  assert.equal(receipt.environment.cronLaunchActiveJobs, "off");
  assert.equal(receipt.environment.cronJobRuns, 0);
  assert.equal(receipt.cleanup, "removed");
  assert.deepEqual(fake.calls.at(-1), ["rm", "-f", "-v", "omnira-bootstrap-replay-test"]);
  assert.ok(!JSON.stringify(receipt).includes("synthetic-local-only"));
  assert.ok(!JSON.stringify(receipt).includes("omnira-bootstrap-replay-test"));
});

test("a fully applied sequence is completed but still never replayReady", async () => {
  const receipt = await run(fakeDocker({ failOn: "NEVER_MATCHES" }));
  assert.equal(receipt.failure, null);
  assert.equal(receipt.completed, true);
  assert.equal(receipt.replayReady, false);
  assert.equal(receipt.applied.length, 4);
});

test("--limit gives a bounded diagnostic replay that is never reported as complete", async () => {
  const receipt = await run(fakeDocker(), { limit: 2 });
  assert.deepEqual(receipt.coverage, { planned: 4, verified: 4, limit: 2, attempted: 2, applied: 2, bounded: true });
  assert.equal(receipt.completed, false);
  const invalid = await run(fakeDocker(), { limit: 0 });
  assert.equal(invalid.refusal.code, "invalid_limit");
});

test("a SHA mismatch or unreadable file refuses before Docker is touched", async () => {
  for (const [plan, code] of [
    [synthetic({ sequence: [...synthetic().sequence.slice(0, 3), { kind: "canonical", name: "20260602_b.sql", lfSha256: "0".repeat(64) }] }), "sha_mismatch"],
    [synthetic({ sequence: [...synthetic().sequence, { kind: "canonical", name: "20260701_gone.sql", lfSha256: "0".repeat(64) }] }), "sequence_unreadable"],
  ]) {
    const fake = fakeDocker();
    const receipt = await run(fake, { plan });
    assert.equal(receipt.refusal.code, code);
    assert.deepEqual(fake.calls, []);
    assert.equal(receipt.applied.length, 0);
    assert.equal(receipt.replayReady, false);
  }
});

test("unsafe or unexpected plans are refused without Docker", async () => {
  const bad = [
    synthetic({ blockers: [{ code: "fixture_unplaceable", detail: "x" }] }),
    synthetic({ replayReady: true }),
    synthetic({ sequence: [] }),
    synthetic({ sequence: [...synthetic().sequence, { kind: "fixture", path: "../secrets.sql", lfSha256: "0".repeat(64) }] }),
    synthetic({ sequence: [...synthetic().sequence, { kind: "canonical", name: "../x.sql", lfSha256: "0".repeat(64) }] }),
    synthetic({ sequence: [...synthetic().sequence, synthetic().sequence[1]] }),
    synthetic({ sequence: synthetic().sequence.slice(1) }),
  ];
  for (const plan of bad) {
    const fake = fakeDocker();
    const receipt = await run(fake, { plan });
    assert.equal(receipt.refusal?.code, "plan_not_executable");
    assert.deepEqual(fake.calls, []);
  }
});

test("a non-local Docker daemon is refused before any container is created", async () => {
  const fake = fakeDocker({ endpoint: "tcp://build-host:2376" });
  const receipt = await run(fake);
  assert.equal(receipt.refusal.code, "docker_not_local");
  assert.ok(!fake.calls.some((a) => a[0] === "run"));
});

test("an isolation breach stops before SQL and the owned container is still removed", async () => {
  const fake = fakeDocker({ inspect: { Mounts: [{ Source: "C:/host" }] } });
  const receipt = await run(fake);
  assert.equal(receipt.failure.phase, "harness");
  assert.match(receipt.failure.error, /mounts/);
  assert.equal(receipt.applied.length, 0);
  assert.ok(!fake.sql.some((s) => s.includes("create table")));
  assert.equal(receipt.cleanup, "removed");
});

test("a container without our label is never removed", async () => {
  const fake = fakeDocker({ label: "someone-else" });
  const receipt = await run(fake);
  assert.equal(receipt.cleanup, "label_mismatch_not_removed");
  assert.ok(!fake.calls.some((a) => a[0] === "rm"));
});

test("cron launching left on is a guard failure", async () => {
  const receipt = await run(fakeDocker({ failOn: "NEVER_MATCHES", cron: "on" }));
  assert.equal(receipt.failure.phase, "guard");
  assert.equal(receipt.completed, false);
});

test("nonzero, malformed or unreadable cron run evidence fails completed SQL and preserves cleanup", async () => {
  for (const evidence of [{ cronRuns: "1" }, { cronRuns: "" }, { cronRuns: "invalid" }, { cronRuns: "-1" }, { cronRuns: "0.0" }, { cronRunsReadable: false }]) {
    const receipt = await run(fakeDocker({ failOn: "NEVER_MATCHES", ...evidence }));
    assert.equal(receipt.applied.length, 4);
    assert.equal(receipt.failure?.phase, "guard", JSON.stringify(evidence));
    assert.match(receipt.failure.error, /cron.job_run_details/);
    assert.equal(receipt.completed, false);
    assert.equal(receipt.cleanup, "removed");
  }
});

test("receipts can only be written as new migration-bootstrap-replay files under docs/validation", () => {
  assert.deepEqual(receiptPathProblems(repo, "docs/validation/migration-bootstrap-replay.json"), []);
  assert.deepEqual(receiptPathProblems(repo, "docs/validation/migration-bootstrap-replay-limit5.json"), []);
  for (const path of [
    "docs/validation/calendar-full-ledger-replay-20261024.json",
    "docs/validation/../migration-bootstrap-replay.json",
    "docs/validation/sub/migration-bootstrap-replay.json",
    "migration-bootstrap-replay.json",
  ])
    assert.equal(receiptPathProblems(repo, path).length, 1, path);
});

// Independent, metadata-only fixture; no dependency on the external snapshot in tests.
const catalogNames = ['agents', 'cron_heartbeat', 'dream_issues', 'manager_tasks', 'media_insights', 'memories', 'outputs', 'platform_config', 'platform_tokens', 'projects', 'revenue_snapshots', 'run_logs', 'runs', 'workflows'];
const catalogRecords = () => catalogNames.map((table_name) => ({
  table_name, rls_enabled: true, force_rls: false, owner: 'postgres', policy_count: 1,
  column_count: 9, anon_select: true, authenticated_select: true, service_select: true,
  anon_insert: true, authenticated_insert: true,
}));
const catalogOptions = (records = catalogRecords()) => ({
  catalogCompare: resolve(repo, '../../local-evidence/catalog.json'),
  readCatalog: () => JSON.stringify({ source: 'metadata only', records }),
});
const catalogQueries = (fake) => fake.sql.filter((sql) => sql.includes('pg_catalog.pg_class'));

test('catalog comparison reports only metadata differences after full replay and cron guards, then removes container', async () => {
  const local = catalogRecords();
  local[0].owner = 'supabase_admin';
  local[1].anon_select = false;
  const fake = fakeDocker({ failOn: 'NEVER_MATCHES', catalog: JSON.stringify(local) });
  const receipt = await run(fake, catalogOptions());
  assert.equal(receipt.completed, true);
  assert.equal(receipt.replayReady, false);
  assert.equal(receipt.cleanup, 'removed');
  const comparison = receipt.diagnostics.catalogComparison;
  assert.equal(comparison.status, 'compared');
  assert.equal(comparison.matches, false);
  assert.deepEqual(comparison.differences, [
    { table_name: 'agents', field: 'owner', external: 'postgres', local: 'supabase_admin' },
    { table_name: 'cron_heartbeat', field: 'anon_select', external: true, local: false },
  ]);
  assert.match(comparison.limitations.join(' '), /ownership.*default privileges/i);
  assert.match(comparison.limitations.join(' '), /RLS policy definitions.*not checked/i);
  assert.equal(catalogQueries(fake).length, 1);
  assert.ok(fake.sql.indexOf(catalogQueries(fake)[0]) > fake.sql.indexOf('select count(*) from cron.job_run_details'));
  const args = fake.calls.find((args) => args.some((arg) => arg.includes('default_transaction_read_only=on')));
  assert.ok(args.includes('-e'));
  assert.ok(args.includes('ON_ERROR_STOP=1'));
  const sql = catalogQueries(fake)[0];
  // Privilege names such as 'INSERT' are string values, not SQL commands.
  assert.doesNotMatch(sql.replace(/'[^']*'/g, "''"), /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|COPY|DO|CALL)\b/i);
  assert.deepEqual([...sql.matchAll(/\b(?:FROM|JOIN)\s+([a-z_.]+)/gi)].map((m) => m[1]).sort(),
    ['pg_catalog.pg_attribute', 'pg_catalog.pg_class', 'pg_catalog.pg_namespace', 'pg_catalog.pg_policy']);
  const queriedNames = [...sql.slice(sql.indexOf('c.relname IN (')).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(queriedNames, catalogNames);
  assert.equal(Object.hasOwn(comparison, 'source'), false);
  assert.doesNotMatch(JSON.stringify(comparison), /records|local-evidence/);
});

test('catalog all-match and missing-table evidence never makes replayReady true', async () => {
  for (const missing of [false, true]) {
    const local = catalogRecords();
    if (missing) local.pop();
    const fake = fakeDocker({ failOn: 'NEVER_MATCHES', catalog: JSON.stringify(local) });
    const receipt = await run(fake, catalogOptions());
    assert.equal(receipt.diagnostics.catalogComparison.matches, !missing);
    assert.deepEqual(receipt.diagnostics.catalogComparison.missingTables, missing ? ['workflows'] : []);
    assert.equal(receipt.replayReady, false);
    assert.equal(receipt.cleanup, 'removed');
  }
});

test('catalog query is skipped after failed, bounded or unsafe replay; default has no new diagnostics', async () => {
  for (const options of [{}, { limit: 2 }, { plan: synthetic({ replayReady: true }) }, { failOn: 'NEVER_MATCHES', cronRuns: '1' }, { failOn: 'NEVER_MATCHES', cron: 'on' }]) {
    const fake = fakeDocker(options);
    const { failOn, cronRuns, cron, ...extra } = options;
    const receipt = await run(fake, { ...catalogOptions(), ...extra });
    assert.equal(catalogQueries(fake).length, 0);
    assert.equal(receipt.diagnostics.catalogComparison.status, 'skipped');
    assert.equal(receipt.cleanup, options.plan ? 'not_created' : 'removed');
  }
  const receipt = await run(fakeDocker());
  assert.equal(Object.hasOwn(receipt, 'diagnostics'), false);
});

test('malformed or unavailable external catalog refuses before Docker without leaking input or errors', async () => {
  const valid = catalogRecords();
  const variants = [valid.slice(1), [...valid, valid[0]], valid.map((r, i) => i ? r : { ...r, table_name: "agents'; select secret" }),
    valid.map((r, i) => i ? r : { ...r, password: 'secret' }),
    ...['true', null, 1].map((rls_enabled) => valid.map((r, i) => i ? r : { ...r, rls_enabled })),
    ...[-1, 1.5, '1', Number.MAX_SAFE_INTEGER + 1].map((policy_count) => valid.map((r, i) => i ? r : { ...r, policy_count })),
    valid.map((r, i) => i ? r : { ...r, owner: 'secret\nowner' }),
  ];
  for (const options of [...variants.map(catalogOptions),
    { ...catalogOptions(), readCatalog: () => { throw new Error('secret path credential'); } },
    { ...catalogOptions(), readCatalog: () => 'secret malformed JSON' },
    { ...catalogOptions(), readCatalog: () => JSON.stringify({ records: valid, credentials: 'secret' }) },
    { ...catalogOptions(), catalogCompare: 'https://secret.example/catalog.json' },
    { ...catalogOptions(), catalogCompare: '\\\\secret-host\\catalog.json' },
  ]) {
    const fake = fakeDocker();
    const receipt = await run(fake, options);
    assert.equal(receipt.refusal?.code, 'catalog_metadata_invalid');
    assert.deepEqual(fake.calls, []);
    assert.doesNotMatch(JSON.stringify(receipt), /secret|credential|password/);
  }
});

test('catalog query errors and malformed outputs fail closed, suppress raw output and preserve cleanup', async () => {
  const valid = catalogRecords();
  for (const options of [{ catalogThrows: true }, { catalogStatus: 3, catalog: JSON.stringify(valid) }, { catalog: 'secret malformed output' },
    { catalog: JSON.stringify([...valid, valid[0]]) },
    { catalog: JSON.stringify(valid.map((r, i) => i ? r : { ...r, owner: 'secret\nvalue' })) },
    { catalog: JSON.stringify(valid.map((r, i) => i ? r : { ...r, table_name: 'secret' })) },
  ]) {
    const fake = fakeDocker({ failOn: 'NEVER_MATCHES', ...options });
    const receipt = await run(fake, catalogOptions());
    assert.equal(receipt.completed, false);
    assert.equal(receipt.failure?.phase, 'catalog_comparison');
    assert.equal(receipt.diagnostics.catalogComparison.status, 'unavailable');
    assert.equal(receipt.cleanup, 'removed');
    assert.equal(receipt.environment.cronJobRuns, 0);
    assert.doesNotMatch(JSON.stringify(receipt), /secret/);
  }
});

test('catalog comparison requires readable cron launch-off evidence before its query', async () => {
  const fake = fakeDocker({ failOn: 'NEVER_MATCHES', cronReadable: false });
  const receipt = await run(fake, catalogOptions());
  assert.equal(catalogQueries(fake).length, 0);
  assert.equal(receipt.completed, false);
  assert.equal(receipt.failure?.phase, 'guard');
  assert.equal(receipt.cleanup, 'removed');
});

test('catalog comparison covers every requested field and emits only changed metadata', async () => {
  const local = catalogRecords();
  Object.assign(local[0], { rls_enabled: false, force_rls: true, owner: 'supabase_admin',
    policy_count: 2, column_count: 10, anon_select: false, authenticated_select: false,
    service_select: false, anon_insert: false, authenticated_insert: false });
  const receipt = await run(fakeDocker({ failOn: 'NEVER_MATCHES', catalog: JSON.stringify(local) }), catalogOptions());
  assert.deepEqual(receipt.diagnostics.catalogComparison.differences, [
    { table_name: 'agents', field: 'rls_enabled', external: true, local: false },
    { table_name: 'agents', field: 'force_rls', external: false, local: true },
    { table_name: 'agents', field: 'owner', external: 'postgres', local: 'supabase_admin' },
    { table_name: 'agents', field: 'policy_count', external: 1, local: 2 },
    { table_name: 'agents', field: 'column_count', external: 9, local: 10 },
    { table_name: 'agents', field: 'anon_select', external: true, local: false },
    { table_name: 'agents', field: 'authenticated_select', external: true, local: false },
    { table_name: 'agents', field: 'service_select', external: true, local: false },
    { table_name: 'agents', field: 'anon_insert', external: true, local: false },
    { table_name: 'agents', field: 'authenticated_insert', external: true, local: false },
  ]);
});

test('storage API schema access runs after storage creation and before baseline replay', async () => {
 const fake=fakeDocker({failOn:'NEVER_MATCHES'});
 const receipt=await run(fake);
 const grant='grant usage on schema storage to anon, authenticated, service_role;';
 const at=fake.sql.indexOf(grant);
 assert.ok(at>=0,'storage schema usage prerequisite was not executed');
 assert.ok(fake.sql.slice(0,at).some(s=>s.startsWith("SET storage.install_roles='false';")));
 assert.ok(at<fake.sql.indexOf(files[BASELINE_FIXTURE].replace(/\r\n/g,'\n')));
 const pin=receipt.prerequisites.find(p=>p.ref==='storage-schema-usage');
 assert.equal(pin?.lfSha256,sha256(grant));
 assert.equal(receipt.completed,true);
 assert.equal(receipt.replayReady,false);
});
test('storage schema access failure aborts before migrations and preserves cleanup', async () => {
 const fake=fakeDocker({failOn:'grant usage on schema storage'});
 const receipt=await run(fake);
 assert.equal(receipt.completed,false);
 assert.equal(receipt.failure?.phase,'prerequisites');
 assert.equal(receipt.failure?.ref,'storage-schema-usage');
 assert.equal(receipt.applied.length,0);
 assert.equal(receipt.cleanup,'removed');
});
