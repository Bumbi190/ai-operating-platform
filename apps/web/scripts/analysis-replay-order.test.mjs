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

const core = {
  name: "20260829_workflow_instance_core.sql",
  sha256: "4354b9e168a974d726d7c5867494fdf49713a48d4535359d76cdfbac096c398a",
};
const attested = {
  name: "20260829_workflow_attested_evidence.sql",
  sha256: "325eecc30e7f69430201d4384259b8404165301b3bc461be5f1fa0529b12e5e6",
};
const gate = {
  name: "20260829_workflow_gate_authorization.sql",
  sha256: "387c4e8e87f147f2f4435136c1f2300c96131c3e9056a7489f0400354fd40024",
};
test("create workflow tables before attested evidence and gate authorization", () => {
  const before = { name: "20260828_before.sql", sha256: "a" },
    escalation = { name: "20260829_workflow_escalation_index.sql", sha256: "b" },
    hardening = {
      name: "20260829_workflow_instance_core_hardening.sql",
      sha256: "c",
    },
    after = { name: "20260830_after.sql", sha256: "d" };
  const input = [after, hardening, core, gate, escalation, attested, before];
  assert.deepEqual(orderReplayMigrations(input), [
    before,
    core,
    attested,
    escalation,
    gate,
    hardening,
    after,
  ]);
  assert.equal(input[0], after);
});
test("modified workflow prerequisite or dependent bytes fail closed", () => {
  assert.throws(
    () => orderReplayMigrations([attested, gate, { ...core, sha256: "x" }]),
    /unreviewed replay dependency: 20260829_workflow_instance_core\.sql/,
  );
  assert.throws(
    () => orderReplayMigrations([{ ...attested, sha256: "x" }, gate, core]),
    /unreviewed replay dependency: 20260829_workflow_attested_evidence\.sql/,
  );
  assert.throws(
    () => orderReplayMigrations([attested, { ...gate, sha256: "x" }, core]),
    /unreviewed replay dependency: 20260829_workflow_gate_authorization\.sql/,
  );
});
test("missing workflow_instance_core is refused rather than skipped", () => {
  assert.throws(
    () => orderReplayMigrations([attested]),
    /missing replay dependency: workflow_instance_core/,
  );
  assert.throws(
    () => orderReplayMigrations([gate]),
    /missing replay dependency: workflow_instance_core/,
  );
});

const binding = {
  name: "20260830_workflow_action_binding.sql",
  sha256: "aae8807b3f1f5c289a9c5e09fb1ffaf436bbb36e676bc46e3070de102ab3fb25",
};
const failure = {
  name: "20260830_action_failure_model.sql",
  sha256: "be1e90f6e47fb39328a21853a26c87e9f6b1bcd42338edf5847f8c376ff3b183",
};
const readonly = {
  name: "20260830_readonly_action_authorization.sql",
  sha256: "85fb5f972e6631322ef24b813112c753e71595fe6b339b9925380e242bf594a3",
};
const stop = {
  name: "20260830_execution_stop_safety.sql",
  sha256: "df3e7141383f3534c93a927737b4cbab901cb89a9c5680f201801b87ced0f279",
};
test("add runs binding columns before action failure model and readonly authorization", () => {
  const before = { name: "20260829_before.sql", sha256: "a" },
    spend = { name: "20260830_spend_budget_gate.sql", sha256: "b" },
    after = { name: "20260831_after.sql", sha256: "c" };
  const input = [after, binding, spend, readonly, stop, failure, before];
  assert.deepEqual(orderReplayMigrations(input), [
    before,
    stop,
    binding,
    failure,
    readonly,
    spend,
    after,
  ]);
  assert.equal(input[0], after);
});
test("modified action binding prerequisite or dependent bytes fail closed", () => {
  for (const changed of [binding, failure, readonly, stop]) {
    const rows = [binding, failure, readonly, stop].map((row) =>
      row === changed ? { ...row, sha256: "x" } : row,
    );
    assert.throws(
      () => orderReplayMigrations(rows),
      new RegExp("unreviewed replay dependency: " + changed.name.replace(/\./g, "\\.")),
    );
  }
});
test("missing workflow_action_binding or execution_stop_safety is refused", () => {
  assert.throws(
    () => orderReplayMigrations([failure, stop]),
    /missing replay dependency: workflow_action_binding/,
  );
  assert.throws(
    () => orderReplayMigrations([readonly, stop]),
    /missing replay dependency: workflow_action_binding/,
  );
  assert.throws(
    () => orderReplayMigrations([binding, failure, readonly]),
    /missing replay dependency: execution_stop_safety/,
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
  const at = (n) => ordered.findIndex((x) => x.name === n);
  assert.ok(at(core.name) < at(attested.name));
  assert.ok(at(core.name) < at(gate.name));
  assert.ok(
    at(core.name) < at("20260829_workflow_instance_core_hardening.sql"),
  );
  assert.ok(at(stop.name) < at(binding.name));
  assert.ok(at(binding.name) < at(failure.name));
  assert.ok(at(binding.name) < at(readonly.name));
  const moved = new Set([tables.name, core.name, stop.name, binding.name]);
  const rest = ordered.map((x) => x.name).filter((n) => !moved.has(n));
  assert.deepEqual(rest, [...rest].sort());
});
