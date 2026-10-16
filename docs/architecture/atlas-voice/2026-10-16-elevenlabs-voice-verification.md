# Atlas Swedish ElevenLabs trial — verification

2026-10-16. Branch: `codex/atlas-swedish-live-voice-20261016`. Separate opt-in preview; current Atlas voice is not replaced.

## Delivered scope

- `/atlas/rosttest`: operator-only and preview/development-only page. Two actual native Swedish library candidates, Anders and Peter, with Flash v2.5 and server-owned Swedish language enforcement.
- Continuous microphone/recognition lifetime, acoustic RMS thinking pause (2/3.5/5 seconds), final-transcript requirement, local speech interruption, and cancellation of stale queued speech. A pending backend task continues; further speech stays in an accumulated editable draft.
- PCM 24 kHz streaming through `/api/atlas/voice-pilot/speech`. Playback starts on incoming PCM chunks, without buffering a complete server response or browser blob. This is a tested dataflow property, not a measured end-to-end audible latency result.
- Existing conversation controller and authenticated chat APIs, in a separate trial conversation. Existing project/tool authority is retained.
- Provider I/O stays in the existing sanctioned ElevenLabs module. Fresh availability lookup excludes custom sharing rates. Each paid request is bounded to 600 input characters; canonical fixed-unit reservation precedes physical dispatch, with no automatic retry. Authority watches body termination, including abort/error under downstream backpressure. Central ledger quantization remains unchanged.
- The route owns its explicitly reviewed personal-assistance `OPERATOR_INTERACTIVE`/`GLOBAL_ONLY` contract. Provider helpers forward it. The audit inventory adds precisely this route and changes the audited ElevenLabs fixed-unit callsite count from two to three. No provider allowlist or general scan exclusion was added.

## Checks

| Check | Result |
| --- | --- |
| New microphone/pause/cancellation tests | 10/10 passed |
| New route/auth/origin/body/character-ceiling/stream-lifetime tests | 8/8 passed |
| New streaming PCM/player tests | 4/4 passed |
| Combined focused regression, cost, precision and provider-boundary checks | 254/254 passed across 14 files |
| Standalone TypeScript, `tsc --noEmit --incremental false` | passed |
| `git diff --check` | passed |
| Independent review | no remaining Critical or Important findings after corrections; reviewer independently reran 22/22 new tests |

After synchronizing latest `main` (`7ded1f5d36d21916a7551008c5fff1448251794b`) into this branch without conflicts, the complete suite was rerun against an isolated worktree of that exact main commit with identical dependencies and two workers. Main baseline: 14,111 total, 12,685 passed, 186 failed, 1,236 pending. Voice branch: **14,170 total, 12,744 passed, 186 failed, 1,236 pending**. Failed assertion identities and failed file identities match exactly: zero new or resolved failures. All 22 new ElevenLabs tests and the 26 migration-guard tests pass; standalone TypeScript also passes after synchronization. The full repository is not green. Inherited assertion/setup failures were not repaired or excluded for this work. The earlier comparison against the pre-social-launch base was 12,666 versus 12,725 passed, with the same 186 failed and 1,217 pending on both sides.

Compared with current main, `apps/web/lib/atlas/runtime.tsx`, existing chat routes, brand voice configuration, cost implementations, AI wrappers, workflows and dependency manifests remain unchanged. Existing narrator/sound function bodies in `lib/media/elevenlabs.ts` are byte-identical; the new streaming capability is appended with the required imports.

## Listening samples and actual spend

Two 151-character samples using the same Swedish text completed through the explicitly requested ElevenLabs plugin:

| Voice | Model | Generated duration | Reported credits | Reported charge |
| --- | --- | ---: | ---: | ---: |
| Anders | `eleven_flash_v2_5` | 8.591 s | 151 | $0.0302 |
| Peter | `eleven_flash_v2_5` | 8.731 s | 151 | $0.0302 |

Combined: **302 credits / $0.0604**. Both MP3s are available for user listening. These are actual audio generations; voice-library descriptions alone do not establish which voice André prefers or whether accent/prosody is satisfactory.

## Remaining live checks

No integrated paid trial-route request, real microphone conversation, physical speaker/headphone echo evaluation, audible latency measurement or interruption-delay measurement is claimed. React sample/draft race corrections were independently reviewed but not exercised in a browser interaction suite.

Reproducible UI fixture: run `node e2e/atlas-voice-pilot-server.mjs` from `apps/web`, then open `http://127.0.0.1:54397/atlas/rosttest`. It renders the actual trial component and native Web Audio with simulated ASR/API/account boundaries and visible controls for delayed audio preparation, delayed conversation creation, consecutive interruptions, task completion and signout. It makes no paid call. The available cloud browser could not reach this local server (`ERR_CONNECTION_REFUSED`); no screenshot, interaction pass or microphone success is claimed.

The published preview must still be exercised with André's signed-in operator account and browser audio devices. First compare the two real voice samples; then test longer Swedish thoughts, mid-answer corrections, speaker versus headphone echo, navigation/signout cleanup, and a real task's continued completion after interrupted speech. GPT-Live paid activation remains separately blocked by its unresolved duration ceiling. No production activation or key change was performed.

## Preview synchronization

The first ElevenLabs deployment stopped at the existing read-only migration guard because parallel social-launch work had reached production after the voice branch was created. Merge commit `0b6ff9efe3079e96123850fdc8d85e66f75a7926` imports the exact current main migration, policy and social-launch code with both parents retained. No guard override, database mutation, production merge or key change was used. Deployment `dpl_FwzaDtra5SEQTeRmZuvwtRCiNs69` is READY at `https://ai-operating-platform-13zp8pjqh-bumbi190s-projects.vercel.app`. It passed the migration guard and Next compilation. An authenticated Vercel fetch of `/atlas/rosttest` returned HTTP 200 for the application login page, as expected without an operator session. This verifies a reachable deployment and the application sign-in boundary, not the signed-in voice UI or audio quality. Draft PR: https://github.com/Bumbi190/ai-operating-platform/pull/359 .

## Follow-up after André's Mac test: speaker echo and response wait

André prefers Anders and reports a substantially better conversation, with remaining slow replies and loudspeaker output recognized as his own input. The original code requested echo cancellation only on the stream used for RMS monitoring; native recognition called `start()` without that stream. The RMS gate also treated any sustained sound as an interruption. These are concrete implementation weaknesses; the exact hardware echo path has not been recorded or measured.

Changes remain in this isolated preview:

- Recognition receives the same captured audio track as the acoustic monitor via the specified `start(audioTrack)` overload. Older implementations may ignore the extra argument, so correctness of speaker-mode gating does not depend on overload support.
- The default **Högtalare** mode suspends both recognition and acoustic turn submission before PCM output is scheduled, ignores late recognizer callbacks, and starts a fresh recognizer after playback plus a 400 ms echo tail. The microphone track stays owned until stop/navigation/signout. The **Avbryt** button stops output; readiness says **Atlas lyssnar** only after the current recognizer's native `onstart`. Talking during recovery is not promised to be captured.
- **Hörlurar** mode retains interruption by speaking. This is an explicit interaction tradeoff, not a claim of OpenAI-style full-duplex loudspeaker echo cancellation. Actual Mac speaker/headphone testing is still required.
- A useful opening phrase can enter speech generation after at most 80 characters instead of waiting for a long sentence or the previous 220-character fallback. Later chunks remain bounded at 220 characters before the existing player/route ceilings. All reply text is preserved.
- Optional **1,2 sekunder** thinking pause; the default remains 2 seconds and longer pauses remain available. It reduces only the selected endpoint wait when final transcription is available; it does not remove ASR, model/tool, governance or TTS latency.
- The expandable **Svarstid i senaste frågan** shows actual acoustic quiet time before automatic submission, time from local submission to first response text and to the player's scheduled playback indicator. This is per-turn in-memory timing, not new telemetry, audio recording, a physical audible-latency measurement or proof of a model/provider bottleneck.

The existing chat/model selection, API/provider adapter, spend controls, rates and keys are untouched. No additional paid generations were made for this correction. A read-only independent review's one Important finding (a button inviting speech during the 400 ms recovery) was corrected and re-reviewed: no remaining Important or Critical findings; reviewer independently ran 23 capture/player/reply tests. The complete focused pilot suite passes 31/31, standalone TypeScript and `git diff --check` pass. Whole-suite comparison and preview publication are recorded below after completion.

Research references: Web Speech API methods https://wicg.github.io/speech-api/ ; Chromium implementation and track-sink dispatch https://chromium.googlesource.com/chromium/src/+/02185d54c93bb01c3ec3e8a709fd48b1bf9fef48/third_party/blink/renderer/modules/speech/speech_recognition.cc . The local Browser plugin returned UNAVAILABLE (session closed), so no new browser-interaction or physical echo pass is claimed.

Frozen-source whole-suite comparison against parent `a39a6886e3097e72370808f04136555ea068994f`, same lockfile dependencies and two workers: parent 14,170 total / 12,744 passed / 186 failed / 1,236 pending; corrected preview 14,179 total / 12,753 passed / 186 failed / 1,236 pending. Failed assertion identities and failed file identities match exactly: zero new or resolved failures. The repository remains red on the inherited assertion/setup failures documented above and in `2026-10-16-live-voice-verification.md`; no assertions or general QA inventories were weakened. The final focused 31/31, standalone TypeScript and diff checks passed after the readiness correction. Preview deployment completion is monitored separately from these source checks.
