# Nova Desktop — Windows bubble (pilot v2)

Windows-native companion **to the existing Omnira/Atlas**, not a separate
AI, memory database, workflow engine or agent. It runs in the logged-in
Windows session and is available via **Ctrl+Alt+Space**.

## Tested now on stationära Hultgren

- Transparent key + 96% opacity; round Nova bubble docked at bottom-right of
  Windows' usable work area. Click to expand into a chat/activity panel.
- Windows-wide shortcut opens the expanded panel and **requests** dictation
  with Win+H. The microphone must be enabled; Swedish input language needed.
- Live dictated/typed text preview, actual task steps, replies/status,
  choice buttons and an abort option. The abort option cannot undo prior steps.
- Known browser destinations: Omnira Atlas/planning/projects, Gmail,
  Handlarbörsen, Familje-Stunden, Outlook Web.
- Local program starts: Chrome, VS Code, Outlook Classic, FileZilla, Epic.
- Explorer opens one of three verified project roots: Omnira, Handlarborsen,
  Familje-Stunden. No arbitrary paths or command execution.
- Enumerates allowlisted open programs without reading any window titles,
  and can try to focus one of those windows (Windows can reject focus changes).
- Session-only activity history survives collapse/expand, but is NOT a
  separate knowledge memory. All account access remains in Atlas or the browser.
- Complex instructions copied to clipboard with explicit option to open Atlas.
  **You must paste and submit them in Atlas yourself.**
- Closing the window with the X exits the process; click "–" to shrink
  back to the corner bubble; right-click bubble for the quit menu.

## NOT yet working

- Direct authenticated Atlas conversation, retrieval of Atlas project memory,
  continuous conversation with a language model inside the bubble.
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
- Complex task text is temporarily copied to the Windows clipboard to
  let the operator paste into the authenticated Atlas page; the clipboard
  can be accessed by other local software. Do not dictate passwords.
- Nothing starts automatically at Windows login. No extra subscription installed.
- For review, the local client does not call an arbitrary code agent, shell,
  LLM service, social API or email API.

## Run / test

Desktop shortcut: `Nova Desktop (Pilot).lnk`, on user's OneDrive desktop.
Or double-click `start-nova.cmd`.

```powershell
cd apps/nova-desktop
python -m unittest discover -s tests -p "test_*.py" -v
python tests/smoke_overlay.py
python tests/geometry_overlay.py
```

## Path to the intended full assistant

1. **Atlas memory**: verify canonical recall/injection flags and project
   isolation under the signed-in Atlas server; do not mirror the DB locally.
2. **Authenticated handoff**: add narrowly scoped, expiring localhost bridge
   with end-user session binding, CSRF/replay protection, proof of receipt,
   controlled project scope and a hard stop. Do not pass Gmail cookies/tokens.
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

## Development isolation

Branch: `feat/nova-global-shortcut-20261106`
Worktree: `C:\Users\Andre\Projects\Omnira\.worktrees\nova-global-shortcut-20261106`

Main/production are unchanged. This is a Windows user-session pilot only.
