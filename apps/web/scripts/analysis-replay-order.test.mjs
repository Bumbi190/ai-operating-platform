import { test } from "node:test";
import assert from "node:assert/strict";
import { orderReplayMigrations } from "./analysis-replay-order.mjs";
const tables = {
  name: "20260520_media_tables.sql",
  sha256: "ec1a18ef576352e99d2b38b54da6d2c8db6cb5b409b38e4ece3921135200e07c",
};
const images = {
  name: "20260520_media_images.sql",
  sha256: "e1d544a46214f72d09588b66725989c5caf9ef4ce6bb8e53c34c34850264ca58",
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
});
