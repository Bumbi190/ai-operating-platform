# Omnira Calendar — social direct-DML revision gate prototype

**Scope and status:** Design proof in an isolated, automatically deleted PostgreSQL database. No production migration, no change to app.omniraos.se, no social provider POST, no automated calendar booking, and no new end-user approval endpoint.

## Why the previous RPC-only approach was insufficient

The latest production-source SQL migrations continue to grant service_role direct INSERT/UPDATE rights to public.social_publications and public.social_schedule_jobs, respectively. SQL functions that use SECURITY INVOKER need those grants to function. Even if a particular RPC locks and increments calendar source revisions, a direct service_role UPDATE to one of the tables can bypass that RPC and leave the calendar source version stale.

The existing static inventory test reads all migration files in lexical (migration) order and retains the final definition for each function. On the current version it identifies these direct writer functions:

| Table | Effective mutating SQL functions |
| --- | --- |
| social_publications | social_publication_prepare, social_publication_step, social_publication_reconciliation_complete, social_schedule_cancel_jobs, social_schedule_claim, social_schedule_step, social_schedule_recover_checkpoint |
| social_schedule_jobs | social_schedule_approve, social_schedule_cancel_jobs, social_schedule_claim, social_schedule_step, social_schedule_recover_checkpoint, social_publication_reconciliation_complete |

There are **13 function/table combinations** (seven writers of publications, six writers of jobs; the same function can write both tables). social_schedule_propose, revoke and other entry points may mutate indirectly by invoking those functions. The inventory does not cover all source tables, dynamic SQL, PostgreSQL admin bypasses, ownership mutation, cron providers, external side effects or every app deployment path.

Service-role direct DML grants are still needed by the existing invoker functions. **Do not revoke them in isolation or install a blocking trigger before all existing writer entry points have been migrated.**

## Isolated guarded-write design

See apps/web/lib/calendar/direct-write-gate-probe.sql (test-only).

1. A private, database-owned signing key is created under a restricted schema in the isolated fixture. No signing key is read out of, exported from, or created for production.
2. A service_role-only SECURITY DEFINER helper, calendar_source_gate_begin_probe, derives the owner from the existing projects table, takes the matching owner/project source revision row FOR UPDATE, then produces a transaction-local signed proof bound to that owner, project and transaction ID.
3. A BEFORE INSERT/UPDATE/DELETE trigger on each protected social data table validates the transaction-local proof, rejects cross-project updates, and **never waits for a new source revision lock at row-trigger time**. If a writer did not lock the source first, the trigger raises CALENDAR_WRITE_GATE_REQUIRED.
4. An AFTER row trigger automatically increments the already locked source revision for each actual INSERT, DELETE or changed UPDATE. Unchanged UPDATE rows produce no version bump. Publication/job/revision updates share the same SQL transaction, so a later error rolls them all back.
5. The proof expires with the transaction and cannot be forged without the private key or replayed in the next transaction.

This is a **source consistency boundary only**, not independent end-user authorization. A caller with valid service_role credentials can intentionally invoke the gate for any project. Project-scoped, independently authenticated user approval must still be enforced before those credentials are ever used. A PostgreSQL database owner or superuser could disable triggers: this mechanism is not designed to defend against the database owner.

The proof implementation currently assumes one active target project per transaction. Multi-project writes need a separately designed deterministic lock order and proof map. Ownership changes, signing-key rotation/recovery, key storage permissions, PostgreSQL role semantics, savepoints, pooled sessions and migration sequencing all require review. Trigger-based version changes per modified row may also incur performance overhead, especially for multi-row worker updates.

## Explicit demonstration of avoiding DOUBLE bumps

The prior draft SQL candidates manually call a source-revision bump helper after each write. A database-trigger release must not leave those calls enabled: doing so would increment the revision twice (or more).

The separate file direct-write-gate-manual-integration-probe.sql takes the effective production-source bodies of social_publication_prepare and social_publication_step from the earlier isolated review candidate and replaces their old source-lock call with the signed gate initializer. It removes both explicit version bumps. The AFTER trigger then handles the version count.

Tests verify an actual manual RPC creates a single publication and one source version bump, exact idempotent replay makes no further changes, an actual manual lifecycle status transition bumps once, and direct DML in a subsequent transaction is blocked.

This file is **not** a new application RPC implementation and is not deployable by itself. It uses the intentionally reduced test-only social publication content/asset/approval validation fixture.

## Local test evidence

**26/26 targeted tests passed** on four fixtures/files using the existing owned PostgreSQL Docker test container:
- 12 signed-gate tests: service_role DML without gate denied, secret inaccessible to service_role, forged and replayed markers fail, tenant isolation, guarded INSERT/UPDATE, no-op semantics, automatic source version increments, missing version fail-closed and rollback.
- 4 deterministic concurrency tests: project A batch blocks only project A; independent B can continue; worker first invalidates a stale week batch; an unguarded DML fails immediately rather than waiting on the source row; two guarded writers on the same project serialize without deadlock.
- 5 real-shaped manual prepare/step SQL integration tests: no double bump, idempotent replay, rejection of direct writes in a separate transaction, rollback and a stale calendar batch after manual prepare.
- 5 structural inventory/grant tests which explicitly freeze the current set of effective SQL write functions, distinguish the final migration overlays, and check legacy service_role direct grants.

These results are scoped to the synthetic SQL fixtures, not a full deployed Supabase schema. No Facebook/Instagram credential, provider account, actual asset or remote post was used.

## Production release blockers

1. **All effective writers must participate before any trigger activation.** Convert all 13 function/table combinations, plus upstream call chains and the other social calendar-visible tables. The manual prepare/step conversion is tested as a model, not yet generalized to schedule/worker/reconciliation, nor applied to production.
2. **Choose one source-revision bump mechanism.** Remove the explicit bump from every converted writer when adopting automatic AFTER triggers; otherwise versions may increment twice. The exact protocol must work for multi-row and multi-project writes.
3. **Full schema and role fidelity.** Run under all production migrations, original RLS policies, definer/invoker permissions, foreign keys, triggers, account-review/content-approval guards, worker leases, cross-project membership and ownership changes, and the final effective function overlays. Restricted private-key storage and safe rotation need independent security review.
4. **Complete lock graph.** Test source revision -> project -> workflow -> social job/publication -> platform stop ordering with pause setters, multi-project workers, the revisioned weekly calendar batch, and delayed external provider receipts. See the prior deadlock proof in PR #451.
5. **Broader direct-write paths.** Protect or explicitly classify social content drafts/revisions, approved decisions, release evidence, monthly rules, publication proof records, source snapshots and any other calendar-visible source. Direct service_role changes to those sources could still invalidate a week without bumping its calendar source version.
6. **Provider-state safety.** No version token can undo an already submitted Instagram/Facebook post. Preserve uncertain, provider-confirmed and recovery behavior, and avoid replaying external POSTs.
7. **Transaction boundary compatibility.** A signed token expires at COMMIT and cannot be minted in one PostgREST call for use in a later call. Each legitimate writer must lock and write within one database transaction; HTTP-level retry needs separate idempotency.
8. **Operational migration and rollback.** Define fail-closed source revision bootstrap, monitoring, capacity tests, indexed source lookups, key rotation and recovery. Coordinate trigger activation and RPC replacement atomically or behind a safely controlled gate; incomplete rollout will break active writers.
9. **Human approval remains essential.** A source-revision gate is not permission for Atlas to book calendar events, publish to social platforms or execute trades. The exact weekly plan hash and source snapshot must be explicitly approved by the user and revalidated at the final atomic booking boundary before activation.

**Do not merge this candidate as a migration or enable autonomous booking.** It is a design proof intended to guide a full-stack security review and controlled staging integration.
