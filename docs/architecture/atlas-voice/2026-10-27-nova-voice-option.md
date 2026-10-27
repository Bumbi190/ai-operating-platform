# Atlas Nova (Agent Office) voice option — dormant scaffolding

Status: **dormant**. No approved, usable Nova ElevenLabs voice exists yet. This only prepares an opt-in alias.

## What it is
An optional `nova` entry in the Atlas managed Swedish voice selector, labelled **Nova (Agent Office)**. It uses the existing server-authorised ElevenLabs PCM streaming adapter, existing Scribe STT, and the unchanged interruption, echo, spending, project and owner gates. Anders stays the default; Anders and Peter are unchanged. The Agent Office label marks Nova's visual identity. If activated, this is a voice choice in the shared Atlas operator voice selector across Omnira; it does not constrain selection to one page. No Family-Stunden data or workflows are involved.

## Approval requirement (both must hold, server-only env)
- `ATLAS_NOVA_VOICE_ID`: a 20-character alphanumeric ElevenLabs voice ID, **not** the rejected ID below.
- `ATLAS_NOVA_VOICE_APPROVED`: exactly `true`.

Otherwise Nova is absent from `GET /api/atlas/voice-pilot/speech`, and a `POST` with `voice: "nova"` fails closed with 503 before any provider lookup, budget reservation or paid call. When ready, Nova is listed only if the fresh ElevenLabs lookup (standard-rate voices only) confirms the voice, and is listed after Anders and Peter. The client receives the key and label only, never the ID.

## Rejected voice
The ElevenLabs voice named Nova with ID `I0uKCr8dyBq1Ouru7CWl` was **explicitly rejected**. It is hard-blocked in `nova-voice.ts` even if configured and approved. Do not use it, generate speech with it, or describe it as approved.

## Reference sample (not in this repo)
- File: `nova_final.wav`, about 5 s.
- SHA-256: `17326AF9E0AE82FAB4749B5DCD52F59457AE069B8F1044C9659776AF0E42B66D`.
- The voice identity and ElevenLabs TTS ID for this approved sample are **unknown**. The audio is not copied here.

## Before enabling
1. Obtain a candidate ElevenLabs voice ID (never the rejected one).
2. The owner listens to a preview and decides whether it matches the approved sample. Nothing here claims that it does.
3. Only then set both env vars in the target environment.

## Files
- `apps/web/lib/atlas/voice-pilot/nova-voice.ts` — server-only gate and rejected-ID block.
- `apps/web/lib/atlas/voice-pilot/voices.ts` — client-safe key and label.
- `apps/web/lib/atlas/voice-pilot/elevenlabs.ts` — listing and routing to the existing adapter.
- `apps/web/app/api/atlas/voice-pilot/speech/route.ts` — label lookup.
- `apps/web/lib/qa/atlas-voice-nova-option.test.ts` — tests.
