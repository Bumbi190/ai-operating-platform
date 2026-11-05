// Local-only executable proof for migration-bootstrap-plan.mjs. Test tooling: never runs hosted SQL,
// reads no credentials and needs no network. Applies the plan's hash-pinned sequence to one owned,
// labeled, disposable Docker Postgres (--pull=never, --network none, no mounts or ports, cron job
// launching off) that is removed in finally. Every file SHA is verified before any container exists;
// psql runs each file with ON_ERROR_STOP and the first failure stops the replay. The receipt is
// nonsecret diagnostic evidence only: replayReady stays false unconditionally.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { readProvenanceInputs } from "./migration-baseline-provenance.mjs";
import { BASELINE_FIXTURE, planCanonicalBootstrap } from "./migration-bootstrap-plan.mjs";
import { CANONICAL_DIR, LEGACY_DIR, sha256 } from "./migration-replay-preflight.mjs";

// Same pinned images and platform prerequisites as verify-calendar-full-ledger-local.mjs.
export const IMAGE = "public.ecr.aws/supabase/postgres:17.11.0.004";
export const STORAGE_IMAGE = "public.ecr.aws/supabase/storage-api:v1.79.36";
export const STORAGE_PREREQUISITES = Object.freeze([
  ["0002-storage-schema.sql", "19562682ff1b77cda9ba096671b873e7e226b10f0b0564bd4823e6c1754393b6"],
  ["0008-add-public-to-buckets.sql", "1d881092aea62e83493f1a9c4cb4f101f3035a08d62be84a7e7970ee0c6f0f48"],
]);
export const LABEL_KEY = "com.omnira.testplan";
export const LABEL = "migration-bootstrap-replay";
export const DATABASE = "bootstrap_replay_test";
export const DEFAULT_RECEIPT = "docs/validation/migration-bootstrap-replay.json";
const SYNTHETIC_PASSWORD = "synthetic-local-only";
const ALLOWED_PLAN_BLOCKERS = new Set(["execution_not_run", "fixture_interleaved", "fixture_untracked"]);
const LOCAL_ENDPOINT = /^(npipe|unix):\/\//;
const SAFE_NAME = "[0-9A-Za-z_.-]+\\.sql";
const LEGACY_PATH = new RegExp(`^${LEGACY_DIR.replace(/\//g, "\\/")}\\/${SAFE_NAME}$`);
const CANONICAL_NAME = new RegExp(`^${SAFE_NAME}$`);
const SHA = /^[0-9a-f]{64}$/;
const DISCLAIMER =
  "Local disposable Docker diagnostic only (--pull=never, --network none, no mounts or ports, cron job launching off). Fixtures are untracked test inputs; even a completed run is not clean-bootstrap, hosted parity or production readiness evidence.";

const PLATFORM_SQL = `create schema extensions;create extension pgcrypto with schema extensions;create extension pg_cron;create extension pg_net;
create schema auth;create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);`;
// A new createdb lacks the managed project's per-database default ACLs; mirrors the ledger replay.
const DEFAULT_PRIVILEGES_SQL = `alter default privileges for role supabase_admin in schema public grant all on tables to postgres,anon,authenticated,service_role;
alter default privileges for role supabase_admin in schema public grant all on sequences to postgres,anon,authenticated,service_role;
alter default privileges for role supabase_admin in schema public grant execute on functions to postgres,anon,authenticated,service_role;
grant usage on schema auth to anon,authenticated,service_role;`;

class Refusal extends Error {
  constructor(code, detail) {
    super(detail);
    this.code = code;
  }
}

const redact = (text) => String(text ?? "").replaceAll(SYNTHETIC_PASSWORD, "[synthetic]").slice(0, 2000);

export function stepPath(step) {
  if (step?.kind === "canonical") return CANONICAL_NAME.test(step.name ?? "") ? `${CANONICAL_DIR}/${step.name}` : null;
  if (step?.kind === "fixture") return step.path === BASELINE_FIXTURE || LEGACY_PATH.test(step.path ?? "") ? step.path : null;
  return null;
}

export function planProblems(plan) {
  const problems = [];
  if (plan?.schema !== "omnira.migration-bootstrap-plan.v1") problems.push("unexpected plan schema");
  if (plan?.replayReady !== false) problems.push("plan must keep replayReady=false");
  for (const b of plan?.blockers ?? [])
    if (!ALLOWED_PLAN_BLOCKERS.has(b.code)) problems.push(`plan blocker ${b.code}: ${b.detail}`);
  const sequence = plan?.sequence ?? [];
  if (!sequence.length) problems.push("plan has no sequence");
  else if (sequence[0].kind !== "fixture" || sequence[0].path !== BASELINE_FIXTURE)
    problems.push(`sequence must start with ${BASELINE_FIXTURE}`);
  const seen = new Set();
  sequence.forEach((step, i) => {
    const path = stepPath(step);
    if (!path) problems.push(`step ${i}: path not allowed`);
    else if (seen.has(path)) problems.push(`step ${i}: duplicate ${path}`);
    else seen.add(path);
    if (!SHA.test(step?.lfSha256 ?? "")) problems.push(`step ${i}: missing lfSha256`);
  });
  return problems;
}

// Reads and verifies every step before anything runs; the verified LF body is exactly what executes.
export function loadVerifiedSequence(sequence, read) {
  return sequence.map((step, index) => {
    const path = stepPath(step);
    let body;
    try {
      body = read(path).replace(/\r\n/g, "\n");
    } catch (error) {
      throw new Refusal("sequence_unreadable", `${path}: ${error.message}`);
    }
    const actual = sha256(body);
    if (actual !== step.lfSha256) throw new Refusal("sha_mismatch", `${path} pinned ${step.lfSha256}, found ${actual}`);
    return { index, kind: step.kind, path, lfSha256: actual, body };
  });
}

const stepRef = ({ index, kind, path, lfSha256 }) => ({ index, kind, path, lfSha256 });

export function replaySteps({ steps, apply, limit = steps.length }) {
  const applied = [];
  for (const step of steps.slice(0, limit)) {
    const result = apply(step.body);
    if (!result.ok) return { applied, failure: { ...stepRef(step), error: redact(result.error) } };
    applied.push(stepRef(step));
  }
  return { applied, failure: null };
}

export function localDockerProblems({ endpoint, env = {} }) {
  const problems = [];
  if (!LOCAL_ENDPOINT.test(endpoint ?? "")) problems.push("docker context endpoint is not a local socket or named pipe");
  if (env.DOCKER_HOST && !LOCAL_ENDPOINT.test(env.DOCKER_HOST)) problems.push("DOCKER_HOST points at a non-local daemon");
  return problems;
}

export const dockerRunArgs = (name) => [
  "run", "--pull=never", "-d", "--name", name, "--label", `${LABEL_KEY}=${LABEL}`, "--network", "none",
  "-e", `POSTGRES_PASSWORD=${SYNTHETIC_PASSWORD}`, IMAGE, "postgres",
  "-c", "shared_preload_libraries=pg_stat_statements,pg_cron,pg_net",
  "-c", "cron.launch_active_jobs=off", "-c", `cron.database_name=${DATABASE}`,
];

const psqlArgs = (name) => [
  "exec", "-i", name, "psql", "-X", "-q", "-A", "-t", "--single-transaction",
  "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", DATABASE,
];

export function containerProblems(inspect) {
  const problems = [];
  if (inspect?.HostConfig?.NetworkMode !== "none") problems.push("network is not none");
  if ((inspect?.Mounts ?? []).length) problems.push("container has mounts");
  if (Object.keys(inspect?.HostConfig?.PortBindings ?? {}).length || inspect?.HostConfig?.PublishAllPorts)
    problems.push("container publishes ports");
  if (inspect?.HostConfig?.Privileged) problems.push("container is privileged");
  if (inspect?.Config?.Labels?.[LABEL_KEY] !== LABEL) problems.push("container label mismatch");
  return problems;
}

export function receiptPathProblems(repo, path) {
  const rel = relative(resolve(repo, "docs/validation"), resolve(repo, path));
  return rel === basename(rel) && /^migration-bootstrap-replay[0-9A-Za-z_.-]*\.json$/.test(rel)
    ? []
    : ["receipt must be docs/validation/migration-bootstrap-replay*.json"];
}

function baseReceipt(plan, limit) {
  return {
    schema: "omnira.migration-bootstrap-replay.v1",
    replayReady: false,
    completed: false,
    disclaimer: DISCLAIMER,
    planSha256: sha256(JSON.stringify(plan?.sequence ?? [])),
    planBlockers: (plan?.blockers ?? []).map((b) => b.code),
    environment: {
      image: IMAGE,
      storageImage: STORAGE_IMAGE,
      pull: "never",
      label: `${LABEL_KEY}=${LABEL}`,
      inspected: null,
      cronLaunchActiveJobs: null,
      cronJobRuns: null,
    },
    coverage: { planned: plan?.sequence?.length ?? 0, verified: 0, limit, attempted: 0, applied: 0, bounded: false },
    prerequisites: [],
    applied: [],
    failure: null,
    refusal: null,
    cleanup: "not_created",
  };
}

export async function runBootstrapReplay({
  plan,
  read,
  docker,
  env = {},
  limit = null,
  storagePrerequisites = STORAGE_PREREQUISITES,
  sleep = (ms) => new Promise((done) => setTimeout(done, ms)),
  name = `omnira-bootstrap-replay-${randomUUID()}`,
}) {
  const receipt = baseReceipt(plan, limit);
  const refuse = (code, detail) => ((receipt.refusal = { code, detail: redact(detail) }), receipt);
  const problems = planProblems(plan);
  if (problems.length) return refuse("plan_not_executable", problems.join("; "));
  if (limit !== null && !(Number.isInteger(limit) && limit > 0)) return refuse("invalid_limit", String(limit));
  let steps;
  try {
    steps = loadVerifiedSequence(plan.sequence, read);
  } catch (error) {
    return refuse(error.code ?? "sequence_unreadable", error.message);
  }
  receipt.coverage.verified = steps.length;

  const mustRaw = (args, input) => {
    const result = docker(args, input);
    if (result.status !== 0) throw new Error(`docker ${args[0]} failed: ${redact(result.stderr || result.error?.message)}`);
    return result.stdout;
  };
  const must = (args, input) => mustRaw(args, input).trim();
  try {
    const dockerProblems = localDockerProblems({
      endpoint: must(["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"]),
      env,
    });
    if (dockerProblems.length) return refuse("docker_not_local", dockerProblems.join("; "));
    must(["image", "inspect", IMAGE]);
    must(["image", "inspect", STORAGE_IMAGE]);
  } catch (error) {
    return refuse("docker_unavailable", error.message);
  }

  const psql = (body) => {
    const result = docker(psqlArgs(name), body);
    return result.status === 0
      ? { ok: true, stdout: result.stdout.trim() }
      : { ok: false, error: result.stderr || result.error?.message || `psql exit ${result.status}` };
  };
  const prerequisite = (ref, body, extra = {}) => {
    const result = psql(body);
    if (!result.ok) {
      receipt.failure = { phase: "prerequisites", ref, error: redact(result.error) };
      throw new Error(`prerequisite ${ref} failed`);
    }
    receipt.prerequisites.push({ ref, lfSha256: sha256(body), ...extra });
  };

  let attempted = false;
  try {
    attempted = true;
    must(dockerRunArgs(name));
    let ready = false;
    for (let i = 0; i < 60 && !ready; i++) {
      // The entrypoint's temporary init server also answers pg_isready; wait for the final postgres.
      ready =
        docker(["exec", name, "pg_isready", "-U", "postgres"]).status === 0 &&
        ["postgres", ".postgres-wrapp"].includes(must(["exec", name, "cat", "/proc/1/comm"]));
      if (!ready) await sleep(500);
    }
    if (!ready) throw new Error("local PostgreSQL not ready");
    const inspect = JSON.parse(must(["inspect", name]))[0];
    const isolation = containerProblems(inspect);
    if (isolation.length) throw new Error(`container isolation: ${isolation.join("; ")}`);
    receipt.environment.inspected = { network: "none", mounts: 0, publishedPorts: 0, privileged: false };
    must(["exec", name, "createdb", "-U", "postgres", DATABASE]);

    prerequisite("platform-stubs", PLATFORM_SQL);
    prerequisite("public-default-privileges", DEFAULT_PRIVILEGES_SQL);
    for (const [upstream, expected] of storagePrerequisites) {
      // Raw stdout: the pinned hash covers the exact upstream file, trailing newline included.
      const exact = mustRaw(["run", "--rm", "--pull=never", "--network", "none", "--entrypoint", "cat", STORAGE_IMAGE, `/app/migrations/tenant/${upstream}`]);
      if (sha256(exact) !== expected) throw new Error(`storage prerequisite ${upstream} hash mismatch`);
      prerequisite(`${STORAGE_IMAGE}/${upstream}`, `SET storage.install_roles='false';${exact}`, { sourceSha256: expected });
    }

    const effective = limit ?? steps.length;
    receipt.coverage.bounded = effective < steps.length;
    const { applied, failure } = replaySteps({ steps, apply: psql, limit: effective });
    receipt.applied = applied;
    receipt.coverage.applied = applied.length;
    receipt.coverage.attempted = applied.length + (failure ? 1 : 0);
    if (failure) receipt.failure = { phase: "sequence", ...failure };
  } catch (error) {
    if (!receipt.failure) receipt.failure = { phase: "harness", error: redact(error.message) };
  } finally {
    if (attempted) {
      // Read-only proof the fixture never launched jobs; runs even after a sequence failure.
      const launch = psql("select current_setting('cron.launch_active_jobs')");
      receipt.environment.cronLaunchActiveJobs = launch.ok ? launch.stdout : null;
      const runs = psql("select count(*) from cron.job_run_details");
      receipt.environment.cronJobRuns = runs.ok ? Number(runs.stdout) : null;
      if (receipt.environment.inspected && launch.ok && launch.stdout !== "off" && !receipt.failure)
        receipt.failure = { phase: "guard", error: "cron.launch_active_jobs is not off" };
      // The random name is ours alone; remove only if it carries our label.
      const labelled = docker(["inspect", "--format", `{{index .Config.Labels "${LABEL_KEY}"}}`, name]);
      if (labelled.status !== 0) receipt.cleanup = "not_created";
      else if (labelled.stdout.trim() !== LABEL) receipt.cleanup = "label_mismatch_not_removed";
      else receipt.cleanup = docker(["rm", "-f", "-v", name]).status === 0 ? "removed" : "remove_failed";
    }
  }
  receipt.completed = !receipt.failure && !receipt.coverage.bounded && receipt.applied.length === steps.length;
  receipt.replayReady = false;
  return receipt;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const { values } = parseArgs({ options: { limit: { type: "string" }, receipt: { type: "string" } } });
  const receiptPath = values.receipt ?? DEFAULT_RECEIPT;
  const pathProblems = receiptPathProblems(repo, receiptPath);
  if (pathProblems.length) throw new Error(pathProblems.join("; "));
  const dockerBin = process.env.DOCKER_BIN || "docker";
  const receipt = await runBootstrapReplay({
    plan: planCanonicalBootstrap(readProvenanceInputs(repo)),
    read: (path) => readFileSync(resolve(repo, path), "utf8"),
    docker: (args, input) =>
      spawnSync(dockerBin, args, { input, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 600000 }),
    env: { DOCKER_HOST: process.env.DOCKER_HOST },
    limit: values.limit === undefined ? null : Number(values.limit),
  });
  writeFileSync(resolve(repo, receiptPath), JSON.stringify(receipt, null, 2) + "\n");
  const { planned, attempted, applied } = receipt.coverage;
  console.log(
    `${receipt.refusal ? `REFUSED ${receipt.refusal.code}` : receipt.failure ? `FAILED at ${receipt.failure.path ?? receipt.failure.ref ?? receipt.failure.phase}` : "SEQUENCE APPLIED"}; ` +
      `applied=${applied}/${planned} attempted=${attempted}; cleanup=${receipt.cleanup}; replayReady remains false. Receipt: ${receiptPath}`,
  );
  process.exitCode = receipt.completed ? 0 : 1;
}
