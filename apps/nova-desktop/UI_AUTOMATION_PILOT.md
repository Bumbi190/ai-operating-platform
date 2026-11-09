# Nova Desktop ? Windows UI Automation pilot

## Status: P0 inspection + P1 approved page reading

Branch: feat/nova-desktop-ui-automation-20261109

This pilot uses the Windows UIAutomationClient assemblies already present on
Windows. No Python package, browser driver, paid service or administrator
privilege is required.

### Supported now

- Inspect top-level windows for a small application allowlist.
- Return process IDs, window handles, accessible element counts, control-type
  counts and the number of document nodes exposing TextPattern. Inspection does
  not return window titles, labels, page text or field values.
- Recognise a narrow Nova command such as "l?s den h?r chatten" or
  "sammanfatta den h?r sidan".
- Capture the topmost visible browser window behind Nova's own overlay.
- Show an approval step before reading any page content.
- After approval, revalidate that the same browser window is still topmost,
  then read visible document text only.
- Send a bounded excerpt (maximum 3,000 characters) to Atlas in read-only mode.
  The prompt treats page content as untrusted data and tells Atlas not to follow
  instructions embedded in the page.
- Reject processes outside the allowlist and fail closed if the UIA tree or
  selected browser window is unavailable. Reading is limited to Brave, Chrome,
  Edge and Firefox.

### Not supported yet

- Clicking, typing, filling forms, sending messages, publishing, deleting,
  purchasing or changing application state.
- Reading all browser tabs, full ChatGPT history, background windows, hidden
  content, passwords, edit-field values, window titles, cookies or screenshots.
- Automatically sending a generated prompt into ChatGPT. Atlas can draft a
  prompt, but the user must still copy it until the approved write stage exists.
- Calendar mutations from Nova Desktop. Omnira already has a calendar at
  /calendar and Atlas calendar tools in its normal authenticated chat; this
  desktop relay deliberately does not expose those tools yet.
- Arbitrary shell commands or unrestricted URL navigation.

### Initial application allowlist

brave, chrome, msedge, firefox, spotify, code, outlook, filezilla,
epicgameslauncher and explorer.

The allowlist is deliberately narrow. Adding an application is a code change
with tests, not a model-generated runtime decision.

### Safety boundary for the next stage

The next implementation stage may add only these UIA actions:

1. Invoke one uniquely matched, enabled control in a verified foreground window.
2. Set one uniquely matched, non-password edit control that exposes ValuePattern.

Both must be tied to a user-approved action plan, the original process ID and
window handle, and a visible execution ledger. The target window must be
revalidated immediately before every action. No coordinate-based blind clicks
or automatic form submission.

Sending, publishing, deleting, payments, bookings and other externally visible
or consequential actions must remain a separate approval step.

### Local verification

Run from apps/nova-desktop:

    python -m unittest discover -s tests -p "test_*.py" -q
    python tests/smoke_uia_readonly.py

The smoke test reports counts only. It does not read page content or change
application state.
