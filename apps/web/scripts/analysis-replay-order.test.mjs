import { test } from "node:test";
import assert from "node:assert/strict";
import { orderReplayMigrations, orderLegacyMediaReplayMigrations } from "./analysis-replay-order.mjs";
const tables = {
  name: "20260520_media_tables.sql",
  sha256: "ec1a18ef576352e99d2b38b54da6d2c8db6cb5b409b38e4ece3921135200e07c",
};
const images = {
  name: "20260520_media_images.sql",
  sha256: "e1d544a46214f72d09588b66725989c5caf9ef4ce6bb8e53c34c34850264ca58",
};
const insights = {
  name: "20260601_media_insights.sql",
  sha256: "b3cad2590764175d104db1f6f62a48b2b63915e95fc3f0ee4020233e2ee941dd",
};
const cron = {
  name: "20260528_pg_cron_setup.sql",
  sha256: "22569e22cd61cef171ad3be914a02d3e7d013a787304ce6904f09a24218d0967",
};
test("create media_scripts before its images alteration without dropping either migration", () => {
  const earlier = { name: "20260501_before.sql", sha256: "a" },
    later = { name: "20260521_after.sql", sha256: "b" };
  const input = [later, images, earlier, tables];
  assert.deepEqual(orderReplayMigrations(input), [
    earlier,
    tables,
    images,
    later,
  ]);
  assert.equal(input[0], later);
});
test("unreviewed bytes for a reordered migration fail closed", () => {
  assert.throws(
    () => orderReplayMigrations([images, { ...tables, sha256: "changed" }]),
    /unreviewed replay dependency/,
  );
});
test("missing dependency is refused rather than skipped", () => {
  assert.throws(
    () => orderReplayMigrations([images]),
    /missing replay dependency/,
  );
});
test("all unrelated migrations retain lexical order", () => {
  const rows = [
    { name: "20260901_z.sql", sha256: "a" },
    { name: "20260801_a.sql", sha256: "b" },
  ];
  assert.deepEqual(orderReplayMigrations(rows), [rows[1], rows[0]]);
});
test("duplicate filenames are refused", () => {
  assert.throws(
    () => orderReplayMigrations([tables, tables, images]),
    /duplicate replay migration/,
  );
});

test("legacy media diagnostic includes its pinned root dependency before BI", () => {
  const bi = { name: "20260602_atlas_bi_foundation.sql", sha256: "bi" };
  const ordered = orderLegacyMediaReplayMigrations([bi, images, tables], insights);
  assert.deepEqual(ordered, [tables, images, insights, bi]);
  assert.equal(ordered.filter((entry) => entry === insights).length, 1);
});
test("legacy media diagnostic refuses changed bytes, duplicates and missing BI", () => {
  assert.throws(() => orderLegacyMediaReplayMigrations([tables, images], insights), /missing replay dependency/);
  assert.throws(() => orderLegacyMediaReplayMigrations([tables, images, { name: "20260602_atlas_bi_foundation.sql", sha256: "bi" }], { ...insights, sha256: "changed" }), /unreviewed legacy media dependency/);
  assert.throws(() => orderLegacyMediaReplayMigrations([tables, images, insights, { name: "20260602_atlas_bi_foundation.sql", sha256: "bi" }], insights), /duplicate legacy media dependency/);
});
test("legacy cron dependency is pinned and ordered before later watchdog functions", () => {
  const bi = { name: "20260602_atlas_bi_foundation.sql", sha256: "bi" };
  const watchdog = { name: "20260614091000_h1p5_runs_claim_id.sql", sha256: "watchdog" };
  assert.deepEqual(orderLegacyMediaReplayMigrations([watchdog, bi, images, tables], insights, cron),
    [tables, images, cron, insights, bi, watchdog]);
  assert.throws(() => orderLegacyMediaReplayMigrations([bi], insights, { ...cron, sha256: "changed" }), /unreviewed legacy cron dependency/);
  assert.throws(() => orderLegacyMediaReplayMigrations([bi, cron], insights, cron), /duplicate legacy cron dependency/);
});

test("repository replay retains every canonical SQL file exactly once", async () => {
  const { readdirSync } = await import("node:fs");
  const { execFileSync } = await import("node:child_process");
  const { createHash } = await import("node:crypto");
  const { fileURLToPath } = await import("node:url");
  const { resolve, dirname } = await import("node:path");
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const names = readdirSync(
    resolve(repo, "apps/web/supabase/migrations"),
  ).filter((n) => n.endsWith(".sql"));
  const rows = names.map((name) => ({
    name,
    sha256: createHash("sha256")
      .update(
        execFileSync(
          "git",
          ["show", "HEAD:apps/web/supabase/migrations/" + name],
          { cwd: repo },
        ),
      )
      .digest("hex"),
  }));
  const ordered = orderReplayMigrations(rows);
  assert.deepEqual(ordered.map((x) => x.name).sort(), names.sort());
  assert.ok(
    ordered.findIndex((x) => x.name === tables.name) <
      ordered.findIndex((x) => x.name === images.name),
  );
  const rootBytes = execFileSync("git", ["show", "HEAD:supabase/migrations/20260601_media_insights.sql"], { cwd: repo });
  const pinnedRoot = { ...insights, sha256: createHash("sha256").update(rootBytes).digest("hex") };
  const legacyOrder = orderLegacyMediaReplayMigrations(rows, pinnedRoot);
  assert.equal(legacyOrder.length, rows.length + 1);
  assert.equal(legacyOrder.filter((entry) => entry === pinnedRoot).length, 1);
  const cronBytes = execFileSync("git", ["show", "HEAD:supabase/migrations/20260528_pg_cron_setup.sql"], { cwd: repo });
  const pinnedCron = { ...cron, sha256: createHash("sha256").update(cronBytes).digest("hex") };
  const cronOrder = orderLegacyMediaReplayMigrations(rows, pinnedRoot, pinnedCron);
  assert.equal(cronOrder.length, rows.length + 2);
  assert.equal(cronOrder.filter((entry) => entry === pinnedCron).length, 1);
});
