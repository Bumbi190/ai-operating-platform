# Atlas Creative P10 — separate worker identity and proof boundary

Date: 2026-10-20
Branch: `feat/atlas-creative-p10-identity`
Base: P9 creative database test branch / PR #464

## New implementation

### Signed creative worker requests (offline, no live endpoint)

`scripts/creative-tools/worker-request-auth.mjs` verifies a P-256
worker signature using the **server-owned registered public key**. The
signature binds:

- dedicated creative domain `omnira.creative.worker.request.v1`;
- exact worker and signing-key ID, monotonic counter and nonce;
- UTC timestamp (maximum 60 seconds old, 15 seconds future);
- POST method and exact `/api/atlas/creative/worker/claim` path, no query;
- SHA-256 of the exact UTF-8 request body.

The worker registry supplies **trusted UUID project IDs** and the separate
creative permission. The device cannot grant itself a new project by
putting it in a header, ticket, or prompt. A *trusted server-side* callback
must transactionally consume a verified counter and nonce and recheck device
state, key generation and allowed projects before returning authenticated
creative claims. The module has NO in-memory fallback.

### Proposed database persistence (NOT APPLIED)

`apps/web/supabase/migrations/20261020235500_atlas_creative_worker_identity_p10.sql`:

- dedicated `atlas_creative_worker_identities` with public verification
  key, `revoked` default and media-claim permission `false` default;
- dedicated `atlas_creative_worker_nonces` with unique nonce digest and
  unique worker+counter, never a raw nonce or signing secret;
- an SQL function to atomically consume the verified nonce, increment
  monotonic counter, and check worker state/key/project grants under
  `FOR UPDATE`;
- server-only service-role read and function-execution grants; NO browser
  policies, NO service-role direct enrollment/update/delete privileges;
- no account records inserted, no worker enabled, no media execution.

The SQL function CANNOT independently verify a signature or human
approval. The **trusted server** must first verify the signature against
a previously enrolled, authenticated identity. The database consumption
is one mandatory replay gate, not self-standing authorization.

### Server adapter prepared but NOT wired to a route

The pure adapter in
`apps/web/lib/media/creative-queue/worker-identity-adapter.ts`
maps the registered identity to the verifier and calls only the P10
database function to consume a proof. The `worker-identity-server.ts`
wrapper is server-only and uses Omnira's existing Supabase admin client.

Nothing imports this adapter from a live Next API endpoint. No route was
created, no environment variable/key was provisioned or exposed, and no
actual Supabase call was made by this implementation.

## Compatibility and additional hardening

The P5 signed ticket validator incorrectly rejected UUIDs as `projectId`,
even though the canonical Omnira project record uses UUID. This is now
corrected without changing the signed format: the verifier supports existing
signed slug fixture tickets as well as real project UUIDs. The DB adapter
still STRICTLY requires canonical UUID IDs, and legacy signed slugs cannot
be rewritten into UUIDs without invalidating their signatures.

The HTTP contract now rejects invalid UTF-8 bytes instead of silently
normalizing them, so the verified signature binds the same logical JSON
bytes that were received.

## Verified now

- **74 of 74 local creative Node tests pass**, including request-signature,
  revoked state, replay nonce/counter, wrong key, canonical project UUID,
  invalid UTF-8 payload, and mocked server adapter tests.
- **11 of 11 existing P8 PGlite tests re-passed** (P7 schema only).
- **8 of 8 existing P9 PostgreSQL 17 tests re-passed** (P7 schema only).
- Combined local regression total: **93/93**. P9 Docker test cleaned up its own container.
- `omnira-media-worker` remains disabled; project code agent untouched.

**CRITICAL:** The new P10 identity migration has had static structural tests
only. Its SQL has NOT yet been executed in PostgreSQL 17 or Supabase, and
the real server HTTP authenticator/registry/transactional store have NOT
been integrated end to end with a live route. Old P9 tests are NOT proof
of P10's new SQL. Neither is this a production-ready media worker.

## Remaining gates

1. Independent P10 SQL review and PostgreSQL 17 execution/concurrency tests
   against a disposable, isolated test database.
2. Authenticated operator-gated creative worker enrollment/revocation,
   binding an actual key to exact allowed project UUIDs.
3. A separately reviewed server-side claim route that wires the signature
   verifier and DB transaction, with durable operator approval and
   generation/key rotation checks. Keep disabled by default.
4. OS isolation testing for the Windows restricted worker, including child
   processes, filesystem junctions and network egress.
5. Full synthetic Atlas -> PhotoCraft -> private, validated Asset ->
   independent preview -> human review. Separate publish approval mandatory.

**NO GO:** merge to production, apply P10 SQL, activate worker, connect
to a live queue, or permit autonomous editor execution.
