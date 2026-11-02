# Real Vehicle 3D — reviewer audit SQL, isolated proof

**Status (2 November 2026):** DRAFT / PROPOSAL, never applied to hosted Supabase.
**Workflow:** Same existing PR #368, no new branch, no application endpoint,
no model generation and no production migration.

## Files and execution

- `docs/sql/atlas-studio-real-vehicle-review-audit-p2b-proposed.sql`:
  proposed scoped assignment, immutable evidence revisions, mutable
  current-revision pointer, append-only pending audit, and internal
  SECURITY INVOKER database function.
- `docs/verification/web-studio/vehicle-review-audit-bootstrap.sql`:
  synthetic `service_role` fixture only, after initial owner A/B fixture.
- `docs/verification/web-studio/vehicle-review-audit-assertions.sql`:
  real PostgreSQL constraints, grants, policies, triggers, and procedure tests.
- `scripts/verification/run-vehicle-capture-rls.ps1`:
  existing isolated runner extended to test both photo and review proposals.
  New disposable `postgres:17-alpine` Docker container, `--network none`,
  no mounts, ports or real credentials, `--memory 192m`, one CPU and
  `finally` cleanup. This runner doesn't touch existing Supabase stacks.

Verified local run output:
```
PASS: isolated owner/foreign/revoked/storage-role SQL assertions
PASS: isolated append-only reviewer A/B, duplicate, swapped GLB, stale revision, revoke and immutability
PASS: isolated Postgres vehicle photo RLS and append-only reviewer audit assertions.
Process completed with exit code 0
```

## Verified safeguards

- No `anon` or `authenticated` SELECT/INSERT/UPDATE/DELETE access to
  reviewer assignments, revisions, current pointer or audit register.
- No `anon` or `authenticated` schema USAGE on internal writer schema.
- Writer function is `SECURITY INVOKER` inside unexposed
  `website_review_private`, explicitly granted to `service_role` only.
- Reviewer ID must already be actively assigned to the exact owned listing.
  Foreign reviewer ID is denied, even when the privileged writer attempts it.
- Current evidence version is checked under PostgreSQL `FOR SHARE` row lock;
  writes to the current pointer or reviewer assignment require conflicting locks.
  If an earlier revision has already become stale, the write is rejected.
- Event `event_id` is unique and replay is denied; a different submitted
  GLB hash fails its evidence-version binding.
- Existing audit events and original revisions are immutable: UPDATE and
  DELETE explicitly raise through triggers, even in fixture superuser tests.
- Outcomes are exclusively `human_review_required`,
  `revision_required`, or `additional_evidence_required`.
  There is NO approved/publish/verified state in the ledger.

## Limits and deployment blockers

- The tests confirm *PostgreSQL semantics* with sequential revision and
  revocation scenarios. They do NOT yet demonstrate a two-session timing race
  or a hosted Supabase DB integration. Concurrent reader/writer interleavings
  require an explicit second transaction test before deployment.
- `service_role` is a privileged actor: it could supply another reviewer ID.
  An eventual server-only writer MUST independently verify the authenticated
  user against that reviewer ID, not trust a caller's JSON. It must never
  expose the privileged client to browsers.
- The internal schema is not exposed to PostgREST. A future backend connection
  or individually reviewed RPC bridge is required; do not alter the Data API
  schema settings simply to call this function.
- Event SHA-256 digests are integrity references, NOT signatures, and do
  not prove physical vehicle identity, photo rights, matching wheels or human
  identity. They must be backed by an independently versioned source ledger
  and an authenticated reviewer.
- The full reviewer photo+render evidence writer, revision transition /
  reviewer revocation controller, signed human review, and post-review
  publication authority remain **unimplemented**.
- The separate SCB migration guard blocks Vercel Preview. Never fabricate
  that migration, disable the guard, modify its ledger or merge this PR to
  bypass it.
- No live SQL, customer photos, real automobile or paid providers were touched.

## Timestamp and digest traceability

The pending audit stores two times: `event_created_at` from the trusted
server event (required, within 300 seconds of DB clock), and `recorded_at`
set by PostgreSQL on receipt. This preserves the timestamp that went into
the application's SHA-256 event digest, but neither timestamp nor digest
constitutes a cryptographic signature. The fixture also rejects a
one-hour-old event, and the DB rejects null/invalid hashes and excessive
difference/uncertainty arrays.
