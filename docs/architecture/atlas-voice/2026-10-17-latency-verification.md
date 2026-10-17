# Atlas voice latency verification — 2026-10-17

Baseline: `0de75f29159c524e015c9c282420313ebe577d80`. Isolated voice preview / draft PR #359 only.

## Evidence and changes

- Supabase management API reports project `iboepohjwrhtgshrqaol` in `eu-west-1`. The baseline Vercel deployment reports `iad1`, also present in its runtime logs. Speech, chat and conversation routes now declare the statically analyzable `preferredRegion = 'dub1'` (Dublin / eu-west-1). This removes repeated US–Ireland database round trips from those functions if honored by the deployment. No project-wide region setting or database location changed.
- The existing PCM TTS adapter returned its response through `withGovernedSpend` without registering a stream lifetime. Consequently it waited for inline settlement before returning already available audio. A new integration fixture uses the REAL governed boundary and spend meter, with simulated provider/budget RPCs. It holds settlement pending and observes whether PCM can be read. All five new tests fail on baseline; all five pass after the fix.
- TTS now registers body termination with the existing spend meter. The canonical boundary registers durable settlement through Vercel `waitUntil`. The full fixed-character reservation remains held until settlement; success settles the full ceiling as unmetered, failed/canceled/aborted transfer as ambiguous. Settlement failure leaves the reservation held. No cost rule, authority check, paid retry or refund was introduced. Authority cleanup still follows body termination.
- Batch transcription no longer imports the aggregate ElevenLabs SDK on its first request. It sends one native multipart request from the same sanctioned adapter to the documented `/v1/speech-to-text` endpoint. Scribe v2, Swedish, raw 16 kHz PCM, six fixed keyterms, no diarization/audio tags/timestamps, 90-second input cap, whole-minute reservation, 20-second deadline and zero retries remain. Rejections and ambiguous transport failures retain their existing financial classifications.
- The cold local Vitest transcription file took 61.6 seconds before removal of the aggregate SDK import and 119 ms afterwards. This includes local module transformation and is NOT a measured Vercel or phone latency improvement.

## Verification

- Final server code: 433 tests passed, one failed across 22 selected files (434 total).
- The sole failure is the pre-existing `atlas-chat.test.ts` assertion “does not observe a client abort”, which rejects the already-existing `request.signal` in the OpenAI chat path. Running the same 99-test file against baseline route source reproduced exactly one failure / 98 passes. Current source was restored byte-for-byte afterwards. That stale contract was not changed as part of this work.
- All selected voice, authority, durable spend, stream lifetime, dispatch-stop, static-conversation, ownership and conversation-controller tests passed.
- Final TypeScript: `npx --no-install tsc --noEmit`, exit 0.
- Chromium: 18/18 scenarios passed in 2.8 minutes with real AudioContext, AudioWorklet, self-hosted WASM and actual Silero V5; microphone speech is a local fixture and transcription/chat/TTS are simulated. Includes automatic quiet speech, three consecutive turns, correction, stale queue suppression, and failed/slow recorder/model startup and retry.
- The browser run preceded the final server-only multipart transport simplification. Its client source is unchanged; the real transcription adapter was verified in the subsequent final unit/integration and type runs.
- Diff whitespace check passed. No new paid provider tests were run.
- Full repository suite was not repeated for these bounded changes. The previous full run (on `7e6b80c`) had 403 pre-existing failures; do not describe the full suite as green.

Commands from `apps/web`:

```text
npm test -- lib/qa/atlas-voice-pilot lib/qa/atlas-live-voice lib/qa/m0-stream-settlement-lifetime.test.ts lib/qa/m0-durable-spend.test.ts lib/qa/governed-dispatch-stop.test.ts lib/qa/atlas-chat.test.ts lib/qa/atlas-static-conversation-route.test.ts lib/qa/chat-conversation-ownership.test.ts lib/atlas/conversation/controller.test.ts lib/qa/organization-middleware-runtime.test.ts lib/qa/organization-navigation-guard.test.ts lib/qa/ui-generation-middleware.test.ts lib/qa/overview-auth-navigation.test.ts --maxWorkers=2 --minWorkers=2
npx --no-install tsc --noEmit
npx --no-install playwright test --config=playwright.atlas-voice-pilot.config.ts
```

Local logs are ignored under `.superpowers/voice-recovery-logs/latency-morning-*`.

## Acceptance still needed

No new physical Pixel conversation has been timed. Do not claim a measured total improvement or instant responses. The remaining pipeline is still pause → batch STT → chat → TTS; streaming transcription while speaking is not activated. The 1.2-second automatic endpoint, Anders voice and speaker/headphone interruption semantics are unchanged. Locked-screen / pocket mode remains later work.

Mobile acceptance: three natural spoken questions without pressing “Klar med frågan”; inspect time to first audio; interrupt/correct; then stop and restart. Compare only samples from this deployment, including endReason=“pause”. If still slow, measure the remaining provider and governed preflight phases before changing models or introducing realtime infrastructure.

## Primary references

- [Vercel regions](https://vercel.com/docs/regions): dub1 maps to eu-west-1; functions should be close to the data source.
- [Next.js 14 route configuration](https://nextjs.org/docs/14/app/api-reference/file-conventions/route-segment-config#preferredregion).
- [ElevenLabs create transcript](https://elevenlabs.io/docs/api-reference/speech-to-text/convert): native multipart fields and raw PCM format.

## Deployment reconciliation follow-up

The first deployment of `1beb458` (`dpl_FvzgJytNfW9QduPyUQBUiuSZrZRv`) stopped at the unchanged fail-closed migration guard: the production ledger already contained `handlarborsen_competitor_candidates_v1`, merged on main after this isolated branch diverged.

Synced the exact canonical SQL, guard policy/count tests, DDL equivalence test and schema-security fixture from main `a129f9460102a4de1d564385ee011ec843d05f30` (registration originated in `feabd726dc1eaa1843d4b3a47be39294ec2dc0d1`). The fixture also carries main's existing social profile/publication classifications, which this preview had not yet copied. No application code from those tracks was merged and no SQL was applied, repaired or reordered; no guard exception was added.

Follow-up verification: **162/162** migration guard, migration security and canonical candidate-DDL tests passed. The canonical corpus is now 128 SQL / 114 enforced names; expected ledger is 151 known names. Voice runtime source is byte-for-byte unchanged from the tested `1beb458`.
