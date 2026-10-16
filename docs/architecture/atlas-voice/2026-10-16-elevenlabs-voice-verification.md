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
