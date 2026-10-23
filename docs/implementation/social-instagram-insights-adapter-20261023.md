# Social publication Instagram Insights – staged adapter

## Status
Implemented only on the isolated local branch codex/instagram-growth-integration-20261023. NOT merged, NOT deployed, feature flag OFF by default.

The existing Omnira platform stores Instagram metrics in media_insights. The Prompt has per-script media receipts, while Familje-Stunden uses a separate social_publications ledger.

Database read-only verification, October 23 2026:
- Familje-Stunden has two published social_publications with provider media IDs, both matching the verified and active Instagram account binding.
- The Prompt has 293 Instagram media_insights rows; Familje-Stunden has none yet.
- Existing media_insights has nullable script_id and a unique constraint on instagram_media_id, so an adapter can persist social-publication metrics without a new table or schema migration.

## New code
- lib/media/social-publication-insights.ts: bounded, identity-checked reader for confirmed, bound social publication receipts. It uses the existing credential resolver and first-party Instagram Insights fetcher. New rows use INSERT (unique provider-media ID); existing rows use a conditional UPDATE filtered by row ID, project ID, media ID, platform and NULL script ID. No unguarded UPSERT that could cross project ownership during a race.
- app/api/media/cron/insights/route.ts: optional addition to the EXISTING cron route. It runs ONLY when OMNIRA_SOCIAL_PUBLICATION_INSIGHTS_ENABLED=true and enough execution budget remains. Otherwise behavior is unchanged; no extra scheduled job.
- lib/media/insights.ts: missing metric values from Graph are now omitted instead of converted to fictitious zeroes.
- lib/qa/social-publication-insights.test.ts: deterministic unit tests using mock credentials and mock provider data.

## Rollout and safety
1. Maintain the default disabled flag until the change has been reviewed, merged and deployed through normal procedures.
2. Run full app typecheck in a correctly installed dependency workspace. The targeted Instagram integration typecheck and isolated Vitest suites are passing.
3. Confirm the project's token supports per-media Instagram Insights permissions. A verified account identity does not by itself prove Insights scopes.
4. After explicit operator authorization, enable OMNIRA_SOCIAL_PUBLICATION_INSIGHTS_ENABLED=true. The cron fetches at most four confirmed Instagram posts per project per run, ten projects maximum, only if enough time remains.
5. Verify results in media_insights and Atlas Operations before declaring family analytics operational. Never fabricate post views/retention/follows; unknown metrics stay null.
6. Do not add automated social publishing, commenting, DMs, browser scraping or new paid API providers as part of this adapter.

This document is an implementation handoff, not evidence that the flag is enabled or that Meta already returned Insights for Familje-Stunden.

## Update: verified read access and safer persistence (2026-10-23)
- A live READ-ONLY probe verified the existing Familje-Stunden token's account identity against the active binding. A single confirmed publication was tested.
- The Instagram Graph API returned HTTP success for both reach-only Insights and the established full Insights metric set. No posts were published, no database rows were changed, and no credentials were logged.
- The previous read-then-UPSERT strategy was tightened. New metrics rows now use plain INSERT protected by the database unique instagram_media_id constraint. Existing rows use UPDATE with matching project ID, media ID, platform, NULL script_id and row ID at write time, then verify that a row was returned. This closes the concurrent ownership overwrite hazard.
- Existing Insights refresh and Atlas opportunities now execute BEFORE the optional social publication reader. The new adapter only uses spare run budget, and the feature flag is still OFF by default.
- Regression tests include concurrent unique-key races, guarded updates, project/binding mismatches and missing metrics.
- The next gate is app-level review, merging through the normal workflow, deployment with the flag OFF, and explicit owner-approved enablement. Read permission is confirmed but this is NOT evidence that production data ingestion has been enabled.

## Response format compatibility
- Meta Insights results may provide numeric counters through either values[0].value or total_value.value. The existing fetchMediaInsights parser now accepts both, while rejecting missing, nonnumeric or negative values instead of manufacturing zeroes.
- A focused mock-based Vitest regression suite covers both response shapes and an empty Insights result.
- This was added from documented API response types; a live payload-shape trace was not captured, so continue verifying actual persisted counts after operator-approved activation.
- As of this review: 95 project/security regression tests passed before this final parser addition, followed by 27 targeted Insights/parser tests, and the targeted TypeScript check passed.
