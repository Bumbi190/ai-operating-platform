import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readProvenanceInputs } from "./migration-baseline-provenance.mjs";
import { BASELINE_FIXTURE, planCanonicalBootstrap } from "./migration-bootstrap-plan.mjs";
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

function fakeDocker({ endpoint = "npipe:////./pipe/docker_engine", inspect = {}, label = LABEL, failOn = "FAIL_HERE", cron = "off" } = {}) {
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
      if (input.includes("cron.launch_active_jobs")) return ok(cron + "\n");
      if (input.includes("cron.job_run_details")) return ok("0\n");
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
