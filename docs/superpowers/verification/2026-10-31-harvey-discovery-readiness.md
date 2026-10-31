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
