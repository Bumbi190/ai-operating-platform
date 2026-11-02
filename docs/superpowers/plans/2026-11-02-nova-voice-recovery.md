# Nova voice recovery — NOVA-VOICE-RECOVERY-20261101

Owner request: reliable microphone, faster first audio, and interrupt Nova to correct/change subject. Reuse PR578; no new PR chain. Work in the existing owned clean social worktree, detached from PR578 head. Preserve the old voice worktree and untracked evidence.

## Evidence and design

Production 17e0e56: ordinary tool-enabled prose is withheld until final receipt verification. The user's campaign-status voice turn therefore waits for another model round even though a deterministic receipt already supplies the entire response. Runtime speech headers take 0.97–1.29s; chat context/first token vary and can dominate. Do not present provider header timing as audible latency.

Speaker mode intentionally gates microphone frames during playback and a 400ms echo tail. The compact/global panel has mute, expand and hangup, but no correction control. Keep speaker echo protection; expose a named Stoppa rösten control in both panel sizes while speech/output or a turn is pending. Preserve the microphone and running tools; corrections remain serialized after the current job. Keep natural spoken interruption opt-in for headphones.

Realtime runtime logs show some ambiguous provider closes (including a zero-audio connection), alongside successful turns. The exact external transport cause is unproven. After an explicitly classified post-ready transport loss, never replay captured audio. The next fresh phrase after silence can use the existing governed batch path instead of reopening the failing transport. An unverified handshake, wire refusal or other ambiguous failure stops capture. A deliberate microphone reconnect may start a fresh governed batch capture; access/budget/permission failures never automatically switch transport. Effective input mode must be reflected in the session. This is recovery handling, not a claim to have fixed the remote provider.

## Implementation and validation

1. Reconcile current main into existing voice PR. Preserve source/Notion/mail isolation and canonical social receipts. Existing source-text assertions may be aligned to deliberate combined guards; actual POST integration remains authoritative.
2. RED/GREEN: rendered panel must expose interruption while pending/speaking, in expanded and compact modes. Browser harness clicks real control, verifies immediate output stop, one open microphone, no stale audio and exactly-once serialized correction.
3. RED/GREEN: streamed failure never retries/replays, waits for silence, then batch accepts one fresh question. Access refusal stops instead. Existing stop/mute/output/headphone lifecycle coverage remains.
4. RED/GREEN: a voice-only get_social_campaign round emits canonical verified status without an unnecessary second model call. Nonvoice and preparation/multiple-write paths continue normally. No model prose reaches the receipt.
5. Run affected voice/chat suites, browser harness, typecheck and full project test command. Classify pre-existing failures against main with unchanged dependencies. Get independent whole-branch review, update existing PR578, and verify Preview/CI. No production completion claim before approved release and actual human audio checks.

## Acceptance limits

Automated PCM scheduling is not a physical speaker/headphone listening test. Preview must be owner-checkable. New image generation/publication, budget/key changes and schema changes are outside scope.
