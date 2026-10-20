# Calendar source revision / workflow_claim_due — bounded and fair-share prototype

**Status:** Isolated SQL prototype and tests only. No production migration, no enabled calendar approval API, and no autonomous booking.

## Source of truth

The latest workflow_claim_due function originates in apps/web/supabase/migrations/20260902081500_stop_atomic_execution_admission.sql. Its earlier August definition was superseded. This function deliberately locks workflow instances with FOR UPDATE SKIP LOCKED before checking platform and project stop authority; changing that stop/transition ordering without proof can introduce a new deadlock.

## Isolated candidate

The test-only workflow-claim-due-revision-candidate.sql does the following:

1. Refuses null, zero or negative requested claim limits.
2. Read-only completeness scan rejects due projects without an owner-matched source revision row, including mismatched owners.
3. Adds a **test-only** last_workflow_claim_at column to the calendar source revision fixture table, independent of its numeric source revision.
4. Selects eligible projects by least recently served (unserved first), oldest due wake time and project ID. An indexed LATERAL lookup fetches only the earliest due wake for each owner-matched project instead of a global aggregation over every due workflow row. It locks at most min(p_limit, 16) source-revision rows per invocation with FOR UPDATE OF r SKIP LOCKED. Projects whose revisions are already locked are skipped rather than blocking the worker.
5. Continues to use the existing instance FOR UPDATE SKIP LOCKED, platform_config FOR SHARE, deterministic project FOR SHARE, and wake-update phases; it does not grant authority through the new source-selection step.
6. The existing fixture trigger increments a project's source revision only on a real wake_at change in the same transaction. Fair-share metadata advances after a successful claim, not for unavailable, empty or paused work.

The source-revision lock footprint is bounded. A fixture-only partial index on workflow_instances(project_id,wake_at,id) for active timed wakes supports one earliest-due lookup per project, and a fairness index on calendar_source_revision_probe(last_workflow_claim_at,project_id) supports selection ordering. A 20,000-workflow fixture verified the PostgreSQL query plan used the due index. **The completeness check and candidate search still visit projects** and have not been proven to have bounded cost as the project count grows. No production latency SLA, CPU limit, or formal starvation guarantee follows from these tests.

## Real PostgreSQL verification in the isolated fixture

- Service-role-only execution; authenticated users cannot call the claim RPC.
- Missing and owner-mismatched source revisions fail closed.
- Global and project pauses prevent admission; a concurrent pause blocks the authority check and prevents any wake/version update.
- Claimed wakes move into the future with atomic source revision updates; an already claimed wake is not reclaimed.
- Locked workflow instance rows and locked source revision rows are skipped.
- During an actual isolated calendar batch transaction for project A, its revision remains locked while the worker claims an independent project B.
- A twenty-project / twenty-three-workflow fixture proves that project version locks are limited to sixteen per invocation, while a project beyond that selection remains available for another writer.
- A large older backlog does not automatically monopolize every invocation: previously unserved projects receive subsequent turns.
- Remaining due work is processed in a later invocation, without duplicate claims.
- Paused or invalid claims never consume the fair-share marker.
- With 80 projects and 20,000 active due jobs, the test query used the calendar_workflow_due_probe_idx in its actual PostgreSQL execution plan. A claim of eight jobs inserted eight wake changes and advanced eight matching source revisions.

All of these cases are **candidate and fixture results**, not end-to-end confirmation against Omnira's real workflow schema, project permissions, cron runtime or release environment.

## Remaining blockers before migration

1. **Complete schema fidelity:** test the final function and trigger against the fully migrated PostgreSQL schema, all deployed RPC overlays, role grants, triggers and constraints.
2. **Production-scale performance:** despite the index-backed lookup for the oldest due wake per project, project-wide completeness and candidate discovery still scan/probe all eligible projects. Benchmark hundreds/thousands of projects, validate index selection under realistic statistics and authorization paths, add a truly bounded candidate-discovery strategy, and test worst-case latency under continuously arriving jobs.
3. **Complete lock graph:** prove no deadlock involving source revision rows, workflow instance rows, platform_config, project stop state, append_transition, pause setters and calendar batch commits, including multiple project owners.
4. **Source consistency coverage:** integrate every social_schedule writer, workflow wake/tick/claim/direct writer, cron worker and membership/ownership mutation. Any uninstrumented calendar-visible schedule change defeats atomic source consistency.
5. **Privileges and ownership:** independently audit SECURITY DEFINER, RLS, strict owner/project scope and direct revision row access. Fairness metadata must not grant calendar authority.
6. **Operational recovery:** initialize source revisions safely, monitor missing rows and repeated skips, and bound retries so that an individual project is not permanently denied service.
7. **Human approval:** only an explicitly approved, exact week plan may ever reach the production write boundary. This prototype does not implement that approval.

**Do not merge, deploy or activate this candidate yet.** The real calendar and production database remain unchanged.
