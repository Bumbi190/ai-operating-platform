# The Prompt: authenticated read-only film preparation in the app

André approved this bounded app integration at 09:23 Stockholm on 19 October 2026. The channel plan, existing illustration style and earlier preparation adapter were already approved.

## Result

A compact **Kontrollera filmunderlag** button sits alongside a saved The Prompt video draft. The ordinary Omnira session invokes a protected POST read operation. Only project/post/revision/SHA are accepted; the server selects the committed reviewed 79-word pilot brief. The real preparation adapter reads current content and plan, checks actual ownership/stops/current approval/exact manuscript and link, then reads and checks again.

The collapsible result shows checked version/time, source status and six concrete remaining steps. It is transient and always denies generation/publication: `persisted:false`, `jobId:null`, `canGenerate:false`, `canPublish:false`. Source metadata remains `operator_supplied_not_verified`. The original source timestamp expires at **2026-10-20T16:49:35.513Z**, not 48 hours after this request.

No database write, schema change, canonical source/manuscript row, film job, provider request, paid generation, render, intake, publication or scheduling occurs. The old approved private film is unchanged.

The panel clears on project/post/revision/SHA/current-plan/plan-state/edit/disabled changes. Abort and sequence guards discard late replies; identity and denial flags are checked again in the client. An expiry timer removes a previously displayed result.

## Scoped verification

Code reviewed: **97f1c158ca5a403f7d89faccaa006ad6b9a9b51f..4c6bcc4a1eea69360e52dc495dd57b6754e90554**, eleven files. Local evidence is in `.superpowers/sdd/2026-10-19-film-preparation-app`.

- Ten complete affected web suites: **161/161 PASS**, no skips. Includes 24 new actual-route/adapter/store cases with only external auth/admin-DB boundaries replaced. Checks session/origin/owner/project/strict input/revision/plan/manuscript/stops/expiry, with no writes/providers.
- Full web TypeScript: **PASS**, after the final product code and expanded UI cases.
- Existing content browser suite initially **17/17 PASS**, including nine new film cases. Real React UI, isolated task-owned server/port54819, HTTP fixtures. Mobile390px and desktop1440px fit without horizontal overflow. Late draft/project/plan/edit/revision replies, mismatched revision and expired-source errors are covered.
- Initial API collection failed because the route did not exist. After implementation, tests exposed the fixture's missing real Host header and extra access-wrapper key in the RPC principal. The fixture gained Host; the API now explicitly projects userId/allowedProjectIds. All actual route tests pass.
- Initial browser behavior failed waiting for the absent button; after implementation, it passed. The screenshot fixture now returns an ordinary unsupported-format publication read response rather than a development-server HTML response. Existing publication product behavior is untouched.
- Independent read-only review found **no Critical or Important findings**. One Minor noted missing successful-result expiry timer coverage; a clock-driven browser case was added. The reviewer did not rerun tests, authenticate, access SQL or call providers.
- No Remotion runtime or full compiler rerun was needed for this web-only increment. Earlier complete runtime168/168 and isolation passes are historical, not fresh-head claims. Previously documented331 main-reproduced web failures and22 shared Remotion compiler diagnostics remain unresolved. This is not a whole-PR green/release claim.

Final expanded browser suite, including successful-result expiry: **18/18 PASS**, no retries or skips. The product code is unchanged from the reviewed commit; only the optional test and this report were added afterwards. Evidence hashes are in [the JSON manifest](the-prompt-film-preparation-app-20261019.json). Exact-head CI/deployment and ordinary signed-in UI observations are reported in PR #377 and the project status page after push; local fixture evidence alone does not establish a successful authenticated deployed request.

## Remaining boundary

This read-only check does not create a canonical source/script or durable generation claim, reserve an approved budget, establish asset usage rights, produce images/Victoria/timings, render/QA a movie or admit it for review. Those remain separate concrete stages. PR #377 remains draft/unmerged and the seven-day trial remains inactive. Ordinary existing publishing schedules are unchanged.
