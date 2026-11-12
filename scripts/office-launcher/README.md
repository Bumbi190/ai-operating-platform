# Omnira Office local start

The existing Omnira Office page now has an explicit `omnira-office://open` link.
The Windows handler can only open the approved local UE 5.8 Office visit map.
It is not a remote-control endpoint or the later agent-status bridge.

## Install on the Office Windows computer
`python scripts/office-launcher/office_launcher.py --check`
`python scripts/office-launcher/office_launcher.py --install`

The engine, project and map must already exist at the locally approved paths in
`default_target()`. Installation is current-user only (HKCU), needs no elevation,
and copies the standalone handler to LOCALAPPDATA/Omnira/OfficeLauncher.
It does not change the active Nova Desktop application or the Unreal map.
The handler rejects foreign effective HKCR registrations, missing owner markers
and altered registered commands. No caller-supplied path or engine option is accepted.

## Verify
`python -m unittest discover -s scripts/office-launcher -p "test_*.py" -v`
`node scripts/office-launcher/test_office_page.cjs` (requires the web app dependencies)
`python scripts/office-launcher/office_launcher.py --open omnira-office://open`

A first link click may ask to open the installed desktop application.
The page must not claim launch success just because a browser click occurred.
A matching existing visible game is focused where Windows permits it.
A starting matching game is reused; background/offscreen/editor jobs are excluded.
The handler writes a non-sensitive local last-result.json (status/PID/time).
Process creation confirms only start; it does not prove map load or agent execution.

## Rollback
`python scripts/office-launcher/office_launcher.py --uninstall`
This removes only the verified owned protocol registration and keeps local files.
Revert the narrow Office page diff to restore its previous manual entry.
Do not reset or clean the repository or touch other worktrees.

## Local verification 12 November 2026
- 10/10 Python behavioral tests passed on Linux and the actual Windows computer.
- Actual Office TSX SSR test failed before the link was added, then passed.
- Independent code review identified effective-registration collision and offscreen matching.
  Both were reproduced by failing regression tests, fixed, and the 10-test suite passed.
- Windows target validation, native command-line parsing, named mutex and real launch passed.
- Installed source hash matched the reviewed repository copy.
- Repeated direct calls and two real Windows URL activations reused PID 23528;
  the resulting main window was the approved Office game and foreground activation returned true.
- Browser preview rendered the actual page at http://127.0.0.1:4186/page-render.html.
  Its 390px layout had no horizontal overflow and both primary links measured 44px tall.
- Browser automation lost attachment when activating the external protocol; the full
  browser consent-to-game path is NOT claimed as verified. Owner click remains.
- No full Next.js build, production deployment, live agent binding or voice integration claimed.
- No commit, push, new branch/PR, database change, new key or paid service.

## Continuation
Existing entry PR #630 is merged. Changes are uncommitted on its preserved branch
feat/atlas-office-entry-20261106 at base 3a4613060e17462bac7c934c28513c1c2cfc80f2.
Reconcile with fresh main and perform required Git/PR preflight before any release PR.
The active production page is unchanged; this is a local reviewed candidate.
Next integration: project/agent identity mapping to verified execution receipts, then voice.
Do not label a walking or typing avatar as a running agent without backend proof.


## Private identity pairing starter (local candidate)
- Read-only local integrity check: python scripts/office-launcher/office_pairing.py --check.
- Explicit foreground start: python scripts/office-launcher/office_pairing.py --pair. Do not offer/run this against production until /atlas/office/connect is released. No real browser pairing was activated during validation.
- Before a listener/browser, require installed/fresh-process/runtime-expiry acceptance, exact current map/project descriptor, saved BP/material/generator/style hashes and enabled runtime JSON plugin. This local integrity check is NOT backend authentication.
- Fixed approved project and only office-familje-pling; no caller paths, URLs or origins. The existing omnira-office://open launch-only protocol remains unchanged.
- Browser key stays in memory and scrubbed fragment; no key in output, files or status. Return-to-Python waits bound Windows Ctrl+C delivery. Normal stop clears identity; abrupt exit relies on independently verified native expiry.
- Relay owns its lease before removing exact old avatar projection files, so a failed new session cannot display the preceding session as current. Partial first/second worker startup releases socket/lease without waiting on an unstarted server or joining an unstarted thread.
- 69/69 combined Python checks pass on Linux and Windows; actual Windows --check is native_receiver_ready with web/voice/workflow explicitly false. 16 starter cases exercise real files/HTTP with synthetic identities and a captured external browser boundary. Actual human browser permission/consent and real Windows console-interrupt acceptance remain separate.
- Review fixes were reproduced RED before GREEN: bounded interrupt wait, incomplete/missing source acceptance, platform-disabled project descriptor drift, partial worker startup hang/lease leak and previous-session fresh-file retention. Generic safe CLI diagnostics are a deferred Minor; no re-review or unrelated source polish.
