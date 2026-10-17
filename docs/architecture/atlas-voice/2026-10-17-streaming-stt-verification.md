# Atlas streaming STT: execution evidence
Plan: docs/superpowers/plans/2026-10-17-atlas-streaming-stt.md
Approved by André 2026-10-17 07:40 Europe/Stockholm; Native.
Accepted baseline: 09a32df71772473794ffdeea0ac335d15b267baf. Separate pilot branch; no production merge.

## Task 1: provider-free transport
- Existing linked worktree verified, no AGENTS.md found. Baseline access suite 24/24 passed.
- RED: missing stream handler assertion failed; after minimal 404 scaffold, behavioral suite had19 failures/4 passes.
- GREEN: new probe/access23 + existing access24 =47/47. TypeScript passed.
- Exact existing fresh operator/membership/legacy-owner guard extracted to access.ts; existing speech behavior remains covered.
- Probe requires preview/development, server mode probe, same Origin and operator; canceled requests cannot upgrade. Payload6404 max, bounded queued echo64000 bytes, closes after5s. No microphone/provider imports, audio transcription, paid calls or provider token.
- @vercel/functions pinned3.10.0; ws moved from dev to runtime, pinned8.21.0. Lock changes include required @vercel/oidc4.0.0/cli-config0.3.1 transitive updates and npm deduplication.
- Probe CLI accepts only a normal existing authorized operator session supplied in environment. It never prints credentials; deployment protection access is separate from app authentication.
- Vercel CLI64.5.0 starts vc dev on54399 with Next14.2.29. A real authenticated upgrade, echo, payload rejection and deadline in the deployed preview are still required before paid relay work.
- No normal operator session is available to the CLI yet. Do not manufacture owner sessions with service-role/admin magic links or relax the guard to make this test pass.
- Vercel branch-specific environment creation initially returned400 because the new local branch was not yet pushed. No shared/production environment variable was changed by that failed request.

## Rulings
- Skill resource provider does not expose its helper scripts or writing-good-tests reference. Workspace/brief/ledger bookkeeping is reproduced directly in this plan's ignored directory; cost if wrong is manual bookkeeping/recovery.
- Prior full-suite failures on baseline are known and covered in earlier latency notes; no claim that this branch's full suite is green.

## Pending gates
Real deployed authenticated WebSocket, verified realtime billing ceiling, governed provider lifecycle, native/mobile conversation acceptance. No new response-time benefit has been measured.

## Task 2: bounded protocol
- Pure browser/server protocol implemented; it is not wired to microphone or a provider.
- RED: missing codec round-trip assertion failed; after codec implementation13 control/segment tests failed while12 codec tests passed.
- GREEN:25 protocol tests and47 access/probe tests =72/72. TypeScript passed.
- 6400-byte PCM blocks +4-byte sequence, strict512-byte controls, 2,880,000 actual-byte ceiling, explicit finish boundary and <=12000-character stable transcript.
- Internal20s checkpoints acknowledge one segment at a time, retain repeated phrases and wait for the user's endpoint before yielding a complete question. Empty tail reuses last acknowledged checkpoint. Tests cover a multi-segment thought,1.4s question, cap and unexpected/duplicate events.
- No audio, transcript, cost-rate or provider configuration changed. Actual provider acknowledgement semantics remain a later gated proof.
- Task1 browser verifier is a credential-free static test artifact; it uses only the normal same-origin application session. Its result is not a microphone or Atlas latency benchmark.

## Fresh review and verifier fixes
A fresh gpt-6-astra reviewer examined a0906de..aa8cdd1. Two Important CLI findings and no Critical/minor findings:
1. Invalid-frame checks could pass an oversized echo or silent ignore until the normal deadline. Reproduced against real deliberately broken local WebSocket servers; four CLI cases failed before the fixes (including the URL cases below), then passed. Rejection now requires no message and termination before2.5s.
2. Malformed private URL parsing could expose Node's input error. Two subprocess regressions use only synthetic markers and assert no input or raw ERR_INVALID_URL is printed.
The browser verifier was also extended to check prompt oversize/text rejection after the positive echo/deadline case. Its bad-server cases failed2/3 before the change and passed3/3 afterward. These VM tests verify the verifier, not a deployed connection.
Final selected verification after fixes:150/150 across9 files (probe CLI/page/protocol/access, existing voice access/transcription/settlement, durable spend and dispatch-stop); TypeScript passed. The full application suite was run and is not green; an additional bounded-worker final run is tracked in the execution ledger/PR.

## Whole-suite evidence and limits
Initial full run on aa8cdd1:12,784 passed,403 failed,1,277 pending. The companion JSON names all failures and compares the older VAD full-suite artifact, not an exact09a full-suite baseline.
400 failed identities match the older run. Three old migration checks are now resolved by the already-merged ledger/schema sync in09a. The three different failures are:
- project-command-center render case:5s timeout in whole-suite run; this exact case passed isolated.
- vnext-settings render case:5s timeout in whole-suite run; this exact case passed isolated.
- provider-dispatch-certainty / no consumer of ProviderDispatchUnknownError weakens it / none converts the ambiguity into a not-dispatched claim: regex assertion on unchanged lib/media/elevenlabs.ts. Source blob equals accepted09a exactly (0f6e1001b0c8911e2075f2128bbed4550152eac5).
Targeted delta check:155 passed/3 failed; the other two failures are the pre-existing project-command-center legacy hash and marketplace-link assertions. No unrelated test, timeout or runtime implementation was changed to make a green claim.

## Deployment proof and remaining gate
Deployment c7d74d6 / dpl_26jyAymA2Gg7ceWG2eGcyF8i8uKZ READY. Direct protected access, preserving ephemeral deployment-protection cookies in memory: app-auth required for browser page (307/login), same-Origin stream401 without app session, wrong-Origin stream403; API x-vercel-id confirms arn1::dub1. This does not prove a positive authenticated upgrade.
Normal operator positive echo, five-second close and invalid-frame rejection remain pending. The browser verifier uses the operator's ordinary login, no admin-issued replacement session. CLI64.5.0 local vc dev startup verified; local127.0.0.1/localhost Origin mismatch correctly403, no positive local upgrade claim.
Temporary access config and newly downloaded .env.local/.vercel/.env.preview.local were deleted; project linkage contains no credentials. Accepted09a preview remains unchanged.

## Execution rulings retained for handoff
- No normal operator session was available in CLI: browser verifier added so no cookie export, service-role impersonation or guard relaxation is needed. Cost if wrong: positive runtime proof remains blocked.
- Branch flag creation was retried only after the branch existed remotely; ATLAS_VOICE_STREAM_MODE=probe is scoped to the new preview branch. Cost if wrong: probe unavailable, no provider spend.
- Task2 is pure and independent, so it was completed while Task1 awaits normal login; the written gate forbids Task3 before runtime proof. Cost if wrong: unused module remains off.
- Full-suite legacy failures are reported, not repaired in this scope; no full-green assertion. Cost if wrong: inherited defects remain.
- Provider billing, segment semantics, client buffering/replay, interruption epochs and cap/manual-review integration remain unimplemented verification gates. Cost if wrong: realtime voice remains unactivated; no early action on segment text.
No reviewer findings were deferred as Minor. Both Important findings are fixed with RED→GREEN evidence. The plan workspace remains available because the full plan is not complete.

## Failed phone probe and follow-up diagnostics (2026-10-17)
The normal operator's phone probe at 08:09 Europe/Stockholm failed. Runtime access log: status200 in183ms; CDN request log: HTTP101 for the stream GET. There was one stream request, so the verifier did not advance past its first echo/deadline stage. This establishes authorization and an upgrade response, not successful bidirectional frames or the required lifetime.

Read-only project configuration confirms Fluid is already enabled. No project setting, region, authentication rule or accepted voice deployment was changed. Exact production probe() plus the exact HTML passed in real local Chromium before this patch (three sockets; positive echo followed by abrupt1006 at~5.03s). Thus a universal browser-error-on-terminate explanation is disproven locally. The actual phone failure remains unlocated.

Follow-up change: use a normal1000 close frame at5s and await acknowledgement, with hard termination at5.25s if the peer is unresponsive. The positive browser verifier now requires a clean1000 close as well as exact echo and the existing deadline. Bounded server logs record opened/first-frame/closed, fixed reasons and numeric metadata only; no cookies, URLs, payloads or exception text. HTTP request cancellation is still honored and now distinguishable from socket close/error; it has not been proven to cause the observed failure.

The browser reports the failing phase/reason, total milliseconds, opened/echo booleans and close code, replacing the generic login suggestion. Failed opening cannot by itself distinguish app authentication from a transport problem.
RED: normal-close expectation failed1/23; browser diagnostic cases failed5/6. GREEN:85/85 selected stream/protocol/verifier and existing authority tests, including nonresponsive-close hard bound and metadata privacy. Native Chromium with the actual patched function/page passed all three sockets: exact echo,1000 close at~5.05s, oversize1009 at8ms, text1006 at21ms. This is local evidence, not a deployed authenticated/mobile pass.
Task1 remains incomplete and Task3 remains blocked until the normal operator's deployed echo/deadline/invalid-frame proof succeeds. No microphone or paid provider call was used. No additional full-suite run is justified for this isolated diagnostic/probe change; earlier inherited failures remain reported above.

Final diagnostic refinement: the invalid-frame subprobes accept a prompt no-echo close after an opened socket even if the browser also emits an error, because that error is consistent with deliberate payload rejection. A positive echo probe still rejects errors and unclean1006 closure. Regression RED1/8 then GREEN8/8; final changed-file selection33/33. TypeScript passed before this page-only refinement and is rechecked on the final source. No scope expansion or inferred deployed success.

## Phone evidence at08:25 and explicit policy-close fix
The normal operator's screenshot3129 reports text/rejection_timeout, opened=yes, echoed=no, no close event. Sequential page control flow establishes that the exact positive echo/deadline and oversize checks passed before the final text check began.
Runtime correlation on8ca195e:
- Positive connection: access200/233ms, first4-byte frame135ms, one frame/four bytes echoed, clean1000 close at5073ms, request signal not aborted.
- Oversize connection: access200/111ms, socket error111ms, no echo; browser advanced, so prompt invalid-payload rejection passed.
- Text connection: access200/258ms, invalid_frame after154ms, zero accepted frames/echo bytes, signal not aborted. Browser nevertheless reached its unchanged2.5s rejection deadline.
The server correctly rejected the frame but its abrupt terminate() did not give the phone a prompt close event on this path. The exact intermediary responsible is unproven. The working positive path sends an explicit close frame; ws documentation distinguishes close() handshake from terminate()/socket.destroy(): https://github.com/websockets/ws/blob/master/doc/ws.md.

Minimal fix: share the bounded closing handshake for invalid text/payload/backpressure with policy1008; retain normal deadline1000 and independent250ms hard termination. Stop reading frames immediately, clear the original deadline, and await close/hard-bound before resolving the handler. Browser deadlines and pass criteria are unchanged. Automatic ws maxPayload rejection remains1009.
RED: new text policy-close/nonresponsive-peer test failed1/26 because no1008 frame was sent. GREEN:58/58 across stream access/browser verifier and original speech authority tests; final TypeScript exit0. No full-suite rerun; old inherited failures unchanged. Native exact-source result follows in the execution ledger/PR.
A new deployed normal-session text-close proof is still required to complete Task1; positive/oversize runtime evidence is now established. Paid Task3 stays blocked, no microphone/provider activation or production merge.
Native Chromium on the final actual probe function/page passed all three connections: exact echo and clean1000 at5018ms, oversize1009 at6ms, text1008 at25ms. This remains local evidence until the deployed phone repeats the text-close check.

## Task1 complete: normal phone session at08:35
Andre reported the full browser verifier succeeded. Runtime on55cbb12 confirms three authorized connections:
- Positive: access208ms, exact4-byte echo/first frame102ms, clean1000 close5105ms.
- Oversize: access164ms, no accepted/echoed frames, socket error168ms; browser advanced.
- Text: access72ms, zero accepted/echo bytes, explicit1008 close260ms; browser succeeded.
No request cancellation. This completes the deployed authenticated transport gate; Task2 remains complete.

## Task3: unactivated governed relay implementation
Added the sanctioned ws adapter, browser protocol bridge and lazy server pilot route. Default branch flag remains probe; no microphone selection or provider activation. Fixed operator execution/billing context, reserve/admit-before-constructor,5s readiness,20s commit/final drain,120s route-entry deadline and150s function budget. PCM count includes all actually forwarded samples,90s maximum; queues bounded, internal20s checkpoints aggregate one question and do not publish partial text. Uneven frame/checkpoint crossings split without losing/repeating samples. Both socket closures use bounded handshakes.

The adapter registers its session lifetime with the existing SpendMeter before returning a handle. Existing withGovernedSpend owns durable waitUntil: full ceiling retained as estimate_unmetered on successful session completion and estimate_ambiguous after possible dispatch failure. Known caller cancellation before construction releases through ProviderNotDispatchedError. Existing watcher remains active until provider termination; an authority-unavailable latch is observed before every send and at250ms idle checks. Its global semantics were not changed. Bridge ownership lasts through the browser close; no paid work can continue afterward.

RED evidence: missing adapter17fail/8pass; missing bridge12fail; pilot route2fail/26pass; pre-constructor cancellation settlement1fail/6pass; uneven checkpoint crossing1fail/27pass. Corresponding implementations/fixes passed; final selected result is recorded in the ledger/PR. New settlement tests exercise the actual withGovernedSpend boundary, including durable intent, deferred RPC, ambiguous teardown, failed settlement and known no-dispatch cancellation.

## Billing evidence and activation blocker
Read-only official evidence checked2026-10-17: API pricing lists0.39USD/hour realtime plus0.08USD/hour keyterms; API reference quotes+20%. Conservative public candidate remains0.48USD/hour (two minutes0.016USD before tax). Pricing FAQ meters STT per audio minute; capability docs bill duration sent. Six fixed keyterms, no edited-transcript feature/minimum surcharge.
Sources:
- https://elevenlabs.io/pricing/api
- https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime
- https://elevenlabs.io/docs/overview/capabilities/speech-to-text
The workspace connector has no subscription-read capability. Vercel env run explicitly cannot pull46 protected Secret values; no alternative credential extraction was attempted. No account lookup occurred, no provider key was printed or stored, and no account plan/minimum applicability is claimed.
Accordingly atlas-realtime-billing.ts has a frozen unverified floor and always refuses real dispatch. A DB value or environment flag cannot override it. No canonical rate fallback/DB row was added, no provider token/paid session/test was created. Positive provider/settlement tests explicitly mock verified billing and the provider, while a separate real billing-gate test proves live code rejects even a supplied0.48 rate.
Before enabling: establish the configured account's applicable standard/custom plan and billing terms, record evidence and canonical rate, then execute the written bounded provider protocol probe. Tasks4–6 remain pending; no stream latency benefit is claimed.
Final Task3 implementation verification:155/155 across9 selected files (relay, real governed settlement, bridge, billing gate, stream access/protocol, existing speech settlement, dispatch stop and durable spend); TypeScript exit0. No new full-suite run; prior inherited failures remain. This is an unactivated implementation checkpoint, not completion of the pending account/live-provider gates.
