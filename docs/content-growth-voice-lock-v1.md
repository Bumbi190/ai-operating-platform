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

## Pling – owner-approved official character voice (2026-10-13)

The owner chose **Pling Alternative B** for the interactive December activities. The voice ID was recorded as `vhPZICLLz0UIRNLnUe0u`; subsequent Pling activities reused it. Treat this voice as **the official Pling character voice for future Familje-Stunden dialogue**, in accordance with that decision. It is distinct from the saved cloned voice below.

Pin: `familje-stunden:pling-dialogue` → `vhPZICLLz0UIRNLnUe0u` + `eleven_v4`. Approved December calendar audio manifest uses this same ID and model.

The December instruction audio receipt also includes a documented brightening audio-processing chain (rubberband tempo/pitch/formant, EQ and limiter). Code records a required profile identifier `pling-alternative-b-december-2026`. Do not assume matching raw TTS without applying and verifying the original processing settings, or merely passing a matching profile name. The profile check is **metadata-only today** and must be paired with verified DSP execution before production rollout.

## Saved ElevenLabs workspace identities: Nova still NOT proven as canonical dialogue voice

- **REJECTED BY OWNER 2026-10-17 — DO NOT USE:** `I0uKCr8dyBq1Ouru7CWl`, shown under the name Nova. The user listened and confirmed that the sample was not Nova and was in English. Metadata saying Swedish/cloned is not evidence of correct character identity. This ID is now denied for Nova even if renamed or surfaced again. The true approved Nova dialogue voice ID remains **unknown** pending a verifiable audio or generation receipt.
- Pling: cloned Swedish voice iS3S91gyCtjX6pvnxlEc also exists but is NOT the approved Alternative B. Do not use it as a backup. The confirmed official Pling dialogue ID is vhPZICLLz0UIRNLnUe0u.
- Many unrelated public voices are named Victoria, Nova and Pling. Names alone cannot establish identity.
- Sanna is an approved November/December narrator, not the Nova or Pling character voice.

## Engineering controls

1. Every Content Growth TTS request must specify project, role, voice ID and model, and verify via requirePinnedContentVoice/assertPinnedContentVoice prior to paid dispatch.
2. Unverified Nova dialogue must fail closed; the user-rejected Nova ID `I0uKCr8dyBq1Ouru7CWl` must additionally be denied by exact ID. Pling dialogue requires the owner-approved Alternative B ID, model and verified processing. No Victoria or Sanna fallback and no new voice design.
3. Use assertPinnedContentVoiceForRender for a role with an approved processing profile. Preserve existing provider auth, spend approvals, timeouts, idempotency and review gates. This registry does not call ElevenLabs or authorize spending.
4. Before enabling actual Content Studio speech, wire this guard into the future governed production TTS adapter and compare representative, approved historical audio. Until then this is a tested guard for future integration, NOT a claim that production TTS is already protected.
5. Do not change or regenerate existing November or December content solely to test this.

Sources: ElevenLabs voice collection listing on 2026-10-17, Omnira and Familje-Stunden repositories (paths above).