# Calendar external writer inventory v1 ? release blocker

Status: verified source map, not complete writer inventory. No production migration.

## Social scheduling

Source: apps/web/supabase/migrations/20261018071209_social_schedule_batches.sql

| SQL function | Initial location | Audit requirement |
|---|---:|---|
| social_schedule_propose | 203 | Proposal may replace visible schedule/revision |
| social_schedule_approve | 230 | Approval creates or activates scheduled items |
| social_schedule_revoke | 262 | Revocation changes active schedules |
| social_schedule_monthly_rule_save | 279 | Recurring schedule changes |
| social_schedule_claim | 334 | Scheduled work claim may change job state |
| social_schedule_step | 405 | Publication step and job status transitions |

Further SQL migration overlays: 20261018073425_social_schedule_checkpoint_recovery.sql and 20261018074426_social_schedule_review_snapshots.sql. Review the final function definitions in migration order before any guard insertion.

Application entrypoint: apps/web/lib/social-launch/scheduling/store.ts uses RPC calls via admin client; calendar reads social content plus schedules per project using separate reads at apps/web/lib/calendar/source-social.ts.

## Workflow scheduling

Source: apps/web/supabase/migrations/20260829_workflow_scheduled_continuation.sql

| SQL function | Initial location | Audit requirement |
|---|---:|---|
| workflow_schedule_wake | 66 | Wake time changed |
| workflow_clear_wake | 111 | Wake time cleared |
| workflow_claim_due | 149 | Claim may move wake state |
| workflow_record_tick | 187 | Tick can reschedule |

Workflow entrypoint: apps/web/lib/workflows/store.ts, scheduleWorkflowWake and clearWorkflowWake. Above functions grant service_role execution; authorizing calendar plans must not accidentally expose them to authenticated clients.

## Integration invariants

1. Every path that mutates a calendar-visible schedule must lock and bump a revision row IN THE SAME transaction as the source write. Include jobs/cron, cancellation, edits and project membership changes.
2. Revision rows must exist before batch approval and every mutation. Missing row fails closed. Project-owner relationship alone does not establish delegated access or approval authority.
3. Batch lock ordering across multiple projects must be deterministic; all writers must take compatible locks before touching calendar-visible data. Avoid writes through bypass functions.
4. Read-only snapshot comparison is insufficient for atomicity. Add an authenticated exact-plan approval gate and prove changed source -> no insert/no receipt under live race.
5. Test authorization including service_role, authenticated, foreign-owner and revoked project permissions in a local SQL fixture before any real migration.

## Verification status

- Real PostgreSQL source revision and batch lock prototypes exist under apps/web/lib/calendar; they are NOT migrations.
- No real social_schedule_* or workflow_* writer is yet connected to revision bump.
- This inventory is incomplete until all migrations, direct table changes, triggers, worker invocations, and cron entries are reconciled.
