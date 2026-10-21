# Atlas Creative P13 — operator-initiated pending worker enrollment

Date: 2026-10-21
Branch: `feat/atlas-creative-p13-enrollment`
Base: `feat/atlas-creative-p12-pg17-proof` (PR #470)

## Implemented (no live activation)

`apps/web/lib/media/creative-queue/enrollment-core.mjs` models a two-step
operator-initiated creative-worker enrollment that **cannot activate the
Windows account or authorize media execution**.

1. A trusted platform-operator resolver (server-side Supabase session) must
   return an authenticated operator principal. Test fixtures simulate it;
   no new Next route is connected.
2. The trusted store issues one limited-time challenge with exact worker ID
   and a sorted, unique list of canonical project UUIDs, maximum 5 minutes.
3. A P-256 public key and proof of possession are signed over a domain-separated
   canonical payload binding enrollment ID, worker ID, key ID, challenge,
   expiry, exact projects and SPKI DER SHA-256 fingerprint.
4. The server verifies that exact signature against the supplied public key,
   checks the stored issued challenge, then calls the trusted store to stage
   the proof **only as `pending_review`**.
5. No approval, active worker record, model access, process launch or publish
   capability is granted by `begin` or `stage`.

The server adapter `enrollment-store.mjs` validates closed, server-known
record shapes and uses two purpose-specific RPC methods. It never gives the
caller raw SQL write access. Server-returned `timestamptz` values may be in
`+00:00` format; the adapter converts only explicitly timezone-qualified
values to exact UTC ISO milliseconds before comparing the signed expiry.

## Proposed persistent schema (NOT DEPLOYED)

`20261021080000_atlas_creative_worker_enrollment_staging_p13.sql`
creates a separate, private `atlas_creative_enrollment_staging` table and:

- unique active `issued` challenge per worker and unique challenge digest;
- expiry <= 5 minutes and a closed `issued`/`pending_review`/
  `rejected`/`expired` state vocabulary;
- service-role-only RPCs to create a challenge and atomically stage a
  previously verified proof, guarded by row lock, original operator,
  challenge hash, expiry, worker ID and ordered project UUIDs;
- no direct insert/update/delete grants to service_role or browser roles,
  no browser RLS policy, no enrollment of any real identity, and no
  transition to an active/executing worker.

The SQL functions **cannot** independently verify an operator's session,
P-256 signature or a legitimate project grant. These are mandatory *trusted
server* prerequisites, not evidence supplied by a model or HTTP body.
**Proof-of-possession is NOT human/operator approval.** The review/approval
and revocation endpoints and durable operator ledger are not implemented.

## Tests on Hultgren

- **86/86 Node creative tests passed** (includes eight core enrollment
  scenarios and four independent server-store shape/date tests).
- **32/32 sequential PGlite (PostgreSQL 18.6) tests passed**. Seven execute
  the actual new P13 migration with P10, and four test the complete
  operator -> challenge -> signed P-256 proof -> database
  `pending_review` sequence, replay denial across service instances and
  lack of any active worker.
- Total **118/118** local checks passing for this worktree.
- P13 itself has **NOT YET** been exercised against PostgreSQL 17 or
  under simultaneous database connections.
- Full application TypeScript/Next build and hosted Supabase integration have
  not been run in this worktree.

## Required next gates (NO GO to prod)

1. Independently audit P13 SQL, test it on isolated PG17 with concurrency.
2. Bind operator resolver to `resolvePlatformOperator` from the authenticated
   session, and verify operator project permissions before issuing challenge.
3. Add a separate operator review/rejection and explicit approval ledger.
   Verify the worker's key fingerprint by a trusted out-of-band method
   before any registration becomes active.
4. Add reviewed service-role adapter and guarded Next routes, disabled by
   default; implement enrollment/revocation audit and key lifecycle.
5. Independently test process, filesystem junction and network restrictions
   for the disabled Windows media worker; enable only after safety review.
6. Test synthetic Atlas -> PhotoCraft -> private canonical Asset ->
   human preview. Publishing requires a separate approval.

No cloud migration, paid service, production deployment, OS account change,
network listener, editor execution or real registration was performed here.
