// Offline metadata reconciliation only. No SQL execution, subprocesses, network, env or writes.
// Never treats a local hash or a matching name as evidence of deployed SQL identity.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { CANONICAL_DIR, LEGACY_DIR, sha256 } from "./migration-replay-preflight.mjs";
import { BASELINE_FIXTURE, SYNTHETIC_FIXTURES, extractSyntheticFixture } from "./migration-bootstrap-plan.mjs";

export const DEFAULT_RECEIPT = "docs/validation/migration-bootstrap-replay-v10-20261105.json";
const SHA = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
const SQL_FILE = /^([0-9]+)_([A-Za-z0-9_][A-Za-z0-9_.-]*)\.sql$/;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const sorted = (items, key) => [...items].sort((a, b) => compare(key(a), key(b)));
const duplicates = (items) => [...new Set(items.filter((item, i) => items.indexOf(item) !== i))].sort(compare);
const digest = (value) => sha256(JSON.stringify(value));

// Reject rather than print unknown payload fields (e.g. SQL statements or application rows).
export function parseMetadata(input) {
  const allowed = new Set(["source", "asOf", "count", "migrations"]);
  if (!input || Array.isArray(input) || Object.keys(input).some(k => !allowed.has(k)) ||
      !Array.isArray(input.migrations) || !Number.isSafeInteger(input.count) || input.count !== input.migrations.length ||
      ["source", "asOf"].some(k => input[k] !== undefined && typeof input[k] !== "string"))
    throw new Error("metadata_format_invalid");
  return input.migrations.map(entry => {
    if (!entry || Object.keys(entry).length !== 2 || typeof entry.version !== "string" || !/^[0-9]+$/.test(entry.version) ||
        typeof entry.name !== "string" || !IDENTIFIER.test(entry.name)) throw new Error("metadata_entry_invalid");
    return { version: entry.version, name: entry.name };
  });
}

function sourceIdentity(path) {
  const dir = path.startsWith(`${CANONICAL_DIR}/`) ? CANONICAL_DIR : path.startsWith(`${LEGACY_DIR}/`) ? LEGACY_DIR : null;
  const filename = dir ? path.slice(dir.length + 1) : "";
  const match = SQL_FILE.exec(filename);
  if (!match) throw new Error("source_path_invalid");
  return { path, directory: dir === CANONICAL_DIR ? "canonical" : "legacy", version: match[1], name: match[2], stem: filename.slice(0, -4) };
}

export function reconcileLedger({ migrations, sources }) {
  migrations = sorted(parseMetadata({ count: migrations.length, migrations }), e => `${e.version}\0${e.name}`);
  const inventory = sorted(sources.map(({ path, sql }) => ({ ...sourceIdentity(path), lfSha256: sha256(sql) })), s => s.path);
  if (duplicates(inventory.map(s => s.path)).length) throw new Error("duplicate_source_path");
  const duplicateLedgerVersions = duplicates(migrations.map(m => m.version));
  const duplicateLedgerNames = duplicates(migrations.map(m => m.name));
  const entries = migrations.map(({ version, name }) => {
    const pairCandidates = inventory.filter(s => s.version === version && s.name === name).map(s => s.path);
    const nameCandidates = inventory.filter(s => s.name === name || s.stem === name)
      .map(s => ({ path: s.path, evidence: s.name === name ? "exact_suffix" : "exact_filename_stem" }));
    const versionCandidates = inventory.filter(s => s.version === version).map(s => s.path);
    // Duplicates stay ambiguous even when one candidate would otherwise win.
    const status = duplicateLedgerVersions.includes(version) || duplicateLedgerNames.includes(name) || pairCandidates.length > 1 ||
      (!pairCandidates.length && nameCandidates.length > 1) ? "ambiguous" :
      pairCandidates.length === 1 ? "exact_pair" : versionCandidates.length ? "version_conflict" : nameCandidates.length ? "name_only" : "unmatched";
    return { version, name, status, pairCandidates, nameCandidates, versionCandidates };
  });
  const counts = Object.fromEntries(["exact_pair", "name_only", "version_conflict", "ambiguous", "unmatched"].map(s => [s, entries.filter(e => e.status === s).length]));
  const sourceCoverage = Object.fromEntries(["canonical", "legacy"].map(directory => {
    const files = inventory.filter(s => s.directory === directory).map(s => {
      const exactPairs = entries.filter(e => e.status === "exact_pair" && e.pairCandidates.includes(s.path));
      const candidates = entries.filter(e => e.pairCandidates.includes(s.path) || e.nameCandidates.some(c => c.path === s.path) || e.versionCandidates.includes(s.path));
      return { path: s.path, exactPairCount: exactPairs.length, candidateCount: candidates.length };
    });
    return [directory, { total: files.length, withExactPair: files.filter(f => f.exactPairCount).length,
      withoutExactPair: files.filter(f => !f.exactPairCount).length,
      withoutAnyCandidate: files.filter(f => !f.candidateCount).length, files }];
  }));
  return {
    schema: "omnira.migration-ledger-reconciliation.v1", offline: true, readOnly: true,
    replayReady: false, productionSqlIdentityValidated: false, catalogParityValidated: false,
    ledgerCount: entries.length, ledgerMetadataSha256: digest(migrations), sourceInventorySha256: digest(inventory),
    counts, duplicateLedgerVersions, duplicateLedgerNames, entries, sourceCoverage, inventory,
  };
}

// Read only allowlisted local replay inputs. No receipt-provided arbitrary path can be read.
// LF pins attest to today's local bytes relative to the historical receipt, never production bytes.
export function verifyReplayPins(receipt, read) {
  if (receipt?.schema !== "omnira.migration-bootstrap-replay.v1" || !Array.isArray(receipt.applied))
    throw new Error("replay_receipt_invalid");
  const seen = new Set();
  const steps = receipt.applied.map((step, index) => {
    const result = { index, kind: step?.kind, path: step?.path, pinVerified: false };
    try {
      if (step?.index !== index || !SHA.test(step.lfSha256 ?? "") || seen.has(step.path)) throw new Error();
      seen.add(step.path);
      let body;
      if (step.kind === "synthetic") {
        const pin = SYNTHETIC_FIXTURES.find(p => p.path === step.path);
        if (!pin || ["sourcePath", "sourceLfSha256", "extractedLfSha256", "lfSha256"].some(k => step[k] !== pin[k])) throw new Error();
        const source = read(pin.sourcePath);
        if (sha256(source) !== pin.sourceLfSha256) throw new Error();
        body = extractSyntheticFixture(pin, source).body;
        result.sourcePath = pin.sourcePath;
      } else {
        if (step.kind === "canonical") {
          if (sourceIdentity(step.path).directory !== "canonical") throw new Error();
        } else if (step.kind === "fixture") {
          if (step.path !== BASELINE_FIXTURE && sourceIdentity(step.path).directory !== "legacy") throw new Error();
        } else throw new Error();
        body = read(step.path);
      }
      result.lfSha256 = sha256(body);
      if (result.lfSha256 !== step.lfSha256) throw new Error();
      result.pinVerified = true;
    } catch {
      // Do not echo SQL, filesystem errors, or arbitrary receipt payloads.
      result.problem = "pin_unverified";
    }
    return result;
  });
  const c = receipt.coverage;
  const historicalCompletionConsistent = receipt.completed === true && receipt.replayReady === false &&
    receipt.failure === null && receipt.refusal === null && steps.length > 0 && c?.bounded === false && c.limit === null &&
    [c.planned, c.verified, c.attempted, c.applied].every(n => n === steps.length);
  return { historicalCompletionConsistent, allPinsVerified: steps.length > 0 && steps.every(s => s.pinVerified),
    appliedCount: steps.length, canonicalCount: steps.filter(s => s.kind === "canonical").length,
    fixtureCount: steps.filter(s => s.kind !== "canonical").length, steps };
}

export function readReconciliation({ repo, metadata, receiptPath = DEFAULT_RECEIPT }) {
  const raw = readFileSync(metadata);
  let parsed;
  try { parsed = JSON.parse(raw.toString("utf8").replace(/^\uFEFF/, "")); } catch { throw new Error("metadata_json_invalid"); }
  const migrations = parseMetadata(parsed);
  const read = path => readFileSync(resolve(repo, path), "utf8");
  const sources = [CANONICAL_DIR, LEGACY_DIR].flatMap(dir => readdirSync(resolve(repo, dir), { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith(".sql")).map(e => ({ path: `${dir}/${e.name}`, sql: read(`${dir}/${e.name}`) })));
  const report = reconcileLedger({ migrations, sources });
  report.snapshotBytesSha256 = createHash("sha256").update(raw).digest("hex");
  const receiptBytes = readFileSync(resolve(repo, receiptPath));
  let receipt;
  try { receipt = JSON.parse(receiptBytes.toString("utf8")); } catch { throw new Error("receipt_json_invalid"); }
  report.replayReceiptBytesSha256 = createHash("sha256").update(receiptBytes).digest("hex");
  report.replay = verifyReplayPins(receipt, read);
  report.replay.canonicalInventoryCovered = report.sourceCoverage.canonical.total > 0 &&
    report.sourceCoverage.canonical.total === report.replay.canonicalCount &&
    report.inventory.filter(s => s.directory === "canonical").every(s => report.replay.steps.some(p => p.path === s.path && p.pinVerified));
  report.replay.fixtureLedgerCandidates = report.replay.steps.filter(s => s.kind !== "canonical").map(s => ({
    path: s.path, pinVerified: s.pinVerified,
    // Synthetic extractions are not whole migrations. Only expose the source's metadata candidates.
    sourcePath: s.sourcePath ?? s.path,
    synthetic: s.kind === "synthetic",
    candidates: report.entries.filter(e => e.nameCandidates.some(c => c.path === (s.sourcePath ?? s.path)))
      .map(({ version, name, status }) => ({ version, name, status })),
  }));
  report.limitations = [
    "Exact pairs establish metadata correspondence only; the snapshot has no production SQL or checksums.",
    "Name-only candidates do not establish migration identity; no fuzzy, case, date or substring matching is used.",
    "Local receipt pins and completion are historical diagnostics, not automatic Dashboard branch replay evidence.",
    "The schema baseline is outside both migration directories and has no version/name identity in this comparison.",
    "No catalog snapshot was supplied: columns, constraints, functions, triggers, extensions, RLS, ACLs and jobs are unverified.",
  ];
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const { values } = parseArgs({ options: { metadata: { type: "string" }, repo: { type: "string" }, receipt: { type: "string" } }, allowPositionals: false });
    if (!values.metadata) throw new Error("metadata_path_required");
    const report = readReconciliation({ repo: values.repo ?? resolve(dirname(fileURLToPath(import.meta.url)), "../../.."),
      metadata: values.metadata, receiptPath: values.receipt ?? DEFAULT_RECEIPT });
    console.log(JSON.stringify(report, null, 2));
    // Zero means the offline report was computed, never permission to replay or migrate.
    process.exitCode = report.replay.allPinsVerified && report.replay.historicalCompletionConsistent && report.replay.canonicalInventoryCovered ? 0 : 2;
  } catch {
    console.log(JSON.stringify({ schema: "omnira.migration-ledger-reconciliation.v1", offline: true, readOnly: true,
      replayReady: false, error: "input_unavailable_or_invalid", usage: "node migration-ledger-reconciliation.mjs --metadata <local metadata JSON> [--repo <root>] [--receipt <local receipt JSON>]" }, null, 2));
    process.exitCode = 1;
  }
}
