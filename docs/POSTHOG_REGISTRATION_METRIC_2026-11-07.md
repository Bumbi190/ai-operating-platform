# PostHog registration submission report

Goal: authorized project viewers see received registration_submitted event totals and daily counts for the same seven UTC dates as existing traffic, separately from registration-page views, verified accounts and approved dealers. This continues the approved registration measurement; no new collection purpose or signup change.

Base aa6faa122643ca48c446f7e093125480cfa8b2e6. Branch feat/posthog-registration-metric-20261107. Preflight checked 121 open PRs and 248 worktrees, nearby source/ownership and merged PR614. Old owned traffic branch could not fast-forward, so preserved it and all parallel worktrees. Script receipt new_branch_approved/no_matching_work: C:/Users/Andre/Projects/Omnira/Docs/posthog-registration-metric-preflight-20261107.json. No new PR/push or deployment.

Design: fourth fixed EventsNode in the existing bounded EU TrendsQuery: registration_submitted, total, exact /registrera, existing production host filter. Keep the existing sessions request, authorization, mapping, seven-second deadline and 32-KiB response bound unchanged; no extra provider request. Parse exactly four unique series and seven exact UTC dates with safe nonnegative integers. Submission totals may exceed pageviews because event delivery is best effort; never manufacture a ratio or reject that valid independent count. Missing/malformed/overflow data is unavailable, never zero. Use the existing chart-surface presentation for a separate received-submissions summary plus daily table column; local horizontal overflow for the expanded table. Keep optional fields for older read-model callers and never coerce a missing field to zero.

Plan:
- [x] Baseline traffic/session tests; write new parser/query/overflow/UI tests and observe RED.
- [x] Extend types, fixed query, parser and safe total; show explicitly consented received events, not complete registrations. Update static no-conversion text. Existing host/project security boundaries stay fixed.
- [x] Run focused new+existing traffic/session tests and focused TypeScript; independent read-only review; fix material findings with regressions.
- [x] Commit local source and verification/handoff, no merge/push/deployment. Check real provider shape without printing credentials or raw visitor data.

Read-only provider diagnostic already returned HTTP200 with all four seven-day series for 2026-11-01 through 2026-11-07. Registration-page and submission series were zero; pageviews [0,0,0,2,0,0,1]. This proves the four-series provider shape, NOT new production instrumentation: Handlarborsen submission branch remains local and unshipped.

Handlarborsen next build --webpack succeeded on 0870ce9f360917382c0a78b51c768a6cc1cb51f0 using synthetic localhost/public build values and empty server provider credentials, no Sentry upload. Current HB main advanced separately to 6e0d4c02694da22e9535fe3b5ef51b6a8c6025e7 (first-vehicle pilot); no collection/auth source overlap. This is an optimized local webpack build, not a production release or integration with the later main change.


Verification (2026-11-07): baseline 24/24 passed; initial new tests RED (5 failures), implementation GREEN 36/36. Review zero-pageview regression RED (1 failure), final GREEN 37/37 across registration (13), traffic (10), sessions (14). Focused TypeScript passes with tsconfig.registration.verify.json; git diff --check passes. Full Omnira suite/build not run. Scoped Next lint cannot run because this checkout has no configured ESLint setup (interactive configuration prompt; no configuration changed).

Independent read-only review: no Critical/Important findings. Minor zero-pageview wording corrected and regression tested. Existing shared project overview includes authorized collaborators; standalone analytics route retains its existing owner scope. No access widening. UTC remains an operational prerequisite: project 245437 timezone verified UTC through connected PostHog project metadata on 2026-11-07. The runtime query-only key correctly lacks metadata access (403); no scope expansion or new per-view request was added. Date labels alone do not verify bucket timezone.

Reproduce in apps/web: node node_modules/vitest/vitest.mjs run lib/qa/handlarborsen-posthog-registration.test.ts lib/qa/handlarborsen-posthog-traffic.test.ts lib/qa/handlarborsen-posthog-sessions.test.ts ; node node_modules/typescript/bin/tsc --noEmit -p tsconfig.registration.verify.json. Existing owned dependency directory was linked, no package or lockfile changes. Final log: %TEMP%/omnira-registration-metric-final-20261107.log.

Subsequent integration check: full Omnira Vitest was attempted and is NOT green (1,022 failed, 12,714 passed, 1,308 skipped; 4 unhandled errors). All 37 PostHog tests still pass. This supersedes the earlier statement that the full suite was not run. See POSTHOG_REGISTRATION_RELEASE_CHECK_2026-11-07.md for environment prerequisites and release block; no production-ready claim.
