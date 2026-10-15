# Atlas Studio project cost and stop control — 2026-10-15

Base: 93174c87e1a1d70c510350e1b2a281dcf7811968.
Scope: the selected project's cost control in /build. The widget appears below Update on desktop and remains accessible at 390px.

## Behaviour
- Read the selected project's project_monthly figures from the existing budget_headroom function, including held reservations and the gate's calendar window.
- Display recorded SEK against the monthly budget, with reservations separately identified. No fabricated zero when a budget/read is missing.
- Refresh every five seconds after each read while visible; refresh on returning to the tab. Retain the last value with a stale warning after errors.
- Authenticated owner scope is checked against both the access allow-list and the actual projects owner_id. Filter RPC results in the query and again before serializing; never expose another project's or platform totals.
- POST can only set the selected project's execution stop to true through setProjectExecutionStop, with server-derived actor and audit reason. There is no resume, global stop, budget mutation, provider request or run creation in this endpoint.
- Confirmed pause disables further studio chat/work. Late reads and project switches cannot replace another project's state. A lost stop response is reconciled by polling without automatic POST retries.
- Explain that already dispatched AI requests can still incur cost. Registered totals are the Omnira ledger, not a supplier invoice reconciliation.

## Verification
- RED: new HTTP coverage failed with missing cost/stop actions; existing product returned 403/400 instead of requested results.
- RED: mobile browser coverage failed because the cost region did not exist.
- RED: lost-stop-response test exposed a stale error after polling confirmed a pause.
- GREEN: 8 new cost/stop HTTP tests passed.
- Existing stop authority suites: 61 authorization + 44 resolver tests passed; combined with the new tests, 113 passed.
- 42 existing cost-ledger SQL isolation tests were skipped because ATLAS_SQL_TEST_URL was not configured. No SQL isolation proof is claimed for that optional run; there are no schema or grant changes.
- Full repository TypeScript check passed.
- Chromium UI fixture: 13 passed, zero retries. Includes live updates, stale data, preserving chat draft, failed stop and retry, lost response recovery, project switch, 390px and desktop placement, five existing viewport checks and sidebar persistence.
- Desktop and mobile screenshots visually inspected.
- git diff --check passed; Git on Windows reports normal LF/CRLF conversion notices.
- Read-only production budget_headroom check for the user-supplied project returned the expected project_monthly numeric fields. No production stop or paid build was executed.
- The database-backed 16-case Studio browser fixture and the full repository unit suite were not rerun for this bounded UI/API change. The normal protected CI workflows still apply.

## Separate outstanding work
The existing failed Lumvy generation and its 6000-token response cap are not changed by this cost-control patch. This patch does not implement new model routing, local runners, domains, hosting, payments or generation capabilities.
