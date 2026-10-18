# The Prompt review evidence: migration and rollback review
Status: proposed, local SQL only. No production schema change or release authority.

## Exact forward artifact
`apps/web/supabase/migrations/20261018083917_media_news_review_evidence.sql`, allocated by installed Supabase CLI 2.81.3 using `migration new`.

Canonical committed bytes: 34,141 bytes, SHA256 `ca7a24d698689039fb99c94a9d8f036130b0ee43bbc535d24b2331f3d23f71f9`. Git attributes preserve these bytes on Windows. Recalculate from the final committed artifact before an approved application.

- Adds server-only RLS-protected immutable `media_news_review_evidence` bound by composite revision/post/project/SHA FK.
- Adds server-only prepare/read/verification helpers with explicit empty search paths. Existing social-content requirements/read/decide retain their canonical behavior with additional news guards; public news metadata is appended only to protected news posts.
- Reserves `the-prompt-review-admission-v1` provenance inserts to service_role. If that name existed before the guard, first installation refuses and requires provenance reconciliation; it never retroactively certifies old metadata.
- Other asset producers, existing JPEG publication and ordinary projects retain their interfaces.
- Does not create publication requests, grant transport/spend authority, edit scripts, reclassify private previews, change CRON or activate the trial.

## Prerequisites before any production application
1. Review the exact committed SQL and checksum, grants, trigger semantics, FK/index coverage and backup/rollback strategy.
2. The owning workstream reconciled exact `sales_reply_preparation` and current social scheduling source in main `e2316f1`. This feature incorporated that main revision in merge `507cf80`; no candidate SQL was copied and no live migration was applied here.
3. Verify there are no unattributable pre-existing reserved admission records. A failed preseed check requires provenance reconciliation; it never permits deleting rows or falsifying provenance.
4. Approve the concrete migration and deployment separately. The implementation approval does not authorize live SQL. Migration Guard keeps the new migration enforced: 146 canonical / 132 enforced, with frozen 14 grandfathered / 30 legacy names unchanged. An actual ledger without `media_news_review_evidence` must fail.
5. Apply through the normal canonical process once approved; rerun advisors and schema parity on the actual target, then deploy/retest authenticated HTTP. Deploy the feature application only after its SQL guards are installed. Operator intake must not precede this coordinated release.

## Local verification
Owned labeled Postgres fixture only. Actual SQL/RPC tests cover owner scopes, server-only ACL/RLS, immutable rows, trusted producer guard, initial preseed refusal, digest parity, exact retries, late attachment, two independent psql sessions, and multichannel rollback. Latest fresh-schema SQL/API run: 18/18 PASS. Existing initialized content/publication regressions: 39/39 PASS before UI integration. Final wider results and exact local database names are in the validation report.

Files run serially because the existing fixture initializer replaces functions; concurrency is exercised explicitly within tests.

Installed CLI advisors refused the non-TLS loopback test server even with `sslmode=disable`; advisor PASS is not claimed. The shared container was not reconfigured and production was not queried as a substitute. Complete advisor review on the separately approved target remains outstanding.

## Rollback
Prefer rolling back application code while **retaining the new SQL guards and audit rows**. Disable the new intake/prepare entry points; preserve private-preview holds and all prior evidence/decisions. Added SQL guards are compatible with existing content callers.

Never drop evidence or decisions to make rollback succeed. Never restore old decision/requirement definitions while protected news revisions could still be approved through them. A schema reversal requires a separately reviewed freeze of those paths and exact restoration SQL; no destructive reverse migration is supplied.
