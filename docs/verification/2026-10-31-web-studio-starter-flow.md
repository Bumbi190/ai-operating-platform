# Approved showroom starter — local integration verification

Date: 2026-10-31. Existing worktree/branch `atlas-builder-references-20261017` / `codex/atlas-builder-references-20261017`, PR #368. Baseline `8d8e7b7d2657b08967c841c044f0699f65a3836e`. No push, merge, production activation, new package, hosted migration or paid model call.

## Implemented scope
The normal Atlas planning tool schema and instructions now expose an optional `design.starter='premium-dealer-demo-v1'`. Saving a valid fictional one-page/static plan produces three reviewable mockups, with the approved amber showroom in the visual option. The existing database approval/start flow is unchanged. A template does not approve itself or grant execution rights. Multi-page or live-integration starter plans are rejected instead of silently losing scope.

The five previously approved demo raster crops are bundled with file-byte SHA-256 identities. Canonical mockups contain compact `atlas-asset:<hash>` references; the real compiler resolves only exact bundled refs, with no network. The existing 48000-byte mockup ceiling is unchanged.

Before model calls, a scoped map is created from the validated approved mockup and the hash-checked previous artifact. HTML image sources are represented by IDs and short alt text. Model output is restored only from that same map before strict compilation. Unknown refs, images belonging only to another snapshot, newly invented base64 and MIME changes fail closed. Existing text-only prompts remain compatible. Image parsing uses parse5 attribute locations, not broad regex replacement. This protocol concerns HTML img src, not arbitrary CSS/video/3D assets.

The real build worker calls the adapter inside its existing governance, validation and commit path. A color-only edit can retain exactly the same image bytes and preserve the previous immutable preview. The successful tests below use deterministic authored provider responses; they do not establish that a real model always preserves layout/images, independently picks this starter or produces sellable design.

## Tests and evidence boundaries
- Initial RED: 7 failing / 8 passing tests demonstrated missing starter and raw-image context behavior.
- Final focused regression: **216/216 passed in 16 files**, including the real chat-route contract with mocked providers, starter validation, output compiler, template, scoped raster tests and existing reference-analysis suites.
- Browser starter pipeline: **4/4 passed** at 390/768/1440 px and edit/history checks. All 9 image instances decode, five distinct sources; filter, keyboard and parent isolation hold. Auth/provider are fixtures; compiler/template/prompt/resolver are actual implementation.
- Existing premium catalog browser suite: **10/10 passed**; reference-picker browser suite **18/18 passed**.
- Full web TypeScript: **exit 0** after the review fixes. Existing YAML parsed and git diff check passed.
- Real PostgreSQL and actual worker: **55/55 passed** (bootstrap2, worker35, existing mockup12, visual4, starter2). Run `319aeccf-89b1-4318-ac4d-932571150dfb`. New tests exercised the actual planning tool -> persisted compact mockups -> explicit approval -> worker build -> color feedback -> immutable prior version, then rejected an unauthorized image handle. Auth identities and model output are synthetic.
- The SQL run preceded two final permanent-error-classification fixes. After those fixes, the focused216 tests, browser4 and TypeScript passed. A repeat full SQL attempt was **blocked before resource creation by the unchanged 2GiB memory floor**. Do not describe the final exact diff as having a newly repeated complete SQL pass; repeat in an admitted environment before release.
- Broad `npm test -- --bail=1 --maxWorkers=1 --minWorkers=1`: exit1 at unchanged `mission-brief-v1.test.ts:384`, 2 passed /1 failed before stopping. No all-repository-tests-green claim.

## Resource safety and failures corrected
Initial free RAM was below2GiB; no guard was lowered. Later a run was admitted when free RAM exceeded the floor. The first owned SQL run failed because a new `server-only` marker was incompatible with the standalone Node compiler. Removed the marker from the already Node-only crypto/Buffer registry, not from the server worker. That failed fixture and the successful next fixture were removed. Before/after the successful run, all42 existing container IDs/names were unchanged. No existing service was stopped to free RAM.

The planning instructions initially exceeded the existing9000-character Studio prompt budget (9039). Shortened the added guidance, not the guard. The real route regression now passes.

The new browser test initially guessed a65000-byte edit budget and measured65525. This was not a product constraint; corrected the test to enforce the real unchanged200000 cap plus a measured reduction below half the rendered raster HTML size. No production limit was raised.

A second manual review found generic errors on tampered design references and deeply nested model markup could escape the intended permanent-error classification. Two new tests failed first, then passed after preserving `INVALID_DESIGN_REFERENCE` and `INVALID_MODEL_IMAGE`. This is manual review, not independent security certification.

## Measured payloads and visual review
Actual fixture metrics: canonical mockup29882 bytes; initial model payload30855 bytes; edit payload65525 bytes; rendered HTML177513 bytes; five distinct approved rasters. Neither model payload contains the raster base64. These are payload sizes, not a monetary-cost estimate.
Desktop/mobile browser screenshots were inspected. Capture uses completed/disabled animation for a stable final frame, rather than mistaking the introductory fade for darker art direction. Existing approved design and AI-image/demo labels remain. No actual3D or additional image generation.

## Local reproduction and retained evidence
Evidence: `.superpowers/sdd/2026-10-31-web-studio-starter-flow/` — preflight, red/green/review logs, final regressions, browser outputs, TypeScript, broad fail and guarded SQL attempts. SQL receipt/logs: `.superpowers/sdd/2026-10-31-web-studio-sql-roundtrip/runs/319aeccf-89b1-4318-ac4d-932571150dfb/`.
From `apps/web`: `node ../../node_modules/@playwright/test/cli.js test --config playwright.website-starter.config.ts`; focused Vitest files are listed in the final regression log; `node ../../node_modules/typescript/bin/tsc --noEmit --incremental false`.
From repo root with allowed local resource capacity: set `WEBSITE_SQL_ROUNDTRIP=isolated-local` and execute `node apps/web/scripts/run-website-sql-roundtrip.mjs`.

## Remaining boundaries
This optional starter and scoped-image path are implemented locally, not activated in the deployed Studio. The planning tool -> SQL -> worker proof is not a real authenticated browser-to-paid-model end-to-end run. Real model visual fidelity, final exact-diff SQL recheck, real Auth/browser integration on this version, independent review and broader suite triage remain. Full customer media intake, protected model selection, interactive3D, CMS, actual lead/customer forms and release remain separate work. Existing generated demo crops are not high-resolution customer photography.
