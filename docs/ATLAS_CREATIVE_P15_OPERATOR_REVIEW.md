# Atlas Creative P15 — operator review decision, NOT activation

Date: 2026-10-21
Branch: `feat/atlas-creative-p15-review-ledger`
Base: P14 Draft PR #476

## Goal

Prepare the next distinct human gate after a creative worker proves ownership
of its signing key. The operator may **record** `approve_registration_only`
or `reject_registration` against an existing `pending_review` record.

A saved decision **never changes** `atlas_creative_worker_identities`,
never enables `omnira-media-worker`, does not issue a signed work ticket,
does not permit process execution, and does not authorize publication.

## Components

- `review-core.mjs`: pure, dependency-injected operator review domain
  adapter. It requires a server-derived platform operator principal, exact
  canonical project UUIDs and signed evidence digests.
- `review-store.mjs`: closed Supabase-style query/RPC adapter that reads only
  a `pending_review` enrollment and records a decision through one SQL
  function. An attacker-supplied extra field never reaches SQL.
- `20261021100000_atlas_creative_enrollment_review_p15.sql`: separate,
  private and **unapplied** review ledger, with immutable one-decision-per-
  enrollment primary key and unique review nonce digest. Only a service-role
  function can append a decision, after `FOR UPDATE` verifies original
  key/proof SHA and exact project UUID array against P13.

The SQL function **cannot** know whether a service-role caller actually
authenticated a platform operator or verified that operator's project
authority. The trusted server MUST derive the principal via
`resolvePlatformOperator` from the Supabase session, independently
authorize the exact projects, and only then use this adapter. A browser
may never supply `reviewerUserId` as authority.

There is no public Next route, server action or review UI in P15, and
no production Supabase migration.

## Verification

- 10 local review-core/DB-adapter tests pass, including wrong operator,
  duplicate review/replay, invalid project, malformed request, additional
  untrusted fields, and zero execution/publish authority.
- 4 local real PGlite PostgreSQL 18.6 tests pass using the **exact P15 SQL**
  together with the P10 and P13 migrations. They verify RLS/revoked grants,
  verified proof/project scope, exactly one decision, browser exclusion
  and zero active worker identities.
- Full branch: **96/96 creative Node tests**, **36/36 sequential PGlite tests**.
- Earlier P14 independently proved P13 one-use staging in PostgreSQL 17.11;
  that does NOT prove P15's new review ledger. P15 still requires PostgreSQL
  17 execution and concurrent operator decision tests.

## Outstanding review and safety gates

1. Verify P15 SQL in isolated PostgreSQL 17 with two real concurrent
   conflicting approve/reject attempts; exactly one immutable decision.
2. Build a separate authenticated, same-origin, CSRF-safe operator review
   endpoint and UI with explicit approval/rejection and visible key SHA256,
   exact project list, request origin, and test-state indicators.
3. Add a durable independent operator decision authorization/evidence
   ledger and key enrollment/revocation review. Never treat an arbitrary
   service-role API caller as the human operator.
4. Require approved worker key, reviewed project scope, fresh device identity
   and verified Windows network/process isolation before *any* creative
   execution. The worker account must stay disabled until then.
5. Keep the human image/video quality and publication approval as a later
   separate gate.

Nothing in P15 enables remote or autonomous editing. No production write,
deployment, connected device change, third-party service or cloud bill
was introduced. Keep all stacked PRs Draft until independent review.
