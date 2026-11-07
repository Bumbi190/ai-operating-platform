// Optional local replay evidence only. Never connects to a database or reads credentials.
// This literal allowlist is the complete scope of the external 2026-11-05 catalog snapshot.
const TABLES = Object.freeze([
  "agents", "cron_heartbeat", "dream_issues", "manager_tasks", "media_insights", "memories", "outputs",
  "platform_config", "platform_tokens", "projects", "revenue_snapshots", "run_logs", "runs", "workflows",
]);
const BOOLEANS = ["rls_enabled", "force_rls", "anon_select", "authenticated_select", "service_select", "anon_insert", "authenticated_insert"];
const COUNTS = ["policy_count", "column_count"];
const FIELDS = ["rls_enabled", "force_rls", "owner", ...COUNTS, ...BOOLEANS.slice(2)];
const KEYS = ["table_name", ...FIELDS];
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const invalid = () => { throw new Error("Invalid catalog metadata"); };

export const CATALOG_LIMITATIONS = Object.freeze([
  "Local disposable replay catalog metadata only; no application data rows or hosted queries.",
  "Local ownership can differ (supabase_admin versus postgres); synthetic default privileges can differ from managed per-database defaults. No ownership or privilege repair is performed.",
  "RLS policy definitions, expressions, roles and runtime access are not checked; counts and table privilege flags do not prove policy equivalence.",
]);

function parseJson(text) {
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > 65536) invalid();
  return JSON.parse(text);
}

function validateRecords(records, complete) {
  if (!Array.isArray(records) || records.length > TABLES.length || (complete && records.length !== TABLES.length)) invalid();
  const seen = new Set();
  for (const record of records) {
    if (!object(record) || Object.keys(record).length !== KEYS.length || KEYS.some((key) => !Object.hasOwn(record, key))) invalid();
    if (!TABLES.includes(record.table_name) || seen.has(record.table_name)) invalid();
    seen.add(record.table_name);
    if (BOOLEANS.some((key) => typeof record[key] !== "boolean")) invalid();
    if (COUNTS.some((key) => !Number.isSafeInteger(record[key]) || record[key] < 0)) invalid();
    // Standard unquoted role names only. Never echo arbitrary role strings into receipts.
    if (typeof record.owner !== "string" || !/^[a-z_][a-z0-9_]{0,62}$/.test(record.owner)) invalid();
  }
  return records;
}

export function parseExternalCatalog(text) {
  const metadata = parseJson(text);
  if (!object(metadata) || !Object.hasOwn(metadata, "records") || Object.keys(metadata).some((key) => !["source", "records"].includes(key))) invalid();
  if (Object.hasOwn(metadata, "source") && (typeof metadata.source !== "string" || metadata.source.length > 256)) invalid();
  return validateRecords(metadata.records, true);
}

// Fixed SELECT-only SQL, no dynamic identifiers, values, psql substitutions, row-content
// queries, information_schema views, or external metadata interpolated into the statement.
// OIDs, not caller-supplied identifiers, are passed to has_table_privilege.
export const CATALOG_SQL = `SELECT COALESCE(json_agg(catalog ORDER BY table_name), '[]'::json) FROM (
  SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS force_rls,
    pg_catalog.pg_get_userbyid(c.relowner) AS owner,
    (SELECT count(*) FROM pg_catalog.pg_policy p WHERE p.polrelid = c.oid) AS policy_count,
    (SELECT count(*) FROM pg_catalog.pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) AS column_count,
    pg_catalog.has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
    pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select,
    pg_catalog.has_table_privilege('service_role', c.oid, 'SELECT') AS service_select,
    pg_catalog.has_table_privilege('anon', c.oid, 'INSERT') AS anon_insert,
    pg_catalog.has_table_privilege('authenticated', c.oid, 'INSERT') AS authenticated_insert
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname IN (
    'agents', 'cron_heartbeat', 'dream_issues', 'manager_tasks', 'media_insights', 'memories', 'outputs',
    'platform_config', 'platform_tokens', 'projects', 'revenue_snapshots', 'run_logs', 'runs', 'workflows'
  )
) catalog;`;

export function compareCatalog(external, stdout) {
  const local = new Map(validateRecords(parseJson(stdout), false).map((record) => [record.table_name, record]));
  const expected = new Map(external.map((record) => [record.table_name, record]));
  const missingTables = TABLES.filter((name) => !local.has(name));
  const differences = [];
  for (const name of TABLES) {
    if (!local.has(name)) continue;
    for (const field of FIELDS) {
      if (expected.get(name)[field] !== local.get(name)[field])
        differences.push({ table_name: name, field, external: expected.get(name)[field], local: local.get(name)[field] });
    }
  }
  return { status: "compared", matches: missingTables.length === 0 && differences.length === 0, comparedTables: local.size, missingTables, differences };
}
