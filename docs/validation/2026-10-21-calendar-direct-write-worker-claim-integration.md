# Calendar direct-write gate: signed social worker claim integration

Status: **isolated SQL candidate, no migration or release authorization**. Built on the fixture-only signed gate prototype PR #475. Does not execute any Facebook or Instagram provider request.

## Context and parent dependency

The real social_schedule_claim(jsonb) worker entry point is defined in apps/web/supabase/migrations/20261018071209_social_schedule_batches.sql. PR #465 instrumented the original function for a source-revision-first lock and explicit source bumps. PR #475 then tested a signed transaction-local source-first database guard and AFTER row triggers against social_publications and social_schedule_jobs, but only integrated the manual prepare/step RPC pair.

This candidate proves an additional path under that new model. It is deliberately **stacked** on PR #475; it is not compatible with a partial live trigger installation, and no existing production worker has been migrated.

## Candidate

apps/web/lib/calendar/direct-write-gate-worker-integration-probe.sql contains:

- A **service_role-only** calendar_source_gate_try_begin_probe(p_project uuid), which resolves the trusted project owner and acquires the corresponding source revision row with FOR UPDATE SKIP LOCKED. When a source is busy, the worker returns false and continues with another project. Missing owner/source state fails closed.
- Once the source lock is held, the helper invokes the parent signed gate initializer for the **same project and transaction**. It can then proceed to the original project/job row locks, preserving the worker's busy-project SKIP LOCKED behavior.
- The previous worker candidate's FOUR explicit source revision bumps are removed. The parent signed database gate's AFTER triggers bump the source version after actual writes to protected publication/job rows, without double-bumping a single write.
- The original worker SQL for due times, pending/revoked approval authority, retries, lease recovery, missed jobs and uncertain states is preserved. The worker does not gain a provider POST call or new standing publishing authority.

## Tests

**14/14 new tests green in isolated real PostgreSQL**:

- 9 worker behavior/ACL tests for dryRun no-op, missing revision fail-closed, one active claim/lease, missed jobs, revoked approval, in-flight creating/publishing recovery to uncertain, direct service_role UPDATE refusal after a signed worker RPC commits, owner/project isolation, and restricted gate helper privileges.
- 2 deterministic two-session races with the isolated calendar_week_revision_batch_probe: source revision held by project A's week batch makes the worker skip A and claim B, and source writer committing first causes a week batch using the old expected revision to fail with STALE_SOURCE.
- 3 parity/contract tests proving the prior worker source-version candidate is unchanged except for signed try-lock substitution and removal of explicit bump calls, preserving uncertainty and provider recovery behavior.

All 26 tests from parent PR #475 also pass unchanged. **40/40 combined targeted tests green**.

## Important semantics

A job claim can be a single job row update and therefore one source revision bump. A lease-recovery path involving both a publication row transition and a job row transition bumps the version **once per changed row** (two increments in that case). This is intentional under the parent row-trigger mechanism; version numbers indicate database changes, not number of user-visible operations.

The helper signs only one target project at a time. If a worker acquires a revision but later skips a busy project row, it retains that earlier source lock until the transaction ends. Under very large multi-project claim loops this can increase lock contention, while there is no globally proven lock graph, round-robin fairness, or bounded source lock footprint.

## Blockers before staging/production

1. **All existing writers** of social_publications and social_schedule_jobs must be moved to a compatible signed source-first gate before either protected table trigger is enabled. The current effective-source inventory finds 13 function/table writer combinations, including nested calls through social_schedule_cancel_jobs, scheduled batch approval, step, recovery and reconciliation. This PR only provides one more tested conversion, in addition to manual prepare/step from its parent.
2. **No mixed explicit and trigger bumps.** Each converted writer must remove prior explicit revisions in the same transaction. A row-level AFTER trigger will automatically account for all changed rows, including multiple writes under a single request; this affects source-version expectations and needs full end-to-end review.
3. **Full schema fidelity.** The worker fixture's social_schedule_authority is deliberately simplified; real media/account/content review, release evidence, platform/project pause, RLS, service-role ACL, provider receipts, immutable audit triggers and foreign-key constraints must be exercised with all migration overlays.
4. **Multi-project and lock topology.** Review retained source locks, project ownership changes, source absence/initialization, job/reconciliation lock ordering, stop/pause setters, worker lease expiry and races with the calendar's exact atomic batch before activation.
5. **Privilege boundary.** A service_role signed source-lock is a calendar-consistency proof and **not** user authorization, provider permission, a substitute for human exact-week approval, or protection from a database owner/superuser disabling triggers.
6. **Operations and rollout.** No live version table/key/trigger has been introduced. A reversible, atomic rollout must ensure all worker deployments are compatible with the gate before enabling it, with controlled monitoring and source bootstrap/recovery. Do not distribute or export any private signing key from a live system.
7. **Source breadth.** Other calendar-visible social tables (drafts, content revisions, decisions, monthly evidence), direct provider writes and workflow schedules are not yet covered by this trigger prototype.

**Do not merge or deploy these candidates to production.** They are research/testing artifacts for the next full-schema integration plan.
