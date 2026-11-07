// Offline baseline-provenance report. Reads files only: no SQL execution, Docker, network or secrets.
// Compares the untracked schema baselines (packages/db) with the relations the early canonical
// migrations depend on. A pass never means the ledger replays cleanly; fullReplayValidated is always false.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { orderReplayMigrations } from "./analysis-replay-order.mjs";
import { GRANDFATHERED_MIGRATION_NAMES } from "./migration-guard-policy.mjs";
import { CANONICAL_DIR, LEGACY_DIR, sha256 } from "./migration-replay-preflight.mjs";

export const BASELINE_CANDIDATES = Object.freeze([
  "packages/db/schema.sql",
  "packages/db/full_schema_run_in_supabase.sql",
]);
const PLATFORM_SCHEMAS = new Set(["auth", "storage", "extensions", "cron", "net", "supabase_migrations", "pg_catalog", "information_schema"]);
const NOT_RELATIONS = new Set(["public", "anon", "authenticated", "service_role", "postgres", "lateral", "unnest", "select", "only"]);
const COLUMN_STOP = new Set(["constraint", "primary", "unique", "check", "foreign", "exclude", "like"]);
const DISCLAIMER =
  "Static offline baseline-provenance report only. No SQL was executed; this does not establish full replay validity.";

const ID = String.raw`(?:"?([a-z_][\w$]*)"?\.)?"?([a-z_][\w$]*)"?`;
const PATTERNS = [
  ["references", String.raw`\breferences\s+${ID}\s*(?:\(([^)]*)\))?`],
  ["alter", String.raw`\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${ID}`],
  ["index", String.raw`\bcreate\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?(?:[\w"]+\s+)?on\s+(?:only\s+)?${ID}`],
  ["policy", String.raw`\bcreate\s+policy\s+(?:"[^"]*"|\w+)\s+on\s+${ID}`],
  ["trigger", String.raw`\bcreate\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+\w+[^;]*?\son\s+${ID}`],
  ["insert", String.raw`\binsert\s+into\s+${ID}`],
  ["update", String.raw`\bupdate\s+(?:only\s+)?${ID}\s+set\b`],
  ["read", String.raw`\b(?:from|join)\s+(?:only\s+)?${ID}(?![\w$])(?!"?\s*[(.])`],
];
const CREATE = new RegExp(
  String.raw`\bcreate\s+(?:or\s+replace\s+)?(?:(?:materialized\s+)?view|table)\s+(if\s+not\s+exists\s+)?${ID}`,
  "g",
);

const SCHEMA_USE = /\b(?:function|procedure|table|view|sequence|type)\s+(?:if\s+(?:not\s+)?exists\s+)?"?([a-z_][\w$]*)"?\./g;
const SCHEMA_CREATE = /\bcreate\s+schema\s+(?:if\s+not\s+exists\s+)?"?([a-z_][\w$]*)/g;

// Lowercased SQL split into DDL-time text and deferred function bodies, without comments or literals.
function lex(sql) {
  const bodies = [];
  const outer = sql
    .toLowerCase()
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\$([a-z_]*)\$([\s\S]*?)\$\1\$/g, (_, _tag, body) => (bodies.push(body), " $body$ "));
  const clean = (text) =>
    text
      .replace(/'(?:[^']|'')*'/g, "''")
      .replace(/\b(?:epoch|year|month|day|hour|minute|second|dow|week|both|leading|trailing|distinct)\s+from\b/g, " ");
  return { outer: clean(outer), body: clean(bodies.join("\n;\n")) };
}

function ctes(text) {
  return new Set([...text.matchAll(/(?:\bwith(?:\s+recursive)?|,)\s+(\w+)\s+as\s*(?:not\s+)?(?:materialized\s+)?\(/g)].map((m) => m[1]));
}

export function relationRefs(sql) {
  const { outer, body } = lex(sql);
  const refs = [];
  for (const [text, deferred] of [[outer, false], [body, true]]) {
    const local = ctes(text);
    for (const [kind, source] of PATTERNS) {
      for (const m of text.matchAll(new RegExp(source, "g"))) {
        const schema = m[1] ?? "public";
        const name = m[2];
        if (schema === "public" && (NOT_RELATIONS.has(name) || local.has(name))) continue;
        const columns = kind === "references" && m[3] ? m[3].split(",").map((c) => c.trim().replace(/"/g, "")) : [];
        refs.push({ schema, name, kind, deferred, columns });
      }
    }
  }
  return refs;
}

export function createdRelations(sql) {
  const { outer } = lex(sql);
  return [...outer.matchAll(CREATE)]
    .filter((m) => (m[2] ?? "public") === "public")
    .map((m) => ({ name: m[3], ifNotExists: Boolean(m[1]), columns: tableColumns(outer, m.index + m[0].length) }));
}

function tableColumns(text, from) {
  const open = text.indexOf("(", from);
  if (open === -1 || text.slice(from, open).trim() !== "") return null; // view or CREATE TABLE AS
  const items = [];
  let depth = 0;
  let start = open + 1;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")" && --depth === 0) {
      items.push(text.slice(start, i));
      break;
    } else if (text[i] === "," && depth === 1) {
      items.push(text.slice(start, i));
      start = i + 1;
    }
  }
  return items
    .map((item) => /^"?([a-z_][\w$]*)/.exec(item.trim())?.[1])
    .filter((word) => word && !COLUMN_STOP.has(word))
    .sort();
}

// Non-platform schemas a migration needs to exist (qualified objects), and schemas it creates.
export function schemaUses(sql) {
  const { outer } = lex(sql);
  const used =[...outer.matchAll(SCHEMA_USE)].map((m) => m[1]);
  for (const ref of relationRefs(sql)) used.push(ref.schema);
  return uniqueSorted(used.filter((s) => s !== "public" && !PLATFORM_SCHEMAS.has(s)));
}
export const createdSchemas = (sql) => uniqueSorted([...lex(sql).outer.matchAll(SCHEMA_CREATE)].map((m) => m[1]));

const ledgerName = (file) => /^\d+_(.+)\.sql$/.exec(file)?.[1] ?? null;
const uniqueSorted = (values) => [...new Set(values)].sort();

export function inspectBaselineProvenance({
  canonical,
  legacy = [],
  candidates,
  grandfatheredNames = GRANDFATHERED_MIGRATION_NAMES,
}) {
  const blockers = [];
  const report = {
    schema: "omnira.migration-baseline-provenance.v1",
    ok: false,
    fullReplayValidated: false,
    disclaimer: DISCLAIMER,
    canonicalDir: CANONICAL_DIR,
    legacyDir: LEGACY_DIR,
    earlyWindow: null,
    dependencies: [],
    platformDependencies: [],
    schemaDependencies: [],
    candidates: [],
    candidateDrift: null,
    blockers,
  };

  let ordered;
  try {
    ordered = orderReplayMigrations(canonical.map(({ name, sql }) => ({ name, sha256: sha256(sql), sql })));
  } catch (error) {
    blockers.push({ code: "replay_order_refused", detail: error.message });
    return report;
  }
  const grandfathered = new Set(grandfatheredNames);
  let boundary = -1;
  ordered.forEach((m, i) => grandfathered.has(ledgerName(m.name)) && (boundary = i));
  if (boundary === -1) {
    blockers.push({ code: "early_window_undefined", detail: "no grandfathered canonical migration found" });
    return report;
  }
  const early = ordered.slice(0, boundary + 1);
  report.earlyWindow = {
    definition: "replay order up to the last frozen grandfathered migration",
    boundary: early[boundary].name,
    files: early.map((m) => m.name),
  };

  // Walk the early window: any public relation used before a canonical migration creates it is a baseline dependency.
  const created = new Set();
  const deps = new Map();
  const platform = new Map();
  const schemas = new Set();
  const schemaDeps = new Map();
  for (const m of early) {
    const ownSchemas = createdSchemas(m.sql);
    for (const s of schemaUses(m.sql))
      if (!schemas.has(s) && !ownSchemas.includes(s) && !schemaDeps.has(s)) schemaDeps.set(s, { schema: s, firstUsedBy: m.name });
    for (const s of ownSchemas) schemas.add(s);
    const own = createdRelations(m.sql);
    const ownNames = new Set(own.map((r) => r.name));
    for (const ref of relationRefs(m.sql)) {
      if (ref.schema !== "public") {
        const key = `${ref.schema}.${ref.name}`;
        if (PLATFORM_SCHEMAS.has(ref.schema) && !platform.has(key)) platform.set(key, { relation: key, firstUsedBy: m.name });
        continue;
      }
      if (created.has(ref.name) || ownNames.has(ref.name)) continue;
      const dep = deps.get(ref.name) ?? { table: ref.name, firstUsedBy: m.name, usedBy: [], kinds: [], fkColumns: [], deferredOnly: true };
      dep.usedBy.push(m.name);
      dep.kinds.push(ref.kind);
      dep.fkColumns.push(...ref.columns);
      dep.deferredOnly &&= ref.deferred;
      deps.set(ref.name, dep);
    }
    for (const name of ownNames) created.add(name);
  }

  const creatorsIn = (files) => {
    const map = new Map();
    for (const f of files)
      for (const r of createdRelations(f.sql)) map.set(r.name, [...(map.get(r.name) ?? []), { file: f.name, ifNotExists: r.ifNotExists }]);
    return map;
  };
  const canonicalCreators = creatorsIn(ordered);
  const legacyCreators = creatorsIn([...legacy].sort((a, b) => (a.name < b.name ? -1 : 1)));

  report.dependencies = [...deps.values()]
    .map((d) => ({
      ...d,
      usedBy: uniqueSorted(d.usedBy),
      kinds: uniqueSorted(d.kinds),
      fkColumns: uniqueSorted(d.fkColumns),
      laterCanonicalCreators: (canonicalCreators.get(d.table) ?? []).map((c) => c.file),
      legacyCreators: (legacyCreators.get(d.table) ?? []).map((c) => c.file),
    }))
    .sort((a, b) => (a.table < b.table ? -1 : 1));
  report.platformDependencies = [...platform.values()].sort((a, b) => (a.relation < b.relation ? -1 : 1));
  report.schemaDependencies = [...schemaDeps.values()]
    .map((d) => ({ ...d, legacyCreators: legacy.filter((f) => createdSchemas(f.sql).includes(d.schema)).map((f) => f.name).sort() }))
    .sort((a, b) => (a.schema < b.schema ? -1 : 1));

  for (const candidate of candidates) {
    const sql = candidate.sql ?? "";
    const tables = new Map(createdRelations(sql).map((r) => [r.name, r]));
    const { outer } = lex(sql);
    const policies = [...outer.matchAll(/\bcreate\s+policy\s+("[^"]*"|\w+)/g)].map((m) => m[1]);
    const dropped = new Set([...outer.matchAll(/\bdrop\s+policy\s+if\s+exists\s+("[^"]*"|\w+)/g)].map((m) => m[1]));
    const entry = {
      path: candidate.path,
      tracked: Boolean(candidate.tracked),
      present: candidate.sql !== null,
      lfSha256: candidate.sql === null ? null : sha256(candidate.sql),
      tables: [...tables.keys()].sort(),
      covers: [],
      uncovered: [],
      uncoveredSchemas: [],
      missingColumns: [],
      laterCanonicalCreates: [],
      platformDependencies: [],
      hazards: { storageWrites: [], nonIdempotentPolicies: 0, createsWithoutIfNotExists: [] },
    };
    report.candidates.push(entry);
    if (!entry.present) {
      blockers.push({ code: "baseline_candidate_missing", detail: candidate.path });
      continue;
    }
    for (const dep of report.dependencies) {
      const table = tables.get(dep.table);
      if (!table) {
        entry.uncovered.push(dep.table);
        continue;
      }
      entry.covers.push(dep.table);
      const missing = dep.fkColumns.filter((c) => !(table.columns ?? []).includes(c));
      if (missing.length) entry.missingColumns.push({ table: dep.table, columns: missing });
    }
    for (const [name, table] of [...tables].sort(([a], [b]) => (a < b ? -1 : 1))) {
      for (const c of canonicalCreators.get(name) ?? []) entry.laterCanonicalCreates.push({ table: name, ...c });
      if (!table.ifNotExists) entry.hazards.createsWithoutIfNotExists.push(name);
    }
    entry.platformDependencies = uniqueSorted(
      relationRefs(candidate.sql).filter((r) => r.schema !== "public").map((r) => `${r.schema}.${r.name}`),
    );
    entry.hazards.storageWrites = uniqueSorted(
      relationRefs(candidate.sql).filter((r) => r.schema === "storage" && r.kind === "insert").map((r) => `storage.${r.name}`),
    );
    entry.hazards.nonIdempotentPolicies = policies.filter((p) => !dropped.has(p)).length;

    if (!candidate.tracked)
      blockers.push({ code: "baseline_untracked", detail: `${candidate.path} is not a canonical migration and has no ledger row` });
    const ownSchemas = createdSchemas(sql);
    entry.uncoveredSchemas = report.schemaDependencies.map((d) => d.schema).filter((s) => !ownSchemas.includes(s));
    if (entry.uncoveredSchemas.length)
      blockers.push({ code: "early_schema_uncovered", detail: `${candidate.path} lacks schema ${entry.uncoveredSchemas.join(", ")}` });
    if (entry.uncovered.length)
      blockers.push({ code: "early_dependency_uncovered", detail: `${candidate.path} lacks ${entry.uncovered.join(", ")}` });
    for (const { table, columns } of entry.missingColumns)
      blockers.push({ code: "baseline_column_missing", detail: `${candidate.path} ${table} lacks ${columns.join(", ")}` });
  }

  const [a, b] = report.candidates.filter((c) => c.present);
  if (a && b) {
    const ta = new Map(createdRelations(candidates.find((c) => c.path === a.path).sql).map((r) => [r.name, r.columns]));
    const tb = new Map(createdRelations(candidates.find((c) => c.path === b.path).sql).map((r) => [r.name, r.columns]));
    report.candidateDrift = {
      onlyIn: { [a.path]: a.tables.filter((t) => !tb.has(t)), [b.path]: b.tables.filter((t) => !ta.has(t)) },
      columnMismatch: a.tables
        .filter((t) => tb.has(t) && JSON.stringify(ta.get(t)) !== JSON.stringify(tb.get(t)))
        .map((t) => ({ table: t, [a.path]: ta.get(t), [b.path]: tb.get(t) })),
    };
  }

  report.ok = blockers.length === 0;
  return report;
}

export function readProvenanceInputs(repo) {
  const readDir = (dir) => {
    const abs = resolve(repo, dir);
    return existsSync(abs)
      ? readdirSync(abs)
          .filter((name) => name.endsWith(".sql"))
          .map((name) => ({ name, sql: readFileSync(resolve(abs, name), "utf8") }))
      : [];
  };
  return {
    canonical: readDir(CANONICAL_DIR),
    legacy: readDir(LEGACY_DIR),
    recoveredMedia: readDir("docs/verification/web-studio/recovered-history"),
    candidates: BASELINE_CANDIDATES.map((path) => {
      const abs = resolve(repo, path);
      return { path, tracked: false, sql: existsSync(abs) ? readFileSync(abs, "utf8") : null };
    }),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  let report;
  try {
    report = inspectBaselineProvenance(readProvenanceInputs(resolve(dirname(fileURLToPath(import.meta.url)), "../../..")));
  } catch (error) {
    report = {
      schema: "omnira.migration-baseline-provenance.v1",
      ok: false,
      fullReplayValidated: false,
      disclaimer: DISCLAIMER,
      blockers: [{ code: "provenance_error", detail: error.message }],
    };
  }
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ok ? 0 : 1;
}
