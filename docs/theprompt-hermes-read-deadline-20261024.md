# The Prompt: article client deadline (2026-10-24)

## Production and read-only evidence

Production is main 93e21399f10c49fc3433c155680f7839c0324f7b after approved #529 and #542. This new correction is independently prepared in a separate worktree/PR; it has not been approved for release.

Step1 races callHermesRead(articleUrl) against ten seconds and then falls back to the existing summary. Its client, however, independently aborts only after thirty seconds. Promise.race does not cancel its losing HTTP promise, so the client request can continue after its result is no longer usable. The shorter caller wait is not a transport deadline.

Existing Vercel logs showed optional /read TimeoutError after Step1 had continued. This is evidence of the mismatch's observable symptom, not proof that every failed article read has this cause.

Render was inspected read-only in the operator-confirmed My Workspace, service srv-d8d8sms2m8qs738034cg:
- Live worker deploy is dep-d96bagtckfvc73b24gmg, commit 07107eb41cbd4c0d20ecf72ba8876d1a453c583a. A Git comparison confirms workers/hermes files exactly match production main; the old deploy date alone is not evidence of stale worker source.
- Worker startup completed on 24 October at 07:10:25 UTC, about 25 seconds after scheduled warmup. On 23 October it completed at 17:10:30 UTC, about 31 seconds after warmup. Both exceed the old ten-second Vercel budget; the deployed #542 allows 55 seconds.
- The selected 23–24 October runtime logs show startup and normal shutdown, no explicit crash error. One 23 October /read response logged HTTP 200 at 17:20:52 UTC. Do not infer successful client consumption from that late server response.
- Sampled 24 October memory between 07:15 and 07:35 was approximately 94–105 MB. Empty HTTP metrics do not establish zero requests and sparse sampling does not rule out other memory peaks.

## Narrow correction

Expose an optional timeoutMs argument on callHermesRead, preserving its 30,000ms default. Step1 passes 10,000ms, matching its existing outer timeout. The same AbortSignal bounds fetch headers and response.json body consumption. Keep the outer race, request payload/authentication, null fallback, summary selection, other callers, retries, paid analysis/script/voice/image paths, publication schedules and all worker code unchanged.

This cancels the CLIENT HTTP request. It does not prove FastAPI cancels a browser task when the peer disconnects. Worker-side queue deadlines/disconnect cancellation and the separate 18s-versus-180s scrape mismatch remain future investigations; this PR neither changes nor calls the Gemini-backed scrape endpoint.

## Verification and rollout

Before implementation, synthetic regressions failed for hung headers/body, native loopback POST cancellation, and Step1 not passing its own ten-second budget. All tests use mocks or a local HTTP server; no production cron or provider endpoint is invoked. The Step1 route case uses the synthetic structured Hermes fallback and stops before paid script work.

Record focused tests, full TypeScript, independent review, GitHub CI and Vercel preview in the PR. Leave draft until separately approved for release. Today's ordinary deployed warmup/Step1 should still be observed at 19:10/19:20 Europe/Stockholm; do not replay jobs to validate this unmerged change.
