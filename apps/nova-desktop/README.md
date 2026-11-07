# Nova Desktop — Omnira Premium + Always-On Windows hotkey host (pilot v5)

Windows-native companion **to the existing Omnira/Atlas**, not a separate
AI, memory database, workflow engine or agent. It runs in the logged-in
Windows session and is available via **Ctrl+Alt+Space**.

## Tested now on stationära Hultgren

- Omnira Premium glass theme: dark navy-violet layered gradient, subtle cyan
  highlights, softly glowing borders, animated Nova orbit, premium pill buttons,
  a narrow dark scrollbar and an illuminated focused text composer.
- Default window opacity is **88%** (12% background transparency), down from
  96%. Change it during the session under **⋯ → Glas-effekt**: 6/12/16/22%
  background transparency. Tkinter opacity applies to the whole window,
  including text. This is simulated glass, **not genuine Windows Acrylic blur**.
- Transparent keyed corners; round Nova bubble near the lower-right of
  the **current pointer work zone**. On 5120px ultra-wide screens this uses a
  1440x960 visible zone instead of snapping to the absolute monitor edge, so
  the entire chat panel remains reachable even with a cropped work viewport.
  Click the N bubble to expand. The whole 442x600 panel is monitor-clamped.
- Drag the N bubble or the expanded chat's title/header to reposition it.
  Its right/bottom anchor survives collapse and expand during the current
  session. From the ⋯ or right-click menu choose *Flytta Nova nära muspekaren*
  to reset it. Without a manual anchor the global hotkey follows the pointer.
  Manual placement does not yet persist across application restarts.
- **Ctrl+Alt+Space** opens the panel and automatically requests Windows
  voice typing (Win+H), waiting for Ctrl/Alt/Space to be released first.
  No second click on Prata should be needed. Windows must show **Lyssnar**
  before speech transcription starts, and a functioning microphone plus
  Swedish input language/online recognition are required. This is not
  hands-free always-on wake-word listening and not verified mic capture.
- Minimal chat composer: **Prata** and **Skicka** are the only buttons below
  the text field. Enter sends, Shift+Enter creates a newline.
- Project folders, open windows, stop/cancel, Atlas pairing and contextual
  choices are behind the top-right **⋯** menu; Ctrl+. also stops a pending task.
- The talk button opens Windows voice typing; review the transcript and press
  Enter or Skicka. Voice typing is not a continuous hands-free agent yet.
- Visible text, replies and activity state. Stop cannot undo prior steps.
- Known browser destinations: Omnira Atlas/planning/projects, Gmail,
  Handlarbörsen, Familje-Stunden, Outlook Web plus Facebook, Instagram,
  LinkedIn and Pinterest. Recognizes spoken requests such as "Nova kan du
  navigera mig till Facebook". Opening a page does NOT grant general GUI
  click/scroll control or permission to post/send anything.
- Local program starts: Chrome, VS Code, Outlook Classic, FileZilla, Epic.
- Explorer opens one of three verified project roots: Omnira, Handlarborsen,
  Familje-Stunden. No arbitrary paths or command execution.
- Enumerates allowlisted open programs without reading any window titles,
  and can try to focus one of those windows (Windows can reject focus changes).
- Session-only activity history survives collapse/expand, but is NOT a
  separate knowledge memory. All account access remains in Atlas or the browser.
- Before browser pairing/deployment, complex instructions are copied to the
  clipboard with an explicit option to open Atlas: manually paste and submit.
- A browser relay can stream authenticated Atlas replies back into the bubble.
  A READY, SSO-protected preview of the compatible web half is available from
  the separate `feat/nova-main-integration-20261106` branch. Live Atlas replies
  are **not verified** until the operator signs in and explicitly pairs Chrome.
  `main` and production remain unaffected.
- Both **×** and **–** collapse the chat to the corner bubble. An explicit
  **⋯ → Avsluta Nova** closes the GUI, but the small resident hotkey host
  stays alive. The NEXT Ctrl+Alt+Space relaunches Nova; there is no
  requirement to use the desktop shortcut after closing the GUI.
- A separate `nova_hotkey_host.py` owns the global Windows hotkey, and
  `nova_desktop.py` receives safe open/toggle events. The two processes
  are session-scoped (not a Windows system service or administrator task).
  If Windows is locked/sleeping, desktop hotkeys do not work until unlocked.

## Atlas read-only relay (SSO-protected preview; production unchanged)

- Local stdlib HTTP server at random 127.0.0.1 port with strict Host, Origin,
  expiring in-memory pairing key and no persisted credentials.
- Browser half: authenticated Omnira `/nova-bridge` page, explicitly paired by
  clicking **Anslut**. Browsers may request Loopback network permission.
- The clickable **Atlas offline · klicka för att ansluta** status in
  the title bar (and **⋯ → Anslut Atlas**) uses only the saved, verified
  Omnira HTTPS preview origin (from `%LOCALAPPDATA%\Omnira\Nova\preview-origin.txt`).
  If missing, an exact protected preview URL must be selected manually.
  This file stores **only the origin**, never a pairing key or login cookie.
  The key rotates on every application restart or origin switch. Arbitrary
  domains are rejected. Pairing is two-stage: **first click opens the
  SSO-protected preview WITHOUT any pairing key**; sign in. The **second
  click** on Atlas status opens the local-key pairing page and asks for
  explicit **Anslut** approval in the browser. This avoids sending the
  pairing fragment through Vercel's initial SSO redirect. Live-pairing
  still requires browser sign-in and explicit user consent.
- The browser calls existing `/api/chat` with `mode=nova_readonly`. Server removes
  every executable LLM tool schema, enforces a second hard stop on unexpected
  tool use and caps replies to 900 output tokens.
- Canonical Atlas project memory is used **only if** existing recall AND
  injection flags authorize it. No new local memory store or flag override.
- Only one queued/active task; at most 10 queries per 5 minutes per runtime.
- Local UI displays the received text as one streaming Atlas answer. Stop is
  in the **⋯** menu (or Ctrl+. shortcut). During long replies the browser polls local task status and
  aborts the browser fetch on cancellation; an Atlas 'done' receipt is required
  before Nova claims completion. Already spent model tokens cannot be refunded.
- Genuine **local UI-to-HTTP-to-synthetic-browser-to-UI** proof passed.
  This does NOT prove production authentication or an actual AI response.
- `/nova-bridge` exists on the SSO-protected Vercel preview, but **not** on
  production. Do NOT claim real Atlas AI responses or full memory access until
  the logged-in browser → local relay → UI test actually succeeds.

## NOT yet working

- Authenticated live pairing and real Atlas AI response from the protected
  preview. Production still intentionally has no `/nova-bridge` route.
- Guaranteed complete/fresh Atlas project memory; recall/injection are
  server-side feature flags and have not been changed.
- Automatically reading, drafting/sending replies in email, creating or posting
  social-media content, running workflows, or monitoring their results.
- Arbitrary UI control (click/type/scroll), screenshot interpretation,
  screen observation across programs, or autonomous background execution.
- No promise of Gmail permissions from ChatGPT carrying into Omnira.
- An app launch means only that Windows accepted the request; Nova does not
  falsely claim the app or web page is loaded.

## Safety & privacy

- No keys/passwords are read or stored in the desktop client.
- No email is sent, no social post is published, and no project code is
  modified by the launcher.
- Whitelisted app names only; window titles are never read.
- Windows 11 dictation uses Microsoft's *online* speech service (Azure);
  it is **not** local/offline transcription. Windows controls microphone access.
- Before pairing, complex text is temporarily copied to Windows clipboard
  for manual Atlas paste. When paired, prompts are relayed via a local token
  protected interface; cookies and Supabase tokens stay in the browser.
- The session key is in a temporary URL fragment for explicit browser pairing;
  this fragment is cleared from browser history by the bridge page. Browser
  extensions or other local processes may still see it. Do not dictate passwords.
- The background **Nova Hotkey Host** starts automatically after Windows
  login via a per-user Startup shortcut (no elevated permissions or scheduled
  task). It launches the premium GUI once, then remains available even if
  the GUI process exits. The desktop shortcut invokes the SAME singleton host
  and opens Nova without spawning multiple copies.
- To disable autostart: Win+R → `shell:startup`, remove
  `Nova Desktop (Pilot).lnk`. To stop the guardian during this Windows session,
  it must also be ended separately (for example in Task Manager), and then
  Ctrl+Alt+Space will not work until it is restarted. No subscription installed.
- For review, the local client does not call an arbitrary code agent, shell,
  LLM service, social API or email API.

## Run / test

Desktop shortcut: `Nova Desktop (Pilot).lnk`, on user's OneDrive desktop.
Or double-click `start-nova.cmd`.

```powershell
cd apps/nova-desktop
python -m unittest discover -s tests -p "test_*.py" -v
python tests/smoke_overlay.py
python tests/smoke_close_keeps_hotkey.py  # X collapses, toggle reopens
python tests/smoke_voice_atlas_ui.py  # mocked Win+H, static status, two-stage pairing
python -m unittest discover -s tests -p 'test_hotkey_host.py' -v
python tests/geometry_overlay.py  # includes button bounds, opacity and hidden menu
python tests/preview_overlay.py  # optional Pillow for visual QA only
python tests/smoke_reposition.py  # ultrawide, resize and drag verification
python tests/smoke_relay_ui.py  # synthetic/local test, no Atlas API
node tests/check_web_syntax.cjs  # existing TypeScript compiler required
```

## Path to the intended full assistant

1. **Atlas memory**: read-only integration respects canonical memory flags
   and project isolation; verify actual enabled flags, relevance and live output.
2. **Authenticated handoff**: browser-mediated localhost relay exists in this
   feature branch. Next: deploy protected preview, verify Chrome LNA prompt,
   authenticated SSE, cancellation, session ownership and permission review.
   No Gmail cookies/tokens enter local Python.
3. **Email**: server-side approved Gmail/Outlook OAuth scopes. List/summarize
   read-only first; drafts then explicit human approval before send.
4. **Content**: bind to existing Omnira marketing workflows. Preview,
   save draft, approval, schedule, publish, verify idempotently.
5. **Full Windows navigation**: evaluate Microsoft's UI Automation APIs / winapp
   CLI; allowlist applications, permission per action, visible action ledger,
   screenshot redaction, fail-closed window binding, keyboard/mouse stop.
6. **Execution evidence**: every workflow action reports its run ID, status,
   actual result and failure; never infer success from model prose.
7. Only after interactive UI acceptance: PR review, safe merge and deployment.
   Mac/Atticus intentionally deferred.

Read `PREVIEW_CHECKLIST.md` for exact protected-preview and acceptance checks.

## Development isolation

Branch: `feat/nova-global-shortcut-20261106`
Worktree: `C:\Users\Andre\Projects\Omnira\.worktrees\nova-global-shortcut-20261106`

Main/production are unchanged. This is a Windows user-session pilot only.
