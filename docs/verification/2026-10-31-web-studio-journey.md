# Web Studio — actual UI journey verification

Date: 2026-10-31. Existing PR #368, branch codex/atlas-builder-references-20261017. Baseline ad354fa310876efa5a61aece760651007ca9ec39. Local work only; no push, hosted schema, deploy or paid inference.

## Scope
Exercise the actual Studio interface, existing HTTP handlers, planning tool, explicit mockup approval, explicit build approval, canonical PostgreSQL functions, build worker and preview. Model outputs are authored fixtures, authentication is synthetic, and worker scheduling is driven by a test-only HTTP control. This is NOT real GoTrue login, live model reasoning, production deployment or a security certification.

The new desktop/mobile tests assert: a requested fictional showroom starter, an explicit budget gate, three real reviewable designs, no premature build session, the selected design approval, a complete eight-car preview, filtering, chat feedback for an accent-only edit, unchanged images/text/catalog, exact revision/feedback receipts and access to the previous version. Viewing history deliberately does not overwrite the active revision. Active rollback is not implemented or claimed here.

## Completed baseline gap
Before changes to the runtime test modules, reran the exact committed ad354fa code against the isolated canonical SQL fixture: **55/55 passed**. Run b5c984e3-f5e4-4840-afff-2e83933f27a5, cleaned=true. This closes the previous turn's resource-blocked SQL rerun for that commit, not any later unrun changes.

## Test infrastructure corrections
- Fresh worker fixture had only the original Studio creation function, which accepted v1/6000 while the application preset was v2/12000. The actual HTTP creation returned INVALID_STUDIO_INPUT. Test bootstrap now loads the existing canonical v2 function from 20261015122500_atlas_builder_output_allowance_v2.sql. No production migration or validation threshold was changed. Added a current-preset/bootstrap-privilege regression.
- Existing authored planning/build providers only handled the café fixture. An explicit showroom request now returns the normal plan-tool proposal and the actual pinned draft via the existing worker request/resolver; it never grants approval or fabricates a worker commit. Unit RED reproduced the missing starter before implementation.
- New role-based assertion initially expected the approved plan's button to stay visible. Actual UI intentionally collapses the approved card. The test reopens its actual summary, retaining the disabled-button assertion. No product UI behavior was changed.
- An APIRequestContext control reused between long UI interactions twice encountered ECONNRESET. Diagnostic server logs showed the failing second control was never admitted to the application, while completed controls had matching admission/completion records. One mobile run completed the entire journey before the desktop transport failure. Final test control opens/disposes a fresh localhost context with Connection: close and maxRetries:0; it does not retry mutation requests. Do not describe earlier partial runs as a green full suite.
- Resource checks remain unchanged: at least 2GiB free host RAM, a unique UUID-bound PostgreSQL container, 192MiB memory/swap, one CPU, no network/ports/host binds and explicit opt-in. Two attempted reruns were refused before resource creation. Other processes and old test containers were not stopped. The first obsolete-fixture run was ended by terminating only its identity-checked Playwright subtree; its owning runner performed verified cleanup.

## Verification
- Final focused regression command: **218/218 passed in 17 files**.
- Test target, explicit mode and opt-in guards: **8/8 passed**. Unknown runner arguments fail closed; the legacy default SQL mode is retained.
- Full web TypeScript: **exit 0** after final transport/test changes.
- Final full Studio run: **25/25 passed**, 0 failed, 0 skipped, 0 flaky, no retries. Run eee6ebbd-71a9-4256-a786-a4b355c54b93; cleaned=true. Includes both new showroom journeys (390/1440 px) and all 23 existing Studio cases. The previous 42 container IDs/names were retained. Mobile and desktop version-2 screenshots inspected. The separate new current-preset SQL-bootstrap unit case will run in the prepared CI SQL stage; no post-helper 56-test SQL result is claimed locally.
- Existing broader repo failure in mission-brief-v1.test.ts remains documented in prior reports; no broad green claim. It was not rerun merely to repeat the same known result.

## Reproduction / evidence
From the repository root, with a cached postgres:17-alpine image and permitted local Docker context:
- `WEBSITE_SQL_ROUNDTRIP=isolated-local node apps/web/scripts/run-website-sql-roundtrip.mjs` (use PowerShell environment syntax on Windows).
- The same command with `--studio` runs the actual Studio browser suite with fixture auth/models; no arbitrary config path is accepted. Stops at the first failure, no retries.
- `node --test apps/web/scripts/website-test-target.test.mjs apps/web/scripts/website-test-mode.test.mjs`.
- Web TypeScript: `node ../../node_modules/typescript/bin/tsc --noEmit --incremental false` from apps/web.

Task evidence: `.superpowers/sdd/2026-10-31-web-studio-journey/`. Run receipts, browser JSON, screenshots and before/after container lists: `.superpowers/sdd/2026-10-31-web-studio-sql-roundtrip/runs/`.
Do not confuse this suite with the lighter existing atlas-studio-ui screenshot fixture or the separate reference Auth/Storage suite. In this synthetic Studio environment, the cost panel may show unavailable; no fabricated live spend or billing-readiness proof.

## CI and release boundary
Prepared a separate bounded 15-minute `studio-journey` job in the EXISTING atlas-studio-ui.yml, with read-only repository permission, no provider keys, SQL regressions, actual Studio tests, cleanup verification and five-day scoped evidence retention. Existing real Auth/Storage job is unchanged. This configuration has been parsed locally; it has NOT executed remotely. A separately approved push is required and may use normal GitHub/Vercel quotas. No new branch or PR.
Manual second-pass review only; no independent agent review claimed. Actual Auth/UI integration for this exact new source, a separately budgeted live-model trial, active version rollback, broader failure triage and production readiness remain open.

Final source review: changes are test-only providers, test SQL bootstrap, diagnostics, typed browser tests, bounded runner and CI configuration. No application UI/runtime, schema migration or paid-provider implementation changed in this slice. Git diff --check passed. The focused source and type checks were rerun after the fresh-connection change.
