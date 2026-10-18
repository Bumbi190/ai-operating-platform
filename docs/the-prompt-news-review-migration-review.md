# The Prompt review evidence: migration and rollback review
Status: proposed, local SQL only. No production schema change or release authority.

## Exact forward artifact
`apps/web/supabase/migrations/20261018083917_media_news_review_evidence.sql`, allocated by existing Supabase CLI 2.81.3 using `migration new`. File SHA and final test counts are recorded in the validation report when implementation finishes.

- Adds server-only RLS-protected immutable `media_news_review_evidence` bound by composite revision/post/project/SHA FK.
- Adds server-only prepare/read/verification helpers with explicit empty search paths. Existing social-content requirements/read/decide are replaced from their canonical definitions with additional news guards.
- Reserves `the-prompt-review-admission-v1` provenance inserts to service_role. If that name existed before the guard, first installation refuses and requires provenance reconciliation; it never retroactively certifies old metadata.
- Other asset producers, existing JPEG publication and ordinary projects retain their existing interfaces.
- Does not create publication requests, grant transport/spend authority, edit scripts, reclassify private previews, change CRON or activate the trial.

## Prerequisites before any production application
1. Review the exact committed SQL and its checksum, grants, trigger semantics, FK/index coverage and backup/rollback strategy.
2. Reconcile `sales_reply_preparation` against canonical source through its owning workstream. Do not copy candidate SQL or bypass migration guard.
3. Verify there are no unattributable pre-existing reserved admission records. A failed preseed check is a reconciliation task, not permission to delete rows or falsify their provenance.
4. Approve the concrete migration and deployment separately. This plan's approval authorizes isolated implementation/tests; it does not authorize live SQL.
5. Apply through normal canonical migration process once approved; rerun advisors and schema parity on the actual target, then deploy/retest authenticated HTTP.

## Local verification
Owned, labeled Postgres fixture only; isolated database name is in this plan's ignored ledger. Tests use actual SQL/RPCs, owner scopes, two independent psql sessions and the existing content/publication suites. Serial test-file execution is required because existing harness initialization replaces shared fixture functions; concurrency is exercised explicitly within the tests.

Installed CLI advisors was attempted against the loopback fixture. It refused the non-TLS test server even with `sslmode=disable`; advisor PASS is not claimed. The shared test container was not reconfigured and production was not queried as a substitute. Actual ACL, RLS, mutation, hash, retry, rollback and concurrency assertions remain required and are recorded separately.

## Rollback
Prefer rolling back application code while **retaining the new SQL guards and audit rows**. Disable the new intake/prepare entry points; preserve private-preview holds and all prior evidence/decisions. The added SQL guards are compatible with existing content callers.

Never drop evidence or decisions to make rollback succeed. Never restore old decision/requirement definitions while protected news revisions could still be approved through them. A schema reversal requires its own reviewed freeze of those paths and exact restoration SQL; no destructive reverse migration is supplied here.
