# Company municipality-first source correction — 2026-11-04

## Trigger and root cause

Owner screenshot shows a successful restaurant query for Hässleholm in the prior e5b2b39 UI, a truncation warning and two cards with the same legal company name. This is user-observed evidence, not independent authenticated browser/source verification. No claim is made that those exact two live rows are duplicates or verified distinct workplaces.

The company adapter fetched the first two nationwide industry pages and only then filtered municipality. For a populous industry this truncates the municipal population before local matching. No local total or full market coverage can be inferred from that subset.

## Correction

The company adapter now fetches `/v1/arbetsstallen/kommun/{kommunKod}` then applies the same exact primary SNI, municipality and legal-identity filters. Existing SCB v1 official contract has this municipality endpoint with the same `aePartialDataCollectionResponseData` schema as industry lists. Current public documentation was checked and the exact schema fetched without credentials from https://apiafr.scb.se/swagger/v1/swagger.json, discovered from official Scalar UI https://apiafr.scb.se/scalar/ linked by https://www.scb.se/vara-tjanster/bestall-data-och-statistik/foretagsregistret/avgiftsfria-uppgifter-i-foretagsregistret/. SHA256 of fetched OpenAPI: `e277224de8d504c94010ed026d2e28d84e23c92aba75e9010ef871efeaa8a5da`. Endpoint and schema evidence saved in `Temp/harvey-resume-20261101/coverage-scb-official-contract.json`.

A narrow municipal factory shares the existing guarded HTTP transport. Old industry/legal-entity list callers retain their existing paths. Fixed credential origin, no-store, redirect denial, per-request/whole-search timeout, zero retries, at most two source pages of5000 rows and five reviewed identities per UI page remain unchanged. No invented additional API query parameters. Official municipality validation stays at company API boundary; client validates four-digit path codes.

Cards expose workplace name and CFAR directly. Separate workplaces are not merged by legal company name/orgnr; repeated identical CFAR still deduplicates and conflicting CFAR ownership is omitted. `sourceScope:municipality` and municipalityCode identify the sampled population. UI distinguishes read municipal workplaces from branch-filtered eligible matches, and still marks truncation if the municipality itself exceeds source limits. Privacy/legal-form omissions and primary-industry-only limitations remain visible. The housebuilder-specific explanation no longer appears for restaurants.

## Verification

- Source RED:6 failures including old raw path assertions, second-municipal-page restaurant regression and scope/cap metadata. UI RED:2 failures for visible distinct workplaces.
- Source/shared-client qualification:82/82 tests across4 files, including10 new municipal client guard/legacy compatibility tests.
- Final regression:241/241 across15 company, Discovery, SCB client/probe/status, Lead Finder and Sales contract/view-model suites, exit0.
- Final browser:20/20 desktop/mobile cases, exit0. New case exposes branch/CFAR/source scope. Mobile screenshot visually inspected.
- Final TypeScript noEmit exit0; whitespace check clean. Synthetic source/project data only in tests. No real keyed SCB lookup was performed by this run.
- One independent code reviewer inspected this increment, shared transport and new tests; no important errors or regressions found. Reviewer ran no tests. Earlier broad Windows suite failures remain documented separately; full repository suite was not rerun or claimed green.

## Boundaries and remaining work

Same Draft PR386, same owned detached worktree `Temp/hb-sales-slim-20261029`, base e5b2b39; no new branch/worktree/PR. Read-only preflight is `HARVEY-COMPANY-LOCAL-COVERAGE-20261104`; generic metadata overlap is manually resolved to existing company/SCB owner PR386.

No customer message, contact/history mutation, SQL apply, source subscription, key/environment change, worker/send/timing/schedule change, main merge or production release. Current same-origin SCB Preview authorization is reused. Live authenticated query of the corrected version still needs observation; user's screenshot verifies only the prior version's rendered result.

Website evidence/analysis, persistent candidate saving, real Webbuilder project registration and shared owner stop overview remain subsequent work. This increment corrects local search foundation and workplace identity before those features depend on it. Even a nontruncated municipal population is not all companies in the area: primary industry and supported legal-identity subset remain limits.
