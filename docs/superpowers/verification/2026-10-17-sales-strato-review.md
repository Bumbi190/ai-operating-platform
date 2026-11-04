# Strato B1 independent review and rulings — 2026-10-17

Current release state and subsequent measured gates are recorded in [2026-10-17-sales-release.md](2026-10-17-sales-release.md). This file preserves evidence at its increment/review checkpoint.


Fresh reviewer reviewed exact4a66ea6f558cf4975180dc0f232ec7468fcd7f40..aafa3b9ef9c48fc243b391ca26dee8e6d6e3abe3, read-only. No Critical finding, two Important findings accepted, no Minor findings. One regression fix pass; no re-review.

Important1: generic authenticated proof appeared beside an unverified candidate/edited address. Fixed: proof names the exact saved status.email; initial saved address fills the form, while polling preserves an owner's ongoing edits. Browser regression loads a noncandidate authenticated mailbox, edits to another, waits across polling, and verifies only the saved mailbox is described as authenticated.
Important2: oversized UTF8/JSON-expanded credentials created a setup before generic sealing failure. Fixed: shared byte/payload validator runs before begin_setup, with fixed secret-free size/format refusals and immediate password clearing. Browser regressions cover2048-byte Unicode overflow and4096-byte JSON escaping overflow, no POST and no secret in console. Seal revalidates independently.

Initial newly added browser fixtures omitted the workspace response and failed before reaching the component; corrected before behavioral verification. Frozen review-head behavior is separately replayed through a plan-owned Vite source override, avoiding working-tree source rollback during the full suite. Current desktop/mobile and regressions4/4 passed; SQL/API/Python3/3 integration and typecheck passed. Full-suite final rerun pending.

Rulings:
- Accepted terminal receipt replay intentionally survives routine worker-token generation rotation for the same authorized management host and unchanged mailbox head. Actual service_role SQL regression confirms equal receipt after rotation; a newer mailbox head and revocation still deny activation. Cost if wrong: previously acknowledged local credential remains inactive and needs manual reconciliation. No new auth retry.
- mailboxId follows the approved v1 format: AAD includes project/worker/setup/kid; decrypted email equals server context and setup ID is database-bound to its mailbox. No independent mailboxId field added to AAD. Cost if wrong: format-version migration; current server/context integrity remains prerequisite.
- New owner policy wraps auth.uid() in SELECT to avoid a new per-row auth_initplan advisor warning; semantics unchanged and real SQL suite passed.
- Live catalog/cron execution, actual OS-store, protected deployment/startup and Strato network compatibility are release gates, not claimed by fixture success. Windows Credential Manager Unicode/readback/size/delete was separately verified in a disposable own namespace. Actual Strato auth remains blocked until secure owner input.
- Final full-suite equivalence is recorded after completion; no historical failure is represented as green.
- No B2 inbox import, historical outreach reconstruction or C sending capability is added. No real customer/model/mail operation is used as an installation test.

Deferred minors: none from this increment. Earlier managed-host minor remains: an already-open host status panel refreshes on mount/actions rather than periodically.
