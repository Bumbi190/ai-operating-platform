# Office visit candidate — local only

This candidate keeps the ONE explicitly selected Familje-Pling identity connected while the verified Office game process lives. It does not start models, voice, workflows or commands. Unknown work status remains unknown.

## Entry and activation

Candidate CLI: `C:\Python312\python.exe scripts\office-launcher\office_visit.py --visit` from this worktree, with no extra arguments. **Do not run it against production until the protected web routes and scoped schema are reviewed and activated together.** The CLI always uses the exact approved local Unreal target and exact `https://omniraos.se` endpoints. It cannot take a URL/project/command override.

No URI installation is performed or offered by this candidate. Existing `omnira-office://open` is unchanged. The separately reviewed future `omnira-office://visit` installation must retain the existing owner/command/collision safeguards, copy and verify the fixed complete module set, then be installed explicitly. The current standalone installed launch-only handler is not a suitable place for an unreviewed dynamic import.

The owner explicitly selects avatar/project/registered agent and clicks **Anslut för kontorsbesöket**. Only after native acknowledgement can the browser be closed. Pending/legacy connections stop on hide; confirmed visits detach the page. **Koppla från** still revokes. Closing the game or Ctrl+C stops the companion and clears identity. The existing saved native receiver independently expires old identity after20seconds if the process crashes or the disk is unavailable.

## Bounds and replay

Hard limit4hours; server lease30seconds, nonrevivable; poll8seconds after completion, TLS request limit5seconds; game monitor250ms independently of file I/O. One exclusive output writer. The companion's32-byte native secret stays in RAM and is never sent to the browser. Browser pairing uses a separate ephemeral key.

Attach is provisional until the browser has read native acknowledgement and confirms the same scope through the fixed attach route. Without that confirmation it expires after15seconds; native polling cannot renew indefinitely. Confirmed browser status-read failure detaches monitoring rather than revoking the native connection. Each outbound exchange uses a disposable fixed-purpose Python worker, terminated within the request budget even if DNS/body reading stalls; there is no persistent service. Visit frames are additionally capped at the server lease and absolute visit deadline, including if the companion crashes near expiry.

**Trusted companion boundary:** local install/process checks are enforced by this companion, not remotely attested by the server. The server verifies owner/session/project/agent scope and secret possession. Another already signed-in owner can manually create a scoped visit for their own agent without this Windows companion. The grant cannot access another owner's projects. Hardware/device enrollment or remote game-process attestation is not implemented or claimed; it would be a separate design.

Visit IDs use timestamp-bound random UUIDv7 (74random bits plus the separate256-bit secret). Create must occur within30seconds of its timestamp; status refreshes an unused challenge before explicit create. This makes old claims unusable even after bounded metadata cleanup. A clock error over30seconds fails closed; correct the clock and start a new visit. Five structurally valid create attempts with a verified owner session per5minutes, at most100metadata rows/owner; malformed/unauthenticated HTTP requests are rejected before database writes.

## Verification boundary

`test_office_visit_sql.py` starts and removes its own network-isolated, disposable `postgres:16` container with synthetic auth/session/project/agent rows. It never starts or changes shared Supabase containers. Tests exercise catalog permissions, roles/RLS, auth-session and owner changes, agent moves, expiry, replay, quota, cleanup and concurrent replacement.

`test_office_visit_transport.mjs` combines the actual browser controller, HTTP handlers, Python visit relay, receiver and atomic file output across more than one native poll after browser detach. Owner verification, DB rows, process lease and the upstream HTTP socket are synthetic. It proves component integration, **not actual owner authentication, browser CORS/TLS or Unreal gameplay**. The production HTTPS client and Windows held process handle have separate boundary tests.

Before hosted acceptance: review/commit/push scope, coordinate schema activation through the normal Migration Guard process, verify function owner privileges and private schema exposure in that target environment, review/install the extended fixed URI module set, then test a real logged-in owner and ordinary Office game with the browser closed. No Migration Guard bypass, production JWT reuse or new paid infrastructure is required by this local candidate. Any hosted activation remains a separate approved action.
