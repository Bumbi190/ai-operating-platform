# Calendar social receipt reconciliation under signed source gate

**Status:** isolated PostgreSQL proof only. No Supabase production migrations, real Facebook/Instagram requests, published posts or automatic calendar bookings.

## Correct final SQL source

The effective function public.social_publication_reconciliation_complete(jsonb,jsonb) is defined in the later social-aware migration 20261018071209_social_schedule_batches.sql, not the earlier manual-only 20261018070155_social_publication_reconciliation.sql.

The real function validates an owner principal and an exact confirmation payload, calls social_publication_reconciliation_inspect (which can lock both projects and publications, and may insert proof evidence), and compares candidate proof identity, hash, state, source revision, expiry and a recent readAt timestamp. An identical published receipt returns unchanged. A valid uncertain receipt can become published; for a scheduled publication the job state and audit are also updated. No remote provider POST is part of the completion function.

The source revision lock must precede the inspector, because the inspector takes other row locks. Acquiring the source lock afterward would recreate the lock-inversion risk demonstrated by PR #451.

## Candidate implementation

File: apps/web/lib/calendar/direct-write-gate-reconcile-integration-probe.sql

- Derived from the exact previous isolated source-version candidate (PR #469).
- Replaces the original source lock helper with the signed transaction-local calendar_source_gate_begin_probe, before calling the inspector.
- Removes the earlier explicit version bump. The AFTER row triggers in parent PR #475 now increment the version for each actually changed publication or job row.
- Preserves original receipt validation, publication state CAS, idempotent already-published return and service_role-only EXECUTE restrictions.
- A scheduled uncertain-to-published confirmation generally changes two protected rows, so the source revision increases **twice**. An unchanged receipt replay increases it zero times.
- Publication status, job status, audit and source version are rolled back together on a later SQL failure.
- This service_role source signature is not an authenticated user or exact-week approval.

## Test evidence

New isolated PostgreSQL test groups:

- **10 behavior tests** for ACL, missing source fail-closed, synthetic confirmation and correct row-trigger revisions, no-op replay, invalid/expired proof, wrong principal, unsafe in-flight confirmation, unconfirmed image, blocked direct publication UPDATE, late rollback and an explicitly demonstrated gap in the separate proof table.
- **3 deterministic two-session races** versus the isolated calendar week batch: batch first, reconciliation first with STALE_SOURCE batch refusal, and two identical concurrent confirmations with one status change.
- **5 source-parity/contract tests** showing the exact original SQL remains after only the signed-gate swap and removal of the former explicit bump, with version lock before the inspector and both protected table triggers present.

The fixture keeps the real reconciliation-proof table definition and constraints but uses a deliberately reduced social_publication_reconciliation_inspect stand-in. It checks ownership and row locking only; it does **not** establish actual Facebook provider proof authenticity, content review, account binding, media validation or production RLS. All proof records are synthetic.

## Evidence-table bypass: still a release blocker

The production-source migration grants service_role SELECT/INSERT privileges on public.social_publication_reconciliation_proofs. The signed two-table gate protects only social_publications and social_schedule_jobs. In the fixture a direct privileged INSERT into the proof table succeeds without changing the calendar source revision. This is a **demonstration of an unresolved evidence-integrity hole**, not proof the system is secure. Such proof rows can influence a later confirmation, even though the proof INSERT by itself does not publish anything.

The complete effective social_publication_reconciliation_inspect, its provider evidence checks, and other proof writers require a separately reviewed source-first contract. A late proof-table row trigger that waits for a source revision can reintroduce deadlocks; do not deploy one without a complete lock-order proof.

## Remaining blockers before production

1. Finish converting all effective legitimate writer entry points, nested cancellation and provider recovery, before installing any blocking row trigger. Previous explicit bumps and automatic row-trigger bumps must not double-count.
2. Protect all other calendar-visible social metadata: decisions, batches, editorial content revisions, monthly rules, release evidence, reconciliation proofs and direct privileged writes.
3. Prove complete cross-source lock ordering including project ownership changes, platform pause, workflow wake revisions and multi-project workers.
4. Validate the entire migrated Supabase schema, real ACLs/RLS, authenticated server principals, proof inspection/media/provider safety, migration rollback, signing-key rotation and recovery.
5. Add exact authenticated **human approval of the submitted week plan** with complete source snapshots and final stale-source validation. The source signature only proves version-lock ownership.
6. Perform staged load, concurrency, CI and operational smoke tests before any deployment.

**No merge or production activation is authorized by this prototype.**
