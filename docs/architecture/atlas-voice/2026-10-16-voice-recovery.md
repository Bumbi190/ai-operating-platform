# Atlas voice recovery — 16 October 2026

André reported silent speech despite text replies, then a mobile session remaining at “Atlas lyssnar”. The starting runtime was 28927ff4 (PR #359).

## Confirmed cancellation defect

PCM voice onset called interrupt() in speaker mode as well as headphone mode. The trial's interruption handler increments speechEpoch, so input during conversation creation or reply preparation invalidated all later speech chunks without failing the text reply or displaying an error. Speaker mode now uses the existing explicit Avbryt control; spoken interruption remains available with headphones.

A native Chromium/Web Audio regression starts the microphone, delays conversation creation, submits text, injects a second spoken phrase, then releases the response. With the original unconditional interrupt, the text arrives but Atlas pratar never appears. With the fix, output is scheduled and the pending continuation is preserved.

## Microphone stream health

The listening status now requires receipt of an audio frame. Missing or stopped frames for five seconds stop the source and show an actionable notice. Silent frames count as a healthy stream; this detects a stalled pipeline, not whether the physical microphone hears the user. Timers are cleared on stop and on the 90-second review-only cap.

## Verification

- npm test -- lib/qa/atlas-voice-pilot lib/qa/atlas-live-voice --maxWorkers=2 --minWorkers=2: 117/117 passed, eight files.
- npx --no-install playwright test --config=playwright.atlas-voice-pilot.config.ts: 3/3 passed, Chromium with native AudioContext and AudioWorklet; simulated microphone source and HTTP providers.
- The new browser cancellation case failed against the old interruption logic and passed with the fix.
- The three new stream-health tests failed before the health check and passed afterward.
- npx --no-install tsc --noEmit: exit 0.
- git diff --check: passed.

These tests establish lifecycle behavior and scheduled output, not physical audibility or real Scribe accuracy. No paid provider request was made. Silent Provlyssna with no active microphone remains unconfirmed and is not explained by the cancellation defect. The connected Browser plugin could not attach to the user's authenticated browser. The full repository suite was not rerun; its documented inherited failures remain in the prior verification record.

Only the existing isolated preview is to be updated. No production merge or GPT-Live activation is included.

## Preview build reconciliation

The first deployment of f74c091 failed before compilation: the production ledger already contained social_project_profiles_v1 and social_manual_publication_v1, while this older branch lacked their canonical files. Import the two unchanged migrations, guard counts and corresponding fixture counts from merged main 535523c. They are enforced (127 canonical, 113 enforced); no guard override, legacy exemption or database apply is involved. Migration Guard v2 integrity tests pass 26/26. The runtime voice code and dependencies are unchanged by this reconciliation.

## Follow-up after two audible replies

André confirmed two audible replies, then a missing final reply, slow response and inability to correct a name. Runtime logs for the three chat calls around 16:56–16:58 Stockholm show first text at 3.5–5.4 seconds; recognition and speech generation add latency. The precise cause of the last missing audible reply is not established by those logs.

A browser regression reproduced a separate queue defect: speech received while a backend turn was pending remained in the draft without automatic dispatch. Completed voice continuations now resume exactly once after successful completion. Draft revision, microphone lifetime, pending input and transcription guard against stale or truncated dispatch. Editing, stopping, signout and explicit correction cancel automatic dispatch; a failed running turn leaves the continuation for manual review.

Avbryt och rätta is available whenever the microphone is active, including response preparation. It cancels pending audio and unfinished recognition without closing the microphone; the next correction waits for an already-running backend job. It also cancels queued automatic dispatch so the operator can correct an accepted draft. Speaker mode still requires this button; spoken barge-in remains headphone-only. Notices now appear beside the controls.

Numeric server timing records recognition and speech-header readiness, success/failure, audio duration and character count without logging content or credentials. Speech-header timing is not complete audio playback latency. This adds diagnostic evidence; it does not establish a latency improvement.

Final verification on frozen source:
- 119/119 focused voice unit tests across eight files.
- 12/12 native Chromium tests, including three consecutive questions, delayed creation, queued follow-ups, edit/stop/signout/correction cancellation, failed turns and a second continuation still being transcribed.
- TypeScript noEmit: exit 0. Diff whitespace check passed.
- Queue and correction regressions, explicit queued-correction cancellation, and timing headers were observed failing before their fixes and passing afterward.
- Targeted Next lint could not run because this repository has no configured ESLint setup; it opened the configuration prompt and exited 1. No lint configuration was created.
- An intermediate browser run was invalidated by editing source while the fixture dev server was active, causing a page reload and counters reset. The final 12-case run used frozen source and passed.

Browser audio and providers are simulated using native AudioContext/AudioWorklet. No paid provider call was made for verification. Physical mobile behavior, recognition accuracy and end-to-end latency still require acceptance evidence; the user's two audible replies are real-device evidence for the previous preview only.
