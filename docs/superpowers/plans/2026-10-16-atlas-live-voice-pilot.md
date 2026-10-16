# Atlas Swedish Live Voice Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native implementation. Steps use checkbox syntax for tracking.

**Goal:** Prepare an isolated GPT-Live voice trial with Swedish delivery, full duplex WebRTC and reliable lifecycle handling, without changing current Atlas behavior or bypassing governed spend.

**Architecture:** Keep the pilot outside the shared Atlas runtime until transport and cost admission are verified. Native WebRTC carries simultaneous microphone and speaker media; provider session events report transcripts and finalization. A server-owned session exchange is required for future integration; browser code never receives an API key or constructs trusted session instructions.

**Tech Stack:** TypeScript, native browser WebRTC/MediaDevices/HTMLAudioElement, Vitest 2.1.9, existing Next.js application and governed-spend boundaries.

**Spec:** `docs/architecture/atlas-voice/2026-10-16-swedish-live-voice-proposal.md`

## Global Constraints

- Work only on `codex/atlas-swedish-live-voice-20261016`, based on `496e826cd130994a362c76305890fc49f5dd70bf`.
- Reuse the existing server `OPENAI_API_KEY`, as approved by André on 2026-10-16. No key creation, copying, rotation or secret changes.
- Initial candidates: `marin` and `cedar`; both verified in the Live create-session reference and official Python SDK.
- No production activation, existing runtime edits, database migration, business action or provider dispatch in the foundation stage.
- Paid activation requires a defensible server-side upper cost bound. A requested five-minute trial, browser timer, token estimate, post-creation `expires_at` and SIP-only duration limits do not prove that bound for WebRTC.
- If no such bound can be verified, complete and review the independently testable transport foundation, record the activation blocker and leave the paid stages pending.

## Review Focus

1. User stops while microphone permission or signaling is pending: late media must be released and no session revived.
2. Assistant audio and incoming user speech coexist: never disable microphone tracks because output audio or transcript arrives.
3. A missing/invalid final usage report must remain unconfirmed; never represent it as zero cost or release a server reservation based on a client result.
4. Output transcript is not evidence of audible playback; a rejected `play()` needs an explicit notification and no speaking claim.
5. Stop and protocol failures must release device/peer resources once, while graceful close retains the event channel long enough to receive `session.closed`.

---

### Task 1: Server-owned Swedish session configuration and event decoding

**Files:** Create `apps/web/lib/atlas/live-voice/config.ts`, `protocol.ts`; test `apps/web/lib/qa/atlas-live-voice-protocol.test.ts`.

**Interfaces:** `buildAtlasLiveVoiceConfig(voice: AtlasLiveVoice): object`; `decodeAtlasLiveEvent(raw: unknown): AtlasLiveEvent | null`. Configuration is prepared for server use only, never sent from the browser. Decoder accepts only validated session, cumulative usage, transcript and error events; unknown events are ignored.

- [x] Write tests for voice allowlist, Swedish instructions, client delegation, `store:false`, explicit frontend event permissions, malformed events, negative/nonfinite usage, foreign/missing session identities and valid transcript timing.
- [x] Run `npx --no vitest run lib/qa/atlas-live-voice-protocol.test.ts` in `apps/web`; observe RED for missing implementation.
- [x] Implement the exact verified Live event contract. Do not reuse Realtime event names or infer complete turns from transcript deltas.
- [x] Rerun the same suite; expect all tests passing. Commit the focused change.

### Task 2: Isolated WebRTC transport

**Files:** Create `apps/web/lib/atlas/live-voice/transport.ts`; test `apps/web/lib/qa/atlas-live-voice-transport.test.ts`.

**Interfaces:** `createAtlasLiveVoiceTransport(options, dependencies?)` returns `{connect(): Promise<void>, close(): Promise<LiveVoiceCloseResult>, snapshot(): LiveVoiceSnapshot}`. `options.exchange({sdp, voice}, signal)` is the sole signaling boundary and must be supplied by a future governed server adapter. Dependencies wrap the native microphone, peer and audio APIs for tests. The transport never constructs a provider URL or accepts a provider key.

- [x] Write native-boundary reproductions for permission denial, stop-before-permission, stop-during-signaling, failed signaling/SDP, autoplay rejection, mic remaining active during remote playback, double-start/stop, wrong-session events, late callbacks, cumulative usage, final-close timeout and channel/network failure.
- [x] Run `npx --no vitest run lib/qa/atlas-live-voice-transport.test.ts`; observe RED.
- [x] Implement one-shot connect, cancellation, native audio track playback, schema-validated events, immediate local silence on stop, `session.close` with a bounded wait for confirmed final usage, and cleanup. Do not equate socket closure with session finalization.
- [x] Run both new suites plus existing voice-capture, conversation-controller and TTS regression suites; compare with a baseline where necessary. Run standalone typecheck. Commit.

### Task 3: Server admission, preview UI and real listening trial — conditional

**Files when unblocked:** `apps/web/lib/atlas/live-voice/server.ts`, `apps/web/app/api/atlas/voice-pilot/route.ts`, `apps/web/app/(platform)/atlas/rosttest/page.tsx`, isolated pilot browser fixture/tests, governed-spend integration/tests.

**Interfaces:** Authenticated, operator-only server exchange accepts only a bounded SDP and voice from the two-candidate allowlist. Server selects model/instructions/permissions and binds provider session ownership. Activation is preview-only; no shared runtime edit until the trial is accepted.

- [ ] Verify a provider-enforced pre-dispatch bound covering WebRTC initialization, session lifetime, termination uncertainty and all enabled billing paths. Record the exact official contract and price snapshot. Do not invent a maximum or weaken existing spend accounting.
- [ ] If verification fails, record BLOCKED and do not create a live endpoint, disabled product page, deployment or provider call merely to look complete.
- [ ] Once verified: write RED admission/isolation/ownership/budget tests; implement reservation before physical dispatch, stop watchers, durable usage accounting and conservative ambiguous settlement. Test local/protocol failures and replay before any paid request.
- [ ] Add the explicitly chosen preview UI and browser checks. Test voice comparison, signout/route cleanup and restart. Only then run the approved ten-minute listening comparison and report actual usage, useful audible latency, interruption delay and subjective Swedish quality.

### Task 4: Reviewable branch and truthful readiness report

- [x] Run focused tests and typecheck; use `git diff --check`. Existing repository failures must be recorded without weakening assertions or unrelated fixes.
- [x] Read the final diff independently or use one read-only reviewer. Review the five failure modes above, including the distinction between tested transport behavior and untested provider behavior.
- [ ] Publish only this branch's completed changes for review. Keep Task 3 explicitly pending when blocked; do not claim a working live pilot, successful Swedish evaluation or measured provider latency from doubles.

## Execution and current prerequisite finding

André approved the trial and then instructed use of the existing key. Native execution avoids repeated per-task delegation. The current documentation provides WebRTC frontend event permissions and post-start expiry metadata, but the reviewed create-session request exposes no configurable duration ceiling and the numeric limits found apply to SIP. This is a real activation prerequisite under the approved spec, not a request for another API key or another approval of the same task.
