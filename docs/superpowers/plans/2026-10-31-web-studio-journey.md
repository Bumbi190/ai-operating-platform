# Showroom Studio journey implementation and verification plan

> Execute inline on the existing PR #368 worktree; use test-driven changes and retain evidence. Baseline ad354fa310876efa5a61aece760651007ca9ec39.

**Goal:** Exercise the accepted showroom through actual Studio controls, HTTP handlers, planning tools, approvals, PostgreSQL, worker, preview and feedback rather than only isolated template pages.
**Architecture:** Reuse the existing Vite Studio acceptance harness and its canonical SQL transport. Extend only deterministic provider fixtures for a clearly requested showroom starter. Reuse the bounded disposable PostgreSQL runner with an explicit browser mode, no live credentials or paid generation.
**Tech stack:** Existing TypeScript/Playwright/Vitest/Node/PostgreSQL. No dependencies, migration, production configuration, new PR or remote push.
**Spec:** Notion Web Studio v0.6, approved showroom design, local handoff section17 and existing studio acceptance criteria.

## Global constraints and rulings
- Actual Auth stack requires Linux/CI. Do not bypass that guard on Windows or claim synthetic auth is real login.
- Existing 2GiB free-RAM floor and 192MiB SQL container cap stay unchanged. No unrelated process/container cleanup.
- Explicit human mockup and build approvals stay separate; no model authority or automatic paid run.
- Existing private reference data, previous previews and other tasks remain unchanged.
- Tests may use deterministic planning/generation responses, explicitly labelled. This is not proof of real model quality.
- Reuse the exact final SQL test on ad354fa first. Do not modify baseline modules while it runs.

## Tasks
1. [x] Complete the outstanding exact-baseline SQL rerun and verify owned cleanup.
2. [x] Add a fail-closed optional `--studio` test-runner mode; no arbitrary config or path input. Unit-test allowed/invalid arguments before implementation.
3. [x] Add desktop/mobile Studio journey tests: explicit fictional starter request, budget gate, three rendered designs, no start before mockup approval, explicit build, actual worker produces eight-card preview, filter works, chat color feedback reaches next revision, pictures/data unchanged, older version remains viewable, reload retains chosen state. Record UI screenshots.
4. [x] Watch the journey fail on the existing café-only provider fixture; adapt only the test providers to return deterministic showroom requests/output through existing application code. Fix any genuine UI defects with a failing regression first.
5. [x] Run the full existing Studio suite plus the new journey on the same disposable SQL boundary; run focused regressions and TypeScript. Record exact counts and any missing boundaries. Do not repeat the known broad-suite failure merely to pad evidence.
6. [ ] Manual second-pass review, local commit, update Notion and handoff. Stop at the separately authorized push/CI/live-model boundary.

## Review focus
Browser asset preservation; approval-state transition; mobile tab and history usability; no raw image bytes in model payload; fixture independence; test runner cleanup and explicit opt-in.
Preflight receipt: `.superpowers/sdd/2026-10-31-web-studio-journey/preflight.json` (reuse_existing).

Ruling: Add the bounded Studio runner as a separate 15-minute job in the existing workflow rather than extending its already crowded 10-minute UI job. The job remains read-only to GitHub, uses no provider secrets, and only activates after a separately approved push. Existing real Auth job is unchanged; this journey job still uses fixture identities/providers.
Ruling: A fresh SQL fixture omitted the already-existing v2 Studio factory function. Load that exact canonical function (not custom relaxed SQL); the actual browser creation failed before the correction. Add a bootstrap contract test.
Ruling: The plan card intentionally collapses after successful start. The new test must reopen its actual summary before checking the disabled started control; no product UI change is required. The old suite uses getByText and is unaffected.

## Execution ledger and final gate
- Baseline ad354fa exact SQL rerun 55/55; run b5c984e3-f5e4-4840-afff-2e83933f27a5, owned cleanup completed.
- Runner-mode RED: two missing-function assertions; mode/target guards GREEN 8/8. Provider RED: requested starter was absent; provider fixtures GREEN 2/2, included in 218/218 focused regressions.
- First browser attempt exposed obsolete v1-only test bootstrap; interrupted only that verified test subtree and retained runner cleanup. Canonical v2 function loaded without relaxing application policy.
- New test's hidden-plan assertion corrected to actual user interaction (reopen approved summary).
- Two controls had ECONNRESET before server admission; added test-only boundary diagnostics. Mobile full journey then passed, desktop control still failed before admission. Switched mutating test controls to a fresh connection each time, maxRetries=0, no replay.
- RAM floor refused two attempts; never lowered. Final admitted full Studio run eee6ebbd-71a9-4256-a786-a4b355c54b93: 25 passed / zero failed, skipped or flaky, owned database removed; unrelated containers preserved.
- Final 218 focused tests, eight runner guards, full web TypeScript and YAML/diff checks passed. No full-repo-green, independent-security-review or real-model claim.
- History viewing is verified; active rollback is still a separate requirement. Local synthetic-auth UI is not GoTrue login.
- Pending release gate: separately authorized push of accumulated local commits, existing real Auth CI plus the new 15-minute SQL/Studio job, protected preview and then separately budgeted live model trial.
