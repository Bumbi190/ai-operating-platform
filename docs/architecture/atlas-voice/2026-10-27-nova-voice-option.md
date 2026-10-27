# Atlas Nova (Agent Office) voice option — gated Sanna v4 pilot

Status: **owner-approved adult Nova (Sanna v4), preferred when provider-confirmed**. Anders remains the fallback when Nova is unavailable or unapproved. Production Nova gate still requires both server env vars.

## What it is
An optional `nova` entry in the Atlas managed Swedish voice selector, labelled **Nova (Agent Office)**. It uses the existing server-authorised ElevenLabs PCM streaming adapter, existing Scribe STT, and the unchanged interruption, echo, spending, project and owner gates. Nova is the default only when server-confirmed, with Anders and Peter still available and their provider paths unchanged. The Agent Office label marks Nova's visual identity. If activated, this is a voice choice in the shared Atlas operator voice selector across Omnira; it does not constrain selection to one page. No Family-Stunden data or workflows are involved.

## Approval requirement (both must hold, server-only env)
- `ATLAS_NOVA_VOICE_ID`: a 20-character alphanumeric ElevenLabs voice ID, **not** the rejected ID below.
- `ATLAS_NOVA_VOICE_APPROVED`: exactly `true`.

Otherwise Nova is absent from `GET /api/atlas/voice-pilot/speech`, and a `POST` with `voice: "nova"` fails closed with 503 before any provider lookup, budget reservation or paid call. When ready, Nova is listed only if the fresh ElevenLabs lookup (standard-rate voices only) confirms the voice, and is listed after Anders and Peter. The client receives the key and label only, never the ID.

## Rejected voice
The ElevenLabs voice named Nova with ID `I0uKCr8dyBq1Ouru7CWl` was **explicitly rejected**. It is hard-blocked in `nova-voice.ts` even if configured and approved. Do not use it, generate speech with it, or describe it as approved.

## Character continuity and current voice decision
- The *original childhood character voice* is preserved as `nova_final.wav` (5.04s, SHA-256 `17326AF9E0AE82FAB4749B5DCD52F59457AE069B8F1044C9659776AF0E42B66D`). The original Higgsfield Annie generation has been identified and byte-verified, but is **not** the adult Atlas voice.
- On 2026-10-27 the owner preferred an *adult, credible Nova* after rejecting the young Annie and finding both Sanna Flash and Multilingual samples unsatisfactory.
- The owner explicitly liked the **Eleven v4** take of **Sanna Hartfield – Swedish Conversational**: ElevenLabs voice ID `4xkUqaR9MYOJHoaC1Nak`, model ID `eleven_v4`.
- Source evidence: ElevenLabs flow `zOgJEmEZ37fcfr9hIb9o`, generation `Kn6X468oPc0djhaaDrmP`, verified by reading the flow node's parameters and generation history. This is *not* the narrator voice `ZSHzpa6aUvhjzShiBmYw` and *not* the rejected Nova clone.
- Provider read-only verification confirmed the Sanna Conversational voice is available, is fine-tuned for v4 and v4 Turbo, and passes the standard-rate-only voice listing. No sample was stored in this repository.
- On 2026-10-27 the owner explicitly requested **Nova as the default**. When the server authorises her, the voice session prefers Nova on first load. If the gate is disabled or the voice unavailable, Anders (or the first available approved option) remains the fallback. Nova uses `eleven_v4` only; Anders/Peter retain Flash.
- The provider documentation places `eleven_v4` at high quality and `eleven_v4_turbo` at lower latency. Turbo has **not been listened to or approved**; do not substitute it without a separate test.

## Recovery after an interrupted microphone/stream turn (2026-10-27)
- A transient realtime STT error used to call `stop()` on the entire browser microphone. The compact dock then displayed **muted**, falsely implying the operator had pressed Mute.
- The client now aborts and discards only the failed transcription turn. It requires **400 ms of fresh silence** before permitting another user-spoken turn, to prevent unintended repeat billing or playback echoes. The failed audio is never replayed and batch STT is never used as an invisible fallback.
- **After two consecutive failures**, capture closes instead of repeatedly starting new paid requests. Provider authority/access refusal remains fail-closed immediately, as do physical microphone errors and the existing 90-second input cap.
- The live dock now differentiates **user mute** from **source disconnected**, displays **Återanslut mikrofon** when appropriate, and preserves a useful error reason in expanded chat. A manual reconnect reuses the same running conversation and leaves Nova's speech output intact.
- The existing 10-minute microphone safety pause is retained but presented as a pause, not as an operator mute. The microphone still closes on actual browser unload and sign-out.

## Speech economics and implementation
- The shared ElevenLabs adapter streams PCM 24kHz and keeps its original request/settlement/abort/cancellation governance.
- Because stored rates can reflect cheap Flash, v4 enforces a conservative minimum reserve price of USD 0.24 per 1,000 characters even when the database rate is lower; actual cost should be monitored before any default switch.
- v4 receives only its compatible stability and similarity settings; Flash retains its old voice settings, including speed and style.
- All speech is still owner-authorised through the same Atlas operator conversation and project scopes. No public voice selector.
- Streaming transcription through the Atlas WebSocket (`/stream`) is independent of the managed streaming TTS (`/speech`). Switching the TTS model must not interfere with STT, barge-in, echo suppression, or turn scheduling.
- Relevant reference: https://elevenlabs.io/docs/sv/overview/models and https://elevenlabs.io/docs/api-reference/text-to-speech/stream.

## Voice selector in the actual Atlas panel
- The production Atlas conversation uses the shared `AtlasVoicePanel` from `components/platform/os/`, not the isolated `/atlas/rosttest` UI. That test route is preview-only, and `/atlas/rost` delegates to the shared panel in the live operator shell.
- The production call now starts in a compact dock with **mute/unmute microphone**, **open chat**, and **hang up**. The full chat has one main scrolling transcript and a composer; minimising it preserves the call. No project navigation, duplicate microphone control, loudspeaker/pause settings, or action clutter in the call overlay.
- The standard Atlas home composer exposes a phone icon for ring/hang up. The optional voice selector (Anders/Peter/Nova) is hidden under **Byt röst** in the expanded chat, not on the primary call controls.
- Selecting another voice stops the current audio stream before switching and requires re-enabling the microphone. Pending turns temporarily disable switching. Normal mute stops only the microphone capture and does **not** end the voice session, cancel the reply, or interrupt the TTS player.
- The selector sends only safe aliases, never provider voice IDs. Nova preference is client UI only; server-side owner/approval/cost/voice gates remain authoritative.
- The owner-started managed call belongs to the shared `(platform)` layout and stays mounted during normal client-side navigation to projects and other Omnira pages, including while the chat dock is minimised. Do **not** call `stopAll()` merely because `document.visibilitychange` fires. A true document unload (`pagehide`), sign-out or explicit hang-up still ends the local browser microphone; browser/OS background policies may suspend microphones on mobile.
- If a voice lookup fails or the approval gate is disabled, the UI never fabricates a Nova option.

## Owner opt-in pilot activation
1. Verify environment has permission to call ElevenLabs and resolve the Sanna voice, with model `eleven_v4` supported.
2. For **opt-in** testing only, set the server-only env vars `ATLAS_NOVA_VOICE_ID=4xkUqaR9MYOJHoaC1Nak` and `ATLAS_NOVA_VOICE_APPROVED=true`. Never put these in client-visible `NEXT_PUBLIC_*` or migrate them to other projects.
3. Confirm GET speech lists Nova as available, and the client prefers her **by key**, with Anders fallback; verify one sample using `voice: 'nova'` through the actual protected speech endpoint and playback.
4. Owner listens to a **real full Atlas conversation** on their Mac/mobile with the existing interruption, microphone and speaker controls. Measure end-to-first-audio and compare against Anders. If sound is good but latency too high, trial v4 Turbo *separately* before changing the mode.
5. Rollback: remove either Nova environment variable and redeploy; the option disappears. Anders/Peter and default remain untouched.
6. The owner **has explicitly requested Nova as default** on 2026-10-27. Do not globally enable or override server-side voice gates to satisfy the preference.

## Files
- `apps/web/lib/atlas/voice-pilot/nova-voice.ts` — server-only gate and rejected-ID block.
- `apps/web/lib/atlas/voice-pilot/voices.ts` — client-safe key and label.
- `apps/web/lib/atlas/voice-pilot/elevenlabs.ts` — listing and routing to the existing adapter.
- `apps/web/app/api/atlas/voice-pilot/speech/route.ts` — label lookup.
- `apps/web/lib/qa/atlas-voice-nova-option.test.ts` — tests.
