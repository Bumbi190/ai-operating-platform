import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectMigrationPreflight, readRepository } from "./migration-replay-preflight.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const repository = readRepository(repo);
const media = repository.canonical.filter((m) => m.name.startsWith("20260520_media_"));
const codes = (report) => report.blockers.map((b) => b.code).sort();

test("repository reports the media lexical hazard, missing baseline and legacy root as blockers", () => {
  const report = inspectMigrationPreflight(repository);
  assert.equal(report.ok, false);
  assert.equal(report.fullReplayValidated, false);
  assert.match(report.disclaimer, /does not establish full replay validity/);
  assert.deepEqual(report.ordering, { lexicalPlacesImagesFirst: true, replayPlacesTablesFirst: true });
  assert.deepEqual(codes(report), [
    "legacy_root_migrations_present",
    "missing_tracked_baseline",
    "missing_tracked_baseline",
  ]);
  for (const entry of report.baseline) {
    assert.equal(entry.firstUsedBy, "20260520_media_tables.sql");
    assert.equal(entry.createdBy, null);
  }
});

test("a tracked baseline before first use clears the baseline blocker but never claims full replay", () => {
  const baseline = {
    name: "20260101_baseline.sql",
    sql: "create table public.projects (id uuid primary key);\nCREATE TABLE IF NOT EXISTS runs (id uuid);",
  };
  const report = inspectMigrationPreflight({ canonical: [...media, baseline], legacyNames: null });
  assert.deepEqual(report.blockers, []);
  assert.equal(report.ok, true);
  assert.equal(report.fullReplayValidated, false);
});

test("a baseline created after first use is still a blocker", () => {
  const late = { name: "20270101_late.sql", sql: "create table projects (id uuid); create table runs (id uuid);" };
  assert.deepEqual(codes(inspectMigrationPreflight({ canonical: [...media, late] })), [
    "missing_tracked_baseline",
    "missing_tracked_baseline",
  ]);
});

test("commented-out creation does not count as a baseline", () => {
  const fake = { name: "20260101_fake.sql", sql: "-- create table projects (id uuid);\n/* create table runs ( */" };
  assert.equal(codes(inspectMigrationPreflight({ canonical: [...media, fake] })).length, 2);
});

test("unreviewed media bytes or a missing prerequisite fail closed", () => {
  const changed = media.map((m) => (m.name.endsWith("tables.sql") ? { ...m, sql: m.sql + "\n-- edit" } : m));
  assert.deepEqual(codes(inspectMigrationPreflight({ canonical: changed })), ["replay_order_refused"]);
  const orphan = media.filter((m) => m.name.endsWith("images.sql"));
  assert.deepEqual(codes(inspectMigrationPreflight({ canonical: orphan })), ["replay_order_refused"]);
});

test("empty canonical directory and colliding legacy names are reported", () => {
  const report = inspectMigrationPreflight({ canonical: [], legacyNames: ["a.sql"] });
  assert.deepEqual(codes(report), ["canonical_migrations_missing", "legacy_root_migrations_present"]);
  const collide = inspectMigrationPreflight({ canonical: media, legacyNames: [media[0].name] });
  assert.deepEqual(collide.legacy.collidingNames, [media[0].name]);
});

test("CLI prints JSON blockers and exits non-zero", () => {
  let result;
  try {
    execFileSync(process.execPath, [resolve(here, "migration-replay-preflight.mjs")], { encoding: "utf8" });
    assert.fail("expected non-zero exit");
  } catch (error) {
    assert.equal(error.status, 1);
    result = JSON.parse(error.stdout);
  }
  assert.equal(result.fullReplayValidated, false);
  assert.ok(result.blockers.length > 0);
});
