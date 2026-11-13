# Handlarbörsen traffic integration
Continue after production PR613, baseline main 946039f7f6d5181f1b0bd78c72ce704f51f429d9.

## Verified discovery
- PostHog project 245437 is Handlarbörsen, timezone UTC, IP anonymization on, session replay off.
- Current event taxonomy (last30d) reports only $pageview as recently seen. No signup/registration completion event is currently verified. Do not fabricate a registration funnel.
- Verified pageview properties $host and $pathname; observed host www.handlarborsen.se.
- Typed query-trends over 2026-10-29 through 2026-11-04 returned seven zero pageview and daily-unique counts. This is a bounded diagnostic, not evidence that tracking captures every real visit.
- Actual deployed personal key query diagnostic returns HTTP403 and explicitly indicates missing query:read. Dashboard metadata reads remain functional.
- PostHog connector access is separate from Omnira runtime credentials. No connector credential was copied.

## Code changes
Reuses the existing project overview traffic module and card, which were already wired to authenticated owned project pages. This is a principal-owned aggregate read path, separate from the explicitly human-granted dashboard metadata capability. No dashboard grant is reused as authority for traffic, and no autonomous tool is enabled.
- One fixed native TrendsQuery, total $pageview + dau, seven UTC calendar days including today, production hosts only.
- Current POSTHOG_* server config is reused only when explicitly mapped to the canonical Handlarbörsen UUID and EU app host. Legacy credential pairs remain supported without mixing partial old/new configuration.
- Response deadline7s, streaming byte cap32KiB, redirect refusal, exact HTTP200, no async polling or retry, no raw response/error logging. 403 has a distinct UI state.
- Reports seven-day pageview total, today's daily unique visitors and per-day counts. Daily unique visitors are never summed into a period unique total; they are not verified dealer accounts. Today is incomplete.
- Invalid, partial, oversized, asynchronous or denied responses do not become zero-valued metrics.
- No SQL migration, event capture, replay or PostHog setting is changed.

## Verification and activation
10/10 traffic Vitest tests pass; focused TypeScript graph passed; diff check clean.
NOT deployed. Await same-key permission update: retain project restriction to Handlarbörsen and dashboard:read, add query:read only. No replacement key is needed. Verify a real bounded query before merging/deploying this phase under the user's existing production approval.
Later registration funnel work requires inspecting/adding the actual Handlarbörsen signup instrumentation and verifying events; this patch does not claim a funnel.

Activation check 2026-11-04: user updated the existing key. Real fixed seven-day production-host query now returns HTTP200 with the exact two expected series and seven zero counts each. Runtime permission blocker resolved. Zero received events is not proof that site capture works for actual visits.