// Read-only, relation-level inventory across the entire canonical directory. Never executes SQL,
// applies fixtures, writes files, contacts services, or infers bootstrap readiness.
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createdRelations, readProvenanceInputs, relationRefs } from "./migration-baseline-provenance.mjs";
import { orderReplayMigrations } from "./analysis-replay-order.mjs";
import { CANONICAL_DIR, LEGACY_DIR, sha256 } from "./migration-replay-preflight.mjs";

const MAX_SOURCE_FILES = 2048;
const MAX_SQL_BYTES = 64 * 1024 * 1024;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const sortedUnique = (items) => [...new Set(items)].sort(compare);
const LIMITATIONS = [
  "Regex-based relationRefs/createdRelations heuristics, not a PostgreSQL parser or schema simulator; false positives and omissions are possible.",
  "firstUse is exact at migration-file granularity only; same-file statement order and self references are not resolved.",
  "All dollar-quoted bodies are classified deferred by the shared parser, including immediate DO blocks and SQL-language bodies; function invocations and trigger execution are not followed.",
  "Dynamic SQL, single-quoted function bodies, quoted identifiers, nested comments, CTE scope and search_path are not fully resolved; unqualified relations are assumed public.",
  "Tracks detected CREATE TABLE/VIEW providers only; DROP, rename, conditional execution and transaction rollback are not modeled.",
  "Does not inventory missing columns, types, functions, schemas, extensions, privileges, constraints or cron side effects. Provider candidates are not verified or applied fixtures.",
  "Baseline candidates are evaluated separately, never combined or assumed preexisting. Deferred references are review leads, not proof of a DDL failure.",
];

function emptyReport() {
  return {
    schema: "omnira.migration-dependency-inventory.v1",
    inventoryComplete: false,
    replayReady: false,
    fullReplayValidated: false,
    disclaimer: "Static offline relation inventory only. No SQL executed; even a complete inventory does not establish full bootstrap readiness or replay validity.",
    scope: { canonicalDir: CANONICAL_DIR, legacyDir: LEGACY_DIR, relationSchema: "public", maxSourceFiles: MAX_SOURCE_FILES, maxSqlBytes: MAX_SQL_BYTES },
    limitations: [...LIMITATIONS],
    migrations: [],
    baselineCandidates: [],
    relations: [],
    excludedSchemas: [],
    summary: null,
    blockers: [],
  };
}

export function inspectMigrationDependencyInventory({ canonical = [], legacy = [], candidates = [] } = {}) {
  const report = emptyReport();
  const files = [...canonical, ...legacy, ...candidates];
  if (files.length > MAX_SOURCE_FILES || files.some((f) => f.sql !== null && typeof f.sql !== "string") ||
      files.reduce((n, f) => n + Buffer.byteLength(f.sql ?? "", "utf8"), 0) > MAX_SQL_BYTES) {
    report.blockers.push({ code: "inventory_input_refused", detail: "Source count, SQL text type or byte limit exceeded" });
    return report;
  }
  if (!canonical.length) {
    report.blockers.push({ code: "canonical_migrations_missing", detail: CANONICAL_DIR });
    return report;
  }
  let ordered;
  try {
    ordered = orderReplayMigrations(canonical.map(({ name, sql }) => ({ name, sql, lfSha256: sha256(sql), sha256: sha256(sql) })));
  } catch {
    // Do not echo SQL, filesystem details or arbitrary exception text into the report.
    report.blockers.push({ code: "replay_order_refused", detail: "Duplicate names, missing pinned prerequisite or unreviewed pinned bytes" });
    return report;
  }

  const relations = new Map();
  const get = (name) => {
    if (!relations.has(name)) relations.set(name, {
      relation: `public.${name}`, firstUse: null, firstImmediateUse: null, firstDeferredUse: null,
      canonicalProviders: [], legacyProviders: [], baselineProviders: [], uses: [],
      potentialMissingBaseline: false, deferredDependencyReview: false, sameFileOrderReview: false,
    });
    return relations.get(name);
  };
  const created = new Set();
  const excludedSchemas = new Set();
  for (const [index, migration] of ordered.entries()) {
    const own = new Map(createdRelations(migration.sql).map((r) => [r.name, r]));
    for (const [name, r] of own) get(name).canonicalProviders.push({ file: migration.name, index, ifNotExists: r.ifNotExists });
    const grouped = new Map();
    for (const ref of relationRefs(migration.sql)) {
      if (ref.schema !== "public") {
        excludedSchemas.add(ref.schema);
        continue;
      }
      if (!grouped.has(ref.name)) grouped.set(ref.name, { immediateKinds: [], deferredKinds: [] });
      grouped.get(ref.name)[ref.deferred ? "deferredKinds" : "immediateKinds"].push(ref.kind);
    }
    for (const [name, modes] of grouped) {
      const relation = get(name);
      const use = { file: migration.name, index };
      const availability = created.has(name) ? "earlier_canonical_creation" :
        own.has(name) ? "same_file_creation_order_unchecked" : "no_canonical_creation_yet";
      relation.firstUse ??= use;
      if (modes.immediateKinds.length) {
        relation.firstImmediateUse ??= use;
        if (availability === "no_canonical_creation_yet") relation.potentialMissingBaseline = true;
      }
      if (modes.deferredKinds.length) {
        relation.firstDeferredUse ??= use;
        if (availability === "no_canonical_creation_yet") relation.deferredDependencyReview = true;
      }
      if (availability === "same_file_creation_order_unchecked") relation.sameFileOrderReview = true;
      relation.uses.push({ ...use, immediateKinds: sortedUnique(modes.immediateKinds), deferredKinds: sortedUnique(modes.deferredKinds), availability });
    }
    report.migrations.push({ index, name: migration.name, lfSha256: migration.lfSha256, creates: [...own.keys()].sort(compare), uses: [...grouped.keys()].sort(compare) });
    for (const name of own.keys()) created.add(name);
  }

  // These are provider candidates only: do not alter the canonical walk's availability state.
  for (const file of [...legacy].sort((a, b) => compare(a.name, b.name))) {
    for (const [name, r] of new Map(createdRelations(file.sql).map((r) => [r.name, r]))) {
      if (relations.has(name)) get(name).legacyProviders.push({ file: file.name, lfSha256: sha256(file.sql), ifNotExists: r.ifNotExists });
    }
  }
  for (const file of [...candidates].sort((a, b) => compare(a.path, b.path))) {
    const provides = sortedUnique(createdRelations(file.sql ?? "").map((r) => r.name));
    const metadata = { path: file.path, present: file.sql !== null, tracked: Boolean(file.tracked), lfSha256: file.sql === null ? null : sha256(file.sql) };
    report.baselineCandidates.push({ ...metadata, provides });
    for (const name of provides) if (relations.has(name)) get(name).baselineProviders.push(metadata);
  }
  report.relations = [...relations.values()].sort((a, b) => compare(a.relation, b.relation));
  report.excludedSchemas = [...excludedSchemas].sort(compare);
  report.summary = {
    canonicalFiles: ordered.length,
    publicRelations: report.relations.length,
    potentialMissingBaseline: report.relations.filter((r) => r.potentialMissingBaseline).length,
    deferredDependencyReview: report.relations.filter((r) => r.deferredDependencyReview).length,
    sameFileOrderReview: report.relations.filter((r) => r.sameFileOrderReview).length,
  };
  report.inventoryComplete = true; // Coverage of the bounded static scan, never readiness.
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  let report;
  try {
    report = inspectMigrationDependencyInventory(readProvenanceInputs(resolve(dirname(fileURLToPath(import.meta.url)), "../../..")));
  } catch {
    report = emptyReport();
    report.blockers.push({ code: "inventory_read_failed", detail: "Could not read or inspect repository SQL inputs" });
  }
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.inventoryComplete ? 0 : 1;
}
