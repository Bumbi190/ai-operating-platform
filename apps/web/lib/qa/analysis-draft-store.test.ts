import { it, expect } from "vitest";
import {
  AnalysisDraftStore,
  encodeDraftCursor,
  decodeDraftCursor,
} from "@/lib/atlas/project-analytics/analysis-draft-store";
import { buildAnalysisReviewDraft } from "@/lib/atlas/project-analytics/analysis-review-contract";
import { hashAnalysisSource } from "@/lib/atlas/project-analytics/analysis-source-binding";
import { fixture, NOW } from "./fixtures/analysis-test-source";
function draft(changes = {}) {
  const f = fixture(changes),
    b = buildAnalysisReviewDraft(
      f.source!,
      f.report,
      {
        ruleId: "company-status",
        ruleVersion: "handlarborsen-insights-1.0.0",
        expectedEvidenceHash: hashAnalysisSource(f.source!),
      },
      NOW,
    );
  if (b.status !== "ok") throw Error();
  return b.draft;
}
const id = "00000000-0000-4000-8000-000000000010";
it("same_identity_retry_one_id", async () => {
  let saved: any = null;
  const calls: any[] = [];
  const db = {
    rpc: async (n: string, p: any) => {
      calls.push(n);
      if (saved && saved.contentHash !== p.p_payload.contentHash)
        return { data: { status: "conflict" } };
      const created = !saved;
      saved = p.p_payload;
      return { data: { status: "ok", id, created } };
    },
  };
  const store = new AnalysisDraftStore(db);
  expect(await store.save(id, draft())).toEqual({
    status: "ok",
    id,
    created: true,
  });
  expect(await store.save(id, draft())).toEqual({
    status: "ok",
    id,
    created: false,
  });
  expect(calls).toEqual([
    "atlas_save_analysis_draft",
    "atlas_save_analysis_draft",
  ]);
});
it("same_key_different_content_conflict", async () => {
  let calls = 0;
  const s = new AnalysisDraftStore({
    rpc: async () => {
      calls++;
      return { data: { status: "conflict" } };
    },
  });
  expect(await s.save(id, { ...draft(), manualSteps: ["forged"] })).toEqual({
    status: "conflict",
  });
  expect(calls).toBe(0);
});
it.each(["not_found", "conflict", "unavailable"])(
  "maps_%s_without_sql_error",
  async (status) => {
    const s = new AnalysisDraftStore({
      rpc: async () => ({
        data: { status },
        error: status === "unavailable" ? { message: "secret" } : null,
      }),
    });
    expect(await s.save(id, draft())).toEqual({ status });
  },
);
it("cursor_ties_no_duplicates", () => {
  const c = { createdAt: "2026-10-12T10:00:00.123456Z", id };
  expect(decodeDraftCursor(encodeDraftCursor(c))).toEqual(c);
  for (const x of [
    "bad",
    Buffer.from(
      JSON.stringify({ ...c, id: "x),project_id.eq.other" }),
    ).toString("base64url"),
  ])
    expect(decodeDraftCursor(x)).toBeNull();
});
it("foreign_detail_filter", async () => {
  const calls: any[] = [];
  const c: any = {
    select: () => c,
    eq: (...x: any[]) => {
      calls.push(x);
      return c;
    },
    maybeSingle: async () => ({ data: null }),
  };
  expect(
    await new AnalysisDraftStore({ from: () => c }).get("project", id),
  ).toBeNull();
  expect(calls).toEqual([
    ["project_id", "project"],
    ["id", id],
  ]);
});
it("storage_error_is_unavailable", async () =>
  expect(
    await new AnalysisDraftStore({
      rpc: async () => {
        throw Error("secret");
      },
    }).save(id, draft()),
  ).toEqual({ status: "unavailable" }));
// Sequential fake lifecycle evidence only; real races are tested in isolated PostgreSQL.
function lifecycle() {
  const records = new Map<string, any>(),
    events: any[] = [];
  let currentHash = draft().evidenceHash,
    fail = false;
  const store = new AnalysisDraftStore({
    rpc: async (_n: string, { p_payload: d }: any) => {
      if (d.evidenceHash !== currentHash)
        return { data: { status: "conflict" } };
      const key = [
        d.projectId,
        d.workflowKey,
        d.ruleId,
        d.ruleVersion,
        d.evidenceHash,
      ].join("/");
      if (records.has(key)) {
        const old = records.get(key);
        return {
          data:
            old.contentHash === d.contentHash
              ? { status: "ok", id: old.id, created: false }
              : { status: "conflict" },
        };
      }
      if (fail) return { error: { message: "injected rollback" } };
      const previous = [...records.values()].at(-1),
        newId =
          "00000000-0000-4000-8000-" +
          String(records.size + 1).padStart(12, "0");
      records.set(key, { ...d, id: newId });
      events.push({ kind: "created", draftId: newId });
      if (previous)
        events.push({
          kind: "superseded",
          draftId: previous.id,
          supersededBy: newId,
        });
      return { data: { status: "ok", id: newId, created: true } };
    },
  });
  return {
    store,
    records,
    events,
    source: (h: string) => (currentHash = h),
    rollback: () => (fail = true),
  };
}
it("new_evidence_supersedes_once", async () => {
  const f = lifecycle();
  await f.store.save(id, draft());
  const d = draft({ captured_at: "2026-10-12T10:02:00Z" });
  f.source(d.evidenceHash);
  await f.store.save(id, d);
  await f.store.save(id, d);
  expect(f.records.size).toBe(2);
  expect(f.events.map((e) => e.kind)).toEqual([
    "created",
    "created",
    "superseded",
  ]);
});
it("old_selector_never_resurrects", async () => {
  const f = lifecycle();
  const old = draft();
  await f.store.save(id, old);
  const d = draft({ captured_at: "2026-10-12T10:02:00Z" });
  f.source(d.evidenceHash);
  await f.store.save(id, d);
  expect(await f.store.save(id, old)).toEqual({ status: "conflict" });
  expect(f.events.length).toBe(3);
});
it("rollback_preserves_old_current", async () => {
  const f = lifecycle();
  await f.store.save(id, draft());
  const d = draft({ captured_at: "2026-10-12T10:02:00Z" });
  f.source(d.evidenceHash);
  f.rollback();
  expect(await f.store.save(id, d)).toEqual({ status: "unavailable" });
  expect(f.records.size).toBe(1);
  expect(f.events).toHaveLength(1);
});

it("production_adapter_paginates_21_tied_persisted_rows_without_duplicates", async () => {
  const d = draft(),
    time = "2026-10-12T10:00:00.123456+00:00",
    project = d.projectId;
  const records = Array.from({ length: 21 }, (_, i) => ({
    id: "00000000-0000-4000-8000-" + String(21 - i).padStart(12, "0"),
    project_id: project,
    schema_version: d.schemaVersion,
    workflow_key: d.workflowKey,
    rule_id: d.ruleId,
    rule_version: d.ruleVersion,
    original_insight_id: d.originalInsightId,
    evidence_hash: d.evidenceHash,
    content_hash: d.contentHash,
    source_envelope: d.sourceEnvelope,
    insight: d.insight,
    manual_steps: d.manualSteps,
    evaluated_at: d.evaluatedAt,
    fresh_until: d.freshUntil,
    created_by: id,
    created_at: time,
  }));
  const calls: any[] = [];
  let request = 0;
  const db = {
    from: (table: string) => {
      const ops: any[] = [];
      calls.push({ table, ops });
      const q: any = {
        select: (...a: any[]) => {
          ops.push(["select", ...a]);
          return q;
        },
        eq: (...a: any[]) => {
          ops.push(["eq", ...a]);
          return q;
        },
        or: (...a: any[]) => {
          ops.push(["or", ...a]);
          return q;
        },
        order: (...a: any[]) => {
          ops.push(["order", ...a]);
          return q;
        },
        limit: async (n: number) => {
          ops.push(["limit", n]);
          return { data: request++ === 0 ? records : records.slice(20) };
        },
      };
      return q;
    },
  };
  const store = new AnalysisDraftStore(db),
    first = await store.list(project, null);
  expect(first.items.map((r) => r.id)).toEqual(
    records.slice(0, 20).map((r) => r.id),
  );
  const cursor = decodeDraftCursor(first.nextCursor!)!;
  expect(cursor).toEqual({
    createdAt: "2026-10-12T10:00:00.123456Z",
    id: records[19].id,
  });
  const second = await store.list(project, cursor);
  expect(second.items.map((r) => r.id)).toEqual([records[20].id]);
  expect(second.nextCursor).toBeNull();
  expect(new Set([...first.items, ...second.items].map((r) => r.id)).size).toBe(
    21,
  );
  for (const call of calls) {
    expect(call.table).toBe("atlas_analysis_drafts");
    expect(call.ops).toContainEqual(["eq", "project_id", project]);
    expect(call.ops).toContainEqual([
      "order",
      "created_at",
      { ascending: false },
    ]);
    expect(call.ops).toContainEqual(["order", "id", { ascending: false }]);
    expect(call.ops).toContainEqual(["limit", 21]);
  }
  expect(calls[0].ops.some((x: any) => x[0] === "or")).toBe(false);
  expect(calls[1].ops).toContainEqual([
    "or",
    "created_at.lt.2026-10-12T10:00:00.123456Z,and(created_at.eq.2026-10-12T10:00:00.123456Z,id.lt." +
      records[19].id +
      ")",
  ]);
});
