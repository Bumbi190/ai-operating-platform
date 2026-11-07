# Nova Desktop ↔ Atlas — isolated browser verification

**QA date:** 2026-11-07
**Machine:** authorized stationary Windows PC, Hultgren
**QA branch:** `feat/nova-atlas-bridge-qa-20261107`
**Baseline:** `5577b89` from `feat/nova-global-shortcut-20261106`
**Actual protected preview web source tested:** commit `bea226e`, branch `feat/nova-main-integration-20261106`

## Recovery fixes prepared in QA (not deployed)

Two reproducible defects were identified, shown failing in tests, and fixed:

- **Orphaned Atlas jobs:** closing the browser during a task left the local
  task in `executing` indefinitely, which blocked new queries. In the QA
  branch, an expired browser heartbeat now transitions that task to `failed`
  once, emits a visible error, and allows a fresh paired tab to start a
  new task. An explicit replacement of a still-live tab cancels the former
  task; its late `/event` messages are denied.
- **Pausa → Anslut race:** an immediate click on Anslut after Pausa was silently
  ignored because the old polling loop still held `pollRef.current`.
  The proposed QA client waits for the previous loop to drain (bounded) before
  connecting and prevents multiple simultaneous connect attempts.

## Browser session binding — protocol v2 (also prepared, not deployed)

- The existing URL fragment pairing key permits an operator to click
  **Anslut**, but **it no longer authorizes `/next`, `/status`, or `/event`
  on its own**. The local bridge returns an independent 32-byte-equivalent
  random `session` value from `POST /connect`.
- The browser stores this second session only in memory and must send
  `X-Nova-Session` with all subsequent bridge calls. It is not placed in the
  URL, logs, cookies, local storage or source.
- A second explicit browser pairing rotates the current session, cancels a
  previous in-flight task, and denies the earlier browser's subsequent reads
  and result writes with HTTP 403. An expired heartbeat invalidates the old
  session as well. Session verification and `/next`, `/status`, or `/event`
  operations run under the same Python `RLock` so a concurrent new pairing
  cannot rotate the session between authorization and task access.
- A real Chromium two-tab test passes: after tab two connects, tab one loses
  its session and cannot fetch the next task; tab two completes the task.
  This is tested against the proposed v2 browser component and bridge in a
  new ephemeral Chromium session.
  Unit tests also reject fragment-only and stale-session requests.
- **Protocol compatibility:** the `bea226e` preview implements v1 and does
  not send `X-Nova-Session`. The new local bridge implements v2. **Do not
  update either side independently.** For the integration handoff, transfer
  these as a coordinated patch:
  `apps/nova-desktop/nova_bridge.py`,
  `apps/web/app/(platform)/nova-bridge/page.tsx`, plus the
  `apps/nova-desktop/tests/test_bridge.py` coverage. Reconcile existing
  uncommitted changes in `feat/nova-main-integration-20261106` instead of
  overwriting files. Then deploy a new SSO-protected preview and select its
  exact origin in Nova before verifying live account and memory behavior.

**IMPORTANT:** All these changes are confined to the separate QA worktree.
Vercel's currently protected preview deploy `bea226e` and the active
Nova Premium desktop remain unchanged until deliberately integrated.

## Findings

1. **Vercel preview:** `ai-operating-platform-web` deployment of `bea226e` is READY, non-production and SSO-protected; this was confirmed via read-only Vercel metadata. Nothing is pushed here.
2. **Actual React component (not a mock of the component):** this harness retrieves `apps/web/app/(platform)/nova-bridge/page.tsx` via `git show bea226e:...`, transpiles it with already-installed Vite, and renders it in a new temporary, unprivileged Chromium browser context.
3. **Real local HTTP transport:** `bridge_fixture.py` starts the actual `NovaBridge` Python HTTP server on `127.0.0.1`. Browser issues real cross-origin CORS requests to it using an ephemeral one-time test key.
4. **Synthetic Atlas SSE:** only `/api/chat` is intercepted and replaced by test SSE. No live AI model, API key, inbox, Supabase session or external content is used.
5. **Passed browser checks:** explicit pairing + hash removal, answer streaming and `done` receipt, two-turn local context, rejected unexpected tool-use event, cancellation of a deliberately delayed provider reply (no late text or false completion), and manual pause.
6. **Passed immutable server-contract checks:** TypeScript syntax, `nova_readonly` envelope rejecting 12 action-capable/oversize payload shapes, empty executable tools, early validation before build approval, project-scoped memory call, and a second hard-stop before unexpected tool handling.
7. **Local Python regression:** 70 tests passed on the QA worktree, including
   the new session-isolation and stale-credential tests.
8. **No paid installs:** existing Python, Playwright, Vite, React and TypeScript reused from local environment; no new accounts, models, subscriptions or deployments.

## How to rerun (stationary Windows only)

From `apps/nova-desktop/`:

```powershell
python -m unittest discover -s tests -p 'test_*.py' -q
node qa-browser/check_server_contract.cjs
node qa-browser/test_browser_relay.cjs
# Compare against the immutable published v1 preview and its own v1 bridge:
node qa-browser/test_browser_relay.cjs
# Validate the new, mutually compatible v2 browser + v2 bridge (PowerShell):
$env:NOVA_TEST_LOCAL_WEB='1'
$env:NOVA_TEST_RECONNECT='1'
node qa-browser/test_browser_relay.cjs
Remove-Item Env:NOVA_TEST_RECONNECT
$env:NOVA_TEST_MULTI_TAB='1'
node qa-browser/test_browser_relay.cjs
Remove-Item Env:NOVA_TEST_LOCAL_WEB, Env:NOVA_TEST_MULTI_TAB
```

All outputs use the user's `C:\Python312` and existing
`C:\Users\Andre\Projects\Handlarborsen\node_modules` solely for
QA tooling. The test scripts are PC-specific, not production application code.
They create and delete a temporary React harness under the Windows temp
directory. They do not start or modify the live Nova app.

## What is NOT proven

- Real Atlas AI responses through the SSO-protected deployment; user
  authentication and explicit browser permission for **loopback-network**
  remain required.
- **Single-tab ownership is implemented only in the proposed QA protocol v2.**
  The currently published protected preview (v1) does not yet have this
  protection. Even v2 cannot prevent a trusted, already authorized page
  holding the original pairing key from *explicitly* requesting another
  session; it does ensure the old tab immediately loses access afterward.
- The actual Omnira Supabase login state inside Vercel SSO, provider availability, API quotas, or production-like model latency.
- Chrome's public-HTTPS → local-HTTP **Loopback Network Access** permission prompt: tests use `127.0.0.1` as the test page origin, which does not trigger it. The deployed client declares `targetAddressSpace: 'loopback'`, matching current Chrome guidance.
- Project memory retrieval in the preview: `resolveMemoryContext` uses
  `ATLAS_MEMORY_RECALL === '1'` and `ATLAS_MEMORY_INJECT === '1'` and defaults OFF.
  Vercel env metadata is truncated and values were not read; no flag was changed.
- Desktop GUI click/scroll automation, inbox, scheduling or social posting.
- No claim that any user email, workflow or computer action was executed by this QA.

## Safe handoff for an authenticated manual verification

1. On the **stationary PC**, use `Ctrl+Alt+Space` to open the current Nova Premium. The always-on hotkey host and current app remain unchanged by these tests.
2. Click the Atlas status in Nova: first step opens the exact approved SSO-protected preview **without** a pairing key. Sign into Vercel and Omnira if required.
3. Click Atlas status again. The second step opens the short-lived `#port=...&key=...` pairing link. Click **Anslut** only in the verified Omnira preview, allow Chrome `loopback-network` if asked.
4. Ask a safe read-only question (e.g., `Vad vet Atlas om WebBuilder?`). Require both browser SSE and Nova panel receipt, and note whether the answer truly includes project context.
5. Stop a long read from Nova; verify no late tokens or false completion. Do **not** test with send/publish/delete permissions until a separately reviewed write-capable workflow exists.
6. If memory is empty, inspect the environment's **effective flags** using approved operator tooling before considering opt-in; do not assume a missing value or silently enable it.

## Isolation and evidence

- User's active Nova hotkey host, GUI and premium branch were not modified
  here. The local QA branch contains only proposed recovery code and evidence.
- `feat/nova-main-integration-20261106` existing working changes remain untouched.
- No changes to `main`, Vercel production, Supabase data, GitHub PRs or Mac.
- The browser fixture's ephemeral local pairing key is kept in memory only,
  never printed in final logs or committed.
