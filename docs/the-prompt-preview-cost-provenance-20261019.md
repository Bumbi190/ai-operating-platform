# The Prompt — exact preview cost provenance, 19 October 2026

Scoped continuation after the owner-approved channel plan and saved planning draft. Product base b6cd09b45e1123bfa8edca2293db35b9c420f503; code fix 7bcfab90e81a9376d1abc7e7cb49ea10528ba335. No new generation, provider call, production write or schema change.

## Observed defect

Read-only production inspection confirmed that the three existing Ideogram assets and Victoria audio have NULL asset_provenance.cost_event_id. Each exact provider flight already has a dispatched, metered, settled reservation and an actual cost event. The runtime omitted costEventId when admitting assets. The existing news-review verifier correctly refuses missing cost provenance. Neither amounts nor costs are fabricated or repaired retrospectively.

## Change

Before each NEW asset admission, the runtime resolves the canonical stable identity used by the governed generator: project/provider/operation plus PREVIEW_ID#imageIndex for images or PREVIEW_ID for voice. It reads the exact reservation and requires dispatched, settled, metered, non-exceeded state. It then requires exactly one same-project/provider/reservation cost event with expected model, operation, metering unit/count and Victoria model metadata, and passes its ID to canonical admission.

No latest-row/time/amount heuristic, cost insertion, global budget change or producer allowlist widening. Missing/error/duplicate/mismatched/ambiguous evidence reaches the existing terminal review_required state; the durable claim prevents a second generation. Existing ready private galleries remain readable even if the ledger read is unavailable. Existing asset provenance and the approved reference movie are not rewritten or re-admitted.

## Fresh evidence

- Test-first: runtime initially produced four undefined cost links. Then 25 subtests plus the enclosing test failed 26/26 on the original implementation: missing links or incorrectly ready despite invalid evidence.
- Corrected actual runtime/core/store test: 26/26 PASS. External DB/provider boundaries are substituted; real PostgreSQL settlement and vendor billing are not rerun by this test.
- Full Remotion Node/tsx suite: 168/168 PASS, no skips. Latest complete rerun after adding old-gallery/ledger-outage coverage also 168/168 PASS.
- Both editorial and news isolation contracts: PASS.
- Affected complete web suites: 46/46 PASS, no skips (budget-retry lifecycle, social credentials, news-review verifier).
- Full web TypeScript: PASS, exit 0. git diff --check: PASS.
- Same installed Vitest 2.1.9 and TypeScript 5.9.3; no new dependency install. Two task-owned temporary dependency junctions only.

No new full broad-web or full Remotion compiler run. The earlier diagnostic run 335 web failures and 22 shared Remotion compiler diagnostics remain unresolved limits; this scoped fix is not whole-PR release approval.

## Remaining movie work

The 19 October generic social content draft is not a canonical media_scripts row. Exact-URL production lookup found no current media_news_items row for https://www.anthropic.com/news/public-benefit-fund. The old private preview remains pinned to the expired 16 October source and is not promoted or repurposed.

A new owner-controlled episode still needs canonical source/manuscript preparation, a separate durable generation identity and concrete budget authorization, asset-specific usage evidence, Victoria receipt/word timings, actual local render/full decode/QA, then trusted intake and revision-bound review. This cost-link fix alone does not create that producer or a new film. The fresh candidate expires 20 October 2026 at 18:49 Stockholm; later retrieval does not refresh its original timestamp.

PR #377 remains draft/unmerged. No publication, schedule/trial activation, new paid generation or SQL migration.

## Independent review

Scoped independent read-only review of b6cd09b..7bcfab9 found no Critical, Important or Minor issues in the two-file change. It confirmed exact adapter key/operation matching, atomic immutable canonical settlements, provenance forwarding, duplicate rejection, terminal no-replay behavior and unchanged ready-gallery access. The reviewer inspected but did not rerun tests, providers or SQL. Whole-PR release readiness, source/rights, historical repair and exhaustive failure combinations were outside that review.

Root's separate read-only production privilege check returned service_role SELECT=true on both public.spend_reservations and public.cost_events. This verifies existing table grants only; no privileges or schema were modified. Tests substitute external boundaries and do not prove live provider billing, new persisted admissions, all network failure combinations or database availability.


## Reproducible evidence hashes

Raw task-owned logs remain in .superpowers/sdd/2026-10-19-preview-cost-provenance (not product source).

| File | SHA256 |
| --- | --- |
| red.log | 9a51486b3525f53f8550f5ca847020176e379e8a12c9f278e499643ff7a0da7f |
| red-all.log | f759cb45ba5531a34943d5b03ae06e876160682200efe070a3fef4ca0b7c3ea5 |
| green.log | e90d88f2fa7c8c5c362077b41984e38eab529efe4b7d6e455e86b45cdfa8da78 |
| remotion-final.log | af7dfa511e580a6af555260193621bd3614ca6eba66ed86db1d59005165c9079 |
| web.json | 0f169451cf6daefe3c961bd740e62c29b227dde543750adb970606b95ff16438 |
| typecheck.log | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 |
| result.json | 12a41aa1b667f085bcf8f59affd90d2c8e5fb52365e7d5f4047f0cd3bec6e438 |
