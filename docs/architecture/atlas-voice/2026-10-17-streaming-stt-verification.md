# Atlas streaming STT: execution evidence
Plan: docs/superpowers/plans/2026-10-17-atlas-streaming-stt.md
Approved by André 2026-10-17 07:40 Europe/Stockholm; Native.
Accepted baseline: 09a32df71772473794ffdeea0ac335d15b267baf. Separate pilot branch; no production merge.

**Current checkpoint2026-10-17:** actual phone/provider follow-up3134 passed2/2 on dd6e1eb:102400+1356800 PCM bytes, ordered1+3 acknowledgements, complete closure. Read-only DB verification confirms all three attempts durably settled at their full conservative ceilings (not invoice measurements). Branch-only pilot activation is approved and prepared; explicit streaming selection, batch default. Physical conversation/mobile latency acceptance remains pending;20paired slots below have no actual samples. Historical sections retain earlier checkpoints and are superseded by the phone3134 section.

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

## Task4: unactivated browser and capture integration
Cookie-authenticated single-turn browser client bounds preflight PCM, frame sequencing, transport pressure and deadlines; no reconnect or batch replay. Existing capture opens streaming only after confirmed80ms onset with one-second preroll, preserves selected pause/speaker tail/headphone interruption and generation/revision fencing, and makes90s caps manual-review only. Failed stream requires explicit microphone retry. No UI selection or paid activation yet.
RED:18 missing client tests;14 new capture tests failed while27 existing passed. GREEN:84/84 client/capture/protocol, TypeScript exit0 and diffcheck. One test read the entire backing ArrayBuffer rather than its sent subarray; fixed its offset/length view. Wire queue allowance includes at most40 bytes of framing for64000 PCM bytes; control allowance512. No new full-suite run or real latency claim.

## Fresh whole-branch review and authority fixes
The required independent whole-branch review covered relay, protocol, client, capture and uncommitted selection/native code. Two P2 findings, both fixed and re-reviewed with no further concrete findings:
1. The generic execution watcher treats OPERATOR_INTERACTIVE unreadable stop state as allowed by design, so checking its authorityUnavailable latch alone did not prove streaming fail-closed behavior. A streaming-specific observer now checks the actual canonical resolver's resolution before provider startup and during the session. Known interactive global-pause assistance stays available; UNRESOLVED closes the stream. Global governance semantics are unchanged.
2. Initial authorization did not bind an identity to ongoing access checks. Pilot access now returns the server-verified user ID, uses strict initial membership/ownership containment and rechecks that same identity/operator/membership. Revocation or unreadable membership cannot be bypassed with an owned project. Verified legacy ownership with an absent membership record remains supported. Existing batch/probe guard semantics are unchanged.

The observer polls serially after2s, bounds each combined read at5s and stays owned through browser transport closure, with immediate caller/socket cancellation and no late-read reopening. Normal polling detection is therefore bounded by2s plus at most5s service wait. Provider cancellation flows through the existing ambiguous-cost lifecycle. This strengthens and supersedes the earlier Task3 latch-only assurance; the provider watcher itself still ends at provider termination.
RED:9 failed/1 passed against the old wrapper. GREEN:12 observer/real-resolver/access-composition tests plus strict route cases; final selected257/257 across14 files, TypeScript exit0 and diffcheck. Actual resolver behavior is exercised with mocked DB/provider, rather than supplying a fabricated authorityUnavailable latch. Re-review was read-only, not a second execution of tests.

## Task5: explicit selection and native regression
The server offers selection only in preview with mode=pilot. UI defaults to batch; only explicit selection lazily imports the cookie-authenticated stream client. Changing transport stops mic/audio and clears queued input. Anders, existing chat/TTS and conversation authority are retained. A local list keeps at most40 anonymous mode/end-to-scheduled-playback timing samples, no user text or persistent analytics. Queued voice timing includes its wait behind a running answer. This is a playback-scheduling proxy, not proof of physical audibility.

Selection RED3failed/2passed, GREEN5/5. Final selected unit result257/257 across14 files; TypeScript exit0 and diffcheck. Native source was frozen, one worker, no automatic retries:
- All18 existing native browser scenarios passed on the final client implementation.
- New selection/streaming run:9/10 passed; the pagehide case failed before Atlas mounted (blank screenshot and missing selection field), not during cancellation. Exact cause is unproven. The unchanged case then passed1/1 with tracing enabled. These are separate runs, not a claimed clean28-test single run.
- New successful cases cover batch default/no socket, three automatic streaming questions, late-final suppression by correction/mode/signout/pagehide, failed connection with explicit retry and return to batch, speaker echo gate, a22s thought crossing one20s boundary that still sends one question, and a90s cap that sends exactly2880000 PCM bytes then keeps final text for manual review with zero chat dispatch.
- Harness corrections allowed its local fixture control endpoint through the fetch mock and fixed an overly exact label locator. Neither was a production transport fix.

Native AudioContext/AudioWorklet, local WASM and Silero are real; speech/noise PCM, STT final, chat and TTS service responses are synthetic. The local WebSocket boundary counts checkpoint crossings; adapter checkpoint acknowledgement/aggregation is covered separately by relay tests. No real-provider segment protocol, Swedish quality, locked-screen behavior or mobile latency claim follows from these tests.

## Remaining Task3/6 gates and rollback
Task1 transport and Task2 protocol are complete; Tasks4/5 are implemented and locally verified, with the native initialization failure/rerun limitation above. Task3's live account billing and provider protocol evidence, and Task6's actual mobile comparison remain pending. No actual mobile sample JSON was created.
Read-only Notion search found no verified account subscription tier. Public pricing alone remains insufficient under the approved design. Frozen billing floor=null, no canonical rate fallback/DB rate write, branch mode=probe and default batch remain in place. No provider credential was extracted and no paid session/probe was started.
After applicable account terms/minimums and canonical rate are verified, follow the written max3-session/120s provider-audio probe and20 paired mobile comparison. Keep batch default unless actual >=300ms median gain, p90 no more than200ms worse and no missing/duplicated turns are evidenced. Rollback remains disabled server mode plus batch selection; existing socket/authority cleanup tests cover termination.
The Notion write restriction was not retried or worked around; detailed recovery state is committed here and in the draft PR. Other Omnira workstreams and the accepted09a32df branch were not changed.

## Task6 preparation: Starter applicability and bounded provider verification
The operator's screenshot3132 on2026-10-17 identifies the configured account as standard Starter,6USD/month,18,545 used of90,000 credits, renewal20October; base30,000 credits/month. No custom contract was reported. This supersedes the earlier unverified account/frozen-floor blocker, not the pending actual-provider gate.
Official pricing/API/billing/workspace documentation checked2026-10-17: standard self-serve API realtime tariff0.39USD/hour plus0.08USD/hour keyterms (API also describes+20%). The conservative required book floor is0.48USD/hour;2whole minutes reserve0.016USD before FX/tax. Credits are shared within the workspace/platform, but the displayed Creative balance is not converted into guaranteed API minutes. The10s per-commit minimum belongs to optional transcript_edit, which the adapter does not enable.
Sources: https://elevenlabs.io/pricing ; https://elevenlabs.io/pricing/api ; https://elevenlabs.io/docs/overview/administration/billing ; https://elevenlabs.io/docs/overview/administration/workspaces/members ; https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime .
atlas-realtime-billing.ts now accepts finite configured rates >=0.48. The canonical accessor has a distinct0.48 fallback; no cost_rates/SQL write, subscription upgrade, topup or provider configuration change. Settlement tests now use the real verified billing helper and still deny a below-floor DB override before reservation/provider construction.

A same-origin static page /atlas-voice-provider-probe.html uses normal operator cookies and explicit one-click start. Server mode verify retains strict identity/governance/provider bounds while keeping microphone streaming selection hidden; batch remains default. No microphone, chat, TTS, credential query or retry/fallback. Three sequential real-time-paced cases send3.2s/40s/42.4s (102400/1280000/1356800 PCM bytes), total85.6s/2739200 bytes and at most3 connections. Each connection reserves its full2min ceiling. Stop on first failure. A sessionStorage latch prevents repeat within that tab/browser session, not a global cross-tab budget; operator must run once and report before any further probe.
Fixtures are offline Windows SAPI Microsoft Zira English proper names Atlas/Omnira/ThePrompt, padded to1.6s each; synthetic and not Swedish-quality evidence. The short case includes silence and does not establish sub-two-second provider behavior. Successful text checks require Atlas, then Omnira, then ThePrompt; no text is logged/displayed. Native browser tests use a local fake provider, not ElevenLabs.
Metadata-only adapter logs record ready/committed/closed, elapsedMs, attemptedPcmBytes, committedSegments and fixed outcome. Attempted bytes include potentially ambiguous sends and are not invoice telemetry. No audio/transcript/secret/session ID/raw provider exception logging.

RED billing4fail/11pass; missing probe10fail; verify-mode/logging2fail/65pass. Final GREEN286/286 across15selected files, TypeScript exit0, diffcheck. Native frozen source,1worker,retries0:2/2 pass in1.8min. Actual browser page sent exactly3connections/2739200bytes,3finals/4local checkpoint crossings; failure stopped before audio and reload did not retry. Mobile viewport412x915 screenshot inspected. Required fresh read-only delta review found no concrete findings.
These are local/mocked tests only. No actual paid provider probe, actual Swedish recognition comparison, audible mobile timing or locked-screen proof has occurred. Real provider acknowledgement/final behavior and20paired mobile samples remain pending. No mobile-samples JSON created.
Branch-specific preview flag is now verify; shared/production/accepted09a branch unchanged. Publish exact new SHA and verify READY/alias before giving user the one-click link. No Notion write retry.

## Phone3133 failure and production bundling fix (2026-10-17)
At10:05 Europe/Stockholm, the operator's screenshot3133 reported final_timeout,1connection,3.2s sent. Actual request skzt9-1792224316146-bd37407e2b0b on d994ac8:
- Initial operator access200/184ms; ElevenLabs session ready541ms.
- At08:05:17.622Z the first6404-byte masked browser frame raised uncaught TypeError t.unmask is not a function in bundled ws buffer-util/getData. No application PCM handler was reached.
- Provider closed15555ms after entry, attemptedPcmBytes0, committedSegments0, outcome ambiguous. Ongoing identity polling continued until the120s route bound; runtime subsequently reported process exit129. Actual durable settlement rows were not queried; retain the existing full ambiguous ceiling/intent accounting. Zero attempted bytes is not invoice proof.

Installed ws8.21 buffer-util selects the optional bufferutil native path for unmask lengths>=32; shorter payloads use its JavaScript fallback. The earlier4-byte phone transport success therefore did not exercise this failure. Runtime stack and a production-build reproduction establish the packaging fault; no timeout increase or provider behavior assumption was used as a fix.
Actual installed Next14.2.29 compiler/production server with the real app next.config:
RED: masked4/31-byte frames decoded;32/6404 failed unmask_not_function.
Minimal fix: experimental.serverComponentsExternalPackages:['ws']; let Node resolve ws and its absent optional addon normally, instead of bundling an empty addon module. No dependency update, environment/secret/SQL/authority/provider/voice change.
GREEN: the same actual compiled fixture decoded4/31/32/6404 bytes exactly, including sample contents. This is a real production compilation/receiver test, not a paid ElevenLabs call or physical phone success.
Reproducible command: node apps/web/scripts/check-atlas-ws-build.cjs .
References: installed node_modules/ws/lib/buffer-util.js; https://nextjs.org/docs/14/app/api-reference/next-config-js/serverComponentsExternalPackages ; https://github.com/websockets/ws/issues/2311 .

The required fresh delta review found no concrete production-config/page issue but one P2 in the first regression checker: fixed-port/stale-server or empty results could falsely pass. Corrected with an available port, own-child startup/error/exit checks, a unique per-run response marker, exactly four expected successful rows, and bounded HTTP read. Predicate tests RED3failed/1passed against the original behavior, GREEN4/4 after correction. Final independent re-review/result follows in the ledger/PR.

One provider connection has already been attempted. The follow-up page now explicitly runs only two remaining cases:3.2s short and42.4s crossing two20s checkpoints plus a final tail, total45.6s/1459200 PCM bytes, at most2connections, no retry. Including the failed first attempt conservatively gives3connections/48.8s, within the approved3connection/120s total. Each connection still reserves2whole minutes. The former separate40s empty-checkpoint-tail case is removed; that edge remains locally unit covered, not separately live-provider proved. Successful follow-up result is2/2, not3/3. New sessionStoragev2 permits only a new explicit click after this reported failure, never automatic continuation.

The remote device disconnected during initial follow-up verification. Unit286/286 completed; native log ended at test startup, so that run is unconfirmed/interrupted, not passed. On reconnection final native/TypeScript are run afresh once. No code default or production merge is authorized by these local proofs.

Final follow-up verification after reconnect: selected286/286 across15files completed; checker tests4/4; hardened real Next production build check exit0 with verifiedCurrentBuild:true and all4/31/32/6404-byte payloads decoded exactly. Native final frozen source,1worker,retries0:2/2 in58.9s, exactly2local connections/1459200PCMbytes/2finals/2checkpoint crossings, failure/no-retry pass. TypeScript exit0; diffcheck pass; mobile412x915 screenshot inspected. Required independent re-review confirms checker P2 resolved and no new concrete findings. Previous interrupted native run is not counted as a pass. Native provider remains simulated; actual follow-up phone/provider result and mobile latency remain pending.

## Phone3134: actual provider and durable settlement gates passed
On2026-10-17 at10:41 Europe/Stockholm the operator's screenshot3134 shows2/2 success and45.6s sent on dd6e1eb / dpl_JDKWteSpowo9VQd11Ji3mYybrY73. Correlated actual runtime:
- Short connection at08:40:26UTC: provider ready917ms; one commit at4304ms; closed4431ms;102400 PCM bytes;1committed segment; complete.
- Long connection at08:40:31UTC: ready305ms; ordered acknowledgements at20737ms/640000bytes,40885ms/1280000bytes,43310ms/1356800bytes; closed43434ms;3committed segments; complete.
- Total forwarded1459200bytes/45.6s; final validation passed for prerecorded Atlas/Omnira/ThePrompt; no chat/TTS/microphone used in this provider-only probe. This is not a Swedish quality, physical audibility or conversation latency benchmark. The separate exact-checkpoint-empty-tail case remains only unit covered.
- Runtime error/warning/fatal query over the probe window returned none. No additional provider-only attempts were made; original three-attempt cap is exhausted (failed3133 + these2), conservative browser audio48.8s total.

Read-only Supabase connector query against the verified AI Operating Platform project checked only operation/time-scoped reservation lifecycle and linked cost totals, no token/audio/user text and no mutations:
- Failed08:05 attempt settled at08:05:32 as estimate_ambiguous, estimated=actual booked0.1680SEK, one linked cost row, fixed_units, no ceiling_exceeded.
- Short08:40:26 attempt settled08:40:30 as estimate_unmetered,0.1680SEK, one linked row, fixed_units, no ceiling_exceeded.
- Long08:40:31 attempt settled08:41:15 as estimate_unmetered,0.1680SEK, one linked row, fixed_units, no ceiling_exceeded.
All three dispatch intents were recorded and all are settled. These are conservative Omnira book estimates, not ElevenLabs invoice measurements; total booked0.5040SEK. This supersedes the earlier unknown actual durable-row status.

Task1 transport, Task2 protocol, Task3 applicable price/lifecycle/provider protocol proof and Tasks4/5 implementation/local verification are complete within the stated scope. Task6 physical conversation acceptance and actual benefit are NOT complete.
The existing branch-specific preview flag now changes verify → pilot under the approved plan; only this branch/preview, no shared/production/accepted09a mutation. Server page offers an explicit Strömmande tal · test selector; batch remains default. Anders/chat/TTS/pause/interruption behavior is retained. Existing six selection tests cover hidden probe/verify, pilot preview availability, batch default and production denial. No production code changed in this documentation/activation checkpoint; previous286selected+4checker/native2/2/TypeScript results remain the relevant verification, not a new full-suite claim.
Publish the exact new SHA/READY alias before directing the operator to /atlas/rosttest. Rollback: disable branch mode or select batch, stopping current sockets/mic/output. No locked-screen/background guarantee; phone page must remain visible.

### Prepared physical comparison slots (no samples recorded)
Use same phone/browser/headset/network, Anders and same pause for each pair. Repeat the same question within its pair, alternate which mode goes first, await listening between turns. Short warm-up: three automatic questions, one spoken name correction, return to listening and audible output. Report failures separately.
The UI keeps at most40 mode/end-to-scheduled-playback measurements in memory, including pause/transcription/queue wait. It is a scheduled-playback proxy; operator must separately confirm that sound was heard. Read/record before reload or leaving, which clears the visit. No actual mobile JSON exists yet.
| Pair | Duration bucket | Order | Actual result |
| --- | --- | --- | --- |
| 01 | short (<3s) | batch → streaming | pending |
| 02 | short (<3s) | streaming → batch | pending |
| 03 | short (<3s) | batch → streaming | pending |
| 04 | short (<3s) | streaming → batch | pending |
| 05 | short (<3s) | batch → streaming | pending |
| 06 | short (<3s) | streaming → batch | pending |
| 07 | normal (3–10s) | batch → streaming | pending |
| 08 | normal (3–10s) | streaming → batch | pending |
| 09 | normal (3–10s) | batch → streaming | pending |
| 10 | normal (3–10s) | streaming → batch | pending |
| 11 | normal (3–10s) | batch → streaming | pending |
| 12 | normal (3–10s) | streaming → batch | pending |
| 13 | normal (3–10s) | batch → streaming | pending |
| 14 | normal (3–10s) | streaming → batch | pending |
| 15 | long (>10s, <90s) | batch → streaming | pending |
| 16 | long (>10s, <90s) | streaming → batch | pending |
| 17 | long (>10s, <90s) | batch → streaming | pending |
| 18 | long (>10s, <90s) | streaming → batch | pending |
| 19 | long (>10s, <90s) | batch → streaming | pending |
| 20 | long (>10s, <90s) | streaming → batch | pending |
For each actual attempt record only anonymous pair/question index,mode,durationBucket,endToPlaybackMs,outcome (no audio/text). No placeholders count as results. Calculate median/p90 per mode and paired differences only from valid complete samples; retain failed attempts separately. Required proposed benefit: >=300ms median improvement, p90 no more than200ms worse, no lost/duplicate turns/name-quality degradation. Missing measurements keep batch default. No default/production change based on a simple subjective speed report alone.
