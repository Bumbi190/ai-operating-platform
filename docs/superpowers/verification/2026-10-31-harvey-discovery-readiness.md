# Harvey B2B — discovery configuration follow-up, 31 October 2026

## Problem and behavior

The branch Preview has Sales enabled for the existing Handlarbörsen project, but no discovery source URL. The previous interface still offered a new search; only the later provider call explained the missing configuration.

The authenticated discovery response now adds a non-secret `sourceConfigured` boolean. It reflects local URL configuration and validation, not provider health or verified lead quality. The persisted SQL report remains unchanged. Authentication, project access and the Sales feature gate run before configuration is exposed.

The interface permits a new search only after the current project's response explicitly confirms configuration. Initial loading, missing configuration and missing metadata have distinct messages. The submit handler also refuses unavailable searches. Saved results, candidate review, rejection and promotion retain their existing behavior.

The database admission and idempotency path is unchanged. An exact replay of a saved request still reads its result if the source was removed, without fetching again. Direct new API attempts retain the existing bounded failure/audit behavior; this change does not add a pre-admission source gate.

## Verification of this follow-up

| Check | Result |
| --- | --- |
| Provider and discovery API tests | 40 passed |
| Chromium Sales browser suite | 39 passed |
| Full TypeScript check | Passed |
| Git diff whitespace check | Passed |

New regression coverage proves that authenticated configuration reads do not probe a source, unauthorized/disabled requests reveal no configuration, exact replay works after source removal, and saved candidate review remains usable. Browser cases cover missing configuration, missing metadata and the pending initial read. The existing Sales browser flows remain included.

The initial new denied-access test fixture returned the generic Response type; the full type check caught that mismatch. The fixture now uses NextResponse, matching the actual ProjectAccess contract. The final unit and type checks pass.

No SQL migration, worker command, mailbox, customer send or production application activation is introduced. The two previously approved migrations remain applied. This follow-up continues draft PR #386 and the existing branch; the preflight's unrelated creative-preview title match was reviewed and rejected as a different file scope.

## Public source investigation

The [Private.coffee operator policy](https://overpass.private.coffee/) explicitly allows commercial projects without registration or a service charge. It asks for fair resource use, a meaningful application User-Agent, suitable POST requests, OSM attribution and no personal information in queries. It provides no availability guarantee. These published conditions are compatible with evaluating a small, manually requested pilot; they do not establish operational readiness.

One real request through the actual source adapter was attempted from Hultgren:
- Endpoint: `https://overpass.private.coffee/api/interpreter`.
- Query: Malmö, car dealers, radius 5 km, at most 5 results.
- Existing fixed application identity, 10-second query budget, 27-second overall limit, 256 KiB response cap.
- Result: `DISCOVERY_PROVIDER_TIMEOUT` after 27,014 ms; no HTTP response.
- One separate status GET also timed out after about 12 seconds, with zero response bytes.
- No database access, customer contact or stored raw business records.

The standalone adapter check used the repository's existing server-only test-module alias in an external TypeScript config; the HTTP provider itself was real and not mocked. Source qualification failed, so no source URL was installed in Preview or production.

[NextGIS's current operator instructions](https://nextgis.com/blog/nextgis-overpass-api-server/) require an account and a personal API key. No such account, credential or new paid service was created as a fallback.

## Remaining live verification

The Browser connection in this conversation reports that an originating browser context is unavailable. Hultgren's existing Brave processes expose no debugging session. No owner session was manufactured, browser credentials extracted or app authentication bypassed.

A logged-in owner check of the deployed Preview remains outstanding, as does successful qualification of a configured company source. WebBuilder's dedicated Strato mailbox is explicitly deferred until later; its final project/offer configuration remains to be verified.

The earlier full-suite comparison at commit 203faea remains historical evidence with 120 failing tests also present on main. It has not been rerun for this small follow-up and is not presented as a green full repository suite.

## Evidence and release tracking

All detailed receipts are on Hultgren under `C:\Users\Andre\Projects\Omnira\Temp\harvey-resume-20261031`, including source-readiness validation, the public adapter probe and the PR scope review.

The current commit, automatic checks and deployed Preview result are recorded in [PR #386](https://github.com/Bumbi190/ai-operating-platform/pull/386) and the [Harvey handoff](https://app.notion.com/p/4087b977c5b88138bbfff29b30b92c1e). Production application release, host activation and customer sends remain inactive.

## Required CI gate: deterministic isolation fixtures

The first automatic project-isolation run for this follow-up failed four unchanged Revenue tests. Their revenue/token rows were seeded on the first day of the current month at noon, while RevenueLegacy first fetches a rolling 30-day interval. At 14:23 UTC on 31 October, that cutoff was 14:23 on 1 October, so the fixture rows no longer reached any of the four tested totals. The same test could pass before noon on the same day.

Only the isolation fixture is adjusted to current-day midnight, inside both existing windows and never in the future. All expected money/token values and foreign-project exclusions are retained. Explicit clock-controlled cases cover the late-31st failure instant and the following month's start. Production date windows, formulas, currency and authorization are unchanged. The follow-up passed 81 focused tests (41 Revenue isolation, 28 discovery API and 12 provider), including both calendar-boundary cases, and a full TypeScript check.

Existing runtime follow-up: the legacy page's rolling 30-day prefetch can omit early first-day events in a 31-day month even though its headline says current-month revenue. The fixture correction does not repair or hide that separate product limitation. It remains documented for the Revenue workstream; the current vNext money surface is a different implementation.

## Correction to earlier Preview HTTP interpretation

The new Preview at application commit 19d363d was READY and passed the real 152/152 migration guard; its login page returned HTTP200 with the Omnira title. However, API URL fetches returned a structured Vercel-tool authentication barrier, not an inspectable application response. For discovery the tool reported stage fetch_deployment, code deployment_authentication_required and blockedAt after_redirect.

The earlier numeric401 observations therefore do not establish app-level Sales API authentication. They are withdrawn as evidence of that boundary. The authenticated report tests remain valid isolated tests; a live owner browser/API check remains outstanding. No credentials or owner session were manufactured to complete it.
