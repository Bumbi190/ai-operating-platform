# Nova voice social receipts — review and verification
Work-ID: NOVA-VOICE-RECEIPTS-20261101. Base cb909318ea820a92aa30324caa09d9ab42041d75.
Original implementation 6ceb1dacd32971a6d6340b1a52a00d2dcc911916.
Independent read-only whole-branch reviewer: review_voice_social_receipts (gpt-6-astra). No critical authorization bypass; initial verdict request changes, eight Important findings.

## Review fix pass
All eight findings were reproduced in the real POST matrix before the single fix pass (12 failures /16 passes):
1. Earlier context/tool-round prose leaked before a later content call. Prose now waits across all unresolved rounds, is discarded if any social content/campaign tool is used, and is otherwise emitted and saved together at completion.
2. Broad continuation prefixes revived stale or superseded social context. Only standalone continuation phrases inherit the most recent substantive user topic.
3. General workflows and social profile/channel-plan actions were incorrectly forced into content completion mode. The completion/budget classifier is independent from broad tool routing.
4. New-image requests and genuine continuations hit content fast path. Recognize them before fast-path selection; existing draft reads also retain tools.
5. Content reads lost their actual observed state. Read receipts report native current counts/status and review links, separately from saved writes; a preparatory read never covers a failed save.
6. Voice omitted uncertain images and concurrent failure/interruption. Speech aggregates all confirmed and unresolved outcomes, retaining both warnings, within two sentences.
7. Ordinary text-only truncation lost spoken text or disagreed with reload. Preserve partial ordinary prose plus matching warning; partial tool outputs still never dispatch or automatically retry.
8. Idempotent save replay returns current project state, not originating revision provenance. Label the validated revision as the current matching version.

Final affected run: **176/176 passed, 8 files, no skips**. This includes 28 real POST receipt tests, 23 receipt edge tests, 51 honesty tests and source/Notion/OpenAI/action/isolation regressions. Initial 89/89 verified before independent review; do not confuse those with final coverage.
Local typecheck: six media dependency errors also reproduced on archived unchanged cb909318 with identical dependency links (Higgsfield MCP client and Remotion Lambda). Our callback annotation issue was fixed. No clean local typecheck claim.
Repository-wide run was attempted:802 files,14913 passed,418 failed,1397 pending, including the new RED review matrix loaded while running. This was exploratory, not exact-head release proof. Many failures require unavailable SQL containers, missing local dependencies or Unix commands on Windows. The final stable-head full run and baseline comparison must be read from their actual reports/PR checks; do not infer green.
The existing campaign CI gate now includes all102 social receipt/honesty tests, requires24+files and464+passing tests, and runs with at most2workers.

## Explicit boundaries
No paid images, production schema/data/config changes, budget increases, account connection, publishing or provider retries. User budget remains$2/day via existing native SEK ceiling. The three approved campaign items remain unchanged.
Model prose on ordinary tool-capable turns is delayed until the turn resolves; this prevents an earlier model claim leaking before a later social write. Static smalltalk and isolated source/Notion/mail streaming retain their existing path.
Physical microphone/audio quality and production activation require live evidence; the real route and TTS text-event boundary were tested, not the microphone.
PR578 document-mode integration is unclaimed and its dirty worktree is preserved.

## Deferred minors
- Reject duplicate ready post/revision rows and contradictory campaign status in malformed RPC results. Native SQL invariants ordinarily prevent these shapes; not a production blocker.
- Add a first-time enqueue case to the route fixture. Current realistic three-item case proves full argument passage and native idempotent replay; dedicated campaign store/SQL tests own enqueue.

## Recorded rulings
- Reused existing owned campaign branch after actual preflight review_required and inspecting PR578's separate scope/dirty worktree. Cost if wrong: later integration conflicts, no overwritten work.
- Cloud skill shell helpers are unavailable on the remote Windows executor; explicit ledger and test logs provide equivalent bookkeeping. Cost if wrong: process bookkeeping.
- Social navigation honesty now suppresses the unsupported claim before streaming instead of appending a warning afterward. Cost if wrong: less model prose on preparation.
- Microphone/production remain live acceptance boundaries; cost if wrong: device-specific audio defects can remain.
- Baseline/full-suite outcomes are verification evidence, not skipped decisions: unresolved failures must be reported and must not be called green.
