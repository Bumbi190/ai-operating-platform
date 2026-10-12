import { describe, it, expect } from "vitest";
import {
  buildAnalysisReviewDraft,
  validateAnalysisReviewDraft,
} from "@/lib/atlas/project-analytics/analysis-review-contract";
import { hashAnalysisSource } from "@/lib/atlas/project-analytics/analysis-source-binding";
import { fixture, NOW, runs } from "./fixtures/analysis-test-source";
function build(
  f = fixture(),
  now = NOW,
  ruleId: "company-status" | "bid-window" = "company-status",
  version = "handlarborsen-insights-1.0.0",
) {
  if (!f.source) return { status: "conflict" as const };
  return buildAnalysisReviewDraft(
    f.source,
    f.report,
    {
      ruleId,
      ruleVersion: version,
      expectedEvidenceHash: hashAnalysisSource(f.source),
    },
    now,
  );
}
describe("immutable manual analysis", () => {
  it("company_10_6_and_bids_2_0_are_proposals", () => {
    for (const r of ["company-status", "bid-window"] as const) {
      const b = build(fixture(), NOW, r);
      expect(b.status).toBe("ok");
      if (b.status !== "ok") throw Error();
      expect(b.draft.insight.kind).toBe("proposal");
      expect(b.draft.manualSteps).toEqual([
        "Granska den citerade rapporten",
        b.draft.insight.nextCheck,
        "Dokumentera resultatet utanför detta analysutkast",
      ]);
      expect(b.draft.insight.evidence.map((e) => e.value)).toEqual(
        r === "company-status" ? [10, 6] : [2, 0],
      );
      expect(
        b.draft.insight.evidence.every((e) => e.collectorVersion === null),
      ).toBe(true);
      expect(validateAnalysisReviewDraft(b.draft)).toEqual(b.draft);
    }
  });
  it("null_is_not_zero", () =>
    expect(
      build(
        fixture({
          companies_verified_total: null,
          completeness: "partial",
          unavailable: { companies_verified_total: "query_failed" },
        }),
      ).status,
    ).toBe("conflict"));
  it("partial_required_vs_unrelated_missing", () =>
    expect(
      build(
        fixture({
          vehicles_reserved: null,
          completeness: "partial",
          unavailable: { vehicles_reserved: "query_failed" },
        }),
      ).status,
    ).toBe("ok"));
  it("fresh_26h_inclusive", () => {
    expect(build(fixture(), new Date("2026-10-13T12:00:00.123Z")).status).toBe(
      "ok",
    );
    expect(build(fixture(), new Date("2026-10-13T12:00:00.124Z")).status).toBe(
      "conflict",
    );
  });
  it("future_unzoned_date_mismatch_refused", () => {
    for (const changes of [
      { observed_at: "2026-10-12T12:00:00Z" },
      { observed_at: "2026-10-12T10:00:00" },
      { snapshot_date: "2026-10-11" },
    ])
      expect(build(fixture(changes)).status).toBe("conflict");
  });
  it("unknown_failed_audit_refused", () => {
    for (const a of [
      undefined,
      [],
      runs({ status: "error" }),
      runs({ status: "mystery" }),
    ])
      expect(build(fixture({}, a)).status).toBe("conflict");
  });
  it("fact_quality_withdrawn_version_refused", () => {
    expect(build(fixture({ companies_verified_total: 10 })).status).toBe(
      "conflict",
    );
    expect(build(fixture(), NOW, "company-status", "future").status).toBe(
      "conflict",
    );
  });
  it("closed_schema_rejects_executable_fields", () => {
    const b = build();
    if (b.status !== "ok") throw Error();
    for (const v of [
      { ...b.draft, agentId: "x" },
      { ...b.draft, insight: { ...b.draft.insight, action: { run: true } } },
      { ...b.draft, manualSteps: [{ run: true }] },
    ])
      expect(validateAnalysisReviewDraft(v)).toBeNull();
  });
  it("key_order_and_clock_stable", () => {
    const a = build(),
      b = build(
        fixture({}, runs(), new Date("2026-10-13T00:10:00Z")),
        new Date("2026-10-13T00:10:00Z"),
      );
    if (a.status !== "ok" || b.status !== "ok") throw Error();
    expect(a.draft.contentHash).toBe(b.draft.contentHash);
    expect(a.draft.insight.quality.collection?.today).not.toBe(
      b.draft.insight.quality.collection?.today,
    );
  });
});
it("fresh_until_preserves_database_microseconds", () => {
  const f = fixture(),
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
  expect(b.status === "ok" && b.draft.freshUntil).toBe(
    "2026-10-13T12:00:00.123456Z",
  );
});
it("historical_frozen_text_is_valid_without_current_rederivation", () => {
  const f = fixture(),
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
  const old = {
    ...b.draft,
    insight: { ...b.draft.insight, title: "Historisk svensk rubrik" },
  };
  old.contentHash = sha256(canonicalJson(analysisContentProjection(old)));
  expect(validateAnalysisReviewDraft(old)).toEqual(old);
});
import { analysisContentProjection } from "@/lib/atlas/project-analytics/analysis-review-contract";
import { sha256 } from "@/lib/atlas/project-analytics/analysis-source-binding";
import { canonicalJson } from "@/lib/atlas/mission/binding";
it("latest_audit_unknown_date_cannot_fall_back_to_older_success", () => {
  const audit = [
    ...runs(),
    ...runs({
      id: "00000000-0000-4000-8000-000000000003",
      ran_at: "2026-10-12T10:02:00Z",
      snapshot_date: null,
    }),
  ];
  const f = fixture({}, audit);
  const b = buildAnalysisReviewDraft(
    f.source!,
    f.report,
    {
      ruleId: "company-status",
      ruleVersion: "handlarborsen-insights-1.0.0",
      expectedEvidenceHash: hashAnalysisSource(f.source!),
    },
    NOW,
  );
  expect(b.status).toBe("conflict");
});
it("submillisecond_future_observation_is_refused", () => {
  const f = fixture(),
    b = buildAnalysisReviewDraft(
      f.source!,
      f.report,
      {
        ruleId: "company-status",
        ruleVersion: "handlarborsen-insights-1.0.0",
        expectedEvidenceHash: hashAnalysisSource(f.source!),
      },
      new Date("2026-10-12T10:00:00.123Z"),
    );
  expect(b.status).toBe("conflict");
});

import { deriveHandlarborsenInsights } from "@/lib/atlas/project-analytics/handlarborsen-insights";
import { MARKETPLACE_METRIC_DEFINITIONS } from "@/lib/atlas/project-analytics/handlarborsen-marketplace-report";
it.each(["2026-10-12T10:00:00.123456+00:00", "2026-10-12T10:00:00.12+00:00"])(
  "preserves_original_p0_identity_and_full_evidence_%s",
  (observed_at) => {
    const f = fixture(
      { observed_at, captured_at: "2026-10-12T10:01:00+00:00" },
      runs({ ran_at: "2026-10-12T10:01:00.1+00:00" }),
    );
    const original = deriveHandlarborsenInsights(f.report, NOW).insights.find(
      (i) => i.rule === "company-status",
    );
    const b = build(f);
    expect(b.status).toBe("ok");
    if (b.status !== "ok") throw Error();
    expect(b.draft.originalInsightId).toBe(original!.id);
    expect(b.draft.insight).toEqual(original);
  },
);
it("frozen_v1_survives_current_report_definition_edits", () => {
  const b = build();
  if (b.status !== "ok") throw Error();
  const definition = MARKETPLACE_METRIC_DEFINITIONS[0],
    old = definition.label;
  try {
    definition.label = "Framtida rapportetikett";
    expect(validateAnalysisReviewDraft(b.draft)).toEqual(b.draft);
  } finally {
    definition.label = old;
  }
});
it("refuses_report_not_bound_to_source", () => {
  const f = fixture();
  f.report.latest!.metrics[0].value = 99;
  expect(build(f).status).toBe("conflict");
});
