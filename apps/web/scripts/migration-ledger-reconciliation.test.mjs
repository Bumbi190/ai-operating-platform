import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseMetadata, reconcileLedger, verifyReplayPins } from "./migration-ledger-reconciliation.mjs";
import { sha256 } from "./migration-replay-preflight.mjs";

const row = (version, name) => ({ version, name });
const file = (name, dir = "apps/web/supabase/migrations", sql = "-- synthetic\n") => ({ path: `${dir}/${name}`, sql });
const snapshot = (migrations) => ({ count: migrations.length, migrations });
const receipt = (applied) => ({
  schema: "omnira.migration-bootstrap-replay.v1", replayReady: false, completed: true,
  failure: null, refusal: null,
  coverage: { planned: applied.length, verified: applied.length, attempted: applied.length, applied: applied.length, bounded: false, limit: null }, applied,
});

test("metadata validates count, string versions and allowlists fields without echoing payloads", () => {
  assert.deepEqual(parseMetadata(snapshot([row("20260101000100", "alpha")])), [row("20260101000100", "alpha")]);
  for (const input of [[], { count: 2, migrations: [row("1", "x")] }, snapshot([row(123, "x")]),
    snapshot([row("1", "bad/name")]), snapshot([{ ...row("1", "x"), statements: ["PRIVATE_PAYLOAD"] }]),
    { ...snapshot([]), credentials: "PRIVATE_PAYLOAD" }]) {
    assert.throws(() => parseMetadata(input), (e) => !e.message.includes("PRIVATE_PAYLOAD"));
  }
});

test("only exact version plus suffix is a pair; whole-stem and suffix names remain candidates", () => {
  const result = reconcileLedger({ migrations: [row("20260101000100", "alpha"), row("20260102000100", "20260102_beta"), row("20260103000100", "gamma")],
    sources: [file("20260101000100_alpha.sql"), file("20260102_beta.sql"), file("20260103_gamma.sql")] });
  assert.deepEqual(result.entries.map(e => e.status), ["exact_pair", "name_only", "name_only"]);
  assert.equal(result.entries[1].nameCandidates[0].evidence, "exact_filename_stem");
  assert.equal(result.entries[2].nameCandidates[0].evidence, "exact_suffix");
  assert.equal(result.productionSqlIdentityValidated, false);
  assert.equal(result.replayReady, false);
});

test("coincidental substrings, date stripping, case folding and padding never match", () => {
  const result = reconcileLedger({ migrations: [row("99", "alpha"), row("98", "Alpha"), row("97", "cron"), row("96", "20260101_beta")],
    sources: [file("20260101_alphabet.sql"), file("20260102_alpha_v2.sql"), file("20260103_cron_setup.sql"), file("20260102_beta.sql")] });
  assert.equal(result.counts.unmatched, 4);
});

test("version conflicts and multiple source candidates are explicit, even for identical SQL", () => {
  const result = reconcileLedger({ migrations: [row("1", "alpha"), row("2", "beta"), row("3", "same")],
    sources: [file("1_other.sql"), file("9_alpha.sql"), file("8_beta.sql"), file("7_beta.sql", "supabase/migrations"),
      file("3_same.sql"), file("3_same.sql", "supabase/migrations")] });
  assert.deepEqual(result.entries.map(e => e.status), ["version_conflict", "ambiguous", "ambiguous"]);
  assert.equal(result.entries[0].nameCandidates.length, 1);
  assert.equal(result.entries[2].pairCandidates.length, 2);
});

test("duplicate ledger versions (including identical rows) cannot produce accepted pairs", () => {
  const result = reconcileLedger({ migrations: [row("1", "alpha"), row("1", "alpha"), row("2", "alpha")], sources: [file("1_alpha.sql")] });
  assert.equal(result.counts.ambiguous, 3);
  assert.deepEqual(result.duplicateLedgerVersions, ["1"]);
  assert.deepEqual(result.duplicateLedgerNames, ["alpha"]);
});

test("deterministic order, no SQL body output, and reverse coverage includes missing sources", () => {
  const migrations = [row("2", "beta"), row("1", "alpha")];
  const sources = [file("1_alpha.sql", undefined, "-- PRIVATE_BODY\r\n"), file("3_missing.sql")];
  const first = reconcileLedger({ migrations, sources });
  assert.deepEqual(first, reconcileLedger({ migrations: [...migrations].reverse(), sources: [...sources].reverse() }));
  assert.equal(first.sourceCoverage.canonical.withoutExactPair, 1);
  assert.equal(first.sourceCoverage.canonical.withoutAnyCandidate, 1);
  assert.ok(!JSON.stringify(first).includes("PRIVATE_BODY"));
});

test("replay pins verify LF bytes; drift and malformed paths fail closed", () => {
  const step = { index: 0, kind: "canonical", path: "apps/web/supabase/migrations/1_alpha.sql", lfSha256: sha256("-- test\n") };
  const read = () => "-- test\r\n";
  assert.equal(verifyReplayPins(receipt([step]), read).allPinsVerified, true);
  assert.equal(verifyReplayPins(receipt([step]), () => "changed").allPinsVerified, false);
  for (const path of ["../private.sql", "supabase/migrations/../../private.sql", "C:/private.sql"]) {
    let called = false;
    const result = verifyReplayPins(receipt([{ ...step, path }]), () => { called = true; return ""; });
    assert.equal(result.allPinsVerified, false);
    assert.equal(called, false);
  }
  assert.equal(verifyReplayPins(receipt([{ ...step, lfSha256: "invalid" }]), read).allPinsVerified, false);
  assert.equal(verifyReplayPins(receipt([step, { ...step, index: 1 }]), read).allPinsVerified, false);
  assert.equal(verifyReplayPins({ ...receipt([step]), completed: false }, read).historicalCompletionConsistent, false);
});

test("synthetic receipt metadata cannot impersonate a reviewed extraction", () => {
  const step = { index: 0, kind: "synthetic", path: "synthetic/platform_config_table_only", sourcePath: "../private.sql", lfSha256: "a".repeat(64) };
  let called = false;
  const result = verifyReplayPins(receipt([step]), () => { called = true; return ""; });
  assert.equal(called, false);
  assert.equal(result.allPinsVerified, false);
});

test("receipt coverage claims cannot turn a partial replay into complete evidence", () => {
  const step = { index: 0, kind: "canonical", path: "apps/web/supabase/migrations/1_alpha.sql", lfSha256: sha256("-- test\n") };
  const full = receipt([step]);
  for (const changed of [{ ...full, failure: {} }, { ...full, refusal: {} }, { ...full, replayReady: true },
    { ...full, coverage: { ...full.coverage, planned: 2 } }, { ...full, coverage: { ...full.coverage, bounded: true } }]) {
    const result = verifyReplayPins(changed, () => "-- test\n");
    assert.equal(result.allPinsVerified, true);
    assert.equal(result.historicalCompletionConsistent, false);
  }
});

test("CLI is repeatable, read-only, and reports unreadable metadata without input contents", () => {
  const root = mkdtempSync(join(tmpdir(), "ledger-offline-"));
  try {
    for (const dir of ["apps/web/supabase/migrations", "supabase/migrations"]) mkdirSync(join(root, dir), { recursive: true });
    const source = file("1_alpha.sql");
    writeFileSync(join(root, source.path), source.sql);
    const metadata = join(root, "metadata.json"), pins = join(root, "receipt.json");
    writeFileSync(metadata, JSON.stringify(snapshot([row("1", "alpha")])));
    writeFileSync(pins, JSON.stringify(receipt([{ index: 0, kind: "canonical", path: source.path, lfSha256: sha256(source.sql) }])));
    const state = () => JSON.stringify(readdirSync(root, { recursive: true }).sort().map(path => {
      try { return [path, readFileSync(join(root, path), "utf8")]; } catch { return [path, "directory"]; }
    }));
    const before = state();
    const script = fileURLToPath(new URL("./migration-ledger-reconciliation.mjs", import.meta.url));
    const run = (path) => spawnSync(process.execPath, [script, "--repo", root, "--metadata", path, "--receipt", pins], { encoding: "utf8" });
    const first = run(metadata), second = run(metadata);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(first.stdout, second.stdout);
    assert.equal(JSON.parse(first.stdout).counts.exact_pair, 1);
    assert.equal(state(), before);
    assert.equal(run(join(root, "missing.json")).status, 1);
    writeFileSync(metadata, "PRIVATE_PAYLOAD");
    const invalid = run(metadata);
    assert.equal(invalid.status, 1);
    assert.ok(!invalid.stdout.includes("PRIVATE_PAYLOAD"));
    assert.ok(!invalid.stderr.includes("PRIVATE_PAYLOAD"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
