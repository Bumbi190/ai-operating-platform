import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { KNOWN_TABLES, parseFingerprints, parseCatalog, auditFingerprints } from "./migration-history-fingerprint-audit.mjs";

const md5 = bytes => createHash("md5").update(bytes).digest("hex");
const body = Buffer.from("-- synthetic PRIVATE_BODY\nselect 'å';\n");
const fingerprints = () => ({ source: "synthetic", records: Array.from({ length: 13 }, (_, i) => ({
  version: String(i + 1), name: `migration_${i}`, statement_count: 1,
  sql_bytes: i === 0 ? body.length : i + 1, sql_md5: i === 0 ? md5(body) : "a".repeat(32),
})) });
const catalog = () => ({ source: "synthetic", records: KNOWN_TABLES.map(table_name => ({
  table_name, owner: "postgres", rls_enabled: true, force_rls: false, policy_count: 0, column_count: 1,
  anon_select: false, authenticated_select: false, service_select: true, anon_insert: false, authenticated_insert: false,
})) });
const file = (name, bytes = body, directory = "apps/web/supabase/migrations") => ({ path: `${directory}/${name}`, bytes });
const audit = (sources, fp = fingerprints(), cat = catalog()) => auditFingerprints({ fingerprints: fp, catalog: cat, sources });

test("matches only complete raw byte length and MD5, independent of names; reports every matching path", () => {
  const result = audit([file("999_unrelated.sql"), file("10_duplicate.sql", body, "supabase/migrations")]);
  assert.equal(result.counts.exactFullFileFingerprint, 1);
  assert.equal(result.counts.noFullFileMatch, 12);
  assert.equal(result.entries[0].matches.length, 2);
  assert.equal(result.productionSqlIdentityValidated, false);
  assert.equal(result.catalogParityValidated, false);
  assert.equal(result.replayReady, false);
  assert.ok(!JSON.stringify(result).includes("PRIVATE_BODY"));
});

test("CRLF, BOM, trailing whitespace, fragments and array formatting never become matches", () => {
  for (const bytes of [Buffer.from(body.toString().replaceAll("\n", "\r\n")), Buffer.concat([Buffer.from([239,187,191]), body]),
    Buffer.concat([body, Buffer.from(" ")]), body.subarray(1), Buffer.from(JSON.stringify([body.toString()]))]) {
    assert.equal(audit([file("1_migration_0.sql", bytes)]).counts.exactFullFileFingerprint, 0);
  }
  const wrongLength = fingerprints(); wrongLength.records[0].sql_bytes++;
  assert.equal(audit([file("1_migration_0.sql")], wrongLength).counts.exactFullFileFingerprint, 0);
  const multiple = fingerprints(); multiple.records[0].statement_count = 2;
  assert.equal(audit([file("1_migration_0.sql")], multiple).productionSqlIdentityValidated, false);
});

test("fingerprints fail closed for unknown fields, types, counts, duplicates and unsafe identifiers", () => {
  const mutations = [x => x.records.pop(), x => x.extra = "PRIVATE_PAYLOAD", x => x.records[0].sql = "PRIVATE_PAYLOAD",
    x => x.records[0].sql_md5 = "z".repeat(32), x => x.records[0].sql_md5 = 123,
    x => x.records[0].sql_bytes = -1, x => x.records[0].sql_bytes = 1.5,
    x => x.records[0].statement_count = 0, x => x.records[0].version = 1,
    x => x.records[0].name = "../PRIVATE_PAYLOAD", x => x.records[1].version = x.records[0].version,
    x => x.records[1].name = x.records[0].name, x => x.records[0] = [], x => x.records[0].name = null,
    x => x.records[0].name += "\n", x => x.records[0].version += "\n", x => x.records[0].sql_md5 += "\n"];
  for (const mutate of mutations) {
    const input = fingerprints(); mutate(input);
    assert.throws(() => parseFingerprints(input), e => !e.message.includes("PRIVATE_PAYLOAD"));
  }
  for (const input of [null, [], 1, {}, { source: "x", records: null }]) assert.throws(() => parseFingerprints(input));
});

test("catalog requires exactly the known table set and strictly typed metadata only", () => {
  const mutations = [x => x.records.pop(), x => x.records[0].table_name = "unknown",
    x => x.records[1].table_name = x.records[0].table_name, x => x.records[0].rows = "PRIVATE_PAYLOAD",
    x => x.records[0].rls_enabled = "true", x => x.records[0].anon_select = 1,
    x => delete x.records[0].owner, x => x.records[0].policy_count = -1,
    x => x.records[0].column_count = 0, x => x.records[0].owner = "unsafe/name", x => x.source = {},
    x => x.records[0].owner += "\n"];
  for (const mutate of mutations) { const input = catalog(); mutate(input); assert.throws(() => parseCatalog(input)); }
  const result = audit([]);
  assert.equal(result.catalog.tables.length, 14);
  assert.equal(result.catalog.scope, "supplied_public_table_metadata_only");
  assert.equal(result.catalog.tables[0].rls_enabled, true);
});

test("deterministic ordering, source path/byte validation, and duplicate paths fail closed", () => {
  const fp = fingerprints(), cat = catalog(), sources = [file("2_beta.sql"), file("1_alpha.sql")];
  const first = audit(sources, fp, cat);
  fp.records.reverse(); cat.records.reverse();
  assert.deepEqual(first, audit([...sources].reverse(), fp, cat));
  for (const source of [file("../secret.sql"), file("bad.sql"), file("1_alpha.sql\n"), { path: "../secret.sql", bytes: body },
    { ...file("1_alpha.sql"), bytes: body.toString() }, { ...file("1_alpha.sql"), sql: "PRIVATE_PAYLOAD" }]) {
    assert.throws(() => audit([source]));
  }
  assert.throws(() => audit([sources[0], sources[0]]));
});

test("CLI is repeatable and read-only; invalid/unavailable payloads and flags have sanitized failures", () => {
  const root = mkdtempSync(join(tmpdir(), "fingerprint-offline-"));
  try {
    for (const dir of ["apps/web/supabase/migrations", "supabase/migrations"]) mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, "apps/web/supabase/migrations/1_alpha.sql"), body);
    const fpPath = join(root, "fingerprints.json"), catPath = join(root, "catalog.json");
    writeFileSync(fpPath, "\uFEFF" + JSON.stringify(fingerprints())); writeFileSync(catPath, JSON.stringify(catalog()));
    const script = fileURLToPath(new URL("./migration-history-fingerprint-audit.mjs", import.meta.url));
    const run = (extra = []) => spawnSync(process.execPath, [script, "--repo", root, "--fingerprints", fpPath, "--catalog", catPath, ...extra], { encoding: "utf8" });
    const state = () => JSON.stringify(readdirSync(root, { recursive: true }).sort().map(path => {
      try { return [path, readFileSync(join(root, path)).toString("hex")]; } catch { return [path, "directory"]; }
    }));
    const before = state(), first = run(), second = run();
    assert.equal(first.status, 0, first.stderr);
    assert.equal(JSON.parse(first.stdout).counts.exactFullFileFingerprint, 1);
    assert.equal(first.stdout, second.stdout); assert.equal(state(), before);
    assert.equal(run(["--unknown", "PRIVATE_PAYLOAD"]).status, 1);
    writeFileSync(catPath, JSON.stringify({ ...catalog(), rows: "PRIVATE_PAYLOAD" }));
    const badCatalog = run(); assert.equal(badCatalog.status, 1);
    assert.ok(!badCatalog.stdout.includes("PRIVATE_PAYLOAD")); assert.equal(badCatalog.stderr, "");
    writeFileSync(catPath, JSON.stringify(catalog()));
    mkdirSync(join(root, "apps/web/supabase/migrations/2_directory.sql"));
    assert.equal(run().status, 1);
    rmSync(join(root, "apps/web/supabase/migrations/2_directory.sql"), { recursive: true });
    rmSync(join(root, "supabase/migrations"), { recursive: true });
    assert.equal(run().status, 1);
    mkdirSync(join(root, "supabase/migrations"));
    writeFileSync(fpPath, JSON.stringify({ ...fingerprints(), sql: "PRIVATE_PAYLOAD" }));
    const invalid = run(); assert.equal(invalid.status, 1);
    assert.ok(!invalid.stdout.includes("PRIVATE_PAYLOAD")); assert.equal(invalid.stderr, "");
    writeFileSync(fpPath, "PRIVATE_PAYLOAD"); assert.equal(run().status, 1);
    rmSync(fpPath); assert.equal(run().status, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
