# Workflow claim_due lock-order blocker for calendar source revisions

**Status:** Release-blocking design finding. No schema, migration, API, or runtime change.

## Verified definition in migration order

`20260829_workflow_scheduled_continuation.sql` initially creates `workflow_claim_due` with `FOR UPDATE SKIP LOCKED` over due instances. It is **overridden** by `20260902081500_stop_atomic_execution_admission.sql`, which explicitly documents **instance first**, then platform and per-project stop authority.

The latter function does all of the following in order:

1. Takes workflow instance row locks with `FOR UPDATE SKIP LOCKED` (bounded by `p_limit`).
2. Acquires `platform_config(id=1) FOR SHARE` and refuses work when automation is paused.
3. Acquires project stop authority in deterministic project-ID order, using `FOR SHARE`.
4. Pushes `wake_at` forward only for approved projects and returns the claimed rows.

Its source explicitly warns that reversing the instance/platform lock order can cause a cycle with `workflow_append_transition` and a concurrent pause setter.

## New calendar integration conflict

The calendar source-revision batch takes source revision locks before booking. The prototype `workflow-wake-trigger-candidate.sql` runs after the workflow row is locked and then updates the calendar source revision. `workflow_claim_due` therefore has an **instance -> revision** order while revised schedule/clear/record_tick candidates use **revision -> instance**. This is a potential deadlock, even if the individual revised RPC tests pass. PR #451 demonstrates a related lock-order inversion with a controlled two-session PostgreSQL repro; that does not prove the full platform pause cycle.

**Do not deploy either the wake revision trigger or the record_tick/schedule/clear candidates as a partial migration.** All calendar-visible writers must obey a lock contract that preserves the current platform stop barrier.

## Design and proof requirements

- Inventory the actual latest SQL after all migration overlays, not the first function with the same name.
- Design a multi-instance `SKIP LOCKED` claim process that does not lock a workflow row and later wait for a source revision row held by a workflow writer. Maintain project-scoped fairness and finite claim batches.
- Keep the original platform stop semantics: no admission while paused, authority checked in the same transaction, and deterministic project order.
- Prove there are no cycles involving source revision, workflow instance, `platform_config`, project stop locks, append_transition, and a concurrent pause setter.
- Verify that the trigger cannot be bypassed by direct cron, workers or other SQL paths; fail closed on missing revision state without silently starving due jobs.
- Test controlled simultaneous claim_due / schedule_wake / record_tick / source batch / pause / append_transition against realistic migrated schema, including rollback, no unauthorized execution, service_role grants and evidence records.

Until every writer is included and these proofs pass, weekly booking must treat workflow schedule consistency as **unverified** and refuse approval if it depends on that source. No production activation.
