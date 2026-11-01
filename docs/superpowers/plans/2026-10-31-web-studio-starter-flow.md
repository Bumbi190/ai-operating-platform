# Approved showroom starter through Atlas planning and build

> Execute inline with TDD on existing PR #368; baseline 8d8e7b7. No new branch, push, paid model call, live flags or hosted schema changes.

**Goal:** Make the approved premium demo available in the existing planning tool and retain its actual pictures through review, build input and later edits.
**Spec:** Notion Web Studio v0.6 (40a7b977c5b88101aae3c22c8c78b714), F01-F06/F08; accepted amber mockup and user's instruction to connect it to Atlas. Existing approvals, isolation and cost gates remain binding.
**Architecture:** Optional `design.starter='premium-dealer-demo-v1'` selects a bundled fictional catalog in the existing plan tool. Three existing review choices remain, with the approved showroom in `visual`. Immutable content-addressed raster handles keep canonical mockups below their existing 48000-byte ceiling. Only bundled approved demo rasters can resolve in the compiler; real private customer uploads are NOT added to this global registry. For model calls, compact only authorized snapshot images and resolve model handles exclusively from that snapshot before strict compilation. No extra authority or automatic build approval.
**Stack:** Existing TypeScript/parse5/Vitest/Playwright; no new dependencies. Known rasters are copied from previously approved repo assets into a bundled JSON registry with SHA-256 checks, not fetched remotely.

## Rulings / alternatives
- Repeating image base64 through every prompt/output would waste context and may exceed current limits. Raising mockup or prompt limits is rejected.
- Do not bypass the builder using an unrelated handcrafted live site or reuse the failure-recovery route as an import mechanism.
- Starter is optional and demo-only. Normal plans with no starter retain existing behavior. The model still uses governed inference for an actual build; test data does not prove generation quality.
- Existing 3-layout SQL contract and explicit UI approvals remain. A template does not reduce approved page scope. This first starter is for a fictional single-page dealership demo; reject multi-page starter plans rather than silently omitting pages.
- Current free RAM was 1615 MiB, below the SQL runner's 2GiB admission floor. Do not lower the guard or stop others' processes. Run bounded unit/worker-boundary/browser tests; run real SQL only if the existing guard permits.

## Tasks and interfaces
- [x] Task 1 RED/GREEN: starter plan validation/schema/brief; deterministic three mockups; exact bundled asset resolution. Files: planning/types.ts, validation.ts, chat-tools.ts, mockups.ts; templates/premium-dealer-starter.ts; assets/bundled-rasters.ts + JSON; artifact.ts. Tests: planning/starter-flow.test.ts. All 48000/32768/1MiB limits remain.
- [x] Task 2 RED/GREEN: compact source rasters for model input; scoped model-output hydration in actual worker, and explicit asset instructions. Files: model-rasters.ts, prompt.ts, worker.ts; tests model-rasters.test.ts and starter-worker.test.ts. Reject unknown handles, new unsupplied images and tampered previous artifacts; do not log private pixels or change approvals/costs. Asset IDs are references, not credentials.
- [x] Task 3: browser fixture compiles actual plan mockup and model roundtrip, validates real images/filter/keyboard and no network. Wire tests into existing CI; no new workflow. Run regressions and TypeScript, broad bail test, manual second review, save local commit and Notion/handoff evidence.

## Review focus
Unknown template or asset ID; hash mismatch; private source leaking across snapshots; legacy text-only regressions; byte limits with repeated images; no secret/raw base64 in model payload; approval and scope preservation; image removal vs addition boundaries. Verify no dynamic fetch/path or caller-writable global registry.

## Ledger
Preflight in `.superpowers/sdd/2026-10-31-web-studio-starter-flow/preflight.json`. Task interfaces share only WebsiteDraft/PlanContent and content-addressed raster refs. A second manual review is not an independent security review. Owner has already approved the visual direction; this is an implementation continuation, not new design selection.

## Execution results
- Optional single-page demo starter wired into real planning schema/validator/brief and three review mockups. Fixed SHA-addressed demo images promoted from already approved assets; no fetch or user-private media registry.
- RED7 failures/8passes; final focused216/216 in16files. Added two manual-review RED/GREEN cases for permanent invalid-design and excessively nested model markup failures. Final full web TypeScript passed.
- Browser pipeline4/4 (390/768/1440 and edit), existing catalog10/10, reference-picker18/18 passed. Actual images decode, filtering/keyboard remain usable and prior color revision remains unchanged. Screenshots are stabilized at completed animation.
- Real SQL55/55 passed in run319aeccf-89b1-4318-ac4d-932571150dfb, with actual planning tool/store/worker and authored model replies. Cleanup verified,42 existing container IDs/names preserved. A requested repeat after two final error-classification fixes was blocked by the unchanged2GiB memory floor, before starting resources. Final exact-diff SQL rerun remains a release check, not claimed done.
- New browser test incorrectly guessed a65000-byte edit cap. Ruling: assert the real unchanged200000-byte product cap plus less than half the rendered raster HTML; measured65525. Canonical mockup29882, initial model payload30855, rendered HTML177513 bytes. No production limit raised.
- The initial isolated SQL attempt exposed a standalone compiler incompatibility with server-only marker in the new crypto/Buffer registry. Removed only that unnecessary marker; failed owned fixture removed; successful SQL rerun followed.
- Added planning instruction initially made Studio prompt9039 characters against9000. Shortened the addition, leaving budget and approval wording intact.
- Broad npm test --bail=1 remains red at unchanged mission-brief-v1.test.ts:384 (2pass/1fail before stop). No broad-green/paid-model/production readiness claim.
- Manual second review performed; not independent agent or security review. No new paid calls, packages, hosted SQL, flags, production or branch push. See docs/verification/2026-10-31-web-studio-starter-flow.md for precise evidence and remaining boundaries.
