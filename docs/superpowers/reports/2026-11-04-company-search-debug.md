# Company-search debugging before further features — 2026-11-04

## Findings and correction

Owner requested current-step debugging rather than further feature work. Base b30a6b3b7bcd48a68f34ab5b23e7cd77ea8344c8; same Draft PR386 and owned detached worktree. Read-only preflight HARVEY-COMPANY-DEBUG-20261104 returned reuse_existing.

Confirmed defect: companies/source.ts required a safe, nonempty optional AE workplace name (`ben`) before legal-entity review. Thus valid orgnr+CFAR workplaces disappeared even though their JE legal name could establish the supported company identity. The public SCB OpenAPI AE partial schema makes ben optional; see official contract receipt in prior local-coverage report. Independently inspected dated legal-only export `Temp/hb-scb-paged-diverse-20261027-133145/preview-manual-review-only.csv`:47 rows,47 blank workplaceName, zero blank legalName. Local legal company rows were present without workplace names. This is historical supporting evidence, not current live SCB counts or a promise of the number of new matches.

Workplaces now reach legal review with valid municipality, primary SNI, legal orgnr and CFAR even when optional branch text is absent/unsafe. Safe JE legal name, matching reviewed orgnr and supported legal form are still mandatory. Optional unsafe names serialize as empty, never fall back to company identity. Separate CFARs remain separate; repeated same CFAR/orgnr deduplicates, conflicting ownership is omitted.

Generic Bilhandlare now matches exact SNI2025 retail47.811 and wholesale46.711, excluding repair/unrelated branches. Official definitions checked at https://snisok.scb.se/47811 and https://snisok.scb.se/46711. Other three categories unchanged. No speculative old-SNI compatibility or fuzzy expansion.

Response includes aggregate-only diagnostics for relevant rows/exclusions, duplicate rows, conflicting workplaces, eligible unnamed workplaces and current-page review/return counts. No rejected identifiers/names are serialized. UI shows these under Så räknades sökresultatet, explains differing units for conflicts, shows an explicit unrun-query state and a completed empty-page message without claiming no companies in the municipality. Missing optional workplace names are explicit on cards; CFAR remains visible. Query reset, manual submit, pagination, no retry and separate saved-record filters are preserved.

## Verification

- Source regression RED:9 failures,22 passes before implementation. GREEN:31/31 afterward, including raw HTTP absent/null/empty/unsafe ben, missing JE name, unsupported/mismatched identity, exact two-code dealer inclusion, repair rejection and aggregate/privacy accounting.
- Final focused regression:250/250 across15 company, Discovery, SCB probe/status, Lead Finder and Sales contract/view-model suites; exit0.
- Playwright:22/22 desktop/mobile fixture cases pass; exit0. Covers query changes, missing names/CFAR, diagnostics, zero pages, source errors/no retry, next-page behavior, owner response isolation and mobile overflow.
- TypeScript noEmit:exit0. Whitespace validation performed before commit. Independent static reviewer approved the specified delta with no actionable correctness/security/privacy/state/pagination findings; reviewer did not independently execute tests or live browser.
- Mobile diagnostics/empty-page screenshot visually inspected: readable labels and controls, no horizontal overflow.
- Test source/project data is synthetic. No real keyed SCB request was performed by this debug run. Earlier broad Windows-suite failures remain documented in the prior company-view report; no full-repository green claim.

Evidence: `Temp/harvey-resume-20261101/company-debug-{red,green,regression,tsc,playwright}.log` and `company-debug-browser` screenshot/trace directory on Hultgren.

## Live verification boundary

Authenticated browser page observation was explicitly denied by browser security policy in this session. No alternate browser/CDP/session/credential route was used to work around it. Dated connector/source export reads and synthetic local browser tests are independent code diagnostics, not a replacement for authenticated Preview + current SCB live verification. Owner screenshot demonstrates prior-version rendering only. The new build can be checked as READY and exact-head CI verified separately; current live source counts and the fully signed-in workflow remain unverified.

Existing fixed SCB origin, server-only key, Preview gate, two5000-row source pages, five reviewed workplaces/UI page, deadlines and zero retries unchanged. No contacts/history/SQL/environment/worker/send changes, customer messages, new provider/key/cost, main merge or production release. Website analysis/lead saving and later feature expansion remain paused until this current-step live check is complete.
