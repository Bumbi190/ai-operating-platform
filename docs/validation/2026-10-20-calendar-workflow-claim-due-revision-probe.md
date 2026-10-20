# Calendar source revision / workflow_claim_due candidate: isolation proof

**Status:** test-only SQL; no production migration, no API activation, no calendar approval.

## Source of truth

- Latest relevant workflow claim writer: `apps/web/supabase/migrations/20260902081500_stop_atomic_execution_admission.sql`.
- Earlier definition in `20260829_workflow_scheduled_continuation.sql` was replaced and MUST NOT be used for the migration plan.
- Existing workflow pause contract: acquire instance rows with `FOR UPDATE SKIP LOCKED`, then global platform stop `FOR SHARE`, then project stop checks in project-ID order, then advance due `wake_at`. Changing the instance/platform order can reopen known stop-barrier deadlocks.

## Isolated candidate

`apps/web/lib/calendar/workflow-claim-due-revision-candidate.sql` derives from the latest definition and adds a preliminary, deterministic **project-ID ordered** `FOR UPDATE OF r SKIP LOCKED` pass on owner/project revision rows before acquiring workflow instance row locks. Busy projects are skipped, while missing/mismatched owner revisions fail closed. Only projects with acquired revisions qualify for phase-1 due instance selection.

The original instance -> platform -> project stop authority order is unchanged after the added revision phase. The existing wake-at test trigger increments the source revision in the same transaction as the claim update. Service-role-only execution is preserved.

## Verified in an isolated PostgreSQL database

- Correct service-role execution permissions, rejection of authenticated clients.
- Missing and wrong-owner revisions refuse to claim.
- Global/project paused claims do not alter wake time or revision.
- Due claim advances wake, increments exactly its project's source version; an already-future wake cannot be reclaimed.
- Source version locked for project A -> worker skips A and claims due project B (another owner).
- Workflow instance row locked by another worker -> claim uses `FOR UPDATE SKIP LOCKED` and does not wait.
- Concurrent global or project pause blocks the claim's authority check, then prevents admission after the pause commits.
- Actual isolated weekly batch holds A revision row through commit; claim skips A, advances B; after batch commit A has one calendar block, A wake is untouched.

## Release blockers

1. **Not the full migrated schema:** tests use a minimal workflow table and candidate trigger, not the live triggers, full project configuration, membership rules or deployed workload.
2. **Unbounded preliminary scan:** all due project IDs are enumerated and eligible revision rows locked before applying p_limit to instances. This could affect latency and fairness. A fair bounded project strategy with no starvation needs design and load tests.
3. **Stop and transition lock graph:** verify current append_transition, pause setter, stop authority, workflow claim, source revision, tick/clear/schedule, and actual weekly batch with a shared lock-order model and deterministic multi-session race tests. These tests demonstrate specific paths, not absence of all deadlocks.
4. **Source coverage:** social schedule writers, direct workflow row writes, other cron/job handlers and project ownership mutations still lack an audited common version protocol. A calendar batch must fail closed while any relevant writer bypasses it.
5. **Privileges and owner scope:** production `SECURITY DEFINER`, role grants, RLS, stable owner identity, fail-closed revision initialization and direct modification/deletion restrictions require separate audit.
6. **Availability:** a missing source version deliberately rejects a claim; busy revisions are skipped. Add operational monitoring, bounded retries and a recovery process before enabling this on a live scheduler.
7. **No human approval yet:** an atomic source consistency guard is not a substitute for explicit approval of an exact weekly plan.

**Do not merge or deploy this candidate** until these blockers are addressed and a reviewed release plan is approved.
