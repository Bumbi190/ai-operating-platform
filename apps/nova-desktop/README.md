# Nova Desktop — Windows pilot

A **thin local launcher** for the existing Omnira/Atlas web application,
NOT a second AI brain. Uses only Windows 11 + Python 3 standard library.
Runs from its isolated feature worktree; no production deployment.

## Try it (Windows stationar)

1. Double-click `start-nova.cmd` in this directory.
2. Press **Ctrl+Alt+Space** from any program to bring up Nova.
3. Use **Windows voice typing** (Win+H); on global shortcut, Nova attempts
   to start it automatically. Windows 11 supports Swedish voice typing
   when Swedish is your input language. Review the transcript and press Enter.
4. Try "Nova öppna Gmail", "Öppna Atlas", "Öppna Handlarbörsen",
   or "Planera innehåll för Familje-Stunden".

## Actual limits

- **Working**: Windows-wide shortcut while the process is running,
  local window, Windows voice typing shortcut, deterministic allowlisted
  browser destinations, verified local Start Menu apps (Chrome, VS Code,\n  Outlook, Epic Games, FileZilla), copying a complex request and opening Atlas.
- **NOT working yet**: automatic authenticated mail read/reply, sending
  email, scheduling or posting social content, full Windows GUI
  automation, live agent execution, hotkey hold-to-talk, or Atlas
  taking the pasted request without you pressing Ctrl+V.
- The native app does not receive any account tokens. It never reads
  Gmail, sends messages, publishes social posts, or edits project files.
- Windows dictation is a Microsoft feature and may use Microsoft's online
  speech service. No microphone stream or transcript is intentionally
  stored by this app; complex requests are copied to the Windows clipboard
  for manual pasting into Atlas (which may retain them in chat).
- Unknown commands are *not* executed as terminal instructions. They are
  copied for review in Atlas instead.

## Windows troubleshooting

- If the global hotkey conflicts with another program, the app warns and
  remains available via its window/taskbar entry.
- Click **Avsluta** to terminate the background listener.
- Use `python nova_desktop.py` for console diagnostics.
- Run tests with `python -m unittest discover -s tests -v`.

## Next integration stages (not yet delivered)

1. Add authenticated Atlas intent handoff, bound to the user's current
   session and project authorization, to remove copy/paste. No passwords
   stored in the native launcher.
2. Connect Gmail/Outlook with read scopes to enable browsing/summarizing
   messages. Draft/reply only with explicit per-action approval.
3. Connect social content planner and existing workflow runner for
   draft/schedule/review and approval before publication.
4. Provide safe native UI automation (allowlist, audit, isolation,
   kill switch) without granting unrestricted shell access.
5. Evaluate Atticus on Mac separately; do not install it on Windows.

## Source isolation

Branch: `feat/nova-global-shortcut-20261106`. Pilot files live in
`apps/nova-desktop/`; do not merge before QA and code review.
