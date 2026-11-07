// Static offline replay preflight. Reads files only: no SQL execution, Docker, network or secrets.
// A pass here never means the canonical ledger replays cleanly; fullReplayValidated is always false.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { orderReplayMigrations } from "./analysis-replay-order.mjs";

export const CANONICAL_DIR = "apps/web/supabase/migrations";
export const LEGACY_DIR = "supabase/migrations";
export const BASELINE_TABLES = Object.freeze(["projects", "runs"]);
const MEDIA_TABLES = "20260520_media_tables.sql";
const MEDIA_IMAGES = "20260520_media_images.sql";
const DISCLAIMER =
  "Static offline preflight only. No SQL was executed; this does not establish full replay validity.";

const strip = (sql) => sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const tableName = (name) => String.raw`(?:public\.)?"?${name}"?`;
const creates = (sql, name) =>
  new RegExp(String.raw`create\s+table\s+(?:if\s+not\s+exists\s+)?${tableName(name)}\s*\(`, "i").test(strip(sql));
const uses = (sql, name) =>
  new RegExp(
    String.raw`(?:references\s+${tableName(name)}\s*\(|alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${tableName(name)}\b|(?:from|join)\s+${tableName(name)}\b)`,
    "i",
  ).test(strip(sql));

// Git stores these files with LF; hash normalised text so a CRLF checkout matches the reviewed bytes.
export const sha256 = (text) =>
  createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");

export function inspectMigrationPreflight({ canonical, legacyNames = null }) {
  const blockers = [];
  const report = {
    schema: "omnira.migration-replay-preflight.v1",
    ok: false,
    fullReplayValidated: false,
    disclaimer: DISCLAIMER,
    canonicalDir: CANONICAL_DIR,
    legacyDir: LEGACY_DIR,
    canonicalCount: canonical.length,
    ordering: null,
    baseline: [],
    legacy: null,
    blockers,
  };
  if (canonical.length === 0) blockers.push({ code: "canonical_migrations_missing", detail: CANONICAL_DIR });

  let ordered = null;
  try {
    ordered = orderReplayMigrations(canonical.map(({ name, sql }) => ({ name, sha256: sha256(sql), sql })));
  } catch (error) {
    blockers.push({ code: "replay_order_refused", detail: error.message });
  }
  if (ordered) {
    const lexical = [...canonical].map((m) => m.name).sort();
    const at = (list, name) => list.indexOf(name);
    const names = ordered.map((m) => m.name);
    report.ordering = {
      lexicalPlacesImagesFirst:
        at(lexical, MEDIA_IMAGES) !== -1 && at(lexical, MEDIA_IMAGES) < at(lexical, MEDIA_TABLES),
      replayPlacesTablesFirst:
        at(names, MEDIA_IMAGES) === -1 || at(names, MEDIA_TABLES) < at(names, MEDIA_IMAGES),
    };
    if (!report.ordering.replayPlacesTablesFirst)
      blockers.push({ code: "media_order_violated", detail: `${MEDIA_TABLES} must precede ${MEDIA_IMAGES}` });

    for (const table of BASELINE_TABLES) {
      const firstUse = ordered.findIndex((m) => uses(m.sql, table));
      const createdAt = ordered.findIndex((m) => creates(m.sql, table));
      const entry = {
        table,
        firstUsedBy: firstUse === -1 ? null : names[firstUse],
        createdBy: createdAt === -1 ? null : names[createdAt],
      };
      report.baseline.push(entry);
      if (firstUse !== -1 && (createdAt === -1 || createdAt > firstUse))
        blockers.push({
          code: "missing_tracked_baseline",
          detail: `${table} is used by ${entry.firstUsedBy} but no earlier canonical migration creates it`,
        });
    }
  }

  if (legacyNames && legacyNames.length > 0) {
    const canonicalNames = new Set(canonical.map((m) => m.name));
    report.legacy = {
      count: legacyNames.length,
      collidingNames: legacyNames.filter((name) => canonicalNames.has(name)).sort(),
    };
    blockers.push({
      code: "legacy_root_migrations_present",
      detail: `${legacyNames.length} SQL files in ${LEGACY_DIR} could be replayed instead of or alongside ${CANONICAL_DIR}`,
    });
  }

  report.ok = blockers.length === 0;
  return report;
}

export function readRepository(repo) {
  const sqlNames = (dir) => readdirSync(dir).filter((name) => name.endsWith(".sql"));
  const canonicalDir = resolve(repo, CANONICAL_DIR);
  const legacyDir = resolve(repo, LEGACY_DIR);
  return {
    canonical: existsSync(canonicalDir)
      ? sqlNames(canonicalDir).map((name) => ({ name, sql: readFileSync(resolve(canonicalDir, name), "utf8") }))
      : [],
    legacyNames: existsSync(legacyDir) ? sqlNames(legacyDir) : null,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  let report;
  try {
    report = inspectMigrationPreflight(readRepository(resolve(dirname(fileURLToPath(import.meta.url)), "../../..")));
  } catch (error) {
    report = {
      schema: "omnira.migration-replay-preflight.v1",
      ok: false,
      fullReplayValidated: false,
      disclaimer: DISCLAIMER,
      blockers: [{ code: "preflight_error", detail: error.message }],
    };
  }
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ok ? 0 : 1;
}
