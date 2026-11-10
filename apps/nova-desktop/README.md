## Hotkey connection pilot (10 November 2026)

- One explicit Ctrl+Alt+Space is now eligible to open the selected,
  SSO-protected Omnira preview using an ephemeral localhost pairing token
  marked with hotkey=1 in the URL fragment. The marker is never sent to
  the Vercel server and is removed from browser history together with the key.
- The browser automatically attempts pairing only for this hotkey-marked
  one-time link. After a successful authenticated pairing it attempts to
  resume the existing Atlas voice session using previously granted browser
  microphone permission. No new AI voice provider or hidden microphone
  recording was added.
- A missing/expired Vercel SSO session, signed-out Omnira account, or browser
  permission/user-gesture requirement still leads to a visible manual step.
  Browser audio autoplay rules may require the user to click Starta
  rostsamtal; this is a pilot and NOT a guarantee of zero-click operation.
- The key, browser cookies and mic audio remain outside the Windows config.
  preview-origin.txt continues to contain only an allowlisted public URL.
- The established ten-minute privacy mic timeout remains unchanged;
  Ctrl+Alt+Space explicitly resumes after timeout on an authorized pair.
  Closing the voice call or explicitly hitting Stop must disable capture.
- Native Nova's read-current-page operation is still scoped to visible
  browser document text with a separate approval, bounded excerpt, and no
  automatic ChatGPT prompt insertion, typing or message submission.
- Ordinary authenticated Atlas voice may use the existing project tools and
  memory only when their server-side feature gates and project permissions
  allow it. The Nova read-only relay continues to have NO memory or tools.
- Actual browser microphone reactivation must be verified on the user's PC
  before this capability can be called complete. No production deploy.


## Code-job proposals: Nova operator intake (2026-11-10)

- Commands such as "Nova, fixa buggen i WebBuilder" or "Nova, koda en
  funktion i Handlarb?rsen" now create a scoped, reviewable *code-job draft*
  in Nova's existing overlay. They do NOT execute arbitrary shell commands,
  Git operations, run Codex/Claude, or incur model costs.
- The top-right (...) review menu offers **Kopiera kodbrief**, an explicit
  clipboard action, **?ppna projektmapp** for verified repo candidates,
  and **Avbryt koduppdrag**.
- Verified project mappings on this Windows machine:
  Omnira/WebBuilder -> the Omnira repository; Handlarb?rsen -> its repo;
  Portfolio -> its repo. Familje-Stunden has a folder but its Git repo is
  not yet verified, so its coding job stays proposal-only.
- Requests with ambiguous/multiple project targets, direct URLs, filesystem
  paths, missing code verbs or excessive text fail closed into the existing
  non-executing Atlas handoff path.
- The registered Omnira SDF code-work capability is still a governed
  proposal/control-plane, not a registered Windows Codex/Claude executor.
  Its model router is advisory-only and its worker requires an isolated
  Linux environment. Do not bypass those authority boundaries from Nova.
- Codex CLI and Claude Code are installed on the Windows host, but installed
  does not prove subscription quota, independent review, safe worktree
  isolation or permission to execute the user's code.
- **Next step for actual coding**: register and verify project-specific
  repositories, separate read-only inspection from write-capable execution,
  configure a trusted signed broker with a per-job spend cap and explicit
  operator approval, bound writes to a clean isolated worktree, test and
  present diff/receipts before any push or merge. Clean temporary worktrees
  only after evidence of completion and owner's review.
- No new branches, destructive cleanup, paid provider calls or real code jobs
  are performed by this proposal-only implementation.


## Nova voice reliability / operator work (9 November, evening)

- A direct, exact allowlist now handles common Omnira voice navigation
  (calendar, Atlas, projects, planning, marketing review) in the existing
  authenticated browser session without another paid AI response.
- The native Prata button resumes the existing Atlas microphone when paired.
  The global Ctrl+Alt+Space toggles it; Windows Win+H is used only when Nova
  is unpaired so competing speech pipelines do not duplicate commands.
- The browser voice call keeps its ten-minute privacy mic timeout. On timeout,
  Ctrl+Alt+Space can explicitly re-arm the microphone and Nova shows the
  paused/error state instead of pretending it still hears speech.
- Complex native instructions are never silently forwarded as "read-only"
  tool commands. A paired operator explicitly chooses
  "..." -> "Kor i Atlas (med verktyg)" or "Bara rad (utan verktyg)".
  The approved branch calls only the existing, authenticated Atlas
  conversation/approval flow; no new direct desktop-control authority.
- Nova's browser relay polls global Stop concurrently with long Atlas tasks,
  so an operator can cancel without waiting for the entire model reply.
- After updating the preview and restarting the local host, browser pairing
  must be refreshed. The shared protected branch preview alias is stable.
- Unit tests, type checking and build checks do not replace a physical
  microphone/navigation/calendar test. Do not claim live functional success
  until the owner verifies a real call.


# Nova Desktop — Omnira Premium + safe local browser navigation (pilot v8)

Windows-native companion **to the existing Omnira/Atlas**, not a separate
AI, memory database, workflow engine or agent. It runs in the logged-in
Windows session and is available via **Ctrl+Alt+Space**.

## Continuous Atlas voice call and emergency stop

- The browser-paired Nova bridge is mounted inside the authenticated platform
  layout, not inside the /nova-bridge page. Its poller therefore survives
  client-side navigation to other Omnira pages.
- First connect the desktop relay, then click **Starta r?stsamtal** once in
  the protected Omnira browser window. This is the explicit browser gesture
  that starts the existing Atlas microphone and audio session.
- The voice call reuses Atlas's existing PCM capture, Silero VAD, streaming
  speech recognition, Swedish TTS and authenticated conversation controller.
  The microphone and audio remain browser-owned; the Windows host receives
  only narrow start/stop/interrupt control signals and status. No new provider,
  subscription, API key or local credential is introduced.
- After microphone consent, **Ctrl+Alt+Space** toggles the persistent Atlas
  voice call from Nova Desktop instead of starting a competing Win+H dictation
  session. Before consent, the old one-shot Windows dictation remains available.
- Keep the dedicated Omnira bridge window open while using other apps. The
  call survives navigation inside Omnira and remains alive while that window
  stays loaded in the background. Closing it or navigating away from Omnira
  in that window ends the browser-owned call.
- **Ctrl+Alt+.** and Nova's visible **Stopp** request immediate interruption
  of Atlas speech and the active answer. The Atlas call remains open for a
  correction. Headphone mode additionally supports speech barge-in; speaker
  mode uses the visible interrupt control to avoid echo/self-trigger.
- Atlas voice uses the normal authenticated conversation path and its
  existing scoped tools, including the existing calendar capability and any
  normal approval gates. The separate local page-reading relay remains
  read-only; it does not gain desktop write access.
- Exact one-shot commands such as "Nova stopp" remain local. An action that
  already completed cannot be rolled back by Stop.
- This implementation is local to the feature branch. It has not been pushed
  or deployed; the protected preview and physical mic/headphone tests are
  required before claiming live end-to-end operation or production readiness.

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
- Known browser destinations: Omnira Atlas/calendar/planning/projects, Gmail,
  Handlarbörsen, Familje-Stunden, Outlook Web plus Facebook, Instagram,
  LinkedIn and Pinterest. Recognizes spoken requests such as "Nova kan du
  navigera mig till Facebook" and "Hej Nova, vill du öppna Facebook?".
  Text is auto-submitted after the three-second pause in voice mode. Opening a
  page does NOT grant general GUI
  click/scroll control or permission to post/send anything.
- Local program starts: Brave, Chrome, Spotify, VS Code, Outlook Classic, FileZilla, Epic.
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
  The current feature branch carries the SSO-protected browser half and the
  server-side read-only route, rebased on current `origin/main`. It is not
  deployed by this work: a fresh Vercel preview and explicit browser pairing
  are still required before live Atlas replies can be claimed as verified.
  `main` and production remain unchanged.
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
- The browser calls existing /api/chat with mode=nova_readonly. Server removes
  every executable LLM tool schema, enforces a second hard stop on unexpected
  tool use and caps replies to 900 output tokens.
- The relay accepts only plain text messages. It rejects conversation IDs,
  project/studio context, images and other context overrides. It does not write
  to ordinary conversation history or load project memory, inbox, calendar or
  other project context; only the user-approved page excerpt is sent to Atlas.
- Atlas treats the excerpt as untrusted source data. It may summarize or draft
  a continuation prompt, but cannot send that prompt or execute a desktop task.
- Omnira's existing /calendar and Atlas calendar tools remain available in the
  normal authenticated Omnira chat. Nova Desktop's relay is deliberately
  read-only until a separately approved calendar/write capability is added.
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

## Persistent Atlas voice control (local feature branch)

- The authenticated Nova bridge provider is mounted in the platform layout,
  so its short-lived pairing and local command poller survive route changes
  inside Omnira. It does not persist pairing credentials to disk or storage.
- After connecting, click **Starta r?stsamtal** once in the browser. That
  explicit gesture starts the existing Atlas voice session and authorizes
  the local bridge to send only two control intents: voice toggle and interrupt.
- The local relay never receives microphone audio. Atlas's browser-owned
  runtime performs PCM capture, VAD, streaming transcription and TTS.
- Once consented, Ctrl+Alt+Space toggles the Atlas call; Ctrl+Alt+. interrupts
  the current answer. Native Nova's visible Stopp button sends the same
  interrupt. Before consent, Ctrl+Alt+Space retains one-shot Win+H dictation.
- Keep the dedicated Omnira bridge window loaded while working in other apps.
  The Atlas provider survives navigation inside Omnira; closing that browser
  window or navigating away from Omnira in it ends the call.
- Voice turns use the normal authenticated Atlas conversation and its existing
  scoped tools/approval gates. The separate page-reading relay remains
  read-only and cannot execute desktop clicks, typing or arbitrary shell code.
- This is local code only. The protected preview must be deployed and the
  microphone, headset barge-in, speaker-mode Stop and calendar flow physically
  tested before any production claim.

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
