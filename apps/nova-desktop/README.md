# Nova Desktop — Omnira Premium + safe local browser navigation (pilot v8)

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
- The 94px orb and 442x600 chat panel now dock relative to the **active
  application window**, not the 5120px desktop's far-right edge.
  Nova only inspects window rectangle/process ID (no window content).
  The app-relative zone is at most 520x720; fallback is the mouse's monitor.
  Reposition via **⋯ → Flytta Nova till aktivt program** or the bubble's
  right-click menu.
- Drag the N orb or title/header to manually pin Nova. Only the two numeric
  coordinates are stored under %LOCALAPPDATA%/Omnira/Nova/position.json to
  preserve the position across app restarts; explicit redocking clears it.
  No screenshots, window titles, credentials or sensitive data are persisted.
  Display coordinates are clamped to Windows' work area.
- **Ctrl+Alt+Space** opens the panel and attempts Windows voice typing
  (Win+H) after Ctrl/Alt/Space have been released. Before sending Win+H,
  Nova MUST verify both that her own window is the Windows foreground window
  and that her own text field holds Tk keyboard focus. The host asks Windows
  to permit focus transfer, but Windows can reject it. If Nova cannot obtain
  or keep the focus, **no Win+H is sent**: the chat displays a warning and
  you can click Nova's input then Prata instead. This prevents initiating
  dictation into ChatGPT, email, or another window while it owns focus.
  Already-running Windows dictation may still follow later focus changes;
  stop dictation if you switch apps. Windows must display **Lyssnar**
  before speaking; a microphone and Swedish online recognition are required.
  Wake-word activation and microphone-based end-of-speech events are NOT
  implemented. The automatic submission timer uses text stability only.
- Minimal chat composer: **Prata** and **Skicka** are the only buttons below
  the text field. Enter sends, Shift+Enter creates a newline.
- **Voice auto-Send**: once Win+H has started a voice session, Nova polls
  her own text field and, after **3 seconds** of unchanged transcribed text,
  automatically submits the utterance exactly once. No Enter/Skicka needed.
  This is *text stability*, not true detected silence. Every new voice
  session must be explicitly started with Ctrl+Alt+Space/Prata.
- **Separation of send and execute:** exact allowlisted navigation requests
  may immediately open a site/app. All other spoken tasks are submitted into
  Nova for review (or forwarded to authenticated Atlas **read-only** when
  connected). Unknown/multi-step, social publishing, email sending, payments,
  and destructive requests **never auto-execute or write to the clipboard**.
  Offline Atlas does not secretly gain Windows control. The ⋯ option
  **Skicka röstkommandon efter 3 sekunder** can be disabled.
  Closing Nova, stopping or manually sending cancels pending auto-Send.
- Windows Win+H is an OS-wide online dictation service. If its microphone
  remains active after navigation, pause it with the Windows voice typing
  toolbar or a supported voice command. Nova cannot confirm microphone state
  from the standard-library Tk text widget.
- Project folders, open windows, stop/cancel, Atlas pairing and contextual
  choices are behind the top-right **⋯** menu; Ctrl+. also stops a pending task.
- The talk button starts Windows voice typing; when auto-Send is enabled
  the one-shot transcript is submitted after the pause. Voice typing may
  remain active afterward. It is NOT continuous hands-free conversation.
- **Local browser controls (new):** Brave, Chrome, Edge and Firefox are
  recognized by their Windows executable name (no tab titles).
  Saying e.g. "Nova nästa flik", "Nova föregående flik", "Nova gå tillbaka",
  "Nova gå framåt", "Nova scrolla ner/upp" or "Nova byt till Brave"
  selects an existing verified browser window and sends only a fixed,
  small, Windows keyboard shortcut. Exact voice phrases are eligible for
  auto-Send after 3 seconds; typed commands still require Enter/Skicka.
  Nova remembers the last browser HWND she observed as foreground. If she
  cannot distinguish among multiple Brave windows, she refuses to guess.
  No arbitrary clicks, text entry, URLs, form submission, shell commands or
  external AI tool execution are added.
- **Native program switching:** exact requests such as "Nova växla till
  VS Code" or "Nova byt till Outlook" may focus a single allowlisted open
  program. Multiple matching windows require a prior selection; nothing
  is changed on an ambiguous match. After browser navigation moves focus
  away from Nova, the next Ctrl+Alt+Space brings Nova back for dictation
  rather than just hiding the panel.
- Browser navigation is bound by Win32 SetForegroundWindow restrictions and
  the SendInput integrity boundary. A successful SendInput means Windows
  accepted the chord – it does NOT prove a website successfully navigated.
- Visible text, replies and activity state. Stop cannot undo prior steps.
- Known browser destinations: Omnira Atlas/planning/projects, Gmail,
  Handlarbörsen, Familje-Stunden, Outlook Web plus Facebook, Instagram,
  LinkedIn and Pinterest. Recognizes spoken requests such as "Nova kan du
  navigera mig till Facebook" and "Hej Nova, vill du öppna Facebook?".
  Text is auto-submitted after the three-second pause in voice mode. Opening a
  page does NOT grant general GUI
  click/scroll control or permission to post/send anything.
- Local program starts: Brave, Chrome, VS Code, Outlook Classic, FileZilla, Epic.
- Explorer opens one of three verified project roots: Omnira, Handlarborsen,
  Familje-Stunden. No arbitrary paths or command execution.
- Enumerates allowlisted open programs without reading any window titles,
  and can try to focus one of those windows (Windows can reject focus changes).
- Session-only activity history survives collapse/expand, but is NOT a
  separate knowledge memory. All account access remains in Atlas or the browser.
- Unknown/complex commands are acknowledged within Nova. They do NOT
  automatically copy to Windows clipboard or open Atlas. Use the explicit
  **⋯ → Kopiera begäran** action if you want to transfer a pending request.
  Atlas can advise via its authenticated read-only bridge but currently cannot
  control arbitrary desktop apps outside Omnira.
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
- Pending complex commands are kept in Nova's session memory only; no
  clipboard write happens without the operator explicitly choosing Copy.
  When paired, queries are relayed read-only through the browser via a token
  protected interface; account cookies and Supabase tokens stay in the browser.
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
python tests/smoke_focus_voice_safety.py  # foreground fail-closed; no real audio
python tests/smoke_spoken_navigation.py  # allowlisted Facebook mock
python tests/smoke_auto_voice_ui.py  # 3-second auto-send, unsafe stays unexecuted
python tests/smoke_browser_nav_ui.py  # mock navigation, no real tab changes
python tests/smoke_hotkey_browser_focus.py  # re-listen after browser focus
python tests/smoke_app_docking.py  # actual 5120px/app bounds geometry fixture
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
