# Omnira calendar — social publication reconciliation source-revision proof

**Status:** isolated SQL test candidate, no real social-provider contact and no production migration or autonomous week approval.

## Correct final source version

The final social-aware public.social_publication_reconciliation_complete(jsonb,jsonb) is in apps/web/supabase/migrations/20261018071209_social_schedule_batches.sql. It overrides the earlier manual-only definition in 20261018070155_social_publication_reconciliation.sql.

The final function:
- Verifies the server-supplied owner principal and strict input fields, including confirmed image, proof hash, expected version and recent readAt.
- Calls social_publication_reconciliation_inspect. This inspector **already locks projects and publication rows FOR UPDATE** and can add inspected proof records; it also validates actual Facebook account, content/media and provider evidence.
- Validates a separate, expiring proof against the same publication and content revision.
- Reconciles only an uncertain state to published, appends publication audit, and for authority_source=scheduled also marks the scheduled job published and appends the social schedule audit.
- A repeated identical confirmation for a previously reconciled published receipt returns without new writes. Conflicting or invalid evidence fails closed.

## Candidate

apps/web/lib/calendar/social-reconcile-revision-candidate.sql copies the final function with exactly two additions:

1. After strict input validation but **before calling the inspector** (which locks projects/publications), acquire the owner/project calendar source-revision row FOR UPDATE using calendar_social_source_lock_probe. This avoids the known source/project lock inversion with the week batch.
2. After the real uncertain-to-published and audit/job writes, but before returning, increment the same source revision with calendar_social_source_bump_probe. The published-idempotent early return never bumps. A transaction failure rolls back all writes together.

The existing calendar social helper RPCs come from PR #461. Privileged service_role callers and independently authenticated, validated principal construction remain security requirements. A caller-provided JSON principal is not proof of end-user identity.

## PostgreSQL test evidence (14/14)

Eight behavior tests:
- Service-role-only reconciliation completion.
- Missing source revision rejects writes before project/publication inspection.
- Previously reviewed uncertain provider proof atomically marks publication and scheduled job published and increments the correct project's source version.
- Identical replay is read-only and never duplicates audit/version.
- Wrong proof hash, stale expectedVersion, wrong principal, expired proof, stale readAt, unconfirmed image and publication still creating are rejected without status changes.
- Injected late SQL failure rolls back publication, job state, both evidence writes and source revision.

Three deterministic PostgreSQL races with the isolated calendar_week_revision_batch_probe:
- Calendar batch commits first, reconciliation waits and then records the verified status with an updated source version.
- Reconciliation commits first, a batch using the prior source revision fails with STALE_SOURCE.
- Two concurrent identical confirmations serialize; only one audit trail and one source bump are committed.

Three source-parity tests:
- Confirm the later social-aware migration, not the earlier manual-only version, is the source of truth.
- Verify the candidate matches the entire original SQL function body after stripping exactly the two source-version additions.
- Verify the source lock precedes the inspector and the bump follows the actual social job/audit changes.

All tests use an isolated local PostgreSQL fixture and no production data, provider API or new publish permission.

## Critical limits

The fixture uses the **real reconciliation proof table definition and constraints**, but a deliberately simplified social_publication_reconciliation_inspect that models project/publication row locks and owner scope only. It **does not** verify Facebook provider candidate authenticity, social content draft/media account binding or the real full-Supabase RLS and service principal layer. Tests seed previously inspected proof rows rather than invoking provider inspection.

Full release blockers:
1. The actual proof inspection and account/media/provider validation must pass against a fully migrated database with real permissions and safe synthetic evidence.
2. The full list of calendar-visible social writers is not yet instrumented: social_schedule_release_confirm, manual social_publication_step, provider reconciliation/manual edits, content revision/draft updates and any direct cron/table operations need source coverage and independent lock-order review.
3. social_schedule_authorize_write is a read-only worker authorization call and delegates to social_schedule_locked_claim from PR #467, which takes the source revision lock first. Its real release and provider gates still need end-to-end tests.
4. Prove full cross-source lock graph including workflow source writer, pause authority, social job/publication, owner/project changes and the calendar batch.
5. Source revisions must be initialized, secured, versioned atomically on every relevant writer, monitored and fail-closed on missing/unavailable/truncated sources.
6. No production write is permitted until an exact week is explicitly approved by the human and the submitted plan hash/revision snapshot matches the final write transaction.
7. Require reviewed reversible migrations, full CI, staging smoke tests and explicit release approval before production deployment.

**Do not merge these test-only candidates into main or enable automated publication / week booking.**
