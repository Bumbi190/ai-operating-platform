# Atlas Nova (Agent Office) voice option — gated Sanna v4 pilot

Status: **owner-liked Sanna v4 candidate, optional and gated**. Anders remains the shipped/default live voice. No automatic switch.

## What it is
An optional `nova` entry in the Atlas managed Swedish voice selector, labelled **Nova (Agent Office)**. It uses the existing server-authorised ElevenLabs PCM streaming adapter, existing Scribe STT, and the unchanged interruption, echo, spending, project and owner gates. Anders stays the default; Anders and Peter are unchanged. The Agent Office label marks Nova's visual identity. If activated, this is a voice choice in the shared Atlas operator voice selector across Omnira; it does not constrain selection to one page. No Family-Stunden data or workflows are involved.

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
- User approval is for an *opt-in live pilot candidate*, not a command to replace Anders as default. The current code uses `eleven_v4` for **Nova only**, without silently falling back to lower-quality Flash. Anders/Peter retain the original Flash model.
- The provider documentation places `eleven_v4` at high quality and `eleven_v4_turbo` at lower latency. Turbo has **not been listened to or approved**; do not substitute it without a separate test.

## Speech economics and implementation
- The shared ElevenLabs adapter streams PCM 24kHz and keeps its original request/settlement/abort/cancellation governance.
- Because stored rates can reflect cheap Flash, v4 enforces a conservative minimum reserve price of USD 0.24 per 1,000 characters even when the database rate is lower; actual cost should be monitored before any default switch.
- v4 receives only its compatible stability and similarity settings; Flash retains its old voice settings, including speed and style.
- All speech is still owner-authorised through the same Atlas operator conversation and project scopes. No public voice selector.
- Streaming transcription through the Atlas WebSocket (`/stream`) is independent of the managed streaming TTS (`/speech`). Switching the TTS model must not interfere with STT, barge-in, echo suppression, or turn scheduling.
- Relevant reference: https://elevenlabs.io/docs/sv/overview/models and https://elevenlabs.io/docs/api-reference/text-to-speech/stream.

## Voice selector in the actual Atlas panel
- The production Atlas conversation uses the shared `AtlasVoicePanel` from `components/platform/os/`, not the isolated `/atlas/rosttest` UI. That test route is preview-only, and `/atlas/rost` delegates to the shared panel in the live operator shell.
- The main panel now displays **Välj röst** immediately under the header, before the scrollable chat; it shows the server-authorized choices `Anders`, `Peter`, and `Nova (Agent Office)` when they are available.
- Selecting another voice stops current microphone/playback before switching, matching the existing isolated voice trial. The operator can start the microphone again, and the new voice is used from the next turn. Pending turns temporarily disable switching.
- The selector sends only the safe alias keys; it never exposes provider voice IDs or changes session identity, cost authority, voice gates, or the default Anders.
- If a voice lookup fails or the approval gate is disabled, the UI never fabricates a Nova option.

## Owner opt-in pilot activation
1. Verify environment has permission to call ElevenLabs and resolve the Sanna voice, with model `eleven_v4` supported.
2. For **opt-in** testing only, set the server-only env vars `ATLAS_NOVA_VOICE_ID=4xkUqaR9MYOJHoaC1Nak` and `ATLAS_NOVA_VOICE_APPROVED=true`. Never put these in client-visible `NEXT_PUBLIC_*` or migrate them to other projects.
3. Confirm GET speech lists Nova **last**, while Anders remains first/default; verify one sample using `voice: 'nova'` through the actual protected speech endpoint and playback.
4. Owner listens to a **real full Atlas conversation** on their Mac/mobile with the existing interruption, microphone and speaker controls. Measure end-to-first-audio and compare against Anders. If sound is good but latency too high, trial v4 Turbo *separately* before changing the mode.
5. Rollback: remove either Nova environment variable and redeploy; the option disappears. Anders/Peter and default remain untouched.
6. Never make Nova the default without an additional, explicit owner decision.

## Files
- `apps/web/lib/atlas/voice-pilot/nova-voice.ts` — server-only gate and rejected-ID block.
- `apps/web/lib/atlas/voice-pilot/voices.ts` — client-safe key and label.
- `apps/web/lib/atlas/voice-pilot/elevenlabs.ts` — listing and routing to the existing adapter.
- `apps/web/app/api/atlas/voice-pilot/speech/route.ts` — label lookup.
- `apps/web/lib/qa/atlas-voice-nova-option.test.ts` — tests.
