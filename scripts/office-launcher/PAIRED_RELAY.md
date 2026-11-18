# Private Office connection candidate — 12 November 2026

Status: local reviewed web/transport candidate plus one saved private native identity consumer at Familje-Pling. Not published or automatically started. Real owner-session acceptance and live voice/execution remain unverified. See PRESENCE_ADAPTER.md for native proofs and guarded installation.

## Implemented chain
1. Existing owner-authenticated Campus GET routes are reused byte-for-byte from the preserved Campus branch. Production sources and their hashes are recorded in .superpowers/office-launcher-20261112/reused-campus-sources.json. No writes to that source worktree and no public Campus world copied.
2. /atlas/office/connect is in a separate minimal route group. The root layout has fonts/CSS/children; the platform voice/runtime/analytics providers do not wrap this page. Only authenticated, scoped project/agent IDs and names become client choices; descriptions/models/prompts are omitted. No initial agent is selected.
3. The exact middleware path never redirects a pairing fragment. Anonymous users can render only the empty login shell; collaborator/revoked/unknown-owner denials return a private no-store 403 in place before the owner page. All other middleware redirects and collaborator API restrictions remain intact.
4. The browser scrubs even malformed pairing fragments before network activity, keeps the secret only in memory, and requires explicit computer check plus explicit avatar/project/agent selection.
5. One read-only binding and one shared snapshot are fetched with the existing same-origin session. A unique matching project and agent are required. Before loopback, the portfolio is reduced to the selected identity and receiver-consumed source fields. No other project, agent, description, model or unrelated run reference crosses the local boundary.
6. The loopback relay validates the selected source with PresenceReceiver and atomically writes only its safe projection. Execution stays not_verified; animation stays ambient. Membership never proves current work.

## Local transport boundary
- Bind only 127.0.0.1 on a random port, with a fresh 256-bit session secret.
- Exact Host and exact HTTPS Origin allowlist, constant-time Bearer verification, no wildcard CORS or cookies. Default origin https://omniraos.se. Preview origins must be explicitly configured, not suffix-matched.
- Pairing URL /atlas/office/connect#officePort=...&officeKey=...; never put the key in a query, log, file, browser storage, UI or source API request.
- The secret authenticates paired trusted browser code, NOT a cryptographically signed server DTO. The browser must use its own authenticated scoped GETs. Source/schema labels are not authorization. Same-user local processes holding the secret share the local trust boundary.
- Bounded UTF-8 JSON; reject duplicate JSON keys, nonfinite values, unknown fields/protocols/routes, transfer encoding and duplicate Content-Length. Never accept caller paths, commands, workflow actions or credential exports.
- An OS-held exclusive output-directory lease prevents concurrent relays from overwriting an avatar. It releases on stop or process death. The retained lock file contains only a fixed byte, no secret, and is not unlinked while another writer might be opening it.
- Expiry publication runs every second and retries transient filesystem errors. Source timestamps and monotonic deadlines prevent replay from renewing identity. Normal stop and disconnect clear identity.

## HTTP contract
All calls require exact Origin and Host: 127.0.0.1:<port>. Except preflight, also Authorization: Bearer <ephemeral-secret>. JSON Content-Type must be application/json. No credentials in query strings.

| Call | Exact JSON fields | Result |
| --- | --- | --- |
| GET /status | none | protocol 1, explicit avatar allowlist, safe current projection or null |
| POST /bind | protocol, avatarId, projectId, agentId | new connectionId and unknown initial presence |
| POST /snapshot | protocol, connectionId, binding, snapshot | safe projection after source validation |
| POST /disconnect | protocol, connectionId | clear this connection's identity |
| OPTIONS | bounded method/header preflight | exact-origin allow response; browser local-network permission can still be required |

Each bind supersedes the previous connection ID. A stale tab's snapshot or disconnect returns 409 without changing the newer connection. Changing the selected avatar clears its previous file before publishing the new unknown binding.

An explicit foreground CLI now exists: office_pairing.py --check or --pair. No service, shortcut, protocol or auto-start integration is installed. The CLI is a local candidate; do not offer --pair until the protected web route is released. --check is read-only with no port, browser or output write. --pair validates actual native artifacts and starts the existing relay for only office-familje-pling, opens the exact production pairing fragment once and runs in the visible process until stopped. No caller paths/origins/URLs are accepted. Output is fixed under the approved project Saved/OfficePresence.

## Browser lifecycle
- Probe and bind cannot overlap; synchronous refs guard batched/stale click events as well as button disabled states.
- Pending probes abort on hide/unmount, and obsolete callbacks cannot reset an active connection's status.
- Eight-second refresh starts after the preceding one completes, with five-second request limits, abort propagation and an independent source-expiry timer. No overlapping poll loop or background model request.
- Expired session, bad/missing/duplicate identity, superseded connection, unavailable source and malformed/expired projection fail closed. Status text is fixed locally, never a caller-supplied claim.
- Hidden page, pagehide, unmount and explicit disconnect stop the connection. A closed browser may prevent its final disconnect HTTP request; receiver and saved native consumer independently enforce expiry.

## Verification
- Python launcher/receiver/real loopback HTTP/install-guard/pairing suite: 69 tests pass on Windows and Linux (10 launcher, 22 receiver, 13 relay, 8 guards, 16 starter). Covers origin/Host/key, explicit scope, bounds, privacy, source expiry, heartbeat recovery, writer exclusivity and superseded browser generations. Oversized requests are rejected from Content-Length before body read; a fully queued oversized body may cause a Windows TCP reset instead of a delivered 413, which remains fail-closed.
- Reused source/GET/identity/step/voice-policy tests: 45 pass. One unrelated source-inspection test for the separate CampusPreview UI was intentionally not copied; original source branch untouched.
- Browser controller, component lifecycle and actual middleware regressions: 14 pass. Review findings were reproduced RED then fixed GREEN: redirect-fragment handling, probe/start race and unselected portfolio forwarding.
- Existing middleware/organization containment suite: 31 pass after exact-route fix.
- Actual TSX SSR check passes; three accessible explicit selectors; no private model/description props. Desktop and 390px SSR visual checks passed with 48–50px controls and no horizontal overflow. This is layout validation, not hydrated real-session acceptance.
- Actual TypeScript producer -> actual TypeScript controller -> actual Python HTTP -> safe disk proof passes with SYNTHETIC source/session behavior, including source401 clearing identity. It does not prove real auth, browser CORS/permission or an Unreal actor.
- Full TypeScript check after review fixes: exit0, no diagnostics. Next compile-only build also passed exit0 (164.40s), including the actual route. This does not claim full production generation, CI or deployment. Existing Supabase Edge API/webpack/font-retry warnings were retained in next-compile.log.
- Full app Vitest is NOT green: 129 failed files /444 failed tests, 648 passed files /14,996 passed tests /1,397 skipped. Every emitted failed test/suite is catalogued in .superpowers/office-launcher-20261112/full-suite-failures.md. Many checks rely on unavailable Windows tools, pinned history/hash/line endings and time-sensitive fixtures; no unrelated code was changed to silence them. Release remains blocked.
- The saved native receiver now passes 19 real graph behavior assertions plus actual fresh-process PIE expiry while paused with stopped writer. Independent new-process finalizer verifies all1420 original actors, exact saved BP/material/plugin/source and map-bound runtime proof. Native label is read-only identity with fixed unknown-work caption; no real auth, voice or workflow execution is implied.

## Remaining activation work
1. The opt-in foreground starter is implemented/tested locally; install and accept its browser/desktop flow only after the web candidate is released. One saved native receiver is attached to the existing SkeletalMeshActor_3 / Pling | Familje and independently expires stale data; step fields are intentionally not rendered.
2. Accept a real owner-session binding to a registered project agent, then verify a real workflow with actual runtime receipts before making execution claims. No permanent worker per decorative figure; Nova remains the single global Atlas identity.
3. Reconcile the isolated Office branch with current main; diagnose release blockers and complete build/CI checks. Next compile-only result is separate from a full application production build.
4. Review/publish a concrete candidate, finish actual owner-session and browser-to-desktop acceptance, then expand to more figures and existing global Nova voice/chat services.

No commit, push, deploy, DB change, new fee, stored credential or model/workflow call in this stage. The entrance logo and all1420 pre-existing actors remain preserved. The approved world now contains one additional private identity label and its own readable material. Native changes are backed up/journaled; see PRESENCE_ADAPTER.md.

## Latest local build verification
Full npm run build --workspace=apps/web passed exit0 on12November with the existing public client configuration supplied only to the process. Actual Office/connect and both API routes are in output. No private key copy, .env file, DB migration or deployment. Next configuration skips type validation; separate prior tsc passed and starter changes are Python only. Whole app Vitest remains RED129files/444tests (isolated DB fixtures, Windows tool/path/container dependencies and remaining assertions); this is not release clearance.
