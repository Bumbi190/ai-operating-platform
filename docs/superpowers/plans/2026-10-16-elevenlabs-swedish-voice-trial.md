# Atlas ElevenLabs Swedish voice trial

André explicitly requested ElevenLabs or another natural voice, excluding robotic system speech (2026-10-16). The uncommitted system-synthesis experiment was discarded. The GPT-Live foundation stays isolated and paid activation stays blocked by its unresolved duration ceiling.

## Chosen approach

- New preview/operator-only `/atlas/rosttest` page, with no shared runtime, default voice, media narrator, chat-route or database change.
- Native Swedish voice candidates discovered with ElevenLabs: Anders (standard Swedish) and Peter (Scanian). Use Flash v2.5 with Swedish language enforcement. Quality must be judged from audio, not descriptions.
- Stream 24 kHz PCM through an authenticated server route to browser Web Audio. No server `arrayBuffer()` or browser `blob()` barrier. Short text chunks avoid waiting for a whole reply.
- Reuse configured server ElevenLabs key (metadata confirmed Preview/Production, no secret retrieved). One paid request per chunk, at most 600 characters, no automatic retries. Existing canonical per-character rate, fixed-unit reservation and global operator execution authority apply. Query voice availability with `include_custom_rates=false` before dispatch, excluding custom sharing rates instead of guessing a multiplier.
- Existing Atlas conversation controller and chat API keep backend identity, actions, history and governed spend. Separate trial conversation. Interrupt stops speech and suppresses remaining speech from that reply; it does not cancel a business task. New speech during pending backend work remains a visible draft for explicit submission afterward.
- Continuous browser recognition plus microphone RMS, two-second thinking pause (selectable longer). Transcripts are not a silence clock; final text is required. Echo cancellation requested; real speaker/headphone behavior remains to be tested.
- Stop, hide, navigation and signout release microphone/audio resources and invalidate late callbacks. Text fallback remains available.

## Verification

- [x] Capture gate and late permission/recognition lifecycle: RED before implementation, then GREEN; final capture suite 10/10.
- [x] Server route/auth/origin/body/cost/authority and ambiguous dispatch tests, 8/8. Backpressure cleanup regressions reproduced RED then GREEN.
- [x] Streaming PCM alignment, first-chunk playback, cancellation and no stale reply tests, 4/4.
- [x] Isolated preview UI, typecheck, reproducible Vite UI fixture and independent review. Final re-check: no remaining Critical or Important issues, independently ran 22/22 pilot tests.
- [ ] Actual browser interaction and physical microphone/headphone/speaker trial. Cloud browser cannot reach the local fixture (connection refused); do not substitute unit doubles for this result.
- [x] Publish branch and preview; report actual voice samples and remaining listening limitations. Draft PR #359; runtime commit `0b6ff9efe3079e96123850fdc8d85e66f75a7926` is READY on Vercel. Application login is required for signed-in testing.

## Sources

- https://elevenlabs.io/docs/api-reference/text-to-speech/stream
- https://elevenlabs.io/docs/api-reference/voices/search
- https://elevenlabs.io/docs/overview/capabilities/text-to-speech
- https://webaudio.github.io/web-speech-api/

One 151-character Anders/Flash sample was generated through the explicitly requested ElevenLabs plugin: 8.59 seconds, 151 credits, $0.0302 reported. This is a listening sample, not a measurement of integrated Atlas latency or interruption.

The matching Peter sample also completed: 8.73 seconds, 151 credits, $0.0302. Combined actual reported charge: 302 credits / $0.0604. Both MP3s were saved for user listening. No integrated trial-route paid request was made.

Financial review corrections: provider HTTP remains inside the existing sanctioned `lib/media/elevenlabs.ts`, with no provider allowlist expansion. The route owns and forwards its explicit personal-assistance execution contract. Its precise OPERATOR_INTERACTIVE/GLOBAL_ONLY construction is added to the reviewed inventory with a rationale. The fixed-unit audit adds the single new character-billed callsite (media adapter count 2→3). Ledger rounding remains exclusively in `withGovernedSpend`. Existing narrator/sound function bodies are unchanged.
