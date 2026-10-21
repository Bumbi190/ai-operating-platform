# Calendar social manual publication version guard — isolated proof

Status: **fixture-only SQL candidate; no migration, provider POST, live calendar write or autonomous approval**.

## Actual effective SQL definitions

The final effective SQL functions social_publication_prepare(jsonb,jsonb) and social_publication_step(jsonb,jsonb) are in apps/web/supabase/migrations/20261018071209_social_schedule_batches.sql. They replace earlier versions in 20261016115402_social_manual_publication_v1.sql.

Both final versions validate a server-supplied owner principal and project scope. The prepare function checks exact confirmed=true and a request idempotency key, locks the project row, refuses to prepare an already scheduled-authority publication, invokes the original social_publication_guard for real content review, then inserts social_publications and an append-only social_publication_events entry. Exact request replay returns the prior record without writing. Conflicting replay is rejected.

The step function checks an existing manual-authority publication, expectedVersion and allowed actions; invalid or stale transitions return an unchanged receipt. Successful transitions update publication state/version and audit. A Facebook request moves from requested to publishing, and its publish completion requires validated provider receipt fields; possibly incomplete provider calls can be marked uncertain, not silently repeated.

## Candidate implementation

apps/web/lib/calendar/social-manual-publication-revision-candidate.sql reproduces the complete final function bodies and adds only:

1. Restricted service_role-only calendar_social_source_lock_probe BEFORE existing projects FOR UPDATE. It verifies the owner/project mapping and requires a source-version row.
2. Restricted calendar_social_source_bump_probe AFTER the actual publication and audit writes and BEFORE the final result, in the same SQL transaction. Original idempotent/no-op early returns do not increment the source revision.

The helpers are already present as test-only SQL in the stacked monthly social candidate (PR #461). A service_role-supplied JSON principal is not authenticated end-user identity by itself; only a trusted server with a verified principal may call these RPCs. No additional browser endpoint or provider execution was created.

## Tested in isolated real PostgreSQL

Eleven transactional behavior tests:
- service_role-only RPC execution; missing source version fails closed;
- successful manual prepare and same-key replay / equivalent different-key replay create exactly one publication and audit record, bumping only on first actual write;
- conflicting request, foreign actor, out-of-scope project and invalid explicit confirmation fail without changes;
- scheduled-authority publication refuses manual prepare and step paths;
- Facebook requested to publishing to published lifecycle atomically bumps source on real writes;
- stale publication version and invalid state transition return unchanged without bumps;
- a missing revision blocks an already prepared publication from stepping;
- uncertain provider status is retained without retrying a provider POST;
- late failure atomically rolls back publication, events and source version;
- the local fixture demonstrates that a direct service_role table UPDATE bypasses the RPC and leaves calendar source revision unchanged.

Four deterministic two-session PostgreSQL races:
- an active week batch blocks manual prepare; after commit the manual prepare bumps source;
- a manual prepare commits first and causes a stale weekly batch to fail with STALE_SOURCE;
- two identical manual prepare requests serialize and commit one publication, one event and one source bump;
- a manual status transition commits first and rejects a weekly batch with the old expected revision.

Six parity/contract tests:
- both candidate functions match their complete final SQL source bodies after stripping ONLY the two source-version hooks;
- source locks precede project locks and bumps follow audit writes;
- the latest scheduled-authority-aware SQL was used, rather than the earlier manual-only functions;
- the real initial migration grants service_role direct UPDATE access to social_publications, so direct-write bypass is explicitly tracked.

Total for these three files: **21/21** targeted local tests passed before the combined regression run.

## Known direct-write bypass: release blocker, not fixed by this prototype

In the real initial social publication migration, service_role receives direct SELECT, INSERT and UPDATE privileges on public.social_publications. Therefore a trusted server or background writer that updates that table directly can alter calendar-visible status without invoking either protected RPC or bumping the calendar source revision.

The fixture reproduces this bypass deliberately and verifies the numeric version remains unchanged. A green test is proof of a remaining hole, NOT proof of production safety.

An eventual production design must reconcile all legitimate direct writers and helper functions. Options to evaluate (not implemented or authorized here): restrict direct DML to narrowly approved functions and locked roles; a database-side owner/source revision trigger with an audited global lock-order contract; or a central write gateway used by all social and workflow sources. A trigger executed after project/publication row locks could recreate the deadlock discovered in PR #451. Lock-order correctness, authority controls, safety gates, external provider in-flight recovery, and rollback semantics are mandatory before choosing an approach.

## Other release blockers

- Fixture social_publication_guard is deliberately reduced to owner/post/revision/binding-ID matching. It does NOT test real social content approval, plan revisions, media checks, provider account binding, real RLS or external delivery.
- All effective post-migration social content and provider writer paths need inventory and shared source revision locks. Reconciliation, owner changes, manual/scheduled publishing and release evidence must be included.
- Calendar source snapshots must be transactionally consistent, reject unavailable/truncated sources and bind final writes to an exact explicitly human-approved week plan.
- Full migrated PostgreSQL schema, real service_role privileges, app server identity, performance, crash/recovery and full lock-graph tests must pass; create a reviewable reversible migration only after those proofs.
- No production merge, deployment or automatic provider post is justified by these local prototype tests.

**Do not merge or deploy this candidate, and do not enable autonomous weekly planning or publishing from it.**
