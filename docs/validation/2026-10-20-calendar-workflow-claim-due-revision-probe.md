# Calendar source revision / workflow_claim_due — bounded and fair-share prototype

**Status:** Isolated SQL prototype and tests only. No production migration, no enabled calendar approval API, and no autonomous booking.

## Source of truth

The latest workflow_claim_due function originates in apps/web/supabase/migrations/20260902081500_stop_atomic_execution_admission.sql. Its earlier August definition was superseded. This function deliberately locks workflow instances with FOR UPDATE SKIP LOCKED before checking platform and project stop authority; changing that stop/transition ordering without proof can introduce a new deadlock.

## Isolated candidate

The test-only workflow-claim-due-revision-candidate.sql does the following:

1. Refuses null, zero or negative requested claim limits.
2. Read-only completeness scan rejects due projects without an owner-matched source revision row, including mismatched owners.
3. Adds a **test-only** last_workflow_claim_at column to the calendar source revision fixture table, independent of its numeric source revision.
4. Selects eligible projects by least recently served (unserved first), oldest due wake time and project ID. It locks at most min(p_limit, 16) source-revision rows per invocation with FOR UPDATE OF r SKIP LOCKED. Projects whose revisions are already locked are skipped rather than blocking the worker.
5. Continues to use the existing instance FOR UPDATE SKIP LOCKED, platform_config FOR SHARE, deterministic project FOR SHARE, and wake-update phases; it does not grant authority through the new source-selection step.
6. The existing fixture trigger increments a project's source revision only on a real wake_at change in the same transaction. Fair-share metadata advances after a successful claim, not for unavailable, empty or paused work.

The source-revision lock footprint is bounded, but **the completeness check and due-project grouping still read all due workflows**. This does not prove bounded CPU cost or SQL query latency. Fair-share timestamps improve service rotation under a finite backlog, but do not provide a formal starvation guarantee under continuous project arrivals or changing priorities.

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

All of these cases are **candidate and fixture results**, not end-to-end confirmation against Omnira's real workflow schema, project permissions, cron runtime or release environment.

## Remaining blockers before migration

1. **Complete schema fidelity:** test the final function and trigger against the fully migrated PostgreSQL schema, all deployed RPC overlays, role grants, triggers and constraints.
2. **Production-scale performance:** benchmark the unbounded read-only due scan, add suitable indexes and a bounded candidate-discovery strategy. Validate multi-tenant fairness and worst-case latency under many projects and continuously arriving jobs.
3. **Complete lock graph:** prove no deadlock involving source revision rows, workflow instance rows, platform_config, project stop state, append_transition, pause setters and calendar batch commits, including multiple project owners.
4. **Source consistency coverage:** integrate every social_schedule writer, workflow wake/tick/claim/direct writer, cron worker and membership/ownership mutation. Any uninstrumented calendar-visible schedule change defeats atomic source consistency.
5. **Privileges and ownership:** independently audit SECURITY DEFINER, RLS, strict owner/project scope and direct revision row access. Fairness metadata must not grant calendar authority.
6. **Operational recovery:** initialize source revisions safely, monitor missing rows and repeated skips, and bound retries so that an individual project is not permanently denied service.
7. **Human approval:** only an explicitly approved, exact week plan may ever reach the production write boundary. This prototype does not implement that approval.

**Do not merge, deploy or activate this candidate yet.** The real calendar and production database remain unchanged.
