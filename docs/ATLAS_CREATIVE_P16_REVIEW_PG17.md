# Atlas Creative P16 — real PostgreSQL 17 review-decision concurrency

Date: 2026-10-21
Branch: `feat/atlas-creative-p16-pg17-review`
Parent: `feat/atlas-creative-p15-review-ledger` (Draft PR #477)

## Verified

Runner: `scripts/creative-tools/pg17-docker-fixture/run-pg17-p15.mjs`

- Executes the exact unapplied P7, P10, P13 and P15 migrations on a disposable
  **PostgreSQL 17.11** instance, using the previously verified, digest-pinned
  Docker image, `--network none`, no exposed ports and no host mounts.
- Tests `atlas_creative_enrollment_review_decisions` RLS and grants.
- Tests signed key/proof mismatch is refused even when a server-side role
  presents a review request.
- Tests one valid `approve_registration_only` decision can be stored.
- Tests two **separate, simultaneous PostgreSQL 17 sessions** attempting
  `approve_registration_only` and `reject_registration` for the same
  enrollment. The first commits; exactly one review ledger row exists; the
  second returns false.
- Tests replay of either decision cannot modify the immutable decision.
- Verifies that the review functions do **not** activate a media worker identity
  or authorize media execution.
- **24/24 PostgreSQL 17 checks passed**, including inherited P7/P10/P13 checks.
- Temporary Docker container was deleted on completion.

This runner and its diagnostics are only local fixtures. Its test Postgres
role differs from Supabase `service_role` (the real role bypasses RLS);
the fixture explicitly reads a stored expiry with trusted test-admin
credentials before passing the value into the function. It does NOT weaken
RLS or production grants.

## Reproduce

From the repository root, with Docker Desktop running and the pinned Docker
image already cached:

```powershell
node scripts/creative-tools/pg17-docker-fixture/run-pg17-p15.mjs
```

## Important NO-GO limits

The SQL function does NOT authenticate the operator's actual session or
prove project-level authority. A privileged service-role call must only be
made *after* a separate, server-owned verification of the operator and exact
project permissions. Without that boundary, the new review ledger is NOT
suitable for production.

The function only records an immutable review event. It does not enroll,
approve for execution, enable a Windows account, run media tools or publish
an asset. No production Supabase deployment, SQL write, device activation
or added cloud expense happened during P16.

Next: an audited operator-only, disabled-by-default server+review UI seam,
operator project ownership check and an independent worker key verification
method. Keep this PR and all parents Draft until reviewed.
