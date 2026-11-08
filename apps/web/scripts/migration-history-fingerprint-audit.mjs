// Offline, read-only fingerprints and supplied catalog metadata. Never executes or emits SQL.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, lstatSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { CANONICAL_DIR, LEGACY_DIR } from "./migration-replay-preflight.mjs";

export const KNOWN_TABLES = Object.freeze(["agents", "cron_heartbeat", "dream_issues", "manager_tasks", "media_insights",
  "memories", "outputs", "platform_config", "platform_tokens", "projects", "revenue_snapshots", "run_logs", "runs", "workflows"]);
// Explicit end assertion: JavaScript's $ also accepts a final newline.
const IDENTIFIER = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,199}(?![\s\S])/;
const OWNER = /^[A-Za-z_][A-Za-z0-9_]{0,62}(?![\s\S])/;
const FINGERPRINT_FIELDS = ["version", "name", "statement_count", "sql_bytes", "sql_md5"];
const BOOLEANS = ["rls_enabled", "force_rls", "anon_select", "authenticated_select", "service_select", "anon_insert", "authenticated_insert"];
const CATALOG_FIELDS = ["table_name", "owner", "policy_count", "column_count", ...BOOLEANS];
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const hash = (algorithm, bytes) => createHash(algorithm).update(bytes).digest("hex");
const digest = value => hash("sha256", JSON.stringify(value));
const record = x => x !== null && typeof x === "object" && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
const keys = (x, fields) => record(x) && Object.keys(x).length === fields.length && fields.every(k => Object.hasOwn(x, k));
const integer = (x, minimum) => Number.isSafeInteger(x) && x >= minimum;
const unique = xs => new Set(xs).size === xs.length;

function envelope(input, count) {
  if (!keys(input, ["source", "records"]) || typeof input.source !== "string" || input.source.length < 1 ||
      input.source.length > 500 || /[\x00-\x1f\x7f]/.test(input.source) ||
      !Array.isArray(input.records) || input.records.length !== count) throw new Error("metadata_format_invalid");
  // The untrusted descriptive source label is never echoed or treated as authentication.
  return input.records;
}

export function parseFingerprints(input) {
  const rows = envelope(input, 13).map(row => {
    if (!keys(row, FINGERPRINT_FIELDS) || typeof row.version !== "string" || !/^[0-9]{1,32}(?![\s\S])/.test(row.version) ||
        typeof row.name !== "string" || !IDENTIFIER.test(row.name) || !integer(row.statement_count, 1) ||
        !integer(row.sql_bytes, 0) || typeof row.sql_md5 !== "string" || !/^[a-f0-9]{32}(?![\s\S])/.test(row.sql_md5))
      throw new Error("fingerprint_entry_invalid");
    return Object.fromEntries(FINGERPRINT_FIELDS.map(k => [k, row[k]]));
  });
  if (!unique(rows.map(r => r.version)) || !unique(rows.map(r => r.name))) throw new Error("fingerprint_duplicate_identity");
  return rows.sort((a, b) => compare(a.version, b.version) || compare(a.name, b.name));
}

export function parseCatalog(input) {
  const rows = envelope(input, KNOWN_TABLES.length).map(row => {
    if (!keys(row, CATALOG_FIELDS) || !KNOWN_TABLES.includes(row.table_name) || typeof row.owner !== "string" ||
        !OWNER.test(row.owner) || !integer(row.policy_count, 0) || !integer(row.column_count, 1) ||
        BOOLEANS.some(k => typeof row[k] !== "boolean")) throw new Error("catalog_entry_invalid");
    return Object.fromEntries(CATALOG_FIELDS.map(k => [k, row[k]]));
  });
  if (!unique(rows.map(r => r.table_name))) throw new Error("catalog_duplicate_table");
  return rows.sort((a, b) => compare(a.table_name, b.table_name));
}

function sourceIdentity(path) {
  if (typeof path !== "string") throw new Error("source_path_invalid");
  const directory = [CANONICAL_DIR, LEGACY_DIR].find(dir => path.startsWith(`${dir}/`));
  const filename = directory ? path.slice(directory.length + 1) : "";
  if (!/^[0-9]+_[A-Za-z0-9_][A-Za-z0-9_.-]*\.sql(?![\s\S])/.test(filename)) throw new Error("source_path_invalid");
  return { path, directory: directory === CANONICAL_DIR ? "canonical" : "legacy" };
}

export function auditFingerprints({ fingerprints, catalog, sources }) {
  const rows = parseFingerprints(fingerprints), tables = parseCatalog(catalog);
  if (!Array.isArray(sources)) throw new Error("sources_invalid");
  const inventory = sources.map(source => {
    if (!keys(source, ["path", "bytes"]) || !Buffer.isBuffer(source.bytes)) throw new Error("source_invalid");
    return { ...sourceIdentity(source.path), bytes: source.bytes.length, md5: hash("md5", source.bytes) };
  }).sort((a, b) => compare(a.path, b.path));
  if (!unique(inventory.map(s => s.path))) throw new Error("duplicate_source_path");
  const entries = rows.map(row => {
    const matches = inventory.filter(s => s.bytes === row.sql_bytes && s.md5 === row.sql_md5).map(s => s.path);
    return { ...row, status: matches.length ? "exact_full_file_fingerprint" : "no_full_file_match", matches };
  });
  return {
    schema: "omnira.migration-history-fingerprint-audit.v1", offline: true, readOnly: true,
    replayReady: false, productionSqlIdentityValidated: false, catalogParityValidated: false,
    comparison: "whole_file_raw_bytes_md5_and_byte_count_without_normalization",
    fingerprintCount: rows.length, fingerprintMetadataSha256: digest(rows), sourceInventorySha256: digest(inventory),
    counts: { exactFullFileFingerprint: entries.filter(e => e.matches.length).length,
      noFullFileMatch: entries.filter(e => !e.matches.length).length },
    sourceCounts: Object.fromEntries(["canonical", "legacy"].map(dir => [dir, inventory.filter(s => s.directory === dir).length])),
    entries, inventory,
    catalog: { scope: "supplied_public_table_metadata_only", tableCount: tables.length, metadataSha256: digest(tables), tables },
    limitations: [
      "Inputs are unauthenticated local metadata snapshots; origin, freshness and hash extraction formula are unverified.",
      "Exact full-file fingerprint means equal MD5 and byte count only. MD5 is not collision-resistant or proof of SQL identity, deployment provenance or ledger mapping.",
      "No normalization, SQL parsing, statement splitting, joining, array serialization or fragment matching is attempted. statement_count is supplied metadata, not a locally parsed count.",
      "PostgreSQL statement arrays may have been concatenated or serialized differently. A mismatch does not prove different SQL semantics or an unapplied migration.",
      "Only the 13 supplied fingerprints are checked; the 197-row ledger, name-only candidates and historical replay pins are not revalidated here.",
      "The 14 public-table catalog records are reported as supplied, not compared against a local or hosted catalog. Privilege booleans do not establish effective access under RLS; policy counts do not describe policy behavior.",
      "Hosted parity needs authenticated target/snapshot identity, original deployment artifacts and documented statement/hash encoding, complete paired schema/security catalogs, a reviewed baseline/prerequisite/order contract and separately authorized isolated hosted replay with observed applied sequence and post-replay comparison.",
      "Paired catalogs must cover columns/types/defaults, constraints/indexes, functions/bodies/search paths, triggers, extensions, owners, role memberships/bypass, grants/default ACLs, RLS flags/policy definitions, storage prerequisites and cron jobs. No SQL execution or hosted validation occurred here.",
    ],
  };
}

// No metadata-controlled SQL paths. Only immediate regular SQL files in the two fixed directories.
export function readFingerprintAudit({ repo, fingerprintsPath, catalogPath }) {
  const fingerprintBytes = readFileSync(fingerprintsPath), catalogBytes = readFileSync(catalogPath);
  const fingerprints = JSON.parse(fingerprintBytes.toString("utf8").replace(/^\uFEFF/, ""));
  const catalog = JSON.parse(catalogBytes.toString("utf8").replace(/^\uFEFF/, ""));
  parseFingerprints(fingerprints); parseCatalog(catalog);
  const sources = [CANONICAL_DIR, LEGACY_DIR].flatMap(dir => {
    // Reject redirected directory components as well as symlinked SQL files.
    const parts = dir.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const stat = lstatSync(resolve(repo, ...parts.slice(0, i)));
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("source_directory_invalid");
    }
    return readdirSync(resolve(repo, dir), { withFileTypes: true }).filter(e => e.name.endsWith(".sql")).map(e => {
      const path = `${dir}/${e.name}`;
      sourceIdentity(path);
      if (!e.isFile() || e.isSymbolicLink()) throw new Error("source_file_invalid");
      return { path, bytes: readFileSync(resolve(repo, path)) };
    });
  });
  return { ...auditFingerprints({ fingerprints, catalog, sources }),
    fingerprintSnapshotBytesSha256: hash("sha256", fingerprintBytes), catalogSnapshotBytesSha256: hash("sha256", catalogBytes) };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const { values } = parseArgs({ options: { fingerprints: { type: "string" }, catalog: { type: "string" }, repo: { type: "string" } }, allowPositionals: false });
    if (!values.fingerprints || !values.catalog) throw new Error("metadata_paths_required");
    const report = readFingerprintAudit({ repo: values.repo ?? resolve(dirname(fileURLToPath(import.meta.url)), "../../.."),
      fingerprintsPath: values.fingerprints, catalogPath: values.catalog });
    console.log(JSON.stringify(report, null, 2));
    // Zero means a valid offline report, including zero matches; never permission to replay.
    process.exitCode = 0;
  } catch {
    console.log(JSON.stringify({ schema: "omnira.migration-history-fingerprint-audit.v1", offline: true, readOnly: true,
      replayReady: false, productionSqlIdentityValidated: false, catalogParityValidated: false,
      error: "input_unavailable_or_invalid",
      usage: "node migration-history-fingerprint-audit.mjs --fingerprints <local JSON> --catalog <local JSON> [--repo <root>]" }, null, 2));
    process.exitCode = 1;
  }
}
