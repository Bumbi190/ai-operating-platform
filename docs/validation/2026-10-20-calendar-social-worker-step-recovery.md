# Social publication step and checkpoint recovery: calendar source-revision prototype

**Status:** Isolated SQL candidates and PostgreSQL tests only. No live migration, provider publish call, enabled dispatch, or human-approved week execution.

## Original function sources and existing invariants

- social_schedule_locked_claim and social_schedule_step are defined in apps/web/supabase/migrations/20261018071209_social_schedule_batches.sql.
- social_schedule_recover_checkpoint comes from the later migration 20261018073425_social_schedule_checkpoint_recovery.sql. Do not substitute an older or incomplete function.
- The existing locked_claim RPC checks the server-side worker claim ID, expected job version, lease deadline and state while locking the project's job row.
- The existing step function uses publication version CAS; a stale publication version or invalid state transition returns the current receipt instead of doing another provider action. It records the audit history and updates job status in the same transaction.
- A failed or interrupted creating/publishing action must be treated as uncertain unless an authoritative provider receipt proves its result. The recovery function is **history-only** and is not authorized to repeat an external provider POST.
- Terminal job states cannot be automatically turned into new publish attempts by recovery.

## Isolated revision-first candidate

apps/web/lib/calendar/social-worker-step-recovery-candidate.sql contains the three original SQL function bodies with the following narrowly scoped additions:

1. A service-role-only SECURITY DEFINER source revision lock helper obtains the trusted project owner and takes the matching owner/project revision row FOR UPDATE before project and job row locks.
2. social_schedule_locked_claim performs that lock before the original project/job lock and worker-claim version checks. It does not increment the revision by itself.
3. social_schedule_step increments the same source revision after its actual state/job/publication/audit writes, before the final receipt. Its original early returns for stale publication versions and invalid transitions bypass the bump.
4. social_schedule_recover_checkpoint acquires the source revision before its project/job locks and increments it only after a real recovery state/evidence update. Terminal state receipts return without a bump.
5. The prior claim prototype's service-role-only calendar_social_worker_source_bump_probe helper is reused. There is no new grant for ordinary clients and no new direct browser endpoint.

Both the original state machine and the original checkpoint-recovery history logic are unchanged outside these calls. The test-only publication schema aligns its initial state with the real requested default from 20261016115402_social_manual_publication_v1.sql.

## Targeted PostgreSQL evidence

Nine behavior tests cover:
- RPC/helper privilege restrictions; missing source revisions fail closed.
- Preparing one publication with matching job, event and source revision; rejecting stale claim replays.
- A stale publication expectedVersion returning a read-only receipt without a bump.
- Facebook claim_create followed by an interrupted checkpoint resulting in an uncertain provider outcome, not a fresh provider attempt.
- Recovering a previously creating/publishing item to uncertain, with audit and source revision updated once.
- Terminal-state recovery as a read-only receipt; invalid claim identity rejected.
- A late SQL failure rolling back publication, job, evidence and source revision together.

Three controlled two-session PostgreSQL races cover:
- Week batch first: recovery waits for the revision row; after the batch commit it records uncertain and updates source version.
- Recovery first: a week batch using the previous expected source version fails with STALE_SOURCE and no calendar event.
- Two identical concurrent recovery calls: one succeeds, the stale replay fails with no duplicate evidence or source increment.

Four source-parity/order tests verify these SQL bodies match their original migrations after stripping only the intentional source-lock and bump additions.

The preceding social-worker claim prototype contributes thirteen tests for due worker selection, project isolation, skipped locks, missed/blocked/uncertain states and calendar concurrency.

**29/29 targeted combined tests passed in an isolated Docker PostgreSQL fixture.**

## Limitations and release blockers

1. The test fixture retains intentionally simplified social_schedule_authority, content, asset, account and review stubs. It does NOT exercise the real approved media, social provider, authorizations or full Supabase migrations/RLS.
2. A real provider POST has not been performed; this work proves database transitions and lack of any new dispatch path, not remote provider exactly-once delivery.
3. social_schedule_authorize_write, manual publication steps, content revisions and publication reconciliation can read or mutate calendar-visible state. Inventory each final SQL definition and apply the common source-revision write contract where needed; direct bypass routes must be closed.
4. Revalidate the complete lock graph: source revision, project, social job/publication, workflow, platform pause, external provider state and calendar batch; include multiple concurrent owners and real worker lease expiry.
5. Privileged helpers trust service_role and derive owner from the database; review server identity/authentication, RLS and least privilege. Never expose service-role credentials to the browser or accept arbitrary principal JSON from untrusted callers.
6. Safely initialize and monitor missing source revisions, use correct transaction isolation, track revisions across project ownership changes, and define recovery/alerting for persistent blocking.
7. Week planning still needs full source snapshots, recurrence, conflict resolution and explicit user approval of the exact batch bound to its final source revisions.
8. Production release requires full-schema tests, reversible migrations, formal review and separate deployment authorization.

**Do not merge these draft SQL candidates to main or deploy them into production.**
