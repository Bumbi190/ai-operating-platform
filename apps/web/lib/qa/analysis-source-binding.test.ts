import { it, expect } from "vitest";
import {
  normalizeAnalysisSource,
  hashAnalysisSource,
  encodeAnalysisSource,
  canonicalTimestamp,
} from "@/lib/atlas/project-analytics/analysis-source-binding";
import { fixture, rows, runs } from "./fixtures/analysis-test-source";
it("full_raw_identity_not_only_values", () => {
  const s = fixture().source!;
  for (const change of [
    { id: "00000000-0000-4000-8000-000000000003" },
    { captured_at: "2026-10-12T10:01:00.654322Z" },
  ])
    expect(hashAnalysisSource(fixture(change).source!)).not.toBe(
      hashAnalysisSource(s),
    );
  expect(
    hashAnalysisSource(
      normalizeAnalysisSource(rows(), runs({ storage_outcome: "refreshed" }))!,
    ),
  ).not.toBe(hashAnalysisSource(s));
});
it("microseconds_offsets_and_key_order", () => {
  expect(canonicalTimestamp("2026-10-12T12:00:00.123456+02:00")).toBe(
    "2026-10-12T10:00:00.123456Z",
  );
  const raw = rows()[0];
  expect(
    hashAnalysisSource(
      normalizeAnalysisSource(
        [Object.fromEntries(Object.entries(raw).reverse())],
        runs(),
      )!,
    ),
  ).toBe(hashAnalysisSource(fixture().source!));
  expect(encodeAnalysisSource(fixture().source!)).toContain(
    Buffer.from("2026-10-12T10:00:00.123456Z").toString("hex"),
  );
});
it("unsafe_bigint_and_unrepresented_raw_fields_refused", () => {
  for (const change of [
    { bids_total: "9007199254740992" },
    { unavailable: { invented: "query_failed" } },
    { extra: "hidden" },
  ])
    expect(fixture(change).source).toBeNull();
  expect(
    fixture({ bids_total: "9007199254740991" }).source?.snapshots[0].bids_total,
  ).toBe("9007199254740991");
});
it("null_and_empty_audit_do_not_coerce", () => {
  expect(normalizeAnalysisSource(rows(), undefined)?.auditReadable).toBe(false);
  expect(normalizeAnalysisSource(rows(), [])?.runs).toEqual([]);
  expect(
    hashAnalysisSource(normalizeAnalysisSource(rows(), undefined)!),
  ).not.toBe(hashAnalysisSource(normalizeAnalysisSource(rows(), [])!));
});
import parity from "./fixtures/analysis-source-parity.json";
it.each(parity)("pinned_parity_$name", (f) => {
  expect(encodeAnalysisSource(f.source as any)).toBe(f.encoding);
  expect(hashAnalysisSource(f.source as any)).toBe(f.hash);
});

import { vi } from "vitest";
it("v1_encoding_is_independent_of_future_report_module_definitions", async () => {
  const saved = fixture().source!,
    expected = encodeAnalysisSource(saved);
  vi.resetModules();
  vi.doMock(
    "@/lib/atlas/project-analytics/handlarborsen-marketplace-report",
    async () => {
      const actual = await vi.importActual<any>(
        "@/lib/atlas/project-analytics/handlarborsen-marketplace-report",
      );
      return {
        ...actual,
        MARKETPLACE_METRIC_DEFINITIONS:
          actual.MARKETPLACE_METRIC_DEFINITIONS.map((d: any) => ({
            ...d,
            label: "Framtida etikett",
          })),
      };
    },
  );
  try {
    const future =
      await import("@/lib/atlas/project-analytics/analysis-source-binding");
    expect(future.validateAnalysisSource(saved)).toEqual(saved);
    expect(future.encodeAnalysisSource(saved)).toBe(expected);
  } finally {
    vi.doUnmock(
      "@/lib/atlas/project-analytics/handlarborsen-marketplace-report",
    );
    vi.resetModules();
  }
});
