# PR #408: security review and release handoff (2026-10-20)

**Status: NOT approved for production, migration apply, or merge.** This is an
evidence inventory prepared by the development assistant, not the required
independent reviewer sign-off.

## Exact scope

- Pull request: https://github.com/Bumbi190/ai-operating-platform/pull/408
- Reviewed branch head before this handoff: `cfdc505`.
- New SQL (both unapplied in AI Operating Platform production at review time):
  - `apps/web/supabase/migrations/20261018185809_atlas_code_review_storage.sql`
  - `apps/web/supabase/migrations/20261019110000_atlas_code_work_execution_lease.sql`
- No code execution consumer, autonomous model dispatch, or production authority
  is enabled by these migrations. The execution-lease HTTP handler returns 503
  unless `ATLAS_CODE_WORK_EXECUTION_LEASE_ENABLED=true`.

## Evidence verified

1. All eight GitHub Actions jobs on PR #408 reported PASS at `cfdc505`.
   Preview Vercel is separate and FAILED CLOSED on the two missing migrations.
2. Read-only production migration listing contained 174 applied records, neither
   `atlas_code_review_storage` nor `atlas_code_work_execution_lease`.
   Read-only SQL confirmed the new review table, review credentials, and
   execution-lease function were absent; predecessor code-work tables existed.
3. `sdf-review-storage-boundary.test.ts`: five static tests pass with the
   added invariant that *every* newly declared public review/lease RPC has
   an explicit REVOKE from PUBLIC/anon/authenticated/service_role and an
   explicit GRANT EXECUTE to service_role only. The exact eight RPCs are pinned
   and a new one fails the invariant until reviewed.
4. The private `atlas_code_review_private` schema and its credentials table
   have explicit REVOKEs in source and the tables enable RLS. A separate
   migration-security test rejects unauthorized grants on this schema.
5. The ordinary review/lease contract tests: 310 PASS in the initial run.
   After adding Docker's installed binary directory to the test process PATH,
   all three `sdf-review-storage-flow.test.ts` tests PASS against a newly
   created, network-disabled, ephemeral `postgres:16` container on Windows.
   The three cases covered two independent review candidates and roles,
   replay/recovery after lost RPC responses, and rejection after cancellation.
   The fixture-owned container was removed; no application database was used.
6. The larger `sdf-review-storage-sql.test.ts` suite passed 17/17 in
   isolated PostgreSQL on GitHub Actions at `62dbc4a`. The Windows-native
   `sdf-execution-lease-sql.test.ts` has NOT been rerun in this handoff.
   Available physical RAM was below 1 GiB; do not start that fixture without
   a new resource and host-identity preflight.

## Additional nonproduction CI gates

The `SDF-1C Trusted Broker Boundary` workflow now runs the isolated PostgreSQL
suites `sdf-review-storage-sql.test.ts` (17 cases) and
`sdf-review-storage-flow.test.ts` (3 cases) on a Linux Actions runner, with a
single Vitest worker and separate exact per-file anti-skip checks. The fixture
uses an ephemeral `postgres:16` image with Docker network disabled. No
Supabase project is contacted. The two PostgreSQL suites and their anti-skip
checks passed on PR #408 in GitHub Actions at commit `62dbc4a`.
The six host-identity lock and timing-window regression tests from that
Windows fixture have additionally been duplicated in the database-free
`sdf-execution-lease-peer-identity.test.ts` suite and enrolled in SDF-1C CI
with an explicit six-test anti-skip floor. The copied tests exercise mock
qualification and process changes without launching Docker. They passed 6/6
on Windows and are pending their first GitHub Linux CI result.
The full native-Windows execution-lease SQL suite is still not included,
because it requires the approved Windows host identity pins and fixtures.
Passing the six mock tests must not be mistaken for that full native proof.

## Independent reviewer checklist (not completed)

- Review SECURITY DEFINER authority and the exact call path for all eight RPCs.
- Independently test role revocation, tenant scope, replay and rotation under
  concurrent cancellation/revocation in an isolated PostgreSQL fixture.
- Check `atlas_code_review_private` is not Data API-exposed, especially after
  the schema exists, and verify no effective anon/authenticated grants.
- Examine reviewer/worker identity separation, reissued reviewer credentials,
  immutable snapshots, bounded budgets, evidence integrity, and fail-closed
  timeout behavior.
- Confirm additive migrations do not change existing objects unexpectedly.
- Review CI configuration and the intentionally disabled lease route.
- Record independent sign-off and residual risks; do not treat this handoff as
  approval.

## Ordered release gates

1. Independent reviewer signs off the exact reviewed commit and SQL digests.
2. Obtain the owner's separate approval to apply the two production migrations.
   Verify backup/recovery readiness and run the PostgreSQL tests in isolation
   before applying.
3. Apply each approved migration via the normal managed migration process;
   check the ledger, RLS, effective ACLs, RPC execution privileges, and Data
   API exposure using read-only post-apply queries. Do not enable lease flags.
4. Confirm Vercel preview build and all required CI checks pass on the exact
   release commit, then obtain an explicit merge approval.
5. Implement and separately gate the real code-worker and independent reviewer
   runtime. These are NOT shipped by this PR.

Never bypass the migration guard or mark missing migrations as applied.
