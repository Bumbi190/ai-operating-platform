# The Prompt — remove unused Hermes trends call from Step 1 (2026-10-23)

**Scope:** non-generating reliability correction to the existing The Prompt Step1 route. This is NOT a new trend engine, not a change to publication schedules, and not authorization for video generation, old-content recovery or extra API credits.

## Verified defect

A read-only examination of `apps/web/app/api/media/cron/step1/route.ts` found the news pipeline dispatched `callHermesTrends(7_000)` in parallel with `runNewsHunter(..., 5, [])`. The trend response was only written to a local `trendingTopics` array and printed to logs; it was never passed to News Hunter or the script writer after the wait.

- A 7-second Hermes timeout therefore **could not affect source selection**, yet it could delay Step1 and emitted `[hermes] /trends error: TimeoutError` to Vercel's error monitor.
- The Hermes trends client documents a typical 15–20-second multi-site scraping task, longer than the seven-second Step1 deadline.
- In contrast, optional **Hermes article reading**, **Hermes news scraping**, weekly **competitor intelligence** and the existing single cost-governed News Hunter run do participate in the editorial pipeline; this change leaves all of them unchanged.
- The old implementation deliberately avoided rerunning News Hunter with late trend context because that doubled AI costs and caused Step1 to exceed its 60-second budget. No extra hunt is introduced here.

## Minimal fix

Remove the unused `/trends` fetch from Step1 and wait only for the single original `runNewsHunter` result. Preserve existing request authorization, same project ID, `maxCandidates=5`, empty trend context (the actual behavior already shipped), rejection handling, persistence, review/quality gate and all next-stage schedules.

Do **not** represent this as improved trend-informed selection: real evidence-backed trends remain a **future feature** tracked in [issue #527](https://github.com/Bumbi190/ai-operating-platform/issues/527). The preferred later architecture is a separate prefetch or source-provenanced, bounded-age per-project cache. It must only label data as current when the source timestamp supports it, and it must not add paid/news job retries.

## Tests and rollout

A failing-first regression on `lib/qa/news-hunter-persistence-contract.test.ts` proved the old Step1 invoked `callHermesTrends(7000)` despite reaching the duplicate/no-work path; after the fix the suite passed. The combined related News Hunter/media text suites initially passed **32/32** using a linked test dependency directory; full TypeScript and independent review will be recorded at release.

No new production cron, project schema, permissions, tokens, provider charges, video creation or publication operations are required. After merge, verify the next normal Step1 runs successfully and produces no `[hermes] /trends` timeout warning; do not manually replay missed publication windows to test.

**Related:** [#527](https://github.com/Bumbi190/ai-operating-platform/issues/527), [#518](https://github.com/Bumbi190/ai-operating-platform/issues/518) and [#516](https://github.com/Bumbi190/ai-operating-platform/issues/516).
