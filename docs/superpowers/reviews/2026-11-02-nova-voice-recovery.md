# Nova voice recovery review — 2026-11-02

Work ID NOVA-VOICE-RECOVERY-20261101; existing PR578. Base17e0e563, independently reviewed head0f4c93c. Reviewer read the entire branch, not only the newest recovery patch, without checkout mutations or paid tests.

## Independent findings and one focused fix pass

- Important: actual WebSocket failures were not the injected voice_access_unavailable error used by the old PCM fixture. Recovery now requires the explicit internal post-ready transport-loss code. A failed/unverified handshake, wire unavailable/aborted and protocol/capacity/timeout failures stop capture and never automatically enter batch. An explicit subsequent microphone activation chooses fresh governed batch capture. Both transports retain their existing server authority/spend checks.
- Important: voice-document tool filtering lacked server dispatch enforcement. Document turns now reject writes/actions outside the read allowlist; deliberate incomplete-document continuation rejects every tool. Real POST adversarial tool tests cover save_workflow, trigger_workflow and get_current_time.
- Important: truncated tool rounds could discard an already-streamed partial document. They now persist the emitted text with an incomplete marker and continuation metadata without running partial tools. Potential social prose remains withheld.
- Minor, deferred: after an inline introduction, a read tool and a later interrupted final segment, the compact document continuation affordance can be absent until reload because it compares aggregate history with the last entry. The full chat and deliberate spoken continuation remain available. This is outside the reported microphone/interruption/first-audio regression and is not claimed fixed.

The three Important cases were reproduced as nine failing tests before the correction; the combined real-route/PCM/transport/source/social regression passed149/149 afterward. Root checked the focused fixes against the independent findings; no claim of a second independent approval.

## Validation recorded during implementation

- Current-main reconciliation:114/114.
- New recovery RED:6 failures, then95/95 GREEN. Resumed-listening display separately RED then GREEN.
- Broad voice/chat run:684 passed,1 failed across39 files. The single failure is the existing atlas-chat source-label assertion; exact-main17e0e56 baseline also fails it (plus two older assertions corrected by the prior voice work).
- Notion, aggregate evidence, Strato source-contract alignment:87/87; Curator routing28/28, zero skips. Exact-text checks now include the combined continuation exclusion and the baseTools -> narrower activeTools pipeline.
- Browser5/5: compact and expanded interruption, one microphone remains open, correction dispatched exactly once after pending job, speaker echo suppression, post-ready transport recovery, and unverified handshake stopping before explicit fresh batch reconnect.
- Deliberate batch reconnect separately RED: old behavior remained streaming after restart; GREEN is included in the5-case browser run.
- Typecheck initially identified a new implicit-any in the shortcut; it was typed explicitly. Six existing Higgsfield/Remotion dependency errors remain in the local shared dependency installation. Do not describe the local whole-project typecheck as green.
- Full pre-review project command:806files,14986passed,412failed,1397pending. Exact-main baseline:120existing failed-suite files,2654passed,406failed,297pending. Every named failure is accounted for:404 reproduced on main;8 pass current focused rechecks;0 unresolved names. Two baseline failures were already corrected by inherited voice work. See the full named accounting file; this is not a green whole-repository claim.

No image generation, publication, production deployment, budget/credential/schema or domain changes were performed. Physical microphone, speaker/headphone listening and audible latency remain owner acceptance.

## Separate Preview dependency review

Vercel initially blocked Preview on two owner-applied migrations missing from source. Root re-read live migration metadata/digests and imported only the exact reviewed SQL blobs, retaining frozen guard algorithms and histories. RED5failed/1passed, then58/58guard tests passed. A separate read-only dependency review of bf3db2b..1e295e0 found no blockers, checked Git source/ledger representation parity and six mandatory anti-skip cases. It did not approve production or re-review the inherited Harvey feature. See the source-parity report.

CI and final hosted Preview readiness are recorded on PR578 for the final head. No production release is inferred from a successful build. Planning received an explicit author second-pass; that planning pass was not independent.

## Managed input default

The final server composition selects governed batch transcription in Production as well as Preview. This promotes the previously owner-accepted Preview path instead of requiring a new user to hit a realtime error first. The realtime entry/authority gates remain unchanged for isolated tests. Existing wiring regression was RED on the former preference and GREEN after the composition change; the five-case real-worklet browser harness already exercises this same managed batch path. No provider is changed and all spend controls remain in place. Physical audible latency still needs owner acceptance.
