# Company municipality coverage correction — 2026-11-04

User screenshots showed one saved name match for Hässleholm/Kristianstad and a six-city municipal menu. These were saved journal records, not all local dealers. The SCB view had incorrectly reused the legacy coordinate discovery allowlist.

## Change and acceptance
- All 290 official SCB 2026 municipalities are available through a name input with native suggestions. Hässleholm 1293 and Kristianstad 1290 are verified.
- A separate strict read-only query uses municipalityCode, car_dealer, limit5; no invented code, radius, URL, mixed legacy field or other branch is accepted. Legacy six-city query clients remain compatible.
- The generic discovery mutation schema, its coordinate allowlist and persisted queries are unchanged. Municipal queries cannot run through the Overpass reserve.
- Search requires an explicit click; next page retains the submitted query. No save/contact/outreach operation is introduced.
- A municipality name typed into the saved-name filter now gets a prominent notice that the matches are saved records, not all area dealers.
- The source still covers the qualified SCB SNI47.811 workplace subset, with five reviewed identities per page. Availability of all municipalities is not complete dealer-market coverage. Existing fetching caps, identity skips and separate branch/history handling remain.
- No customer mail, contact edit, worker, flag, timing, key, cost or production change.

## Provenance
SCB 2026 code list, retrieved 2026-11-04:
https://www.scb.se/hitta-statistik/regional-statistik-och-kartor/regionala-indelningar/lan-och-kommuner/lan-och-kommuner-i-kodnummerordning/
Read-only extraction asserted exactly290 distinct codes and preserved leading zeroes. The generated static catalogue is committed in municipalities.ts.

## Verification
- RED: Hässleholm/Kristianstad query regression rejected INVALID_BODY on unchanged d4a6dfb.
- GREEN: 62 focused unit/API/source tests across4files.
- 12 desktop/mobile Playwright cases pass, including the screenshot reproduction, full municipal inputs, explicit requests and invalid names blocked.
- Final TypeScript noEmit passes. Final changed query/API suites rerun19/19 after type narrowing fix.
- Two additional screenshot capture runs pass; mobile fixture screenshot visually inspected.
- Fresh independent static review found no critical/important issue; its lack of full local dependencies is explicit.
- Browser plugin can list the user's current Preview tab but controlling it still returns HTTP401. No authenticated live SCB query is claimed. No credentials, cookies or keys were extracted.
- Earlier broad Windows suite failures remain separately documented; current targeted tests do not make the full suite green.

Same owned detached worktree and Draft PR386. Read-only preflight receipt company-municipalities-preflight-20261104.json returned review_required for the original local branch worktree. The clean owned continuation and matching PR head were verified; no new branch/worktree/PR created and no other worktree changed.
