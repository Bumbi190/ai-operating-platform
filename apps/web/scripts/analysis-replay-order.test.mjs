import { test } from "node:test";
import assert from "node:assert/strict";
import { orderReplayMigrations, orderLegacyMediaReplayMigrations, orderCrossTreeReplayMigrations } from "./analysis-replay-order.mjs";
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
const dream = {
  name: "20260609_dream_issues_ledger.sql",
  sha256: "efc2b09e75c60fb8d14bcafdf4bcf2712e7d28e2107336634487d18fb9510089",
};
const workflowCore = { name: "20260829_workflow_instance_core.sql", sha256: "4354b9e168a974d726d7c5867494fdf49713a48d4535359d76cdfbac096c398a" };
const attested = { name: "20260829_workflow_attested_evidence.sql", sha256: "325eecc30e7f69430201d4384259b8404165301b3bc461be5f1fa0529b12e5e6" };
const actionBinding = { name: "20260830_workflow_action_binding.sql", sha256: "aae8807b3f1f5c289a9c5e09fb1ffaf436bbb36e676bc46e3070de102ab3fb25" };
const actionFailure = { name: "20260830_action_failure_model.sql", sha256: "be1e90f6e47fb39328a21853a26c87e9f6b1bcd42338edf5847f8c376ff3b183" };
const crossTree = [
  { name: "20260528_pass_a_safeguards.sql", sha256: "4665ac611487c0d833914c2b2e40de11b2e0433e9ed89d172b9b0e463e4c0c04" },
  { name: "20260602_atlas_growth_account_snapshots.sql", sha256: "f035e5ff0e1b03d85a61463da8f1f0398445545544abf748d07beeee55617bb9" },
  { name: "20260602_stripe_intelligence_revenue_snapshots.sql", sha256: "941d578548f895e5087c201502bcc34c8cf9e8b90f422d7b35dbcffc764e833e" },
  { name: "20260603_cron_heartbeat.sql", sha256: "f3c28dcd9bd031098bed10f86817f7e4bb55d5b03193199e102ffeae9bcbd831" },
  { name: "20260603_durable_runs.sql", sha256: "a189659945447189022e96bb8a26a5cb4e0e26fb321c9f56a02d0b6e44da7ee4" },
  { name: "20260609_manager_task_dream_link.sql", sha256: "c1fb7723f386343e61f9f81297f6e0eb2622dde1d703d348298e7c57b22a767a" },
  { name: "20260602_g1_multitenant_platform_tokens.sql", sha256: "88a3f8e1f95cf3334dbedc11edb924a316d630ea52f7d47458665766db712d98" },
];
const crossTreeConsumers = [
  "20260602_atlas_bi_foundation.sql",
  "20260617160200_backfill_dream_issues.sql",
  "20260623_150300_atlas_collector_cron.sql",
  "20260820_manager_tasks_work_packages.sql",
  "20260830_workflow_action_binding.sql",
  "20260914120300_platform_tokens_project_binding.sql",
  "20260831_budget_scopes.sql",
  "20260914120400_social_account_bindings_the_prompt_evidence.sql",
  "20261002190000_survival_input_epoch.sql",
].map((name) => ({ name, sha256: name }));
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
test("workflow core is created before same-day attestation alterations", () => {
  assert.deepEqual(orderReplayMigrations([attested, workflowCore]), [workflowCore, attested]);
  assert.throws(() => orderReplayMigrations([attested]), /missing replay dependency: workflow_instance_core/);
  assert.throws(() => orderReplayMigrations([attested, { ...workflowCore, sha256: "changed" }]), /unreviewed replay dependency/);
});
test("run binding columns precede same-day failure indexes", () => {
  assert.deepEqual(orderReplayMigrations([actionFailure, actionBinding]), [actionBinding, actionFailure]);
  assert.throws(() => orderReplayMigrations([actionFailure]), /missing replay dependency: workflow_action_binding/);
  assert.throws(() => orderReplayMigrations([actionFailure, { ...actionBinding, sha256: "changed" }]), /unreviewed replay dependency/);
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
test("dream ledger fixture requires reviewed bytes and precedes its backfill", () => {
  const bi = { name: "20260602_atlas_bi_foundation.sql", sha256: "bi" };
  const backfill = { name: "20260617160200_backfill_dream_issues.sql", sha256: "backfill" };
  const rows = [backfill, bi, images, tables];
  const ordered = orderLegacyMediaReplayMigrations(rows, insights, cron, dream);
  assert.deepEqual(ordered, [tables, images, cron, insights, bi, dream, backfill]);
  assert.throws(() => orderLegacyMediaReplayMigrations(rows, insights, cron, { ...dream, sha256: "changed" }), /unreviewed legacy dream dependency/);
  assert.throws(() => orderLegacyMediaReplayMigrations(rows, insights, undefined, dream), /requires cron fixture/);
  assert.throws(() => orderLegacyMediaReplayMigrations(rows, insights, cron, { ...dream, name: "other.sql" }), /unreviewed legacy dream dependency/);
  assert.throws(() => orderLegacyMediaReplayMigrations([bi, dream, backfill], insights, cron, dream), /duplicate legacy dream dependency/);
  assert.throws(() => orderLegacyMediaReplayMigrations([bi], insights, cron, dream), /missing replay dependency: dream backfill/);
});
test("closed cross-tree manifest retains consumers and rejects changed or missing roots", () => {
  const rows = [images, tables, ...crossTreeConsumers];
  const ordered = orderCrossTreeReplayMigrations(rows, insights, cron, dream, crossTree);
  assert.equal(ordered.length, rows.length + 10);
  assert.deepEqual(ordered.map((entry) => entry.name).sort(), [...rows, insights, cron, dream, ...crossTree].map((entry) => entry.name).sort());
  for (const [name, consumer] of [
    [crossTree[0].name, "20260831_budget_scopes.sql"],
    [crossTree[1].name, "20260914120400_social_account_bindings_the_prompt_evidence.sql"],
    [crossTree[2].name, "20261002190000_survival_input_epoch.sql"],
    [crossTree[3].name, "20260623_150300_atlas_collector_cron.sql"],
    [crossTree[4].name, "20260830_workflow_action_binding.sql"],
    [crossTree[5].name, "20260820_manager_tasks_work_packages.sql"],
    [crossTree[6].name, "20260914120300_platform_tokens_project_binding.sql"],
  ]) assert.ok(ordered.findIndex((entry) => entry.name === name) < ordered.findIndex((entry) => entry.name === consumer));
  assert.throws(() => orderCrossTreeReplayMigrations(rows, insights, cron, dream, crossTree.slice(1)), /incomplete cross-tree replay manifest/);
  assert.throws(() => orderCrossTreeReplayMigrations(rows, insights, cron, dream, crossTree.map((entry, index) => index === 3 ? { ...entry, sha256: "changed" } : entry)), /unreviewed cross-tree replay dependency/);
  assert.throws(() => orderCrossTreeReplayMigrations([...rows, crossTree[0]], insights, cron, dream, crossTree), /duplicate cross-tree replay dependency/);
  assert.throws(() => orderCrossTreeReplayMigrations(rows.filter((entry) => entry.name !== "20260831_budget_scopes.sql"), insights, cron, dream, crossTree), /missing cross-tree replay consumer/);
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
  assert.ok(ordered.findIndex((x) => x.name === workflowCore.name) < ordered.findIndex((x) => x.name === attested.name));
  assert.ok(ordered.findIndex((x) => x.name === actionBinding.name) < ordered.findIndex((x) => x.name === actionFailure.name));
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
  const dreamBytes = execFileSync("git", ["show", "HEAD:supabase/migrations/20260609_dream_issues_ledger.sql"], { cwd: repo });
  const pinnedDream = { ...dream, sha256: createHash("sha256").update(dreamBytes).digest("hex") };
  const dreamOrder = orderLegacyMediaReplayMigrations(rows, pinnedRoot, pinnedCron, pinnedDream);
  assert.equal(dreamOrder.length, rows.length + 3);
  assert.equal(dreamOrder.filter((entry) => entry === pinnedDream).length, 1);
  const pinnedCrossTree = crossTree.map((entry) => ({
    ...entry,
    sha256: createHash("sha256").update(execFileSync("git", ["show", "HEAD:supabase/migrations/" + entry.name], { cwd: repo })).digest("hex"),
  }));
  const fullOrder = orderCrossTreeReplayMigrations(rows, pinnedRoot, pinnedCron, pinnedDream, pinnedCrossTree);
  assert.equal(fullOrder.length, rows.length + 10);
});
