# Omnira calendar — signed social worker status and recovery prototype

**Status:** isolated test-only SQL. No Supabase production migration, no active social publish dispatch, and no automatic weekly booking.

## Base and scope

- Parent PR #475 provides a transaction-local signed source-version gate plus BEFORE/AFTER table triggers that reject direct unguarded writes to social_publications and social_schedule_jobs.
- Parent PR #478 adds the signed SKIP LOCKED gateway to the due worker social_schedule_claim without its earlier explicit version bumps.
- This candidate extends that same guarded-write contract to:
  - social_schedule_locked_claim (source-first lease and claim verification)
  - social_schedule_step (prepare, claim-create, provider transitions, checkpoint)
  - social_schedule_recover_checkpoint (history-only recovery with uncertain in-flight receipts)
- Exact source SQL bodies come from the earlier isolated worker recovery PR #467. That branch itself reproduces social_schedule_locked_claim and social_schedule_step from 20261018071209_social_schedule_batches.sql and the later social_schedule_recover_checkpoint definition from 20261018073425_social_schedule_checkpoint_recovery.sql.

## Test-only SQL transformation

The file apps/web/lib/calendar/direct-write-gate-worker-recovery-integration-probe.sql preserves all original validation, CAS, lease, authorization, audit and provider state transitions. It replaces the old source-lock helper with calendar_source_gate_begin_probe(project) in the two functions that take the owner/project source lock **before** the project and job rows.

social_schedule_step delegates its initial lock to social_schedule_locked_claim, so that every actual row change has a signed transaction-local marker. Previous explicit calls to calendar_social_worker_source_bump_probe(j.project_id) are removed to prevent a second increment: guarded AFTER INSERT/UPDATE/DELETE triggers now account for changed rows automatically in the same transaction.

- Preparing a new publication can INSERT one publication and UPDATE one job: **two** source increments in that transaction.
- Claiming a provider action can UPDATE publication and job: two increments.
- Recovering a publishing publication to uncertain and updating the job: two increments.
- Recovering a claim with no publication to waiting: one increment for the changed job.
- Terminal-state receipt or stale publication-version CAS without row changes: zero increments.

These are **row-change counters**, not numbers of human approval events. Final production behavior must explicitly agree on row-versus-operation revision semantics.

## Verification

New isolated PostgreSQL tests:

- 11 behavioral tests: service_role-only worker functions and signed gate, missing version fail-closed, prepare/claim/checkpoint, uncertain provider outcome instead of unsafe repost, direct ungated job write refused, never-dispatched waiting recovery, no-op terminal and stale CAS, stale/forged claim identity, and rollback of job/publication/audit/source revision together.
- 3 two-session races: weekly booking commits before recovery; recovery commits before a stale weekly booking, which fails with STALE_SOURCE; two concurrent same-claim recoveries serialize without duplicate evidence or duplicate version increments.
- 4 source-parity/lock-order tests: original three SQL functions remain unchanged except for the helper substitution and removal of explicit source version bumps; source lock precedes project/job locks; AFTER triggers remain responsible for increments.

The parent signed-gate and worker-claim integrations contribute 40 targeted tests. Run all tests together as a final regression before creating the draft PR.

## Mandatory release blockers

1. **Incomplete writer conversion.** Effective SQL inventory currently lists 13 function/table combinations involving social_publications and social_schedule_jobs. Converting manual prepare/step, due worker claim and this step/recovery does not yet cover scheduled approvals, cancellations, reconciliation and nested writers. Enabling the trigger before all writers are converted could halt legitimate jobs.
2. **Transaction compatibility.** The signed marker applies to one project and one SQL transaction, and cannot be transferred across HTTP calls or sessions. All writers must acquire source locks before project/job locks.
3. **Other source tables.** Calendar-visible social content revisions, proposed decisions, month release evidence and other tables are not protected by the two data-table triggers.
4. **Full schema fidelity.** Fixtures simplify authority and synthetic provider evidence; they do NOT establish real Facebook/Instagram media/account review, RLS, grant coverage, external provider idempotence, worker identity or the final schema.
5. **Complete lock graph.** Test the source revision, project rows, social jobs/publications, workflow and platform pause setters, calendar batch and ownership changes together, including multi-project transactions.
6. **Explicit human approval.** A service-role source marker is not permission to publish, schedule arbitrary work or commit an unapproved exact week.
7. **Reversible rollout.** Migration ordering, private signing-key lifecycle, safe revision bootstrap, CI, staging and load tests, operational monitoring and rollback require a reviewed plan.
8. **Uncertain provider outcomes.** An interrupted provider request cannot be blindly retried because its lease expires. The original uncertain state must remain fail-closed until reliable evidence resolves it.

**Do not merge or deploy these candidates to production.**
