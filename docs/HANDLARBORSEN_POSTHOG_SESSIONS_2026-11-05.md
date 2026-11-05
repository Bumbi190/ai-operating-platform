# Handlarbörsen: PostHog session display

Work ID: HB-SESSIONS-20261105. Follow-up to merged statistics PR #627.
The owner requested connecting the verified provider session count to the traffic card.

## Verified source and definition

PostHog OAuth active project was confirmed as Handlarbörsen, project245437, EU ingestion, timezone UTC, cookieless server hash enabled and session recording disabled. No settings were changed. On 2026-11-05, the native WebOverviewQuery for inclusive dates2026-10-30 through2026-11-05, with exact host allowlist handlarborsen.se / www.handlarborsen.se, returned2views and1session. Both filterTestAccounts:true and false returned the same values. The implementation uses false explicitly, matching the existing unfiltered event traffic scope. This is a verified native provider count, not proof of exact human identities or every session boundary.

PostHog sessions are fetched for the complete period. Never sum daily session counts. Today's data remains incomplete. The UI labels the value as PostHog cookieless sessions over seven UTC dates and explains that it is not an exact number of people.

References:
- https://posthog.com/docs/data/sessions
- https://posthog.com/tutorials/cookieless-tracking

## Implementation and boundaries

The existing project ID / slug / allowlist and server-only credential guards run before any network call. Add one native aggregate WebOverviewQuery beside the existing daily TrendsQuery, to the same fixed EU endpoint, with no redirects or response cache. They share the existing seven-second request deadline and each response uses the existing32KiB bounded streaming JSON reader.

Only an exact single sessions metric with kind unit and a nonnegative safe-integer value is accepted. Missing/invalid/duplicate metrics, async responses, denied permission, provider failure, network failure or oversized bodies leave the sessions card unknown with a reason. A verified zero is displayed as zero. Session-only failures retain valid daily pageviews and visitors. No session IDs or raw events reach the browser.

No SDK, tracking scope, consent choices, cookies, recording, project settings, credentials, database, collector or outreach changes. API reads per connected page load increase from one to two; no new paid service or resource is provisioned.

## Preflight and branch reuse

Required script receipt: HB_SESSIONS_PREFLIGHT_20261105.json. It checked main bcc6ddf0c1dd544699af4b257402dbc8231aa8ef,123open PRs and249worktrees, returning review_required for the existing proposed branch (no matching open PR). Scope inspection found no open PR modifying either traffic reader or traffic component. The clean/unlocked feat/hb-registration-journey-overview-20261104 branch was safely reused and reconciled with main; its tree had zero diff from main before this task. No new branch was created; no other worktree was modified.

## Validation and release

Initial regression:12new session assertions failed because the session value/state was absent; the unauthorized-network test already passed. After implementation,75/75focused traffic, sessions, growth, journey, statistics, route and overview tests passed. Independent review then verified the timeout-isolation fix: an added regression first reproduced the failure where a stalled sessions request discarded valid Trends data. Both complete fetch/parse pipelines now run concurrently, retaining already parsed traffic if sessions hits the shared deadline. Older HTTP mocks now return a fresh Response per request, matching real fetch behavior; the expected successful connected request count is two. Guards and data assertions were retained.

Final focused regression passed 84/84 tests across nine suites, including all direct traffic-reader consumers. Independent read-only review confirmed the timeout fix and found no remaining blocking issue, and the final full TypeScript check exited 0 (`tsc --noEmit --incremental false --project apps/web/tsconfig.json`). Full TypeScript status and CI/preview results are recorded in the review PR before release. The21existing unrelated broad Handlarbörsen test failures documented under PR627 are not fixed or suppressed here.

This document does not authorize production publication.
