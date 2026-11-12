# Office pairing start — design, 12 November 2026

Continuation of the owner's approved private Office integration. Goal: an explicit foreground action starts the existing read-only relay and opens the exact Omnira pairing page; agent choice remains explicit in the authenticated page. This is local candidate development, no production activation.

Approaches: reusing the foreground relay is chosen by the implementer because it adds no service or dependency. Modifying active Nova Desktop would collide with another worktree; a permanent autostart service is unnecessary. Existing omnira-office://open remains a fixed launch-only handler.

Add office_pairing.py with exactly --check and --pair. Fixed approved default_target(), one avatar office-familje-pling, exact https://omniraos.se origin and /atlas/office/connect fragment. No caller paths, URLs, origins or engine flags. Validate native installed manifest, independent audit bound to current map, actual BP/material/source hashes and runtime JSON plugin before binding a port. This is local integrity checking, not authentication or proof of agent execution.

--check is read-only, no port/browser. --pair runs only in the visible calling process until Ctrl+C/close, opens the browser once and stops/clears on normal exit or launch failure. Browser key is ephemeral memory/fragment only, never logs/status/files. Browser exceptions are sanitized. Native expiry remains responsible after abrupt process death. No model, voice, workflow or DB call.

Use the existing Python standard library and OfficeRelay; preserve output-directory writer exclusivity and generation contract. No changes to relay/controller/native runtime logic. Keep candidate in existing isolated Office branch, no commit/push/merge/deploy or desktop shortcut installation in this step. Do not launch the production pairing URL during tests; protected web candidate is not published yet. A browser-open return value is not verified pairing.

Acceptance: invalid/missing/drifted native state opens no listener/browser; successful local check has no side effects; explicit start opens only exact fragment URL with one allowed avatar; a real HTTP identity received in a controlled test clears on normal stop; browser failures cannot leak key or retain writer lease; a second process cannot replace a live relay. Test actual HTTP/filesystem boundaries with synthetic source, not real-auth claims. Windows rerun and fresh independent review before delivery.
