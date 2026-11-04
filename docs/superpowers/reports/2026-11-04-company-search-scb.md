# Company search correction — 2026-11-04

The prior company Preview incorrectly required the unconfigured Overpass reserve even though the owner had already approved and configured SCB in Preview. This correction uses the existing SCB key/flag without changing environment variables, workers, timing, send flags or production.

- SCB is primary when the existing Preview gate is available. An explicitly configured Overpass source remains a reserve; SCB failures never silently fall back.
- Municipality search for registered car retail (SNI 47.811); no claim of full dealer coverage or a radius for SCB.
- The existing fixed-origin SCB client reads at most two 5,000-row pages. Five workplace identities are reviewed per explicit page request, with CFAR branches preserved. People, conflicting identities and unsupported legal forms are omitted. Limits and omissions are visible.
- Legal entity lookup, no-store, bounded timeouts, no retries. No contacts are saved and no outreach capability is introduced.
- Positive registration/suppression/exclusion stops propagate through exact organization numbers. Contact history remains separate and unknown history is never permission.
- The new search appears above saved records. The saved name/address filter is labeled separately.

Validation on Hultgren:
- 50 focused unit/API/source tests pass, including the default SCB client with raw HTTP fixtures and cursor pagination.
- 10 Playwright cases pass across desktop and mobile, including explicit SCB search and next page.
- TypeScript noEmit passed before final stop-propagation delta; final check recorded in handoff.
- Independent fresh review found an exact-orgnr stop propagation issue; corrected and reviewed again with no further important findings.
- Real authenticated browser control currently returns HTTP 401 while tab listing works. No cookies, keys or passwords were extracted. A successful live SCB query in the new Preview is not yet verified.
- Earlier broad Windows suite failures are not represented as passing by these focused checks.

Scope: same Draft PR #386, no main merge or production release. No customer mail, contact mutation, automation or scheduling.
