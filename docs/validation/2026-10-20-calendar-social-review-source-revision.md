# Omnira calendar — social review source-version prototype

**Status:** Isolated PostgreSQL prototype and tests only. No production migration, provider API action, scheduler activation or autonomous calendar approval.

## Grounding

The production-source migration apps/web/supabase/migrations/20261018071209_social_schedule_batches.sql defines social_schedule_propose, social_schedule_approve and social_schedule_revoke. These functions validate the trusted owner principal, preserve immutable batch revisions, enforce exact batch revision/SHA256 approval, require confirmed=true, check expected versions for revocation, and avoid duplicate jobs through idempotency-key checks.

A new version of an approved proposal revokes the old approval and cancels pending jobs. Publishing, uncertain and provider-in-flight states have separate recovery requirements and must not be treated as simple deletion.

## Candidate integration

The test-only SQL file apps/web/lib/calendar/social-review-revision-candidate.sql is generated from those original function bodies. It adds:
1. A source revision FOR UPDATE guard before each project row FOR UPDATE, using the restricted calendar_social_source_lock_probe helper inherited from the earlier monthly-rule test branch.
2. A bump of that source revision after successful proposal, approval or revoke writes, in the same transaction.
3. No bump on the existing early-return paths for an identical idempotent request or an already revoked batch. Neither uniqueness checks nor approval and cancellation logic have been replaced.

The source helper is a SECURITY DEFINER function callable only by service_role. It relies on the principal supplied by the trusted server layer. Possession of service_role credentials and a caller-supplied JSON principal are NOT proof of an authenticated end user; the real server boundary needs independent review.

The fixture copies important social batches, decisions, jobs and events table definitions, unique constraints, relevant FKs and the original manifest-validation, batch-view and cancel-jobs SQL functions. It intentionally simplifies the social_schedule_item_guard and social_content_active helpers, so **real content review, account binding, media assets, monthly release gates, provider permission checks and full RLS are not verified.**

## Test evidence in isolated PostgreSQL

- Seven tests for permissions, missing version, proposal replay and conflicting idempotency keys, owner scope, exactly one approved job on replay, rollback and idempotent revoke.
- Four deterministic concurrent database races: calendar batch first versus proposal; social approval first versus stale calendar batch; two identical approvals; and calendar batch first versus social revoke.
- Four replacement-revision tests: revising an approved batch cancels the old queued job, repeated submission is stable, stale approval is rejected, and an injected failure restores the previous approval and scheduled state.
- The earlier monthly-rule prototype includes eight further PostgreSQL tests for version-first locking, rollback and calendar concurrency. Running all these groups together gives regression coverage across both social paths.

## Release blockers

1. Social worker claim, step, checkpoint recovery, manual content revisions, reconciliation and direct table writes can change calendar-visible schedules and still lack a common source-version contract. Use final SQL after all migration overlays.
2. Real content/review/asset/account-binding and RLS restrictions must be exercised using a full migrated Supabase fixture, not the simplified review source fixture.
3. Published, in-flight and uncertain external provider states need explicit safety and audit checks. Cancelling a queued job does not undo an already published post.
4. Prove complete lock ordering across source revision, project, workflow, social job/publication and platform stop locks, including simultaneous changes and project ownership.
5. Audit the SECURITY DEFINER and service_role permission boundary and initialize missing source revisions safely. A forged principal supplied by a privileged caller must not become a confused-deputy route.
6. Weekly writes still need exact human approval, atomic source reads, stale-source refusal and recurrence/conflict safety. A source-version test is not authorization to write a week plan.
7. Design a reversible production migration, operations monitoring and benchmark before any activation.

**Do not merge or deploy this candidate or dependent drafts to production.**
