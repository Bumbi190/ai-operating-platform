# Atlas website entry and microphone-start repair — 2026-10-14

The operator could not find website building and reported no visible response when starting voice. Deployment alone had not established a usable entry flow.

## Result
- Owner Atlas Home exposes project-bound website links sourced only from its authorized project model.
- Legacy project pages expose the same build route. Owner vNext project links remain in place.
- An active organization owner entering a monitored project is redirected only when a fresh session-bound RLS read confirms the same exact project. Collaborator and foreign-project monitoring stays disabled and sanitized.
- Missing speech support, constructor/start throws, denied audio capture and asynchronous speech-service failures now produce inline feedback with a text fallback.
- Pending microphone start has visible progress and explicit cancellation. Cancellation retires the recognizer immediately; callbacks from an older recognizer cannot revive another session. Fatal speech errors stop automatic restart loops.

## Verification
- Initial Atlas entry/voice reproduction: four failures, two passes. Owner route reproduction: one failure, two passes.
- Further RED reproductions covered pending progress, legacy inline errors, 980px header overlap and native cancellation retaining a stale active lock (one native start instead of two after retry). The legacy test's initially ambiguous button locator was corrected against observed accessible labels before verifying its intended RED.
- Final Atlas entry suite after review repairs: 13/13 Chromium flows, unchanged 30-second test timeout, no retries; real home components and runtime, external SpeechRecognition doubles.
- Existing website workspace suite: 9/9 passed. After the final recognizer-cancellation edit, the two affected voice/route-cleanup flows passed again (2/2). Physical microphone and real provider generation are not inferred from these tests.
- Standalone typecheck and git diff --check pass.
- Eight related Vitest files: 148 passed, six failed. All six names independently match the previously recorded 362-name baseline; no repository-wide green is claimed.

The six inherited failures:
1. launcher renders in the platform layout / is mounted by the platform layout
2. PLACEMENT — the bottom-right corner is shared with the activity peek / the activity peek really is on screen at desktop where the launcher renders
3. PLACEMENT — the bottom-right corner is shared with the activity peek / shares a right edge with the peek so the corner reads as one stack
4. PLACEMENT — the bottom-right corner is shared with the activity peek / rides the panel above the launcher, not beside the peek
5. project command center · legacy rollback / keeps the legacy body byte-identical to the page it replaced
6. project command center · Marknadsplatsstatistik link / the view renders it as a plain link, with no project name of its own

## Release boundary
No schema, grants, provider keys, execution authority, budgets or existing protection policy changed. The normal PR checks are required for protected main; manually dispatched checks do not satisfy its pull-request requirement. Independent review and final protected release evidence are recorded in the PR description.

## Independent review and rulings
A single independent read-only review of the first repair commit found no Critical issues and two Important gaps. Its original verdict was not ready until those gaps were repaired; no second review is claimed.

1. Important: a pending recognizer could still replace a typed request's thinking phase. Root accepted this existing race as part of the conversation repair. sendMessage now retires recognition before changing phase or dispatch; a real-runtime browser reproduction observed RED, then GREEN.
2. Important: legacy warning copy referred to a local field that does not exist. Root accepted; fallback copy now permits text without claiming a local field and the legacy view provides an explicit /chat link. Browser reproduction observed RED, then GREEN.
3. Minor: exact-ID mismatch was not covered by the null-project refusal test. Root added a non-null, different-ID case; all four owner/collaborator route cases pass.
4. Physical microphone and speech-provider behavior are not proven by speech doubles; the user's exact browser cause still requires live user-session evidence.
5. Inherited repository failures are documented by name above and remain outside this focused repair. No failing assertion was weakened to obtain green.
6. Protected release checks/deployment were not part of the reviewer's inspection. Root verifies them separately on the final feature and merge commits before claiming release.
