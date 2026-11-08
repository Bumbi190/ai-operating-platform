# Web Studio catalog interaction and dealership functional preview

Spec: Notion Web Studio v0.6, page 40a7b977c5b88101aae3c22c8c78b714, F01/F03/F04/F05/F06; approved ongoing implementation. Baseline a5b0e39. Same owned PR368 worktree. No new package, model call, production schema/flag, deployment or push is authorized by this local slice.

## Design and scope
The current static compiler allows only toggle/tabs/accordion and denies model JavaScript. Implement a reusable declarative `filter` behavior for a finite static catalog, not a dealership-specific executable script. A native labelled single-select filters explicit target IDs by one bounded data attribute; `*` means all. A count and empty-result message update accessibly. No requests, selectors, expressions, storage, prices-from-APIs or model code.
Use eight fictional cars in an explicit local test/demo package compiled by the real production compiler and displayed in its real sandbox preview. Detail and interest sections reuse existing native details and declared toggles with read-only vehicle values. No message is sent. This is a functional acceptance prototype, not final approved art direction or proof of autonomous AI generation.

Alternatives considered: custom JavaScript per demo violates current runtime boundary; separate React dealership bypasses the builder we must prove; a declarative compiler/runtime extension preserves the existing architecture. Implementation choice: one categorical selector per collection first; no multi-filter/query builder, full 3D, new picture generation or paid model run.

## Tasks and RED/GREEN gates
1. Add compiler tests: valid exact configuration; selector/tag/attribute/value bounds; missing IDs; duplicate/overlapping targets; count/empty overlap; nested controls; unknown execution fields denied. Observe missing filter capability fail before implementation.
2. Extend the type union, compiler validation, owned runtime and output instructions. Keep legacy toggle/tab semantics and CSP unchanged. Native select change/input applies a deterministic filter; no arbitrary selector/innerHTML. Initial render respects selected option. Distinct catalogs must not interfere.
3. Test/demo fixture renders eight fictional records using existing styling/behaviors and no customer facts. Reuse an existing original local car render only when available and clearly labelled as an illustration, otherwise show an explicit placeholder. Visual theme remains provisional. Build artifact and downloadable local package via the compiler, not a separate app.
4. Real Chromium tests: desktop/mobile/keyboard filters, count/empty/reset, two catalogs, details->correct selected car, no network/form delivery, exported file behavior, unchanged content under color revision, unchanged opaque preview isolation. Capture and inspect actual screenshots.
5. Run existing artifact/reference/provider/route regressions and TypeScript; broad npm test with bail records known failures without loosening expectations. Manual second-pass code review; local commit, evidence and Notion/handoff update. No claim of paid AI or full auth E2E for this demo.

## Safety and acceptance
- All target/control/status IDs exist and are role-compatible. Filter values are literal bounded tokens; no URLs or JavaScript. Select is single-choice with wildcard option. An independent collection cannot share writable IDs. Controls/status must remain outside filtered cards.
- Existing approved plan, revision/hash, price/permission and publication gates remain untouched. Current output format stays static-website.v1; new runtime behavior is explicit in generated contract, older stored artifacts remain viewable.
- F07 premium 3D/cinematic assets and F08 real model chat changes remain separately unproved. The functional preview cannot be advertised as a finished sales site.

## Ledger
Preflight: existing branch reuse receipt in .superpowers/sdd/2026-10-31-web-studio-catalog-preview/preflight.json. User-facing purpose: make the first dealer demo actually filter and inspect cars without hand-coding a separate production website.

### Implementation and review ledger
- RED: two new positive filter cases failed INVALID_BEHAVIOR; existing artifact cases remained green. New validation/runtime was added only after this observation.
- Initial assertion checked literal CSP quotes, but output correctly HTML-escapes them. Corrected the assertion to the existing serialized contract; no CSP changes.
- Browser harness first failed because the existing package compiles TypeScript to CommonJS and top-level await was unsupported. Changed only harness ZIP startup to a Promise continuation; no compiler/runtime relaxation.
- Functional demo uses a labelled original low-poly Blender still (documented hash), not new generated or borrowed product imagery. It is explicitly NOT final approved premium design and NOT live AI-generated output.
- 174 focused tests passed; seven catalog Chromium acceptance cases and 18 existing reference UI cases passed. Full web TypeScript passed before the harness-only startup adjustment; a final run follows.
- Ruling: add the new pure catalog tests and browser fixture to the existing Studio CI job so this capability is not left untested on future pushes. No new workflow, credentials, services, permissions, deployment or actual CI run is introduced in this local step.
- Broad npm test with bail=1 remains red at unchanged mission-brief-v1.test.ts:384, 2 passed/1 failed before bail. Do not describe the repo as fully green.
