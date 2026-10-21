# Calendar source-version guard for monthly release confirmation

**Status:** isolated review and PostgreSQL test candidate only. No production migration, publication, or autonomous calendar booking.

## Actual function and the calendar impact

The real function public.social_schedule_release_confirm(p_principal jsonb,p_input jsonb) comes from apps/web/supabase/migrations/20261018071209_social_schedule_batches.sql. It checks the server-provided owner principal, exact payload fields and explicit confirmed:true; requires a YYYY-MM release month, SHA256 catalog identity and constrained HTTPS customerViewUrl. It then locks the project row, validates content activation, inserts an append-only social_monthly_release_evidence record and appends a release_access_confirmed event.

A successful evidence record is read by social_schedule_authority when an approved release_month job is processed. The actual authority function requires the matching approved actor, release month and catalog hash, kind owner_verified_access, and evidence verified within the previous 24 hours. It is not permanent blanket permission to publish.

## Isolated candidate

apps/web/lib/calendar/social-release-confirm-revision-candidate.sql is derived from the original function body and adds only:
1. calendar_social_source_lock_probe(p_principal,p_input) **before** the original projects FOR UPDATE, to lock the owner/project calendar source revision row and reject missing or mismatched ownership;
2. calendar_social_source_bump_probe(p_principal,p_input) after evidence + event insertion, in the same SQL transaction before returning. A late error rolls back evidence, audit and the revision.

These helpers are service_role-only prototypes inherited from PR #461. The trusted server principal boundary and full RLS are not proven by this work.

**Important existing behavior:** social_schedule_release_confirm has no idempotencyKey and makes a fresh evidence row on every successful call, even if the same data is sent again. Each actual new evidence write must bump the calendar source revision; preserving current semantics means duplicate requests create two evidence rows. Avoid accidental retries in the UI/server until a separately reviewed idempotency design is implemented. Do not silently deduplicate or claim this procedure is exactly-once.

## Tested in real isolated PostgreSQL

Seven functional tests:
- service_role-only RPC and helper ACL;
- missing revision fails closed before inserts;
- valid owner-approved release evidence, matching source revision increment and audit record commit atomically;
- repeated confirmation appends fresh evidence and bumps the version again, by original design;
- foreign principal/missing project scope fails;
- invalid month, hash, unsafe URL and unconfirmed input fail without changes;
- injected late transaction error restores evidence, audit and version together.

Three deterministic multi-session races with the isolated weekly calendar batch:
- a human-approved calendar batch commits first, while release confirmation waits on its source revision lock, then commits safely;
- release confirmation commits first, and a stale expected revision causes the waiting calendar batch to reject with STALE_SOURCE;
- two simultaneous identical confirmations serialize without deadlock, with two separate evidence rows/audits/revision bumps because the original function is append-only.

Four source-parity/contract tests:
- the SQL candidate matches the complete original function body after removing only the two lock/version calls;
- source lock precedes project locking and bump follows the audit insert;
- the original social_schedule_authority includes owner-verified release evidence and a 24-hour validity window;
- the original release function does not have request idempotency.

The fixture copies the original social_monthly_release_evidence table definition and relevant constraints. social_content_active is a deliberately reduced test stub, and the full media, asset, account binding and content review gates are NOT tested.

## Before any production migration

1. Finish inventory of every social calendar-visible writer: manual social_publication_step, editorial content changes, provider reconciliation/inspection proof inserts, and direct worker/table mutations. Instrument all with one source-revision contract, not just this RPC.
2. Prove full lock ordering among source revision, projects, social jobs/publications, workflow wake locks, platform/project stop authority, and atomic calendar batch; test synthetic concurrency in a fully migrated database.
3. Verify service_role/RLS/SECURITY DEFINER privilege, authenticated server principal construction, project ownership changes, and source revision creation/recovery. No browser exposure of privileged helpers.
4. Validate full monthly release authority using real content reviews and a provider-safe fixture, including expiration and retries. The original monthly confirmation procedure is not idempotent.
5. Ensure no unavailable/truncated social source can be treated as a complete calendar snapshot. Bind exact user-approved week plan and source revisions to the final write transaction.
6. Require a reversible migration, full CI, staging tests, and explicit human production release authorization before activation.

**Do not merge/deploy this test-only candidate to main or production.**
