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

Whole repo comparison used identical dependencies and the previously inspected base, with the final runtime/test source frozen. Baseline: 14,073 total, 12,666 passed, 186 failed, 1,217 pending. Final: **14,132 total, 12,725 passed, 186 failed, 1,217 pending**. Failed assertion identities and failed file identities match exactly: zero new or resolved failures. The full repository is not green. The inherited assertion/setup failures remain listed in `2026-10-16-live-voice-verification.md`; they were not repaired or excluded for this work.

`apps/web/lib/atlas/runtime.tsx`, existing chat routes, brand voice configuration, cost implementations, AI wrappers, workflows and dependency manifests remain unchanged. Existing narrator/sound function bodies in `lib/media/elevenlabs.ts` are byte-identical; the new streaming capability is appended with the required imports.

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
