# Harvey editorial-only drafts — existing PR #386

## Goal and authorization
Continue the already requested Carstore acceptance draft for human review. The owner has authorized one bounded review draft and explicitly forbids Webbuilder sending until ready; all new mail requires current history/statistics/reply review. The existing autonomous-development instruction supplies the execution method. No new production activation is authorized by this plan.

## Current failure
sales_prepare_job and sales_timing_assert_snapshot require owner_confirmed_none, complete history in all channels and an olderHistoryAttestation even for text preparation. The observed all-available-source audit is not such an attestation. Never fabricate it or relabel gap as complete.

## Chosen approach
Add an explicit editorial_only preparation mode, using the existing initial-draft job/worker/revision/review pipeline. A separate RPC admits only confirmed, unsuppressed, nonexcluded, apparently new contacts with a current structured three-channel audit, no observed contact/reply/send events and no failed/stale/changed source. Honest source gaps and missing older attestation may remain visible for text-only work. Normal initialPreparationAllowed and all sending authority remain unchanged.

Alternatives: invent an owner attestation (rejected: false evidence); relax normal timing (rejected: widens existing permission); generate a disconnected local draft (does not verify the requested saved-review flow).

## Safety invariants
- Server-owned preparationMode marker, immutable job snapshot and job/revision binding.
- Existing owner/project/conversation, contact/offer matching, duplicate jobs, worker lease, attempt permits, cancellation and source fences stay in force.
- Each model dispatch and draft commit rechecks the same pinned structured review.
- Only HISTORY_REVIEW_REQUIRED, SOURCE_GAP, NOT_INITIAL_CONTACT may remain from normal timing; no failed source or observed events are admitted.
- Customer sending cannot accept initial-draft IDs: existing send authority only references sales_reply_draft_revisions and verified general replies. Add real-DB rejection tests.
- UI and Atlas clearly identify editorial_only and retain uncertainty; no scheduling, SMTP or sender activation.
- No existing canonical migration is edited. New additive migration is tested locally; production application remains a separate concrete release decision.

## Acceptance
Fresh bounded audit + unknown older history produces one non-sendable saved editorial draft; normal initial preparation is still refused. Missing/failed/stale/foreign/changed evidence, suppression, prior contact or new incoming mail refuses dispatch/commit. Exact job replay is idempotent. Sending rejects the initial draft, even after text approval.
