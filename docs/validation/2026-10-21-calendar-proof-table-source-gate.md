# Omnira Calendar — social reconciliation proof-table source gate

**Status:** Isolated PostgreSQL review prototype. Do not apply the SQL to production, enable any social dispatch, or grant Atlas autonomous calendar booking.

## Original effective inspector

The final effective public.social_publication_reconciliation_inspect(jsonb,jsonb) comes from apps/web/supabase/migrations/20261018070155_social_publication_reconciliation.sql. Unlike the later 20261018071209_social_schedule_batches.sql override of reconciliation_complete, the original inspector is not redefined by that later migration.

The real inspector verifies project ownership, Facebook publication state, matching content revision and SHA, one-image media format, current Facebook account binding, up to 50 candidate payloads, provider ID, text, timestamps, photo ID, image URL and candidate hashes. It locks projects and publications FOR UPDATE **before** checking/inserting missing proof records. A direct service_role INSERT into the proof table was previously not required to increment the calendar source revision.

## Candidate changes

The signed source-version prototype from PR #475 already provides a per-transaction service_role-only source-lock signature and before/after triggers on social_publications and social_schedule_jobs. This branch adds:

1. apps/web/lib/calendar/direct-write-gate-proof-trigger-probe.sql: BEFORE and AFTER INSERT/UPDATE/DELETE row triggers on public.social_publication_reconciliation_proofs. They reuse the existing signature assertion and source-revision bump functions. The BEFORE trigger **does not wait for a new source lock** after a proof row is locked.
2. apps/web/lib/calendar/direct-write-gate-proof-inspect-candidate.sql: an exact copy of the effective original inspector function with one added calendar_source_gate_begin_probe((p_input->>'projectId')::uuid) immediately **before** the first projects FOR UPDATE. This ensures a legitimate inspector can insert a proof while owning the correct source-version lock and transaction signature.
3. apps/web/lib/calendar/direct-write-gate-proof-inspect-fixture.sql: a deliberately reduced executable inspector model for isolated PostgreSQL race tests. It validates ownership, project/publication row locks, simplified candidate shapes and idempotent proof insertion. **It is not the real provider-evidence validation**. The original inspector SQL parity test is separate.

When a new proof is added, the source revision increments once. Inspecting the same candidate again under the source lock inserts nothing and does not increment the version. A separate uncertainty-to-published completion can update both publication and scheduled job, yielding two more row-based source increments. The actual proof row and all version bumps remain atomic.

## Test evidence

- Proof insert without a valid source-first signature is refused with CALENDAR_WRITE_GATE_REQUIRED, even from a direct service_role INSERT.
- A valid project/source scoped inspector inserts one proof with an atomic source bump; re-review with the same candidate does not duplicate the proof or bump.
- Missing source revision or foreign/out-of-scope owner fails closed. Existing reconciliation_completion behavior, replay, stale proof/CAS, uncertain-provider semantics and rollback are preserved in the fixture.
- Three deterministic two-session races for proof INSERT against the calendar weekly batch: calendar first, inspection first rejecting a stale week with STALE_SOURCE, and two identical concurrent inspections writing only one proof/version bump.
- Three preceding reconciliation completion races continue to pass (calendar before confirmation, confirmation before stale calendar, duplicate confirmations).
- Five SQL parity/lock-order tests ensure the REAL source inspector is unchanged except for the one source-first gate. They explicitly check that the real media/account/Facebook candidate validators remain in its original body and that proof-table triggers do not independently acquire new source locks.
- Additional inspection tests document the privilege boundary: someone already holding service_role can mint a valid source signature and insert their own synthetic proof without real provider verification. The signature guarantees **source consistency**, not evidence authenticity.

**128/128 targeted local tests passed across 21 PostgreSQL test files on this exact branch** (103 previously passing signed-gate tests plus 25 new proof-table/proof-inspection behavior, concurrency and source-parity tests). The local web TypeScript check still reports three pre-existing Remotion dependency/type errors in lib/media/lambda-render.ts, but no newly reported calendar test typing failures. Full GitHub CI is a separate check and must still complete.

## Critical remaining blockers

1. **Proof authenticity still not guaranteed by a source lock.** The migration currently grants service_role direct INSERT on social_publication_reconciliation_proofs. An authorized privileged caller can deliberately mint the source signature, making a synthetic proof traceable to a source version but not necessarily verified by the real inspector. Review least-privilege proof writers, provenance and the actual provider evidence validation. Do not claim this solves falsified proof injection.
2. **Full effective schema missing.** The fixture uses the original proof table schema and foreign key, but a simplified inspector. The real inspector has not been executed with the new signed source gate against the complete migrated Supabase RLS, content, provider, media and account-binding schema.
3. **Other metadata sources remain direct-DML gaps.** Decisions, batches, publication events, content revisions/drafts, monthly release evidence and rules, along with direct worker writes and cron paths, require a complete common version contract.
4. **Partial release unsafe.** Do not install proof/job/publication BEFORE triggers unless every active writer of those tables has a compatible signed source-first lock in the same SQL transaction and old explicit source bumps have been reconciled. Otherwise legitimate social operations will fail.
5. **Lock graph and owner scope.** Verify with project ownership changes, platform/project stop authority, workflow wake locks, multi-project writes and an actual human-approved calendar batch. Avoid any row trigger which waits on a source version acquired after project or job locks.
6. **Signing-key operations.** A service_role signature is not authenticated end-user approval; test least-privilege key storage, rotation, recovery, transaction pooling, savepoints, rollback and multi-project request boundaries.
7. **External irreversible effects.** A remotely posted photo cannot be undone by a database rollback. Maintain the original uncertain/receipt reconciliation and no-blind-retry policy.
8. **Exact plan approval.** All final calendar writes remain disabled until a source-consistent exact weekly plan is explicitly approved by a human and checked at commit. No automatic booking authority is introduced here.

**Draft only. No merge to main, no production migration, no provider POST.**
