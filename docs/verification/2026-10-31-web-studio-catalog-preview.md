# Web Studio catalog capability and dealership functional preview

Date: 2026-10-31. Existing worktree/PR368; baseline a5b0e39d718103621cbf88c5b7d4f8e20106edc7. Local implementation only, no new push, paid inference or production activation.
Spec: Notion Web Studio v0.6, 40a7b977c5b88101aae3c22c8c78b714, especially F01/F03/F04/F05/F06.

## Implemented reusable behavior
Added a declarative `filter` variant to the existing static-website.v1 contract. The production compiler validates exact field names, single native select, explicit finite category values and target IDs, separate text-only count/empty elements, no nested controls/targets and no conflicting writers to the same targets. The owned runtime uses getElementById/getAttribute, hidden and textContent; it executes no model-supplied code and adds no network or storage capability. CSP and iframe privileges were not widened.
The existing model output contract describes this capability for future governed builds. One categorical filter per collection is supported; multi-criteria search, sorting, arbitrary code and remote inventory are outside this implementation.

## Visible acceptance prototype
A test-only Demo Motors package contains eight explicitly fictional vehicle records, a filter with count/empty/reset states, native details, and per-vehicle test inquiry panels with a read-only vehicle value. Form submissions are prevented by the existing runtime; no success/delivery claim is displayed. The same original low-poly concept illustration is used throughout with a visible disclosure. It is not an accurate image of eight different vehicles, final approved design, interactivity in 3D or paid model-generated output.
The prototype passes through the actual production compiler, CSP, runtime and opaque iframe renderer. It is not a separate React customer website. The fixture still supplies authored input: autonomous end-to-end Atlas generation is NOT established by this prototype.

## Fresh verification
- RED: two positive catalog cases failed INVALID_BEHAVIOR before implementation; all existing artifact tests remained green. Negative input tests were already rejected by the old contract.
- GREEN: **174/174 targeted tests in 13 files**, including 27 new catalog validation cases, existing artifact/compiler/reference/planning tests and actual chat-route contract tests with provider boundaries mocked.
- **7/7 real Chromium acceptance tests**: 390/768/1440 viewports, native keyboard choice, count/empty/all states, preserved focus, correct vehicle in each test form, no request on submit, preselected category, independent collections, blocked parent/cookie/network access, disk export and content preserved under an accent-only revision.
- **18/18 existing reference UI browser cases passed**.
- Full web TypeScript **exit 0**, including a final pass after the harness startup correction.
- Existing workflow parsed successfully with installed js-yaml; new pure/browser tests are added to its existing Studio job for future pushes. CI itself was NOT run on this local change.
- Desktop/mobile screenshots from the real compiled pages were visually inspected. No horizontal overflow at the three tested widths. This is not physical-device testing or a complete accessibility/performance audit.
- Broad `npm test -- --bail=1 --maxWorkers=1 --minWorkers=1`: exit 1 at unchanged `lib/qa/mission-brief-v1.test.ts:384` status-list assertion; 2 passed, 1 failed before bail. No whole-repo green claim.

## Corrections during verification
1. The CSP assertion expected raw quotes while the existing serializer correctly emits HTML entities. Corrected the test expectation; policy not changed.
2. The local TypeScript test server initially used top-level await in this CommonJS package. Replaced only harness ZIP startup with a Promise continuation; browser tests then ran and passed.
3. A workflow syntax check attempted unavailable yaml; reran successfully using already installed js-yaml. No dependency installed.

## Reproduction
From apps/web:
- `node ../../node_modules/vitest/vitest.mjs run lib/website-build/catalog-filter.test.ts lib/website-build/artifact.test.ts lib/website-build/planning/visual-continuity.test.ts lib/website-build/planning/validation.test.ts lib/website-build/planning/mockups.test.ts lib/website-build/reference-analysis lib/website-build/feedback-interpretation.test.ts lib/qa/atlas-static-conversation-route.test.ts --maxWorkers=1 --minWorkers=1`
- `node ../../node_modules/@playwright/test/cli.js test --config playwright.website-catalog.config.ts`
- `node ../../node_modules/@playwright/test/cli.js test --config playwright.reference-picker.config.ts`
- `node ../../node_modules/typescript/bin/tsc --noEmit --incremental false`
Evidence: `.superpowers/sdd/2026-10-31-web-studio-catalog-preview/`: preflight, RED/GREEN/regression/browser logs, screenshots, compiled original/edited HTML, ZIP and artifact JSON. Original exported index SHA-256: 0c1b5ab30beb5e16d980f350e93f1e1b25c63001b1fbf218eacdc7281916959f. ZIP 22258 bytes; standalone HTML 177655 bytes. No external asset/font dependencies.

## Review and remaining gaps
Second manual diff review covered bounded filter data, DOM element ownership, output escaping, unchanged CSP, no executable model payload, native form denial and legacy interactions. This is not an independent review or security certification. The older auth CI receipt applies to a5b0e39, not this new change.
F04 is implemented in the static builder and tested locally. F01/F03/F05/F06 have acceptance-fixture evidence, not full customer delivery signoff. F02 final art direction, F07 premium cinematic/3D, F08 real chat/model generation for this dealer site, F09 complete product rollback UI, F10 production accounting and F11/F12 customer editing/release remain separately incomplete. No new model budget, permission, hosted schema, public URL, Handlarbörsen data, lead job or outreach was used.
