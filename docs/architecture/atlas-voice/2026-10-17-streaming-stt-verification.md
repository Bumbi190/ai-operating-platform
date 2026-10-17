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
