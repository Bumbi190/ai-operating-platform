# Atlas Phase B — latency audit and bounded optimization

Date: 2026-09-19  
Branch: `feat/omnira-atlas-voice-latency`  
Base: `df2e66daaba8de9bca635995b107782a33f594fa`  
Base tree: `a8282376d4fd2b018b8428236fbd9d53d4d25cff`

This report separates three evidence classes. “Observed live baseline” is the
owner's single production observation. “Synthetic controlled” is the repeatable
12-sample local microbenchmark. “Live after” was not measured: the authenticated
route could be opened locally, but safe automation could not POST without either
extracting session credentials, adding a benchmark-only endpoint, or writing
normal chat data. Those alternatives were rejected by the task constraints.

## 1. Branch, base, head and tree

- Isolated branch/worktree created from the exact approved main commit and tree.
- Final head/tree are reported from Git at owner stop after the commits exist.
- Canonical checkout was not used for implementation.

## 2. Changed files

- Chat and TTS routes, Atlas runtime/latency/static classifier, MiniOrb.
- New pure modules: context slices, speech segmenter, SSE consumer, bounded queue.
- Focused QA suites, benchmark harness, and this report.

## 3. Original critical path

`speech-end → 800 ms silence detector → sendMessage → client auth + conversation
insert → /api/chat auth → project allow-list → live context → tool memory → action
memory → records-in-view → Anthropic stream → first SSE delta → React state (hidden
in MiniOrb while thinking) → sentence-terminal regex → /api/chat/tts auth → governed
OpenAI speech → full server arrayBuffer → full browser Blob → analyser preparation →
HTMLAudio playing event`.

## 4. Final critical path

`speech-end → unchanged 800 ms detector → sendMessage + immediate /api/chat → auth
→ safe classifier → project allow-list where required → independent context slices
in parallel → Anthropic stream → first SSE delta → visible React text → natural
incremental segment → bounded governed TTS request → response-body pass-through →
browser Blob → unchanged analyser/playback → real playing event`.

First-turn conversation insertion now starts server-side alongside model work; its
owned id returns over SSE. It does not block context, model dispatch, first token,
or first audio.

## 5. Baseline benchmark

Observed live baseline (one owner observation; no p50/p95 claimed):

| Metric | Value |
|---|---:|
| context | 839 ms |
| request-relative TTFT | 2.8 s |
| first complete sentence | 5.1 s |
| TTS | 3.7 s |
| playback handoff | 2 ms |
| first audio / total-to-audio | 8.8 s |
| first visible text | not captured |

Synthetic controlled baseline, 12 samples per case:

| Slice | min | p50 | p95 | max |
|---|---:|---:|---:|---:|
| sequential top-level context | 60.2 ms | 62.0 ms | 64.3 ms | 64.3 ms |
| sentence-only first segment | 31.0 ms | 33.6 ms | 34.3 ms | 34.3 ms |
| full-buffer proxy | 33.7 ms | 35.0 ms | 36.2 ms | 36.2 ms |

These fixture values measure wait topology only, not provider latency.

## 6. After benchmark

Synthetic controlled after, 12 samples per case:

| Slice | min | p50 | p95 | max |
|---|---:|---:|---:|---:|
| parallel top-level context | 19.7 ms | 20.6 ms | 21.9 ms | 21.9 ms |
| natural soft first segment | 10.5 ms | 12.1 ms | 12.2 ms | 12.2 ms |
| response-body pass-through | 8.0 ms | 9.2 ms | 10.5 ms | 10.5 ms |

Live-provider after values are deliberately absent. No provider request was made
during the stopped automation attempt, so there is no fabricated TTFT, TTS, or
first-audio result.

## 7. First-visible-text improvement

- Qualitative implementation result: first `text` SSE delta updates the response
  immediately and MiniOrb no longer hides it behind the thinking label.
- `TEXT_VISIBLE` is now recorded from the mounted response element's ref callback,
  separately from network `firstByte`; a closed MiniOrb panel cannot claim visibility.
- Absolute/percentage live improvement: not measurable without an after sample.

## 8. First-speakable improvement

- Synthetic p50: 33.6 → 12.1 ms, -21.5 ms / 64.0%.
- Synthetic p95: 34.3 → 12.2 ms, -22.1 ms / 64.4%.
- `FIRST_SPEAKABLE` is separate from retained `firstSentence`.

## 9. First-audio improvement

- Live after: not measured; no safe end-to-end provider sample was available.
- The two measured contributing topology changes were context p50 -66.8% and
  TTS proxy first-byte p50 -73.7% in controlled fixtures. These percentages must
  not be presented as first-audio production improvement.

## 10. Context changes

| Await/source | Classification | Final behavior |
|---|---|---|
| session authentication | required before model | unchanged |
| request parse/classifiers | required, synchronous | unchanged |
| project allow-list | required except proven static class | unchanged |
| conversation ownership/create | safe to defer | memoized server-side, concurrent |
| `buildLiveContext` | required full path; cached | existing 45 s cache retained |
| internal live collectors | safe to parallelize | existing parallelization retained |
| tool memory | relevant full path; parallel-safe | launched with other slices |
| action memory | truth-relevant full path; parallel-safe | launched with other slices |
| view normalization/block | synchronous | order retained |
| records-in-view | flag-gated, parallel-safe | launched with other slices |
| static identity/social turn | unnecessary operational context | exact allow-list only |

`hur mår du?` is now an exact static social phrase. `vad gör vi nu?`, `okej`,
`okej, kör`, status/project questions, actions, navigation, Dream findings and
context-dependent follow-ups remain full-path.

## 11. Segmentation algorithm

The pure incremental segmenter:

- prefers sentence terminals;
- allows comma/colon/semicolon only after six useful words and 42 characters;
- accumulates tiny 1–3 word fragments into a later segment;
- protects common Swedish abbreviations, decimals, clock times and URL-like text;
- preserves source characters exactly once and flushes final text exactly;
- removes presentation-only Markdown only from TTS input, never visible or saved text.

## 12. TTS transport changes

The authenticated TTS route still calls `openAISpeech`, which retains admission,
cost reservation/logging and in-flight governance until body completion. The
route now forwards the watched response body instead of first awaiting
`arrayBuffer()`. OpenAI's speech API supports streamed audio responses, including
audio and SSE stream formats: [official speech API reference](https://developers.openai.com/api/reference/cli/resources/audio/subresources/speech/methods/create).

The browser deliberately still completes the first small segment into a Blob for
stable HTMLAudio/analyser playback. MediaSource/Web Audio progressive decoding
was not introduced.

## 13. Playback/analyser preservation

- `speaking` still has exactly one source: the real media `playing` callback.
- analyser preparation, direct-play fallback, playback outcomes and object URL
  cleanup remain in the existing playback module.
- no fake speaking state was added.

## 14. Cancellation behavior

- A new generation aborts the previous chat fetch, cancels queued/active TTS,
  and stops old playback.
- The bounded FIFO permits two active TTS requests.
- Stale text, warnings, timing, playback starts and history writes are generation
  guarded. Queued object URLs are revoked.
- A failed segment is contained and later segments can still succeed.

## 15. Latency readout changes

Retained marks: T0, sent, first byte, first complete sentence, TTS start, Blob
ready, playback handoff, first audio. Added marks: first visible, first speakable,
and TTS response headers. The compact readout appears at visible text and expands
to `text`, `audio`, `ctx`, request-relative `TTFT`, `segment`, `TTS`, and playback
audio delay. TTFT is never called pure model latency.

## 16. Tests

- Focused Phase B selection: 102/102, then 104/104 integration contracts.
- Atlas/governance/playback regression selection: 337/338 initially; the single
  expected event-list contract was updated for the new `conversation` SSE event,
  then 104/104 passed.
- Phase A Dream/isolation/M4/migration selection: 235 passed, 31 SQL tests skipped.
- Full suite: 10,555 passed, 531 skipped, six 5-second timeouts under parallel
  load; all six files reran green, 263/263.
- `git diff --check`: passed.

## 17. Build/typecheck

- `npm run typecheck`: passed after installing locked dependencies in the worktree.
- Next production compilation: passed with the existing Supabase Edge warning.
- Full static prerender: blocked because build-time Supabase variables were not
  present. Loading the entire existing credential environment for build was not
  authorized by the TTS-only credential approval, so it was not bypassed.

## 18. Phase A regression status

No Phase A behavior was reopened. Dream reconciliation, resolution routing,
status context, project isolation, Memory M4 boundaries and migration guards pass
their executable non-Postgres suites. PostgreSQL-only tests remain unexecuted
without a local SQL harness.

## 19. Model/TTS/voice unchanged

YES: `claude-sonnet-4-6`, `gpt-4o-mini-tts`, and `onyx` are unchanged. The 800 ms
silence threshold is also unchanged.

## 20. Remaining latency bottleneck

The likely dominant live bottlenecks are Anthropic first-token latency and OpenAI
generation plus completion of the first MP3 segment in the browser. The exact
share cannot be claimed without a safe real-provider after benchmark.

## 21. Recommended next optimization

Run a preview or local authenticated benchmark harness that can issue bounded
same-origin route requests without exporting session credentials or writing chat
history. Capture at least ten simple turns plus representative context/status/tool
classes, then decide whether smaller segment thresholds or browser progressive
decode complexity are justified. Only after post-speech latency is quantified
should the 800 ms silence threshold be evaluated separately.

## 22. Production writes

None. No migration, production mutation, benchmark conversation, cost event, or
provider call was made. No API key was printed, copied, rotated, re-scoped, logged,
or written to the repository/report/env/Recovery.

## 23. Blockers and deviations

- Live after benchmark: stopped because safe automation could not POST through
  the authenticated route without credential extraction, a temporary endpoint,
  or production chat writes.
- Full build: compilation passed; prerender lacked Supabase build variables. A
  broader credential load was explicitly rejected and not circumvented.
- SQL integration suites: skipped because no local PostgreSQL harness was set.
- Full-suite six-file timeout cluster: load-related; every file passed on bounded
  rerun.
