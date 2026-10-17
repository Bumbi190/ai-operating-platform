# Atlas personal inbox in the shared shell — 2026-10-17

The existing verified Handlarbörsen inbox is now reachable beside the approvals bell in the desktop shell and beside Menu on mobile. Legacy CommandBar's decorative notification dot is replaced by the same real personal inbox. Counts distinguish verified zero, loading, unavailable and revoked access. The popover only links to the role-correct competitor page; opening never acknowledges a notice or triggers discovery.

## Boundaries

- Existing HANDLARBORSEN_CANDIDATE_INBOX_ENABLED and candidate-memory gates remain authoritative.
- Server shell only mounts the resource when its display project allowlist contains the exact Handlarbörsen project. User identity and audience key reset personal state.
- Existing owner/collaborator inbox endpoints gain counts-only GET; actor and project never come from request parameters. The existing inbox service revalidates session, live membership, project ownership/scope and evidence on every read.
- GET response contains only status, unreadCount and totalCount with private,no-store. No candidate evidence or recipient IDs are serialized.
- Middleware admits only the exact collaborator inbox GET; owner APIs, neighboring projects/methods and revoked memberships remain denied.
- One client resource per shell, no localStorage and no polling. Mount, visible-tab focus (30-second throttle), explicit open and a successful read receipt refresh the count. Explicit refresh cancels older reads; generation checks ignore stale responses. Ten-second timeout and unmount cleanup abort pending reads.
- No SQL migration, production configuration, account, role, automatic discovery, external provider, paid API, schedule, email or push change.

## Validation

303 targeted tests in35 suites pass across inbox, competitor evidence/review, organization middleware and shared/mobile shell contracts. TypeScript passes separately from Next's configured build check. The added GET expectations were red before implementation; the collaborator GET middleware test was red before its exact exception. The old organization-shared-shell literal expected an obsolete closing angle bracket before already-existing voice props; it now checks the same collaborator-empty projects expression independently of additional props.

The portable isolated Chromium harness is apps/web/scripts/test-handlarborsen-inbox-shell-browser.cjs. Run from apps/web with node scripts/test-handlarborsen-inbox-shell-browser.cjs; it uses already-installed dependencies and downloads nothing. Optional HB_INBOX_SHELL_RECEIPT writes sanitized JSON; optional HB_INBOX_SHELL_SCREENSHOTS writes fixture screenshots. Receipt: docs/verification/2026-10-17-hb-inbox-shell-browser.json.

The browser harness renders the actual provider, inbox control, desktop topbar and mobile navigation. Only Next routing/runtime collaborators are shimmed and HTTP counts are synthetic. It is NOT a live authenticated-user acceptance test. Chromium verifies1440/1024 desktop and390/360/320 mobile, opening, Escape, outside click, correct owner/collaborator link, viewport bounds, receipt-driven empty state, unavailable state and revocation. Independent review identified mobile panel overflow; the browser reproduced it before the header-relative fix. Browser testing also reproduced an immediate Escape/listener timing race; stable dismissal now reads native details.open and the proof passes. Temporary server, browser and bundle are cleaned up.

## Release gate

Independent final diff review, all mandatory GitHub checks and exact-head protected Vercel Preview READY with the normal Migration Guard are required before merge. Verify signed-out GET remains unauthorized and the live ledger/data remain unchanged. Do not substitute browser fixture evidence for Oscar's pending real-account test.

## Rollback

Revert the code PR to restore previous chrome; personal database inbox and read receipts remain intact. The existing flag hides the whole inbox and prevents summary reads. UI-flag rollback does not disable the already-approved candidate INSERT trigger; any trigger repair requires a separately reviewed database change.
