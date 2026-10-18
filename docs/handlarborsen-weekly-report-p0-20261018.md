# Handlarbörsen weekly report P0 — saved evidence view

## Behavior
Both existing owner and organization competitor views now include Atlas / Veckounderlag above the manual check. It reuses the same already-authorized history prop, with no extra database query or authorization path.

The current Stockholm calendar week shows:
- dated title comparisons and fixed official source links;
- missing, failed and first-baseline checks as distinct unknown states;
- a bounded interpretation plus at most three evidence-backed review suggestions, never automatic product actions.

The 12 actually persisted observations observed read-only on2026-10-18 contain five unchanged successful title pairs from15/17October and two failed BCA checks. Titles alone do not verify prices, offers, functions or social performance. P0 deliberately presents a title-metadata report rather than inventing richer facts or commercial improvements. Earlier curated news and its publication date are not presented as discoveries this week.

## Evidence contract
Input is revalidated using existing history validation; comparisons and aggregates are recomputed. Periods are Monday dates in Europe/Stockholm, including DST/year boundaries; the displayed interval ends on Sunday. A prior-week baseline may be compared, but both check dates are shown and the actual event time is explicitly unknown.

A failed intervening check is not bridged. An earlier dated change remains evidence even when the latest check failed; current source coverage remains unknown. No-data/failure does not turn into zero changes. Suggestions are deterministic, deduplicated by source and capped at three. All proposal/report executionAllowed values are false, and automaticActive is false. Source titles are rendered as escaped React text and links come only from the fixed official catalogue.

## Scope
No route, service, schema, database privilege, account, journal flag, scheduler, collector, notification, paid API, search or external source call was added. The report is a read projection at page-render time, not a persisted/completed watch run or archived weekly report. Existing human-triggered scan/save controls remain separate.

The P1 journal schema remains installed, empty and disabled as before. Human recovery, evidence beyond title metadata, strict canonical stop/spend/request dispatch, approved sources, project budget and schedule/activation gates remain before autonomous weekly operation. Monthly discovery and own-social integrations remain separate increments.

## Validation
-30 new tests; initial missing-module RED then GREEN. An observed-date disclosure regression was RED before the date wording fix.
-667 targeted tests passed across48 suites;51 older environment-gated SQL fixture tests skipped. No full historical suite claim.
-TypeScript noEmit passed on the isolated branch.
-Real-component Chromium fixture passed1440/1024/390/360/320px, source/evidence disclosures, links, long title wrapping, empty/unavailable/disabled/gap states; no browser errors, external requests or production writes. Receipt: docs/verification/2026-10-18-hb-weekly-report-browser.json. Screenshots inspected; this is not an authenticated production owner/Oscar acceptance test.
-Independent code/security review: no Critical/Important findings. Minor escaping-proof gap addressed by adding a valid entity-like/quoted/ampersand title test; behavior already correctly escaped.
-A path-scoped DB-free CI job runs the22 core and8 rendering assertions with anti-skip floors. Existing mandatory workflows remain unchanged.

Release CI, exact-head Preview/production and live post-release checks are recorded in the PR body and Notion after completion.
