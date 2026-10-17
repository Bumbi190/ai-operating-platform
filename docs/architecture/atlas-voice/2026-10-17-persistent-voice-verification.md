# Persistent Anders voice verification
Release PR: https://github.com/Bumbi190/ai-operating-platform/pull/385 (canonical merge/deployment receipt is maintained in the PR).

André requested one tap on the forehead star and persistent voice throughout Omnira, including navigation, projects, costs and Bygg med Atlas. The accepted engine is extracted into useAtlasVoiceSession and mounted once in AtlasRuntimeProvider with the shared controller. The live voice page reuses that owner. Full chat exposes a separate continuous-call launcher while retaining its existing reviewed one-shot composer recording.

## Evidence
- Full real WebAudio/worklet/Silero Native suite: 47/47 on d5b7984, one worker, zero retries, simulated media and local provider only.
- The final full-chat launcher changes only AtlasMiniOrb plus test fixtures. Targeted affected shell/full-chat suite: 19/19, including its new mobile one-tap case. Runtime, hook and controller remain byte-identical to the full-suite version.
- Dashboard/messenger suite: 32/32; home microphone/read-only/error/cancel subset: 10/10 in an isolated run. Three unrelated website-entry cases remain excluded, as their failures were reproduced on the prior release.
- Expanded unit scope: 556 passed, one unchanged baseline failure out of 557, 30 files. All 28 controller tests pass, including five new settlement tests.
- Baseline failure: atlas-chat.test.ts, 'does not observe a client abort — which is why there is no stop control'. Both its source and app/api/chat/route.ts are unchanged; Git blobs match main146c5db and baseline461c92a. The same failure was reproduced in the owned baseline worktree. It is not a regression from this change.
- Source is frozen during browser tests. A concurrent multi-Vite home run produced reload/detach failures; the subsequent isolated run passed 10/10.

## Independent review and fixes
Four findings were reproduced in Native against the real AtlasChatConversation, then passed after fixes:
1. Explicit null-to-existing thread selection now retires initial microphone/transcription; subscribeCreated distinguishes legitimate first creation.
2. Speech queued behind a full-chat/build turn resumes only after a successful current controller settlement. Failed or stale turns cannot later replay it.
3. PCM capture failure/end settles the real composer's recording state.
4. Returned one-shot cancellation is scoped to its lifetime, so it cannot stop a newer session.

## Limits
No paid provider-only probe, production impersonation or authenticated physical phone call was performed. André's Android/Brave playback remains the physical check. Lock-screen/pocket support is unchanged and not guaranteed. Provider authorization, reservations, Origin checks, regions, Anders and PCM/VAD/turn limits are unchanged.
