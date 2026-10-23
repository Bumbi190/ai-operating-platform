# Social publication Instagram Insights – staged adapter

## Status
Implemented only on the isolated local branch codex/instagram-growth-integration-20261023. NOT merged, NOT deployed, feature flag OFF by default.

The existing Omnira platform stores Instagram metrics in media_insights. The Prompt has per-script media receipts, while Familje-Stunden uses a separate social_publications ledger.

Database read-only verification, October 23 2026:
- Familje-Stunden has two published social_publications with provider media IDs, both matching the verified and active Instagram account binding.
- The Prompt has 293 Instagram media_insights rows; Familje-Stunden has none yet.
- Existing media_insights has nullable script_id and a unique constraint on instagram_media_id, so an adapter can persist social-publication metrics without a new table or schema migration.

## New code
- lib/media/social-publication-insights.ts: bounded, identity-checked reader for confirmed, bound social publication receipts. It uses the existing credential resolver and first-party Instagram Insights fetcher, and writes the existing media_insights schema by unique media ID. Existing rows belonging to another project or a legacy script are not overwritten.
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
