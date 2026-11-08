# Web Studio visual-plan continuity — local verification

Date: 2026-10-31. Scope: existing PR #368 / `codex/atlas-builder-references-20261017`.
Baseline: `6404ec29ea8bb33aff27e8b2e14155ad5d4be669`.
State: local implementation tested at the listed boundaries; NOT released, merged, activated or proven with live model inference.

## User-visible change
The existing reference-direction action now carries suggested design data with its exact palette and heading-font choice into ordinary planning chat. Planning accepts an optional, strictly validated `design.visual` object. Its values survive validation, canonical hashing, the textual build brief, all three static mockups and the reviewed draft supplied to the builder.
A palette-only edit changes plan/mockup hashes while preserving the planned pages and mockup content. Legacy plans without visual data keep their original contract and rendering path. All existing plan and mockup approvals remain mandatory. Reference data is not authority and cannot approve or launch a build.
This is not image generation, a premium dealership site, a 3D viewer or proof that a real model follows every instruction. The displayed concepts retain explicit image placeholders.

## Code scope
- `planning/visual-style.ts`: client-safe strict parser, optional type and model-tool JSON schema; exact six-digit hex colors and serif/sans choice only.
- `planning/types.ts`, `planning/validation.ts`: optional visual contract, source validation, deterministic hash and brief.
- `planning/mockups.ts`: explicit colors and heading fonts override heuristic defaults, only when supplied.
- `planning/chat-tools.ts`: optional tool field and compact planning instruction.
- `StudioReferenceAnalysis.tsx`: extend the existing handoff; no new module, fetch, model call or approval action.
- `planning/visual-continuity.test.ts`: 20 focused cases for validation, backwards compatibility, revision isolation and actual compiler/build-input continuity.
- `e2e/reference-picker/analysis.spec.ts`: exact handoff assertion at desktop/mobile, retaining non-approval checks.
No dependency, SQL migration, server permission, production flag or customer-data change.

## RED/GREEN evidence
1. New continuity cases initially produced 7 failures and 34 passes. Existing validation and mockup files passed. Failures demonstrated that valid structured preferences were rejected or ignored.
2. The strengthened real UI-button tests initially failed at both 1440/390 widths: `suggestedDesign` was absent from the chat payload.
3. After implementation: 116/116 focused cases in 11 files and 18/18 Chromium reference UI cases passed; full web TypeScript passed.
4. The broad test run found one regression from the added planning instructions: Studio system prompt 9222 characters exceeded its unchanged 9000-character budget. Shortened only the new instruction; did not loosen the budget or remove safeguards.
5. Final focused run includes the real chat-route contract: **147/147 tests in 12 files passed**. Full web TypeScript again exited 0.
6. Actual compiled synthetic mockups: **12/12 Chromium render checks** at 390/768/1440 px; exact background/accent/heading font, three page cards, no horizontal overflow, and unchanged visible content after an accent-only edit. Four screenshots saved, desktop/mobile examples visually inspected.

## Broad suite status
Initial full `npm test`, Windows, `CI=true`, two workers: 16735 total; 14928 passed, 948 failed, 859 pending. 141 failed files of 807 reported files. This is not an all-green project result.
Observed causes include unavailable PostgreSQL/test fixtures, stopped owned test containers, missing `/usr/bin/git`/grep and other Unix-oriented tools, path-platform expectations and other assertions. Do not classify every failure as pre-existing or environmental without separate baseline analysis.
The known `mission-brief-v1.test.ts` status-list assertion was reproduced separately: 224 passed, 1 failed. Its test and source are unchanged by this patch.
Web Studio's SQL-backed planning/store/worker suites could not establish their fixture. Pure validation, compiler, analysis and the new continuity tests passed. Thus new data persistence, real Auth/SQL flow and successful model dispatch are not proven by this local pass.
Final full rerun after the prompt-budget fix, same Windows/CI-mode conditions: **16735 total; 14929 passed, 947 failed, 859 pending; exit 1**. 140 failed files. Comparison of assertion identifiers: 1 removed failure (the Studio prompt-size guard), 0 newly failing assertions. All other failing assertions were unchanged between these two runs; this is NOT a clean-baseline proof for the entire patch. The final Studio prompt measured 8985 characters against the existing 9000 limit. No test expectations or thresholds were weakened.

## Reproduction and local evidence
From `apps/web`, use installed packages only:
- `node ../../node_modules/vitest/vitest.mjs run lib/website-build/planning/visual-continuity.test.ts lib/website-build/planning/validation.test.ts lib/website-build/planning/mockups.test.ts lib/website-build/reference-analysis lib/website-build/artifact.test.ts lib/website-build/feedback-interpretation.test.ts lib/qa/atlas-static-conversation-route.test.ts --maxWorkers=2 --minWorkers=1`
- `node ../../node_modules/@playwright/test/cli.js test --config playwright.reference-picker.config.ts`
- `node ../../node_modules/typescript/bin/tsc --noEmit --incremental false`
- `npm test -- --maxWorkers=2 --minWorkers=1 --reporter=json --outputFile <report-path>`

Local evidence directory: `.superpowers/sdd/2026-10-31-web-studio-visual-plan/` (ignored scratch evidence, not automatically published).
Contains preflight, RED logs, targeted/final logs, browser results, compiled fixture HTML, four screenshots, `render-check.mjs`/JSON, TypeScript logs and full-suite JSON/failure summaries.
Browser HTTP/Auth/provider responses are fixtures; markup rendering and the changed UI action are actual code. No paid model output was generated. Static SQL contract inspection is not a database execution test.

## Review and release boundary
A second manual diff review checked strict nested validation, absence of executable styling inputs, legacy semantics, page scope, version/hash changes and unchanged approval boundaries. This was NOT an independent agent review or security audit.
No new branch or PR. No model spend, hosted schema mutation, flag activation, push, merge, public deployment or outreach. Keep the existing branch/worktree; production readiness is not claimed.
Before release: validate the new optional metadata through the owned disposable SQL/Auth environment; investigate broad-suite failures in their supported environment; perform independent review and a separately budgeted real reference-to-build trial. Preserve the existing operator approvals and price/authority gates.
