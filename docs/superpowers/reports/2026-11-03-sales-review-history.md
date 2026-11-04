# Sales draft review history correction — 3 November 2026

The first-draft review panel rendered sales_contacts.historySource, an unversioned older note. It therefore displayed the earlier 139-contact/100-message check even though the later saved structured audit was already available in the workspace timing response.

The panel now displays the latest saved history selected by the server timing report's historyRevisionId, after matching workspace/project, draft contact and normalized recipient. It does not select the highest array version or borrow another recipient/project's history. If the match is missing, the UI says that a versioned check is unavailable. The older note is preserved in a separate collapsed “Äldre kontaktanteckning”.

The displayed date is the real saved/checked timestamp with Europe/Stockholm timezone. Existing stale/gap/changed blockers stay visible; no audit timestamp is refreshed by reading the page. Source scope and references remain the recorded evidence, not hardcoded campaign counts. The current contact-register size is explicitly labelled as the count at this page read, separate from delivery. This latest saved history is not represented as a new mailbox read or proof of the audit originally pinned to every older draft.

No schema, API permission, sending policy, worker or host configuration changed. No mailbox/provider scan, model call, approval or customer send was performed for this correction. The already known NOT_INITIAL_CONTACT condition is described conservatively in this panel without falsely asserting that a past contact event was observed.

## Verification

- Browser RED: the new test failed because “Senast sparade kontaktkontroll” was absent in the old view.
- Sales Vitest: 537 passed across 54 files; 8 database-environment integrations skipped. No database integration is claimed for this UI-only change.
- Focused history/timing tests: 11 passed, included in the broader count. They cover report-bound versus decoy revisions, mailbox normalization, foreign project/recipient/contact refusal, missing history and preservation of the older note.
- Sales Playwright: 12 passed, including current audit rather than the older note, exact Stockholm timestamps, stale/gap labels, collapsed historical note, source scope, desktop/mobile layout and no mutation while reading.
- TypeScript tsc --noEmit: exit 0. Whitespace check: git diff --check exit 0.
- Self-review of the complete patch; no independent agent review is claimed. Repository-wide tests were not rerun.

## Existing work and preflight

Continue Draft PR #386 and codex/atlas-harvey-sales-20261017 in its existing owned continuation worktree hb-sales-slim-20261029, base ea01a65f7f08250bcef341728b3fb474590636ec. No branch, worktree or PR was created. The read-only receipt review-history-preflight.json returned review_required: it suggested calendar PR #482 from metadata similarity and identified the older Harvey worktree. The actual #482 body, parent base codex/calendar-direct-gate-worker-recovery-20261021 and seven changed paths were inspected; those are calendar-only SQL probes/tests and do not own this Sales UI correction. This worktree was clean at the exact PR head before editing; the older Harvey worktree and the Calendar stack were untouched. Manual scope reconciliation supports reusing #386.

## Saved email formatting

The current Carstore draft was read first and remained pending. Its long middle paragraph was split after the sentence about advertisement/transaction fees, with every word, recipient and offer unchanged. Existing sales_save_revision was used with exact current ID/hash and pending-approval checks; no raw draft-row edit or new model run.

New current revision: 0870e31d-aaf8-4d53-8716-02a3cfb0133d.
SHA256: f87d42d24f4254deeecc66826184cd583e1b54acbbd3effce0b52cf79cbe9f9f.
New approval: 093d2997-a176-430e-a8fd-0fb1ec7357cb, pending.
Original versions remain stored. The editorial-only marker and sendingAllowed=false remain bound to the existing job. Readback confirms the same one model attempt and historical send totals of one job/four events.

## Delivery and limits

Push normally to the same PR after remote-head and clean-scope checks; do not merge or release the production application. Verify the new exact-head Preview separately before describing this UI correction as visible there. Record delivery, actual Preview/CI and live readback in the Notion handoff. The old 2 November audit remains dated and stale; no current-mailbox evidence is claimed for 3 November. Customer sending still requires its own current checks and authority.

Rollback is a normal source revert/new Preview; no SQL rollback is needed. If the owner asks to restore a former email layout, create another saved revision through the existing editor rather than rewriting history or approval IDs.
