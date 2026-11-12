# Nova Desktop and Atlas chat recovery — 2026-11-12

## Scope and evidence

This change continues `feat/nova-desktop-ui-automation-20261109` from baseline
`a50fce2fc279d55f7279655caf1282df4002fb94` in its existing isolated worktree.
It addresses the silent calendar request and the desktop voice routing failures.
It does not establish general autonomous desktop capability.

Read-only production observations on 12 November, around 09:05 UTC:
- Three user turns reached `/api/chat`. Each completed `get_current_time`,
  then ended in the generic provider error without an assistant answer.
- The cost journal identifies OpenAI / `gpt-5.4-mini`; the old log incorrectly
  named Anthropic. Each second completion recorded exactly 150 output tokens.
- The expected private event was absent from the owner's calendar at inspection.
  No calendar event was inserted or replayed during this repair.
- Production was running main commit `8f1b2581d1376afeeebc7d5c86d3dd0483533afc`;
  the selected desktop preview was on the baseline Nova commit.

Source inspection and an offline reproduction explain that pattern: ordinary
voice turns offered tools but allowed only 150 output tokens. The OpenAI
adapter rejected length termination before the route could handle it.
A natural private-calendar request did not match the older special-case
allowances. The live provider finish reason was not independently available;
the matching usage pattern, code path and deterministic regression support the
diagnosis. Private conversation content and identifiers are intentionally omitted.

## Resulting behavior

1. **Tool payloads:** voice rounds offering tools receive the existing 4096-token
   allowance. Tool-free voice stays at 150, read-only text at 900, and ordinary
   content text at 1200. Spoken brevity remains a prompt constraint.
2. **Safe failure:** length termination becomes a typed, actionable Swedish error.
   Partial tool arguments are never executed. No automatic retry was added.
   An earlier successful calendar receipt survives a later response failure.
3. **Conversation completion:** initial conversation creation is bounded at 30
   seconds and a turn at 130 seconds. The latter includes the server's current
   120-second budget plus a transport margin. Terminal SSE events settle the
   request without waiting indefinitely for connection closure.
4. **Cancellation and sessions:** cancellation settles even when a transport
   ignores its abort signal. Signout aborts all in-flight turns, including
   background conversations; old callbacks cannot overwrite a new session.
5. **Desktop voice:** selecting Sanna no longer vetoes the authenticated native
   Atlas route. Native capture pauses before handing a turn to Atlas.
6. **Desktop calendar:** natural action phrasing and explicit personal calendar
   questions reach the existing operator review. Unpaired requests wait for
   connection. The existing run/cancel choices remain; the tool-free
   `nova_readonly` path receives no additional authority or calendar data.

## Verification

- Desktop: **49/49** focused Python tests (16 new routing regressions plus 33
  adjacent owner-command, stop and core tests).
- Web: **148/148** tests across nine suites in one final run, exit code 0.
- Full web TypeScript check: `tsc --noEmit --incremental false`, exit code 0.
- Independent reviews covered the provider path and the final controller diff.
  A signout race found in review was corrected and regression-tested.
- `git diff --check` passed before committing.
- Tests use synthetic fixtures and mocked providers. No paid model requests,
  production data writes or external messages were made for verification.

Reproduce from `apps/web`:

```text
node ../../node_modules/vitest/vitest.mjs run lib/qa/atlas-voice-tool-route.test.ts lib/qa/atlas-openai-chat.test.ts lib/qa/nova-social-receipts-route.test.ts lib/qa/nova-bridge-voice-runtime.test.ts lib/qa/atlas-static-conversation-route.test.ts lib/qa/atlas-tts-error-contract.test.ts lib/atlas/conversation/controller.test.ts lib/atlas/conversation/controller-deadline.test.ts lib/atlas/conversation/calendar-effects.test.ts --pool=forks --maxWorkers=1 --minWorkers=1
node ../../node_modules/typescript/bin/tsc --noEmit --incremental false
```

## Activation and remaining acceptance

The patch and offline tests are not proof of live microphone/calendar operation.
The browser connector was unavailable from this Voice session. The running
desktop process has not been restarted, so it still holds the old Python code.

Use the existing SSO-protected preview for interactive acceptance. Finish or copy
any unsent desktop draft, then use **Avsluta Nova** before relaunching: simply
running the shortcut again focuses the existing process and does not reload it.
A genuine restart discards in-memory drafts/reviews and renews the bridge port
and pairing key, so reconnect through the preview's Nova bridge. Saved voice,
position and preview-origin settings persist.

Verify a real authenticated calendar read, then a deliberately authorized event
creation: the event must appear once with the correct local date/time and a real
success receipt. Verify cancellation and the return to listening with the user's
actual microphone/headset. Do not repeat an ambiguous write without checking for
its receipt/event first. Production activation remains a separate release step.

The increased output allowance permits up to 3946 additional output tokens per
affected tool round; actual charges depend on usage. Existing spend gates, grant
limits, provider choice and loop ceiling remain unchanged. No new credentials,
dependencies, schema changes or permissions are introduced. Before release, use
the existing budget controls and verify the deployed commit. Rollback is a
normal revert of this patch and redeployment of the previously verified preview;
it does not undo any independently authorized calendar action.
