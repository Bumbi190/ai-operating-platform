# Company industry and owner project continuation — 2026-11-04

## Delivered increment

Same Draft PR386, same owned detached continuation worktree `Temp/hb-sales-slim-20261029`, base `07bbdf038285fd1c44abd6a638f0a8136f5a90ef`. No new branch, worktree or PR.

The existing company search now has four strict reviewed SNI2025 choices: Bilhandlare47.811; Restauranger56.110; Frisörer och barberare96.210; Husbyggare41.000. Official definitions: https://snisok.scb.se/47811, https://snisok.scb.se/56110, https://snisok.scb.se/96210, https://snisok.scb.se/41000. All290 municipalities remain available. The selected category reaches the actual SCB path and filters returned rows, not merely a cosmetic label. Provider bounds remain two5,000-row source pages, five reviewed workplaces per explicit UI page, zero retries, fixed HTTPS origin and existing request/deadline limits. Individual businesses and unsupported legal forms are omitted; the UI now discloses this.

A project selector lists real session-owner projects, independently checked against principal allowedProjectIds and current SSR owner metadata. Generic directory reads are available through existing SCB Preview readiness or existing Sales project availability; this is a separate read-only capability and does not change Sales project allowlist/worker/send settings. Each navigation reloads keyed project UI, with contacts/timing scoped to that project. HB archives, named pilot dialogue and registration exclusions remain HB-only.

Changing branch/geography removes old source results and next-page cursor, with no automatic request. Successful wrong-project responses are rejected. Website links remain existing safe links; there is no website fetching/analysis, lead selection or persistent import in this increment.

## Project gap and honest boundaries

Read-only live project inventory for the HB owner contained seven real projects, no registered standalone Webbuilder/Web Studio project. Customer Demo Motors Preview is not used as a substitute. No project was created and no identity guessed. The interface displays the missing Webbuilder binding. A future registration needs the real project identity; lead persistence/offer/sender activation remain separate.

History, offers and source notes belong to the selected project. Global owner stop aggregation is not implemented here and is visibly marked unknown; an empty selected-project history is never cross-project clearance. The new read-only directory does not introduce outreach authorization.

Authenticated local-browser claim still fails HTTP401. Therefore a successful live SCB lookup and live owner SSR interaction in the new Preview are **not verified**. No session cookies, passwords or key values were extracted. Local production env presence was checked as booleans only; no SCB key/preview flag existed there, so it was not used as a fallback. Automated tests use synthetic source/mail/project data.

## Verification evidence

- RED:7 new behavioral assertions failed, plus missing project-module suite. Existing62 tests passed. Industry raw-client request mapping and HB cross-context regression observed failing before implementation.
- GREEN:77 focused tests (72 company model/API/query/source/project tests +5 real server-wiring tests).
- Final regression command:179/179 tests pass in12 files, exit0, including existing Discovery API/schema, SCB probe/status policy and Sales contract/view model. Earlier exploratory timing integration file was skipped because its isolated DB fixture was absent; no database integration success is claimed.
- UI RED:4/4 new desktop/mobile category/project cases failed before UI changes. Final Playwright run:18/18 pass, exit0. Covers industry selection, explicit pagination, reset on category/municipality changes, real-route project navigation, successful wrong-project response rejection, empty/error/no-auto-retry states, safe URLs and no unintended writes.
- Final TypeScript noEmit passes, exit0, including server-wiring tests. Whitespace check passes.
- Mobile synthetic screenshot inspected visually; no horizontal overflow in browser assertion. Desktop interactions also pass.
- One fresh independent review inspected current auth/isolation, scope/feature flags, provider/validation, SCB client/source/status/readiness and new code/tests. No important security/correctness finding. Reviewer did not run tests or verify live source independently.
- Prior broad Windows suite failures remain as documented in the company-view report. They were not represented as passing or rerun without cause. PR remains Draft; no merge-ready/full-suite/production claim.

Evidence is on Hultgren under `Temp/harvey-resume-20261101/company-industries-*`: red/green/regression/type/browser logs, source sync payloads and screenshots. Repository preflight `HARVEY-COMPANY-MULTIBRANCH-20261104` returned review_required due generic metadata overlap with creative read-only PRs; actual current PR/file ownership selects reuse of386. No new branch was created.

## Scope

No customer mail, contacts/history writes, campaign activation, schedule/worker/timing change, new key/provider subscription, production SQL, environment change, main merge or production release. Same PR fast-forward and Git-driven Preview only. Existing pilot offers are unchanged.

## Next

1. Verify an explicit real source query and second page with the owner in Preview once browser control is available.
2. Register/bind the actual Webbuilder project without guessing a demo project's identity.
3. Add separate project-scoped website evidence/lead selection and global-owner prevention-only stop hints, with source freshness and ambiguity retained.
