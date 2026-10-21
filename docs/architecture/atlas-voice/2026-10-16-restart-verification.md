# Voice recovery after the 18:28 mobile report

Date: 2026-10-16 (Europe/Stockholm).
Parent: `99b856f1fdd883d4aec80deca2df349d171b661c`.
Scope: existing isolated preview in draft PR #359. Anders voice, models, two-second
thinking pause, provider admission, spending ceilings and foreground-only capture
remain unchanged.

## Evidence from the actual deployment

Vercel deployment `dpl_6PUnQaaGD7Uo6KfuHVWUt6XL9Qxd` logged middleware failures
at 18:26:42 and 18:27:16 for `POST /api/atlas/voice-pilot/speech`, then at 18:28:00
for `GET /atlas-voice-recorder.js`. Each says the function did not return its
initial response within 25 seconds.

The recorder is a public static AudioWorklet file with no credentials or personal
data. The old middleware matcher nevertheless sent it through session validation
and membership/ownership reads. The browser gave its download only 1.5 seconds,
closed the capture on failure, then incorrectly suggested a permission problem.
A new start fetched the same file through the same unavailable dependency.

This is direct evidence of a server-side blocker for voice requests and recorder
restart. It does not establish why the initial capture stopped: visibility change,
audio-stream interruption and device conditions remain separate possibilities.

Successful requests in the same session also remained slow:
- Scribe route duration: 3028, 3158 and 4493 ms.
- Chat first token: 1822 and 4267 ms, with fast-path context 340 and 396 ms.
- Speech response headers: 1357–2194 ms.
- The selected silence threshold adds 2000 ms before transcription.

These are stage measurements from different requests, not a summed end-to-end
turn. They exclude middleware time. Both observed chat turns used the fast path,
so the previous full-context parallelization cannot improve those turns.

## Changes

- Exclude the exact recorder asset from middleware matching; an exact defensive
  handler also avoids auth if middleware is called directly.
- Delegate only GET/POST on the exact speech route to its own complete guard.
  Fresh verified identity and the configured operator allowlist are still checked.
  Membership/revocation containment and the existing verified legacy-owner fallback
  move into that guard. They run before body parsing, provider lookup or spending.
  No session/role cache, client-supplied identity or broad API exception is added.
- Remove one redundant identity verification from every speech request.
- Bound that read-only authorization phase at five seconds, failing closed with
  503 and a stable code. Late completion cannot trigger any provider dispatch.
  Log only elapsed time and status, never speech, cookies or credentials.
- Map that code to a specific access-service message in input and playback.
  Never expose arbitrary server/proxy response text. Failed audio queues are not
  automatically replayed; a new explicit request can succeed.
- Give the static module download up to five seconds; audio-context resume keeps
  its existing 1.5-second bound. Cancellation still immediately releases tracks.
  Distinguish module loading, denied permission, missing microphone and device
  opening failure in user messages.

## Verification

- New middleware/route regression initially failed 5 of 18 cases on parent
  behavior: asset unnecessarily authenticated, identity verified twice on GET
  and POST, and both stalled identity/membership checks failed to return promptly.
  The corrected combined middleware + real route + real operator resolver passes
  all 18 with simulated Supabase/provider boundaries.
- Denial cases cover anonymous, nonoperator, collaborator, revoked collaborator
  even with project ownership, unknown user, membership lookup failure, ownership
  lookup failure and unconfigured operator. Production remains unavailable.
- Real HTTP recorder failure and a two-second asset download both reproduced
  startup failures in Chromium before the client correction. An initial
  page.route-based experiment did not intercept Chromium AudioWorklet requests;
  it was replaced with controlled HTTP responses in the local fixture server.
- 172/172 focused voice, live-voice and middleware tests pass.
- 14/14 Chromium tests pass with native AudioContext/AudioWorklet and simulated
  microphone/provider boundaries. They include a failed recorder download followed
  by successful restart and response without page reload, slow startup, immediate
  cancellation, three consecutive turns, queued continuations and correction.
- TypeScript `tsc --noEmit` and `git diff --check` pass.
- Full Windows suite: 12713 passed, 403 failed, 1277 pending (exit 1).
  All 403 failed test identities match the preceding 99b856f run exactly;
  no added or resolved failure identities. There are 97 failing files, as before.
  The suite is not green. The previous verification document records the baseline
  investigation, including the recurring platform-authority timeout.

No paid voice calls, database migrations, production merge or GPT-Live activation
were performed. These checks are not a physical-phone audibility/latency result.

## Remaining work

Verify the deployed recorder URL returns executable JavaScript, and the speech
route still refuses an unauthenticated caller without accessing the provider.
Then compare the new access-stage timing and actual mobile turn latency.
Batch transcription after the question ends remains a multi-second bottleneck;
the preview is not yet verified as a low-latency conversational system.
Reliable locked-screen brainstorming remains deferred, not implemented here.

Framework reference: [Next.js 14 middleware matching](https://nextjs.org/docs/14/app/building-your-application/routing/middleware).
Prior full-suite baseline and failure inventory:
[latency verification](2026-10-16-latency-verification.md).
