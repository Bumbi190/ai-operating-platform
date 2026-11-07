# Registration analytics release check — 2026-11-07

Release remains local and blocked pending verification. No production branch update, remote push, deployment, environment, database migration or live signup.

## Pinned candidates
- Omnira: ceffcde40d08dbefcc0819bc6e963e95a6e3fb23, based on current origin/main aa6faa122643ca48c446f7e093125480cfa8b2e6. Current targeted evidence: 37/37 and focused TypeScript pass.
- Handlarborsen: 27ad93715af4871fa300d0e30ef81fa67162fced, merge of existing registration feature 0870ce9 with origin/main 6e0d4c0. Merge-tree and actual local feature-branch integration are conflict-free. No changes to main checkout or parallel worktrees. Earlier optimized build applies to 0870ce9 only; integrated candidate needs fresh checks.

## Release order
Ship Omnira report first when cleared; zero received submission events is valid data. Then ship Handlarborsen consent-v2 capture, verify old approvals require a new choice while denials persist, and verify no registration event before current consent. After an authorized real successful submission, verify verification-page navigation and bounded provider event delivery without exposing submitted data. The smoke test would create a real account/email; local intercepted browser tests do not authorize or substitute that transaction. Do not generate fake production registration counts. Existing pageview/session figures remain separate.

## Rollback considerations
Keep privacy notice aligned with collection. Preserve a user denial across rollback. Rolling capture back to consent-v1 behavior may revive old approvals and must not be performed blindly; disable analytics collection first if emergency rollback is needed. Do not silently reset consent storage or replay missed submissions.

## Broad-suite investigation
Omnira full Vitest run was started on the pinned candidate. It exposes failures outside the nine changed files, including Windows path separators, missing grep binary, and historical pinned hashes. No failed assertions have been skipped or relaxed. Full outcome will be recorded below. This is not a green release gate.

Full Omnira Vitest finished with exit 1: 813 files (530 passed, 250 failed, 33 skipped); 15,048 tests (12,714 passed, 1,022 failed, 1,308 skipped), 4 unhandled errors, 326.55 seconds. All three PostHog suites passed in this same run (10+14+13=37). Representative blockers: missing @omnira/local-text-contract in the reused focused dependency tree; missing grep on Windows; Unix-versus-Windows path assumptions; historical byte/hash assertions; SQL fixtures requiring separately prepared isolated databases. No baseline-main rerun has been performed, so this evidence does not prove every failure pre-existed or is harmless. It does prove full-suite release readiness has not been established in this environment. Do not weaken assertions or touch SDF security isolation to green this analytics change. Raw local log: %TEMP%/omnira-registration-full-suite-20261107.log; normalized UTF-8 log: %TEMP%/omnira-registration-full-suite-clean-20261107.log.


## Final Handlarborsen result

Final complete Handlarborsen rerun on integrated 27ad937: npm test -- --pool=threads --maxWorkers=2 exit 0, 149 files passed / 1 existing contract file skipped; 1415 tests passed / 1 skipped, 270.33 seconds. Isolation stayed enabled. No assertion, timeout, source or worker-limit change from the failed full run; other broad suites/build/browser were finished before this rerun. Log: %TEMP%/hb-registration-integrated-unit-serial-20261107.log. Together with 12/12 browser, full TypeScript, lint (four existing warnings) and optimized webpack build, this verifies the local integrated HB candidate. It does not clear the separate Omnira broad-suite release block or prove live ingestion.

Both origin/main refs re-fetched at final check: Omnira aa6faa122643ca48c446f7e093125480cfa8b2e6 and HB 6e0d4c02694da22e9535fe3b5ef51b6a8c6025e7; each is an ancestor of its isolated candidate. Keep both branches local; no PR/push/production merge or release while the broad Omnira verification is unqualified. Next work is to qualify the Omnira workspace dependencies and isolated fixture prerequisites in its supported test environment, retaining all failing assertions and security boundaries.


## Superseding matched-baseline evidence — 2026-11-07

The missing dependency prerequisites have now been resolved in an isolated complete lockfile install. Full main and candidate runs were performed with identical dependencies, Windows host, child grep PATH and four-worker settings. Main: 15030 passed/410 failed; candidate: 15045 passed/408 failed. Every candidate failure is also a baseline failure; zero new failed assertions/files and zero removed assertions. All13 new assertions and all37 PostHog tests pass, focused TypeScript passes. Earlier whole-suite uncertainty about new analytics regressions is resolved by this comparison. The whole repository suite remains red; no all-green or live-release claim, and no production action was taken. See POSTHOG_REGISTRATION_BASELINE_2026-11-07.md and posthog-registration-baseline-20261107.json.
