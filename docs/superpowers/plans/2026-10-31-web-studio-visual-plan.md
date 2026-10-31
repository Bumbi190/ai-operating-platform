# Web Studio visual-plan continuity

> **For agentic workers:** Use superpowers:executing-plans; follow RED/GREEN and one final review. Continue existing PR #368; no new branch.

**Goal:** Preserve the chosen reference palette and typography through planning, saved mockups and the approved build input, instead of silently falling back to keyword-based defaults.
**Architecture:** Add optional bounded `design.visual` data to the existing versioned PlanContent. Reuse the static compiler, immutable plan/mockup hashes and current operator approvals. Absence of this field preserves legacy plan semantics and rendering. No raw model HTML, CSS, URLs or executable code enters this field.
**Tech Stack:** Existing TypeScript, Vitest, React and Playwright; no new dependencies.
**Spec:** C:\Users\Andre\Projects\Omnira\Docs\OMNIRA_WEB_STUDIO_MASTERPLAN_V05_2026-10-30.md, sections 2.1–2.3, 3.1 and 17; owner's accepted build-review-change workflow.

## Scope and approach
An explicit optional structure is preferable to extracting CSS/color names from free text, because it can be validated, hashed and rendered deterministically. Importing an unrelated design toolkit or enabling live inference is outside this change.
`design.visual = {palette: {background, foreground, accent}, font: 'serif' | 'sans'}`. Colors are exact six-digit hexadecimal strings. No new authority or automatic approval. Three distinct layout alternatives remain available.
The existing reference handoff sends this as a suggested design in ordinary planning chat. Its creation is not an approval. The model must save a plan, and the user must review the actual rendered mockup as before.

## Global constraints
- Reuse clean isolated worktree `atlas-builder-references-20261017`, baseline 6404ec2; retain the real preflight receipt.
- No new dependencies, API calls to models, SQL/schema activation, production flags, deployment, outreach or customer data.
- Never alter existing persisted revisions or their hashes. Old plans without visual data must serialize and render unchanged.
- Validate every new nested field. Support only fixed fonts and literal colors. Changed visual choices must produce new plan/mockup hashes.
- Mockups remain static layout concepts with placeholders, not generated image/3D assets.
- No local Docker stack: use pure contract/compiler tests and browser fixtures. Report unavailable SQL/full-suite coverage precisely.

## Review focus
1. Missing, null, malformed or unknown visual fields fail closed without granting authority.
2. CSS/URL injection through color/font values is refused.
3. Optional omission does not alter old plan hashes or mockup bytes.
4. A color-only revision preserves page scope, text and the previous version.
5. Reference handoff carries exact choices but never approves or starts a build.

### Task 1 — validated visual preferences and planning integration
**Files:** planning/types.ts, planning/validation.ts, planning/visual-style.ts, planning/chat-tools.ts; tests in planning/visual-continuity.test.ts.
**Interfaces:** parseWebsiteVisualStyle(unknown) returns bounded WebsiteVisualStyle; validatePlanContent accepts optional design.visual; compileStaticBrief includes exact approved visual choices.
- [x] Write tests for valid persistence, invalid nested input, deterministic hash changes and unchanged legacy plans.
- [x] Run targeted tests and observe the missing-feature failures.
- [x] Add the optional type, strict parser, plan validation, brief and model tool schema.
- [x] Re-run the target tests and existing plan validation tests.

### Task 2 — render and hand off the selected style
**Files:** planning/mockups.ts, components/website-build/StudioReferenceAnalysis.tsx; tests in planning/visual-continuity.test.ts and e2e/reference-picker/analysis.spec.ts.
**Interfaces:** createWebsiteMockups consumes validated optional visual data; existing UI handoff emits plain planning text with suggestedDesign and existing source identifiers, no approval.
- [x] First reproduce default colors/fonts ignoring supplied choices; add handoff data tests.
- [x] Apply literals and fixed font selection to the existing three layouts; include validated suggestedDesign in the existing UI action.
- [x] Test actual compiler output, exact mockup hash validation and build input; prove color edits preserve unrelated content and old snapshots.
- [x] Render the actual generated documents in Chromium at 390/768/1440 widths; inspect screenshots and CSS values. This is a fixture test, not paid model quality proof.

### Task 3 — verification and evidence
- [x] Run affected contract/compiler suites, TypeScript and available browser regressions.
- [x] Run the existing full test command with limited concurrency; retain/report failures rather than weakening tests. Do not classify all failures as pre-existing without baseline evidence.
- [x] Perform a second manual review (not independent-agent review unless an actual independent reviewer is available), inspect diff and git status.
- [ ] Record exact commands/results and local commit; do not push, merge or deploy without separate authority.

## Execution ledger
Preflight: reuse_existing / explicit_existing_pr, `.superpowers/sdd/2026-10-31-web-studio-visual-plan/preflight.json`.
Shared interface: parser output is consumed by plan validation, mockup rendering and reference handoff. Type/schema/brief must agree.
Ruling: This is a reversible completion of the approved design continuity requirement, not a new visual redesign; retain existing layout choices and no additional design approval is inferred.

### Verified implementation results
- RED: 7 missing-feature failures / 34 passing tests; existing validation and mockup suites stayed green. UI RED at both widths: expected suggestedDesign, received undefined.
- GREEN: 116/116 tests in 11 files, 18/18 existing reference-picker Chromium tests (including both strengthened handoff cases), full web TypeScript exit 0.
- Actual compiled synthetic mockups checked at 390/768/1440 px: 12/12 renders retained exact palette, heading font, three page cards and no horizontal overflow; color-only edit preserved visible text. Four screenshots inspected. Not model-generated visual quality evidence.
- Test correction: console output initially disguised an existing em dash as a hyphen; updated only that assertion to the actual brief contract.
- Simplification ruling: keep the two-line style handoff in the existing UI action instead of adding a separate helper/module. The browser regression tests the real button and chat payload; the shared strict parser handles validation.
- Manual second-pass review checked backward compatibility, source-vs-approval boundaries, nested CSS/URL rejection, unchanged page scope, hashed revisions and read-only local SQL definitions. This is not independent reviewer or penetration-test evidence.
- Full npm test was invoked at low concurrency; its result is recorded in the verification report. Windows warnings report unavailable Unix commands and a missing historic Git ref; do not infer full-suite success from the focused checks.
- No new dependencies, migration, model call, live flag, public URL, repository push, merge or production mutation.

### Final broad verification and correction
The first full run caught a new Studio prompt-length regression (9222 > 9000). Reduced only the added instruction; all 31 chat-route cases now pass, with 8985 Studio characters. Final focused total: 147/147 in 12 files; full web TypeScript exit 0.
Repeated full npm test after correction: 14929 passed, 947 failed, 859 pending / 16735 total. One fewer failing assertion and no newly failing assertions between the two full runs. SQL/Auth fixture and platform-specific checks remain unavailable/red; no release/merge readiness claim. The detailed report is docs/verification/2026-10-31-web-studio-visual-plan.md.
