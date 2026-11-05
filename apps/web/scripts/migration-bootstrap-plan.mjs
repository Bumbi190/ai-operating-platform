// Offline bootstrap plan. Reads files only: no SQL execution, Docker, network or secrets.
// Composes existing SQL and explicitly pinned, guarded schema-only extractions
// into an ordered fixture sequence for a disposable local replay of every
// canonical migration. A plan is never replay evidence: ok, replayReady and executionValidated stay false.
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { orderReplayMigrations } from "./analysis-replay-order.mjs";
import {
  createdRelations,
  inspectBaselineProvenance,
  readProvenanceInputs,
  relationRefs,
} from "./migration-baseline-provenance.mjs";
import { LEGACY_DIR, sha256 } from "./migration-replay-preflight.mjs";

// Same baseline the historical ledger replay (verify-calendar-full-ledger-local.mjs) applies.
export const BASELINE_FIXTURE = "packages/db/full_schema_run_in_supabase.sql";
// This source is NEVER executable as a full fixture: it updates unrelated operational tables.
export const PLATFORM_CONFIG_FIXTURE = Object.freeze({
  kind: "synthetic",
  path: "synthetic/platform_config_table_only",
  sourcePath: "supabase/migrations/20260528_pass_a_safeguards.sql",
  sourceLfSha256: "4665ac611487c0d833914c2b2e40de11b2e0433e9ed89d172b9b0e463e4c0c04",
  extractedLfSha256: "6d79a5b176cb70f544c6e149693b01f1349262847d27d3c98b5250f22c7bfe18",
  lfSha256: "8b7a5960642aa6c02b9a0bc192d05c46a1d19f9af90d103f9c0a67455e396355",
  limitation: "No row seeding, RLS or explicit ACL reconstruction. Executor default privileges may apply; no production security parity claim.",
});
const PLATFORM_CONFIG_FIRST_USE = "20260831_budget_scopes.sql";

export function extractPlatformConfigTable(source) {
  const lf = source.replace(/\r\n/g, "\n");
  if (sha256(lf) !== PLATFORM_CONFIG_FIXTURE.sourceLfSha256) throw new Error("platform_config source SHA mismatch");
  // Safe only for these exact reviewed source bytes, not a general SQL extraction parser.
  const matches = [...lf.matchAll(/^CREATE TABLE IF NOT EXISTS platform_config \([\s\S]*?^\);/gm)];
  if (matches.length !== 1) throw new Error("platform_config CREATE extraction ambiguous");
  const extracted = matches[0][0] + "\n";
  if (sha256(extracted) !== PLATFORM_CONFIG_FIXTURE.extractedLfSha256) throw new Error("platform_config extracted SHA mismatch");
  // Plain CREATE is the atomic absence guard: never accept an existing relation with unknown shape.
  // Qualifying the target and requiring absence are the only changes to the reviewed statement.
  const body = extracted.replace("CREATE TABLE IF NOT EXISTS platform_config (", "CREATE TABLE public.platform_config (");
  if (sha256(body) !== PLATFORM_CONFIG_FIXTURE.lfSha256) throw new Error("platform_config executable SHA mismatch");
  return { extracted, body };
}

export const PLATFORM_TOKENS_FIXTURE = Object.freeze({
  kind: "synthetic",
  path: "synthetic/platform_tokens_schema_only",
  sourcePath: "supabase/migrations/20260602_g1_multitenant_platform_tokens.sql",
  sourceLfSha256: "88a3f8e1f95cf3334dbedc11edb924a316d630ea52f7d47458665766db712d98",
  extractedLfSha256: "232551356dbbf8f28409890de69bd784ab6d11aef4241d1f717f3e1d35eef543",
  lfSha256: "45fc6471291c6bd21b41c458d4dc4e713f6f50873ed285176a162f29759e704b",
  limitation: "Empty-token offline schema prerequisite only; no credential backfill, row seeding, RLS or ACL changes; no hosted parity claim.",
});
const PLATFORM_TOKENS_FIRST_USE = "20260914120300_platform_tokens_project_binding.sql";
// LOCK requires a surrounding transaction. The executor sends this entire body once with
// --single-transaction and ON_ERROR_STOP. Nothing catches a failed lock, catalog read or empty check.
// Table ownership/bypass is required so RLS cannot hide credential rows from SELECT 1.
const PLATFORM_TOKENS_GUARD = `LOCK TABLE ONLY public.platform_tokens IN ACCESS EXCLUSIVE MODE;
DO $guard$
DECLARE
  target oid := 'public.platform_tokens'::regclass;
  names text[]; types oid[]; required boolean[]; defaults text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_roles r ON r.rolname = current_user
    WHERE c.oid = target AND c.relkind = 'r' AND NOT c.relispartition
      AND c.relrowsecurity AND NOT c.relforcerowsecurity
      AND (r.rolsuper OR r.rolbypassrls OR c.relowner = r.oid)
  ) OR EXISTS (SELECT 1 FROM pg_catalog.pg_inherits WHERE inhrelid = target OR inhparent = target) THEN
    RAISE EXCEPTION 'expected old platform_tokens schema and unfiltered read authority';
  END IF;
  IF EXISTS (SELECT 1 FROM ONLY public.platform_tokens) THEN
    RAISE EXCEPTION 'platform_tokens must be empty for offline schema fixture';
  END IF;
  SELECT array_agg(a.attname::text ORDER BY a.attnum), array_agg(a.atttypid ORDER BY a.attnum),
         array_agg(a.attnotnull ORDER BY a.attnum),
         array_agg(coalesce(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '<none>') ORDER BY a.attnum)
    INTO names, types, required, defaults
    FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = target AND a.attnum > 0 AND NOT a.attisdropped;
  IF names IS DISTINCT FROM ARRAY['id','platform','token_type','access_token','expires_at','refreshed_at','created_at']::text[]
     OR types IS DISTINCT FROM ARRAY['uuid'::regtype::oid,'text'::regtype::oid,'text'::regtype::oid,'text'::regtype::oid,
                                    'timestamptz'::regtype::oid,'timestamptz'::regtype::oid,'timestamptz'::regtype::oid]
     OR required IS DISTINCT FROM ARRAY[true,true,true,true,false,true,true]
     OR defaults IS DISTINCT FROM ARRAY['gen_random_uuid()','<none>',$default$'user'::text$default$,'<none>','<none>','now()','now()']::text[]
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = target AND attnum > 0
                AND (attisdropped OR atttypmod <> -1 OR attidentity <> '' OR attgenerated <> '')) THEN
    RAISE EXCEPTION 'expected old platform_tokens schema: columns/defaults';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_constraint WHERE conrelid = target) <> 2
     OR (SELECT count(*) FROM pg_catalog.pg_constraint c WHERE c.conrelid = target
         AND c.convalidated AND NOT c.condeferrable AND NOT c.condeferred
         AND ((c.conname = 'platform_tokens_pkey' AND c.contype = 'p' AND c.conkey = ARRAY[1]::smallint[])
           OR (c.conname = 'platform_tokens_platform_token_type_key' AND c.contype = 'u' AND c.conkey = ARRAY[2,3]::smallint[]))) <> 2
     OR (SELECT count(*) FROM pg_catalog.pg_index WHERE indrelid = target) <> 2
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_index WHERE indrelid = target
                AND (NOT indisvalid OR NOT indisready OR NOT indisunique OR indpred IS NOT NULL OR indexprs IS NOT NULL))
     OR pg_catalog.to_regclass('public.platform_tokens_project_platform_type_key') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid = target)
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid = target AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'expected old platform_tokens schema: constraints/indexes/policies/triggers';
  END IF;
END;
$guard$;
`;

export function extractPlatformTokensSchema(source) {
  const lf = source.replace(/\r\n/g, "\n");
  if (sha256(lf) !== PLATFORM_TOKENS_FIXTURE.sourceLfSha256) throw new Error("platform_tokens source SHA mismatch");
  const statements = [...lf.matchAll(/^alter table public\.platform_tokens (?:add column|drop constraint)[^;]*;|^create unique index if not exists platform_tokens_project_platform_type_key\n  on public\.platform_tokens \(project_id, platform, token_type\);/gm)].map((m) => m[0]);
  if (statements.length !== 4) throw new Error("platform_tokens schema extraction ambiguous");
  const extracted = statements.join("\n") + "\n";
  if (sha256(extracted) !== PLATFORM_TOKENS_FIXTURE.extractedLfSha256) throw new Error("platform_tokens extracted SHA mismatch");
  const body = PLATFORM_TOKENS_GUARD + extracted;
  if (sha256(body) !== PLATFORM_TOKENS_FIXTURE.lfSha256) throw new Error("platform_tokens executable SHA mismatch");
  return { extracted, body };
}

export const SYNTHETIC_FIXTURES = Object.freeze([PLATFORM_CONFIG_FIXTURE, PLATFORM_TOKENS_FIXTURE]);
export function extractSyntheticFixture(step, source) {
  if (step.path === PLATFORM_CONFIG_FIXTURE.path) return extractPlatformConfigTable(source);
  if (step.path === PLATFORM_TOKENS_FIXTURE.path) return extractPlatformTokensSchema(source);
  throw new Error("unknown synthetic fixture");
}
// Legacy creators of relations first needed after the early window (the provenance scan stops there).
// Pinned by LF SHA-256; still untracked fixtures with no canonical migration or ledger row.
export const SUPPLEMENTAL_FIXTURES = Object.freeze([
  // public.cron_heartbeat, seeded by canonical 20260623_150300_atlas_collector_cron.sql. Side effects: SECURITY
  // DEFINER public.cron_job_status() and cron.schedule('omnira_heartbeat'); never launched locally (executor
  // runs cron.launch_active_jobs=off, --network none). Needs omnira_cron (20260528_pg_cron_setup.sql) at run time.
  { name: "20260603_cron_heartbeat.sql", lfSha256: "f3c28dcd9bd031098bed10f86817f7e4bb55d5b03193199e102ffeae9bcbd831" },
  // public.dream_issues, read by canonical 20260617160200_backfill_dream_issues.sql.
  { name: "20260609_dream_issues_ledger.sql", lfSha256: "efc2b09e75c60fb8d14bcafdf4bcf2712e7d28e2107336634487d18fb9510089" },
]);
// Legacy files that only add columns to a baseline table. They create no relation, so createdRelations cannot
// find them: each is declared explicitly, pinned by LF SHA-256, and its declaration must match the SQL statement
// by statement, the baseline's columns, and the first canonical file that uses the columns. Any drift fails closed.
export const COLUMN_PREREQUISITES = Object.freeze([
  // manager_tasks.owner/source/source_key plus idx_manager_tasks_source. Canonical
  // 20260820_manager_tasks_work_packages.sql constrains and freezes source/source_key.
  {
    name: "20260609_manager_task_dream_link.sql",
    lfSha256: "c1fb7723f386343e61f9f81297f6e0eb2622dde1d703d348298e7c57b22a767a",
    table: "manager_tasks",
    columns: ["owner", "source", "source_key"],
    indexes: [{ name: "idx_manager_tasks_source", columns: ["project_id", "source", "source_key"] }],
    firstUsedBy: "20260820_manager_tasks_work_packages.sql",
  },
]);
// Full, unmodified legacy fixture: unlike COLUMN_PREREQUISITES this deliberately installs
// functions and schedules. Run only with cron launching off in the disposable offline executor.
export const DURABLE_RUNS_FIXTURE = Object.freeze({
  name: "20260603_durable_runs.sql",
  lfSha256: "a189659945447189022e96bb8a26a5cb4e0e26fb321c9f56a02d0b6e44da7ee4",
});
const DURABLE_COLUMNS = ["attempts", "max_attempts", "claimed_at", "lease_until", "last_error", "error_history"];
const DURABLE_FUNCTIONS = ["public.claim_runs", "omnira_cron.reap_stuck_runs"];
const DURABLE_SCHEDULES = ["omnira_runs_drain", "omnira_runs_reaper"];
const DURABLE_FIRST_USE = "20260614091000_h1p5_runs_claim_id.sql";
const DURABLE_CRON = "20260528_pg_cron_setup.sql";
const DISCLAIMER =
  "Static offline bootstrap plan only. No SQL was executed; fixtures are untracked test inputs, so this is not clean-bootstrap or production readiness evidence.";

const uniqueSorted = (values) => [...new Set(values)].sort();
// Lowercased SQL without comments or string literals. Dollar-quoted bodies stay: DO blocks run at DDL time.
const code = (sql) =>
  sql
    .toLowerCase()
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/'(?:[^']|'')*'/g, "''");
const quoted = (name) => String.raw`"?${name}"?`;

// Only two statement shapes are accepted: a bare single-column ADD COLUMN IF NOT EXISTS (one type word, no
// default or constraint) and CREATE INDEX IF NOT EXISTS on plain columns, both on public.<table>.
function columnStatements(sql, table) {
  const target = String.raw`(?:only )?(?:"?public"?\.)?${quoted(table)}`;
  const add = new RegExp(String.raw`^alter table (?:if exists )?${target} add column if not exists "?([a-z_][\w$]*)"? [a-z_]\w*$`);
  const index = new RegExp(String.raw`^create index if not exists "?([a-z_][\w$]*)"? on ${target} \(([^()]*)\)$`);
  const result = { added: [], indexes: [], unexpected: [] };
  for (const statement of code(sql).split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean)) {
    const a = add.exec(statement);
    const i = index.exec(statement);
    if (a) result.added.push(a[1]);
    else if (i) result.indexes.push({ name: i[1], columns: i[2].split(",").map((c) => c.trim().replace(/"/g, "")) });
    else result.unexpected.push(statement.slice(0, 80));
  }
  return result;
}

function columnPrerequisiteProblems(pre, sql, baselineColumns, ordered) {
  const problems = [];
  const created = createdRelations(sql).map((r) => r.name);
  if (created.length) problems.push(`creates ${created.join(", ")}; a column prerequisite must create no relation`);
  const { added, indexes, unexpected } = columnStatements(sql, pre.table);
  for (const statement of unexpected) problems.push(`unexpected statement: ${statement}`);
  if (JSON.stringify([...added].sort()) !== JSON.stringify([...pre.columns].sort()))
    problems.push(`adds ${added.join(", ") || "no column"}, declared ${pre.columns.join(", ")}`);
  if (JSON.stringify(indexes) !== JSON.stringify(pre.indexes))
    problems.push(`indexes ${JSON.stringify(indexes)} differ from declared ${JSON.stringify(pre.indexes)}`);
  if (!baselineColumns) problems.push(`baseline does not create public.${pre.table} with a column list`);
  else {
    const present = pre.columns.filter((c) => baselineColumns.includes(c));
    if (present.length) problems.push(`baseline already has ${pre.table}.${present.join(", ")}`);
    const unknown = pre.indexes.flatMap((i) => i.columns).filter((c) => !baselineColumns.includes(c) && !pre.columns.includes(c));
    if (unknown.length) problems.push(`index needs ${pre.table}.${uniqueSorted(unknown).join(", ")}, absent from baseline`);
  }
  // First canonical file, in replay order, that touches the table (DDL-time or deferred) and names a declared
  // column outside comments and literals. Over-matching moves first use earlier, which fails closed.
  const uses = new RegExp(String.raw`\b(?:${pre.columns.join("|")})\b`);
  const firstUse = ordered.find(
    (m) => relationRefs(m.sql).some((r) => r.schema === "public" && r.name === pre.table) && uses.test(code(m.sql)),
  );
  if (firstUse?.name !== pre.firstUsedBy)
    problems.push(`first canonical use of ${pre.table}.(${pre.columns.join(", ")}) is ${firstUse?.name ?? "none"}, declared ${pre.firstUsedBy}`);
  else if (new RegExp(String.raw`\badd\s+column\s+(?:if\s+not\s+exists\s+)?"?(?:${pre.columns.join("|")})"?\s`).test(code(firstUse.sql)))
    problems.push(`${firstUse.name} adds a declared column itself; the prerequisite is not needed`);
  return problems;
}

export function planCanonicalBootstrap({
  canonical,
  legacy = [],
  candidates,
  baselinePath = BASELINE_FIXTURE,
  grandfatheredNames,
  supplemental = SUPPLEMENTAL_FIXTURES,
  columnPrerequisites = COLUMN_PREREQUISITES,
  durableRunsFixture = DURABLE_RUNS_FIXTURE,
}) {
  const blockers = [];
  const plan = {
    schema: "omnira.migration-bootstrap-plan.v1",
    ok: false,
    replayReady: false,
    executionValidated: false,
    disclaimer: DISCLAIMER,
    baseline: baselinePath,
    fixtures: [],
    sequence: [],
    blockers,
  };
  const provenance = inspectBaselineProvenance({ canonical, legacy, candidates, grandfatheredNames });
  const candidate = provenance.candidates.find((c) => c.path === baselinePath);
  const baselineSql = candidates.find((c) => c.path === baselinePath)?.sql ?? null;
  if (!provenance.earlyWindow) {
    blockers.push({ code: "provenance_incomplete", detail: provenance.blockers.map((b) => b.code).join(", ") });
    return plan;
  }
  if (!candidate?.present || baselineSql === null) {
    blockers.push({ code: "baseline_candidate_missing", detail: baselinePath });
    return plan;
  }
  for (const { table, columns } of candidate.missingColumns)
    blockers.push({ code: "baseline_column_missing", detail: `${baselinePath} ${table} lacks ${columns.join(", ")}` });

  // Each relation or schema the baseline lacks must come from exactly one existing legacy file.
  const sources = new Map();
  const needs = [
    ...candidate.uncovered.map((t) => ({ provides: t, dep: provenance.dependencies.find((d) => d.table === t) })),
    ...candidate.uncoveredSchemas.map((s) => ({ provides: s, dep: provenance.schemaDependencies.find((d) => d.schema === s) })),
  ];
  for (const { provides, dep } of needs) {
    if (dep.legacyCreators.length !== 1) {
      blockers.push({
        code: dep.legacyCreators.length ? "fixture_source_ambiguous" : "fixture_source_missing",
        detail: `${provides}: ${dep.legacyCreators.join(", ") || "no legacy creator"}`,
      });
      continue;
    }
    const entry = sources.get(dep.legacyCreators[0]) ?? { provides: [], firstUsedBy: [], supplemental: false };
    entry.provides.push(provides);
    entry.firstUsedBy.push(dep.firstUsedBy);
    sources.set(dep.legacyCreators[0], entry);
  }

  const ordered = orderReplayMigrations(canonical.map(({ name, sql }) => ({ name, sha256: sha256(sql), sql })));
  const names = ordered.map((m) => m.name);
  const baselineRelations = createdRelations(baselineSql).map((r) => r.name);

  // Pinned post-window sources: they provide what they create that the baseline lacks, and must land
  // before the first canonical file that references it at DDL time.
  for (const pin of supplemental) {
    const sql = legacy.find((f) => f.name === pin.name)?.sql;
    if (sql === undefined) {
      blockers.push({ code: "fixture_source_missing", detail: `${LEGACY_DIR}/${pin.name} (pinned)` });
      continue;
    }
    if (sha256(sql) !== pin.lfSha256) {
      blockers.push({ code: "fixture_sha_mismatch", detail: `${LEGACY_DIR}/${pin.name} expected ${pin.lfSha256}, got ${sha256(sql)}` });
      continue;
    }
    const provides = createdRelations(sql)
      .map((r) => r.name)
      .filter((r) => !baselineRelations.includes(r));
    const firstUse = ordered.find((m) => relationRefs(m.sql).some((r) => r.schema === "public" && !r.deferred && provides.includes(r.name)));
    if (!firstUse) {
      blockers.push({ code: "fixture_source_unused", detail: `${LEGACY_DIR}/${pin.name} provides nothing a canonical migration references` });
      continue;
    }
    const entry = sources.get(pin.name) ?? { provides: [], firstUsedBy: [], supplemental: true };
    entry.provides.push(...provides);
    entry.firstUsedBy.push(firstUse.name);
    sources.set(pin.name, entry);
  }

  // Pinned column-only prerequisites: validated against their own SQL, the baseline and canonical first use.
  const baselineColumns = new Map(createdRelations(baselineSql).map((r) => [r.name, r.columns]));
  for (const pre of columnPrerequisites) {
    const path = `${LEGACY_DIR}/${pre.name}`;
    const sql = legacy.find((f) => f.name === pre.name)?.sql;
    if (sql === undefined) {
      blockers.push({ code: "fixture_source_missing", detail: `${path} (pinned column prerequisite)` });
      continue;
    }
    if (sha256(sql) !== pre.lfSha256) {
      blockers.push({ code: "fixture_sha_mismatch", detail: `${path} expected ${pre.lfSha256}, got ${sha256(sql)}` });
      continue;
    }
    if (sources.has(pre.name)) {
      blockers.push({ code: "fixture_source_ambiguous", detail: `${path} is both a relation source and a column prerequisite` });
      continue;
    }
    const problems = columnPrerequisiteProblems(pre, sql, baselineColumns.get(pre.table) ?? null, ordered);
    for (const problem of problems) blockers.push({ code: "column_prerequisite_mismatch", detail: `${path}: ${problem}` });
    if (problems.length) continue;
    sources.set(pre.name, {
      provides: [],
      providesColumns: pre.columns.map((c) => `${pre.table}.${c}`),
      firstUsedBy: [pre.firstUsedBy],
      supplemental: true,
    });
  }

  // Dedicated full-fixture gate. The immutable SHA covers defaults, function bodies, ACLs,
  // indexes and schedule commands; these checks also verify the declared schema/ordering contract.
  // Do not route this through, or broaden, the bare column-only validator above.
  if (durableRunsFixture) {
    const pin = durableRunsFixture;
    const path = `${LEGACY_DIR}/${pin.name}`;
    const sql = legacy.find((f) => f.name === pin.name)?.sql;
    const cron = legacy.find((f) => f.name === DURABLE_CRON);
    const problems = [];
    if (sql === undefined) blockers.push({ code: "fixture_source_missing", detail: path });
    else if (sha256(sql) !== pin.lfSha256)
      blockers.push({ code: "fixture_sha_mismatch", detail: path });
    else {
      const text = code(sql);
      const added = [...text.matchAll(/alter table public\.runs add column if not exists (\w+)\s/g)].map((m) => m[1]);
      const functions = [...text.matchAll(/create or replace function ([\w.]+)\(/g)].map((m) => m[1]);
      const schedules = [...sql.replace(/--[^\n]*/g, "").matchAll(/select cron\.schedule\('([^']+)'/g)].map((m) => m[1]);
      if (JSON.stringify(added) !== JSON.stringify(DURABLE_COLUMNS)) problems.push("expected six durable runs columns");
      if (JSON.stringify(functions) !== JSON.stringify(DURABLE_FUNCTIONS)) problems.push("expected claim/reaper functions");
      if (JSON.stringify(schedules) !== JSON.stringify(DURABLE_SCHEDULES)) problems.push("expected drain/reaper named schedules");
      const columns = baselineColumns.get("runs") ?? [];
      if (!["id", "created_at", "status", "started_at", "finished_at", "error"].every((c) => columns.includes(c)) ||
          DURABLE_COLUMNS.some((c) => columns.includes(c))) problems.push("baseline runs columns differ from prerequisite contract");
      if (!cron || !sources.has(DURABLE_CRON))
        blockers.push({ code: "fixture_source_missing", detail: `${path} requires ${DURABLE_CRON}` });
      else if (sha256(cron.sql) !== "22569e22cd61cef171ad3be914a02d3e7d013a787304ce6904f09a24218d0967")
        problems.push("unreviewed pg_cron setup bytes");
      const firstUse = ordered.find((m) => /\b(?:attempts|max_attempts|claimed_at|lease_until|last_error|error_history)\b/.test(code(m.sql)) &&
        relationRefs(m.sql).some((r) => r.schema === "public" && r.name === "runs"));
      if (firstUse?.name !== DURABLE_FIRST_USE) problems.push("first durable columns use must be H1.P5");
      const firstReplacement = ordered.find((m) => /create or replace function (?:public\.claim_runs|omnira_cron\.reap_stuck_runs)\(/.test(code(m.sql)));
      if (firstReplacement?.name !== DURABLE_FIRST_USE) problems.push("first function replacement must be H1.P5");
      if (sources.has(pin.name)) problems.push("ambiguous full fixture source");
      for (const detail of problems) blockers.push({ code: "full_fixture_mismatch", detail: `${path}: ${detail}` });
      if (!problems.length && cron && sources.has(DURABLE_CRON)) sources.set(pin.name, {
        provides: [], providesColumns: DURABLE_COLUMNS.map((c) => `runs.${c}`),
        providesFunctions: DURABLE_FUNCTIONS, schedules: DURABLE_SCHEDULES,
        afterFixture: `${LEGACY_DIR}/${DURABLE_CRON}`,
        firstUsedBy: [DURABLE_FIRST_USE], supplemental: true,
      });
    }
  }

  // Reserve the unsafe legacy source for extraction only, even if provenance or an explicit
  // supplemental declaration would otherwise select it as a full fixture.
  const unsafeSource = "20260528_pass_a_safeguards.sql";
  for (const fixture of SYNTHETIC_FIXTURES) {
    if (sources.delete(fixture.sourcePath.slice(LEGACY_DIR.length + 1)))
      blockers.push({ code: "synthetic_fixture_refused", detail: `Full ${fixture.sourcePath} execution is forbidden` });
  }

  // Place each fixture at the earliest replay position where its DDL-time public dependencies exist,
  // and no later than the first canonical use of what it provides. Position 0 means truly preexisting.
  for (const [name, { provides, providesColumns = [], providesFunctions, schedules, afterFixture, firstUsedBy, supplemental: pinned }] of [...sources].sort(([a], [b]) =>
    a < b ? -1 : 1,
  )) {
    const sql = legacy.find((f) => f.name === name).sql;
    const path = `${LEGACY_DIR}/${name}`;
    const own = new Set(createdRelations(sql).map((r) => r.name));
    const requires = uniqueSorted(
      relationRefs(sql)
        .filter((r) => r.schema === "public" && !r.deferred && !own.has(r.name))
        .map((r) => r.name),
    );
    const deadline = Math.min(...firstUsedBy.map((f) => names.indexOf(f)));
    const created = new Set(baselineRelations);
    let position = -1;
    for (let i = 0; i <= deadline; i++) {
      if (requires.every((r) => created.has(r))) {
        position = i;
        break;
      }
      for (const r of createdRelations(ordered[i].sql)) created.add(r.name);
    }
    const fixture = {
      path,
      lfSha256: sha256(sql),
      provides: uniqueSorted(provides),
      providesColumns: uniqueSorted(providesColumns),
      requires,
      position,
      after: position > 0 ? names[position - 1] : null,
      before: position >= 0 ? names[position] : null,
      preexisting: position === 0,
      supplemental: pinned,
      ...(afterFixture ? { afterFixture, providesFunctions, schedules } : {}),
    };
    plan.fixtures.push(fixture);
    if (position === -1)
      blockers.push({ code: "fixture_unplaceable", detail: `${path} requires ${requires.join(", ")} before ${names[deadline]}` });
    else if (position > 0)
      blockers.push({
        code: "fixture_interleaved",
        detail: `${path} requires ${requires.filter((r) => !baselineRelations.includes(r)).join(", ")} from canonical replay; it cannot be part of a preexisting baseline`,
      });
  }

  const firstConfigUse = ordered.find((m) => relationRefs(m.sql).some((r) => r.schema === "public" && r.name === "platform_config"));
  if (firstConfigUse) {
    try {
      if (firstConfigUse.name !== PLATFORM_CONFIG_FIRST_USE) throw new Error("unexpected platform_config first use");
      const earlier = ordered.slice(0, names.indexOf(PLATFORM_CONFIG_FIRST_USE));
      const fixtureSql = [...sources.keys()].map((name) => legacy.find((f) => f.name === name).sql);
      if ([baselineSql, ...earlier.map((m) => m.sql), ...fixtureSql].some((sql) => createdRelations(sql).some((r) => r.name === "platform_config")))
        throw new Error("platform_config must be absent before synthetic creation");
      const source = legacy.find((f) => f.name === unsafeSource)?.sql;
      if (source === undefined) throw new Error("platform_config source missing");
      extractPlatformConfigTable(source);
      plan.fixtures.push({ ...PLATFORM_CONFIG_FIXTURE, position: names.indexOf(PLATFORM_CONFIG_FIRST_USE), provides: ["platform_config"], providesColumns: [] });
    } catch (error) {
      blockers.push({ code: "synthetic_fixture_refused", detail: error.message });
    }
  }

  const firstTokenUse = ordered.find((m) => /\b(project_id|account_id)\b/.test(code(m.sql)) &&
    relationRefs(m.sql).some((r) => r.schema === "public" && r.name === "platform_tokens"));
  if (firstTokenUse) {
    try {
      if (firstTokenUse.name !== PLATFORM_TOKENS_FIRST_USE) throw new Error("unexpected platform_tokens column first use");
      const position = names.indexOf(PLATFORM_TOKENS_FIRST_USE);
      const earlier = ordered.slice(0, position);
      const base = earlier.find((m) => m.name === "20260527_platform_tokens.sql");
      if (!base || !createdRelations(base.sql).some((r) => r.name === "platform_tokens"))
        throw new Error("platform_tokens canonical creation must precede schema fixture");
      if (![baselineSql, ...earlier.map((m) => m.sql)].some((sql) => createdRelations(sql).some((r) => r.name === "projects")))
        throw new Error("projects must precede platform_tokens schema fixture");
      const source = legacy.find((f) => `${LEGACY_DIR}/${f.name}` === PLATFORM_TOKENS_FIXTURE.sourcePath)?.sql;
      if (source === undefined) throw new Error("platform_tokens source missing");
      extractPlatformTokensSchema(source);
      plan.fixtures.push({ ...PLATFORM_TOKENS_FIXTURE, position, provides: [], providesColumns: ["platform_tokens.project_id", "platform_tokens.account_id"] });
    } catch (error) {
      blockers.push({ code: "synthetic_fixture_refused", detail: error.message });
    }
  }

  const fixtureStep = (f) => f.kind === "synthetic" ? { ...SYNTHETIC_FIXTURES.find((s) => s.path === f.path) } : { kind: "fixture", path: f.path, lfSha256: f.lfSha256 };
  plan.sequence.push({ kind: "fixture", path: baselinePath, lfSha256: candidate.lfSha256 });
  ordered.forEach((m, i) => {
    for (const f of plan.fixtures) if (f.position === i) plan.sequence.push(fixtureStep(f));
    plan.sequence.push({ kind: "canonical", name: m.name, lfSha256: m.sha256 });
  });
  for (const f of plan.fixtures.filter((f) => f.afterFixture)) {
    const at = (path) => plan.sequence.findIndex((s) => s.path === path);
    if (at(f.afterFixture) < 0 || at(f.path) <= at(f.afterFixture))
      blockers.push({ code: "fixture_unplaceable", detail: `${f.path} must follow ${f.afterFixture}` });
  }

  for (const path of [baselinePath, ...plan.fixtures.map((f) => f.path)])
    blockers.push({ code: "fixture_untracked", detail: `${path} has no canonical migration file or ledger row` });
  blockers.push({ code: "execution_not_run", detail: "static plan only; replay evidence requires a disposable --network none executor" });
  plan.ok = blockers.length === 0;
  return plan;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  let plan;
  try {
    plan = planCanonicalBootstrap(readProvenanceInputs(resolve(dirname(fileURLToPath(import.meta.url)), "../../..")));
  } catch (error) {
    plan = {
      schema: "omnira.migration-bootstrap-plan.v1",
      ok: false,
      replayReady: false,
      executionValidated: false,
      disclaimer: DISCLAIMER,
      blockers: [{ code: "plan_error", detail: error.message }],
    };
  }
  console.log(JSON.stringify(plan, null, 2));
  process.exitCode = plan.ok ? 0 : 1;
}
