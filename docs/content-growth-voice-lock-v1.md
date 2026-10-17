# Atlas Content Growth - ElevenLabs Voice Lock v1

Date: 2026-10-17. VOICE CONSISTENCY IS A RELEASE BLOCKER.
Pin the exact voice ID and model by project, character, and use case. Do not select by display name, replace automatically, or reuse narrators as speaking characters.

## Verified production references

| Role | Voice | ID | Model | Evidence |
|---|---|---|---|---|
| The Prompt AI news | Victoria | qSeXEcewz7tA0Q0qk9fH | eleven_turbo_v2_5 | Omnira apps/web/lib/voice/config.ts |
| November story NARRATOR | Sanna Hartfield | ZSHzpa6aUvhjzShiBmYw | eleven_v3 | familje-stunden-v2 docs/month-experience/NOVEMBER_SANNA_AUDIO_REQUIRED.json |
| December story NARRATOR | Sanna Hartfield | ZSHzpa6aUvhjzShiBmYw | eleven_v3 | familje-stunden-v2 docs/december-2026/STORY_ORIGINAL_VERIFIED_TRANSCRIPTS.json |
| December calendar instruction character | Pling | vhPZICLLz0UIRNLnUe0u | eleven_v4 | familje-stunden-v2 docs/december-2026/CALENDAR_INSTRUCTIONS_V3_AUDIO.json |

## Saved ElevenLabs workspace identities: NOT YET proven as canonical general dialogue voice

- Nova: cloned Swedish voice I0uKCr8dyBq1Ouru7CWl was found in the connected ElevenLabs voice collection. Before general character voice generation, compare it with the user-approved November/December Nova example and its actual voice receipt.
- Pling: cloned Swedish voice iS3S91gyCtjX6pvnxlEc also exists, distinct from the generated December instructions voice vhPZICLLz0UIRNLnUe0u. Do not infer interchangeability. Which is canonical for generic Pling dialogue remains unverified.
- Many unrelated public voices are named Victoria, Nova and Pling. Names alone cannot establish identity.
- Sanna is an approved November/December narrator, not the Nova or Pling character voice.

## Engineering controls

1. Every Content Growth TTS request must specify project, role, voice ID and model, and verify via requirePinnedContentVoice/assertPinnedContentVoice prior to paid dispatch.
2. Unverified Nova/Pling dialogue must fail closed; no Victoria or Sanna fallback and no new voice design.
3. Preserve existing provider auth, spend approvals, timeouts, idempotency and review gates. This registry does not call ElevenLabs or authorize spending.
4. Before enabling actual Content Studio speech, wire this guard into the future governed production TTS adapter and compare representative, approved historical audio. Until then this is a tested guard for future integration, NOT a claim that production TTS is already protected.
5. Do not change or regenerate existing November or December content solely to test this.

Sources: ElevenLabs voice collection listing on 2026-10-17, Omnira and Familje-Stunden repositories (paths above).