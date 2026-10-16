# Automatic voice turn completion — 2026-10-16

## Report and observed evidence

André reported at 19:59 Europe/Stockholm that replies were still slow and that he had to press **Klar med frågan**. Expected behavior is automatic submission after a natural pause, with manual completion only as an optional fallback. Anders remains selected.

On the deployed parent `6b3e369`, the four transcription requests at 19:52–19:56 took 5576, 2743, 3785 and 3246 ms. Their audio durations were 24520, 9080, 71140 and 25060 ms. Chat first-token measurements were 3572, 3819, 4236 and 3484 ms; TTS response-header measurements ranged from 1391 to 2421 ms. These are separate stage measurements, not a measured end-to-end total. The previous auth/worklet timeout was not reproduced in these successful requests. A 71-second recording alone does not prove what portion was silence, and the old logs cannot distinguish manual and automatic completion.

## Reproduced defect

The old detector used RMS amplitude. Once speech began, the noise estimate stopped adapting and the continuation threshold fell to 60% of onset. At the initial noise estimate, steady background amplitude 0.001 was above continuation (0.00072), so it reset the silence counter forever. Quiet speech below onset could never trigger automatic completion at all. Both cases were reproduced as failing regression tests before the implementation changed.

This is an architectural limitation of amplitude-only detection, not evidence that every unsuccessful phone turn had exactly the same cause.

## Changes

- Replace RMS decisions with local Silero V5 speech probabilities, using the pinned VAD package's recommended 0.3/0.25 thresholds. Keep the actual PCM for transcription unchanged.
- Serialize recurrent inference, reset discarded turns, discard stale results after correction/stop, bound pending inference frames and release sessions after in-flight work settles.
- Keep one second around confirmed onset instead of uploading the entire waiting period. Manual completion still has the bounded 90-second review fallback. A detected question has its own 90-second maximum and capped questions still require review.
- Change the initial thinking pause from 2000 to 1200 ms. Longer pauses remain selectable. This removes 800 ms from that configured wait; it does not prove an 800 ms improvement in total live response time.
- Explain in the UI that Atlas submits automatically after the pause and the finish button is optional.
- Self-host the pinned model/runtime assets. Only the three exact static asset paths bypass middleware authentication. Speech API authorization, revocation, project containment, budget ceilings, billing and no-retry behavior remain intact.
- Bound initial model loading to 15 seconds, keep stop immediately effective, release late model sessions, and drain worklet frames during startup so audio from before “Atlas lyssnar” cannot be replayed afterward.
- Add an allowlisted `endReason` (pause/manual/limit/unknown) to existing transcription timing logs. Never log arbitrary header contents, audio or transcripts.

The startup replay defect was independently reproduced with a two-second delayed model download and speech before the listening state. The test failed before attaching the startup drain handler, and passed afterward.

## Verification

- Targeted voice/live-voice/middleware suite: **188/188 passed**.
- TypeScript: passed.
- Native Chromium: **17/17** full voice scenarios passed using real Web Audio, worklet, resampling and the actual pinned Silero model. After the startup-drain correction, **3/3** relevant startup/retry/cancellation scenarios passed, including the new delayed-model/pre-listening-audio regression. There are 18 distinct browser scenarios.
- The browser speech fixture is locally synthesized English speech with seeded room noise and a reduced-amplitude case. External transcription, chat and TTS are simulated. This checks local detection, dispatch and lifecycle, not Swedish transcription quality or actual mobile provider latency.
- Full suite: **12729 passed, 403 failed, 1277 pending** across the same 97 failing files. Exact failed-test identities match the parent recovery run: zero new or removed failures. All 154 voice/live-voice tests passed inside the full run. The full suite is not green; inherited failure details are recorded in the preceding latency/restart verification documents.
- Diff check: passed.

## Remaining response-time work

Automatic turn detection and total time to audible response are separate acceptance criteria. This change does not remove the serial batch transcription → chat → TTS pipeline. The 2.7–5.6 seconds spent in transcription in the user's latest attempts remains a major target. Streamed TTS already begins before the whole answer is complete; hiding text would not make the sound arrive sooner.

A larger improvement needs transcription while the user speaks (with server-enforced audio/session limits and existing cost/authority checks), or a separately benchmarked bounded server-side realtime transcription adapter. No unbounded browser provider token was introduced. The documented single-use token expires after 15 minutes before use; that is not proof of a short active-session cap. No new paid provider tests or infrastructure were created.

Physical Android/Brave acceptance, Swedish recognition quality, real end-to-end timing and locked-screen use are not verified by these tests. Locked-screen/pocket use remains deferred.

## Reproduction

From `apps/web`:

```sh
npm test -- lib/qa/atlas-voice-pilot lib/qa/atlas-live-voice lib/qa/organization-middleware-runtime.test.ts lib/qa/organization-navigation-guard.test.ts lib/qa/ui-generation-middleware.test.ts lib/qa/overview-auth-navigation.test.ts --maxWorkers=2 --minWorkers=2
npx --no-install tsc --noEmit
npx --no-install playwright test --config=playwright.atlas-voice-pilot.config.ts
```

Pinned assets are generated before dev/build and before the browser fixture. Their combined uncompressed size is about 13.6 MB; first startup needs to load them. No audio is sent externally by the local detector.

References:
- https://docs.vad.ricky0123.com/user-guide/browser/
- https://github.com/ricky0123/vad/blob/master/packages/web/src/frame-processor.ts
- https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime
- https://elevenlabs.io/docs/api-reference/tokens/create
