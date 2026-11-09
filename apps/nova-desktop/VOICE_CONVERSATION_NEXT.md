# Nova Desktop: Continuous voice call and operator interruption

## Current verified work (9 November 2026 ? local feature branch)

- The new native Nova overlay still uses one-shot Windows voice typing (Win+H).
- The native overlay now has a visible Stopp button, exact spoken stop intents,
  Ctrl+. inside Nova, and a global Ctrl+Alt+. handled by the resident host.
- The local Atlas relay is deliberately read-only and cannot update the calendar.
- The existing Omnira /calendar and Atlas calendar tools are already implemented.
- Atlas browser voice already has VAD, Swedish speech recognition, TTS playback,
  transcript state, mic permissions, and paid-stream budgeting. This branch
  adds an immediate interrupt button, aborts the active chat request and TTS,
  and guards against starting further tools after cancellation.
- A completed tool side effect is not automatically undone by Stop.
- None of the new Atlas browser changes are in production. Hardware testing
  and an SSO-protected feature preview are still required.

## Implemented locally in this continuation

- NovaBridgeProvider is mounted inside the authenticated Atlas platform
  layout, so its pairing token, polling loop and voice-control channel survive
  client-side Omnira navigation. The pairing token remains in memory only and
  is scrubbed from the URL.
- The /nova-bridge page now offers **Anslut Nova** and **Starta r?stsamtal**.
  The latter calls the existing Atlas runtime synchronously from the user's
  click, then records explicit voice consent in the local relay.
- The local loopback relay now has allowlisted voice authorize/revoke/status
  endpoints and acknowledged voice_toggle / voice_interrupt commands.
  It does not carry audio, cookies, transcripts, credentials or model prompts
  for the voice call.
- The global Ctrl+Alt+Space toggles the Atlas voice session after consent.
  Before consent it retains the existing Win+H one-shot dictation fallback.
- Ctrl+Alt+. and the visible Nova Stopp action send voice_interrupt to
  the existing Atlas voice runtime. The browser owns mic capture, VAD, TTS
  and the authenticated Atlas conversation; no second voice provider was added.
- The dedicated Omnira bridge window should remain open while the operator
  uses other apps. The provider survives navigation inside Omnira, not a full
  browser close or navigation away from Omnira in that window.
- The full Atlas voice conversation uses the normal authenticated tool path;
  the separate Nova page-reading relay remains read-only.
- Verification so far: 119 Windows unit tests pass; 81 targeted web voice,
  bridge and controller tests pass; TypeScript check passes. Live microphone,
  browser pairing and hardware tests are not yet done.

## Real goal

One Ctrl+Alt+Space opens the same Nova bubble; after permission is granted
she can hold a continuous two-way conversation while other Windows apps are
in focus. Operator speech is interpreted through Atlas; Nova executes only
approved, narrowly scoped desktop and calendar actions.

### Build this without another paid service

1. Reuse the browser-owned Atlas PCM capture, Silero VAD and voice pilot
   transcription + speech player. Do not introduce a second subscription,
   a separate AI identity, or hard-coded credentials in the Windows host.
2. Add a separately approved voice session to the already authenticated
   /nova-bridge browser tab. Browser mic permission and audio playback must
   be activated by a user gesture when required; never bypass it from native.
3. Extend the short-lived localhost pairing protocol to carry microphone
   transcripts and generation-safe stop/pause commands, with strict
   origin/token checks and a session-bound execution epoch.
4. Route spoken commands through Nova's existing strict local intent parser
   and Atlas's authenticated, project-scoped tools. Never execute model prose
   as native OS commands.
5. Feed replies to the existing voice player; keep browser mic capture
   active across turns. Show transcript/voice/permission state in the
   native Nova bubble. No invisible microphone recording.
6. Make stop work for mouse, Ctrl+Alt+., and exact "Nova stopp". When
   headphones are selected, allow speech onset to interrupt playback and
   preserve the user's correction. Speaker mode uses manual interrupt while
   TTS is playing to prevent self-trigger and echo.
7. For calendar: add an explicit narrowly scoped approval flow that uses
   the existing owner-authenticated Atlas calendar tools. Before mutation
   show title/date/time/participants and require approval when appropriate.
   Return the actual calendar mutation receipt and display the updated event.
8. Keep budget ceilings: no paid STT calls during silence, TTS only for
   accepted reply chunks, abort in-flight requests, timeouts, and cost telemetry.

### Acceptance criteria

- Five natural multi-turn exchanges after starting a single voice call.
- An interrupted reply stops audio immediately and aborts the active stream.
- A user can correct herself/himself without a queued stale reply firing.
- Ctrl+Alt+. works even when another desktop app owns keyboard focus.
- Speaker mode never mistakes Nova's own voice for a new command.
- A canceled plan never starts additional steps; completed actions are
  clearly reported as irreversible rather than falsely claiming rollback.
- One verified create/update/cancel calendar flow with receipts, after approval.
- No new paid providers, no changes to unrelated projects or branches.
- SSO-protected preview and physical Windows/Brave/headset/Sonic mic tests
  before any production deployment.

### Branch and cleanup

All implementation continues on:
feat/nova-desktop-ui-automation-20261109

Only once functionality is integrated, tested and production-approved should
related older Nova branches/worktrees be audited and deleted after ensuring
no unique work, uncommitted files, or existing tasks are lost.