# Omnira calendar: signed social proposal, approval and revocation review

**Status:** TEST-ONLY PostgreSQL candidate. No Supabase migration, social-provider dispatch, production change or autonomous weekly booking. Stack this work after PR #481 and its transitive draft branches.

## Final-source behavior preserved

The effective social_schedule_propose, social_schedule_approve, social_schedule_revoke and social_schedule_cancel_jobs definitions originate in apps/web/supabase/migrations/20261018071209_social_schedule_batches.sql. The prior calendar source-version prototype in PR #463 adds a source-first revision lock and explicit bump to the three owner-facing RPCs, without modifying original review, media/account checks, immutable batch revisions, idempotency keys or provider status protections.

The current candidate apps/web/lib/calendar/direct-write-gate-social-review-integration-probe.sql extends those functions to the signed transaction-local gate from PR #475:

- Propose acquires calendar_source_gate_begin_probe(project) before its existing project FOR UPDATE. A new proposal changes social_schedule_batches metadata, so one explicit calendar_social_source_bump_probe remains after a successful proposal/audit append. An exact replay returns without any bump.
- Approve locks the source first. Approval validates a confirmed exact batch ID, immutable revision ID and SHA256 and inserts at least one job (the original manifest allows 1–6 items). Each protected job INSERT automatically increments the source revision via the AFTER trigger. The prior extra explicit approval bump is removed, preventing double counting for the same job row. Exact idempotent replay inserts no job and does not bump.
- Revoke locks the source before project and job rows and appends a decision. The decision is calendar-visible metadata outside the two protected tables; one explicit metadata bump remains. Cancelled/published/uncertain job row modifications additionally get automatic AFTER-trigger source increments.
- The separately callable service-only social_schedule_cancel_jobs now derives the approval's project and signs/locks its source revision **before** its existing SELECT FOR UPDATE job rows. It preserves the original state machine and makes no new provider POST. When the approval ID does not exist it remains a no-op. It is an internal service helper, **not** an authenticated owner's revocation endpoint.

A project version is a monotonic changed-source counter rather than a user-operation count. A new proposal + one approved job causes two increments; a revocation with one queued-job cancellation causes a decision-metadata increment plus a job-row increment; a change involving an in-flight publication and its job also increments for both changed rows. A no-op replay increments zero.

## Verified in isolated PostgreSQL

- 9 functional tests: owner-only service-role RPCs, missing source revision fail-closed, proposal/replay, stale idempotency conflict, approved job created exactly once, direct DML refused after commit, missing approval cancel helper no-op, rollback and idempotent revoke.
- 5 approved-batch revision tests: a new proposal cancels the old approved job, preserves the immutable batch identity, and permits approval of the next revision only; a direct privileged UPDATE without transaction gate fails; a late SQL failure restores the old batch approval and job/version state.
- 4 deterministic two-session calendar races: batch first versus proposal; approval first versus stale batch; simultaneous exact approvals; and calendar batch first versus revocation.
- 4 special edge tests: a two-item manifest inserts exactly two jobs, a revoked creating/publishing job becomes uncertain rather than silently cancelled or reposted, a previously published publication remains published, and the separately invoked internal cancel helper signs its project before changing jobs.
- 5 parity/order tests: original source candidate preserved except for gate substitution and removal of the redundant approve version bump; nested cancel retains the existing creating/publishing/uncertain/published state machine; source lock precedes job/project locking.

A combined run with the parent signed gate/manual/worker claim/recovery regression suite should be completed before creating the draft PR. All test data is synthetic, and the social manifest/content authority fixture remains deliberately reduced.

## Important release blockers

1. **Partial conversions break live workers.** The table-level BEFORE guard on social_publications/social_schedule_jobs must not be activated before EVERY writer, including nested helper and reconciliation paths, uses one compatible source-first signed transaction gate. The effective function/table inventory currently shows 13 combinations, but this is not a complete dynamic-SQL or provider write inventory.
2. **Metadata-table bypass persists.** The AFTER triggers cover only protected publication/job rows. Batch/decision/social-event metadata and other social calendar sources are not guarded against direct service-role DML. An explicit bump in propose/revoke protects only these RPCs; a direct INSERT outside the reviewed entry point can still leave a stale calendar source version.
3. **Approval authority remains distinct from signing.** A service_role-signed calendar source lock proves transactional consistency, not the originating user's authentication, media review, provider permissions or the final approved week plan. The fixture's social_schedule_item_guard and social_content_active functions are intentionally simplified.
4. **Privileged helper caller audit.** social_schedule_cancel_jobs can be called directly by service_role with an approval ID and actor argument. The underlying original function is intentionally preserved here; only trusted server code may reach it, with a separately verified role and reason.
5. **Lock graph and bulk writes.** Owner changes, multiple projects in one transaction, publication/provider actions, pause setters and workflow source locks remain unproven. A row-trigger that acquires a source lock late could reintroduce deadlocks, so the signed source-first invariant must be maintained.
6. **Version semantics and idempotence.** Metadata + row-level increments are legitimate separate source changes and need exact snapshot validation. An irreversible provider POST cannot be undone by calendar revocation; uncertain must remain fail-closed.
7. **No live migration yet.** Full post-migration Supabase schema/RLS, real content permissions, reversible key/bootstrap/trigger rollout, staging CI, load tests, rollback and explicit human approval for the exact calendar week are all required before activation.

**Do not merge these test-only SQL candidates to main or deploy them to production.**
