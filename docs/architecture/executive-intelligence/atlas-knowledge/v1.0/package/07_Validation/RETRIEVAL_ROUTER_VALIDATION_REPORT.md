# Retrieval Router Validation Report — ATLAS KNOWLEDGE EDITION v1.0 — LOCAL VALIDATION CANDIDATE 2 CLEAN

The router `Build/query_atlas.py` is a real deterministic local router (no embeddings, no vector DB, no model).
The test runner passes ONLY the query string to the router, then compares the router's actual ranked output
against expected fixtures (`Build/test_fixtures.jsonl`). Expected section IDs are NEVER fed to the router.

- Tests: 56 (requirement ≥ 50)
- Passed: 56 / 56
- Exit code is non-zero if any test fails.

## Categories covered
exact section-ID lookup, chapter lookup, concept/definition, authority, external-action, Stage 1,
project-specific, ambiguous, unknown, and no-safe-result queries.

## Retrieval-quality corrections (Candidate 1 → Candidate 2)
- "What status does GainPilot have?": primary target changed from §18.166 (GainPilot Initial License Strategy)
  to **§2.26 (The Role of Executive Intelligence in GainPilot)** — canonically states GainPilot's project status
  ("currently a hibernated or paused project"), i.e. lifecycle/portfolio status, which the reviewer asked for.
- Broad concept queries no longer route to "Purpose of This Chapter": a −3.5 purpose penalty plus title/lexicon
  boosts steer them to definitional sections (e.g. Decision Ledger, Damage Boundary, Trust Score, Mission Brief).

## Per-test results
Machine-readable: `retrieval-test-results.jsonl`. Summary:

| Test | Type | Actual primary | Conf | Pass |
|---|---|---|---|---|
| AKE2-T-001 | authority | 1.10 | confident | PASS |
| AKE2-T-002 | concept | 18.80 | confident | PASS |
| AKE2-T-003 | chapter_topic | 3.6 | confident | PASS |
| AKE2-T-004 | concept | FM.2 | confident | PASS |
| AKE2-T-005 | concept | FM.2 | confident | PASS |
| AKE2-T-006 | chapter_topic | 17.4 | confident | PASS |
| AKE2-T-007 | project | 2.26 | confident | PASS |
| AKE2-T-008 | project | 2.25 | confident | PASS |
| AKE2-T-009 | concept | FM.3 | confident | PASS |
| AKE2-T-010 | concept | FM.1 | confident | PASS |
| AKE2-T-011 | concept | 2.7 | confident | PASS |
| AKE2-T-012 | chapter_topic | 6.7 | confident | PASS |
| AKE2-T-013 | concept | 16.28 | confident | PASS |
| AKE2-T-014 | concept | 18.10 | confident | PASS |
| AKE2-T-015 | chapter_topic | 11.3 | confident | PASS |
| AKE2-T-016 | chapter_topic | 20.3 | confident | PASS |
| AKE2-T-017 | chapter_topic | 28.5 | confident | PASS |
| AKE2-T-018 | concept | 4.4 | confident | PASS |
| AKE2-T-019 | concept | 5.4 | confident | PASS |
| AKE2-T-020 | chapter_topic | 19.10 | confident | PASS |
| AKE2-T-021 | chapter_topic | 27.11 | confident | PASS |
| AKE2-T-022 | chapter_topic | 18.274 | confident | PASS |
| AKE2-T-023 | chapter_topic | 16.216 | confident | PASS |
| AKE2-T-024 | chapter_topic | 29.336 | confident | PASS |
| AKE2-T-025 | concept | 1.18 | confident | PASS |
| AKE2-T-026 | chapter_topic | 31.328 | confident | PASS |
| AKE2-T-027 | chapter_topic | 9.130 | confident | PASS |
| AKE2-T-028 | chapter_topic | 8.129 | confident | PASS |
| AKE2-T-029 | chapter_topic | 10.132 | confident | PASS |
| AKE2-T-030 | chapter_topic | 12.4 | confident | PASS |
| AKE2-T-031 | chapter_topic | 13.191 | confident | PASS |
| AKE2-T-032 | chapter_topic | 14.143 | confident | PASS |
| AKE2-T-033 | chapter_topic | 15.128 | confident | PASS |
| AKE2-T-034 | chapter_topic | 7.120 | confident | PASS |
| AKE2-T-035 | chapter_topic | 22.242 | confident | PASS |
| AKE2-T-036 | chapter_topic | 23.285 | confident | PASS |
| AKE2-T-037 | chapter_topic | 24.291 | confident | PASS |
| AKE2-T-038 | chapter_topic | 25.387 | confident | PASS |
| AKE2-T-039 | chapter_topic | 26.302 | confident | PASS |
| AKE2-T-040 | chapter_topic | 21.232 | confident | PASS |
| AKE2-T-041 | chapter_topic | 32.212 | confident | PASS |
| AKE2-T-042 | concept | 4.9 | ambiguous | PASS |
| AKE2-T-043 | concept | 4.10 | confident | PASS |
| AKE2-T-044 | chapter_topic | 2.27 | confident | PASS |
| AKE2-T-045 | concept | 1.10 | ambiguous | PASS |
| AKE2-T-046 | concept | 28.5 | confident | PASS |
| AKE2-T-047 | exact_id | 18.80 | confident | PASS |
| AKE2-T-048 | exact_id | FM.2 | confident | PASS |
| AKE2-T-049 | exact_id | 11.60 | confident | PASS |
| AKE2-T-050 | chapter | 17.247 | confident | PASS |
| AKE2-T-051 | chapter | 6.1 | confident | PASS |
| AKE2-T-052 | external_action | 21.13 | ambiguous | PASS |
| AKE2-T-053 | unknown | None | no_confident_match | PASS |
| AKE2-T-054 | no_safe_result | None | no_confident_match | PASS |
| AKE2-T-055 | ambiguous | 1.10 | ambiguous | PASS |
| AKE2-T-056 | concept | FM.1 | confident | PASS |
