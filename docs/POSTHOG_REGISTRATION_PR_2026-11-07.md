# Prepared pull request

Title: feat(analytics): report consented registration submissions
Base: main
Branch: feat/posthog-registration-metric-20261107
Release implementation/source: b11fd9b359f85ffa66484d7cf754c93d8d61d71e. Companion Handlarborsen review head:2ecef020c0ddfddd632342c322710a4cffda1550.

## Body

Project viewers can now distinguish visits to /registrera from received consented registration submissions. The existing traffic request adds a fourth fixed registration_submitted aggregate for the same seven UTC dates and canonical hosts. The overview and protected analytics page show weekly/daily received-event counts separately from verified email, approved dealers and authoritative business totals. Existing authorization, project mapping, two-request count, seven-second deadline and 32-KiB response bounds stay intact. Missing/malformed/unsafe data stays unavailable; a valid zero remains zero. No percentage is invented and independent submissions may exceed delivered pageviews.

The daily table keeps dates on one line and supports a labeled keyboard-focusable horizontal scroll area on narrow screens. Desktop/mobile screenshots use explicitly marked synthetic values and are in review/posthog-registration-20261107/.

Validation: 37 focused tests and focused TypeScript pass. Six headless Chromium scenarios cover desktop/mobile, populated/zero/unavailable states, no page overflow, unbroken dates, keyboard scrolling and access to the last column, with no external requests. The matched whole-suite release result is 15,043 passed /410 failed versus main 15,030 passed /410 failed; 409 failed assertion identities are shared, no new failing file, and one additional 5-second first-render timeout passed unchanged in an isolated diagnostic. All 13 added registration assertions pass; zero assertions removed. Details: posthog-registration-release-baseline-20261107.json. The repository-wide suite is not claimed green; baseline details and any observed regressions must remain explicit.

Release order: publish this read-side report first, then the companion Handlarborsen consent-v2 capture. UTC project timezone is an operational prerequisite (verified2026-11-07). No extra API scopes, capture configuration, real signup or live ingestion is part of this PR.

## Local preparation status

No push, PR or deployment performed. Fresh preflight inspected 121 open PRs/250 worktrees and found no matching PR; nearby older journey/KPI branches were inspected read-only and have no registration_submitted event in apps/web. Current approved branch owns this implementation, so continue it without creating another branch/worktree. Receipt: posthog-registration-release-preflight-20261107.json. Source/live verification, baseline qualifications and rollback considerations: POSTHOG_REGISTRATION_RELEASE_CHECK_2026-11-07.md.
