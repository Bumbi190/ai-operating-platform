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
