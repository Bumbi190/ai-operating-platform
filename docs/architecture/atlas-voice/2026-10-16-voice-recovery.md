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
