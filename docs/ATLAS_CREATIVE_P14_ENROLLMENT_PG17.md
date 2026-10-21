# Atlas Creative P14 – PostgreSQL 17 enrollment concurrency acceptance

Date: 2026-10-21
Branch: `feat/atlas-creative-p14-pg17-enrollment`
Parent: P13 Draft PR #474

## Result

The **exact unapplied P13 migration** and earlier P7/P10 migrations were
executed in a temporary local Docker PostgreSQL **17.11** container.
The new runner `scripts/creative-tools/pg17-docker-fixture/run-pg17-p13.mjs`
extends P12's reviewed runner, uses an image pinned by SHA256 digest,
`--network none`, no published ports, no host mounts and RAM-backed PGDATA.
Only its own temporary container is removed in `finally`.

All **20/20 local PostgreSQL 17 integration checks** passed, including:

- RLS and no browser execution/table write privileges
- P7 one-use claim and two-client race
- P10 signer proof counter/nonce replay and two separate concurrency cases
- P13 private/empty enrollment table and restricted issue/stage SQL functions
- A test-only service-role issuance creates exactly one `issued` challenge
- An exact, verified test enrollment may transition only to `pending_review`
- Wrong operator or challenge hash and duplicate proof staging are refused
- At most one `issued` challenge exists per worker at a time
- **Two separate PostgreSQL 17 sessions racing to stage the same P13 proof**
  yield exactly one accepted and one rejected result, one `pending_review` row.

### Two important test-fixture corrections

1. The local Docker test's `service_role` does not have the Supabase production
   role's `BYPASSRLS` attribute. Reading `expires_at` through an in-call
   service-role subquery returned `NULL` and caused the stage to be rejected.
   The runner now first fetches the expiry through its trusted test-admin
   connection, then passes the exact value as a bound-in-meaning SQL argument.
   The migration's authorization checks were **not relaxed**.
2. The second synthetic enrollment needs a distinct canonical proof SHA256,
   because `canonical_proof_sha256` is deliberately UNIQUE across all
   enrollments. Reusing the first hash was a fixture error, not permission
   to bypass a unique constraint.

## Remaining security controls

- This is **SQL concurrency verification**, not proof that a real authenticated
  Omnira operator can approve an enrollment. The server-side session-derived
  platform operator and canonical project membership checks are not wired.
- A proof of key possession is NOT a human review decision.
- There is no durable review decision ledger, approval/revocation endpoint,
  enrolled device signing key in production or UI activation.
- No Windows worker isolation, network egress/child process constraint, image
  output admission, or human publishing review is verified.
- PostgreSQL 17.11 matches Supabase's major v17 but is not an exact Supabase
  database clone, and this fixture uses synthetic rows only.
- P13 SQL is NOT deployed. No live Supabase writes, account enablement, server
  listener, media editing, output publishing or billing changes occurred.
- The system must remain default-deny and `omnira-media-worker` disabled.

**GO:** continue with design and independent testing of an operator-reviewed
approval decision, always separate from OS worker enablement.

**NO GO:** apply migrations or make autonomous creative execution available.
