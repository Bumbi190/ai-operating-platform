# Atlas Creative P11 — executed identity and replay tests

Date: 2026-10-21
Branch: `feat/atlas-creative-p11-proof-tests`
Base: P10 identity PR #466 (Draft)

## What changed

Two isolated test files run the **exact, unapplied** SQL migration
`apps/web/supabase/migrations/20261020235500_atlas_creative_worker_identity_p10.sql`
in a disposable PGlite PostgreSQL 18.6 WASM database. No Supabase
database, site or connected Windows service was changed.

The same test package used for P8 is extended with a serial test command:

```powershell
cd scripts/creative-tools/pglite-fixture
npm ci --no-audit --no-fund
npm test
```

The tests run **one database file at a time** via `--test-concurrency=1`,
to avoid simultaneous PGlite memory spikes on the Hultgren PC.

### P10 SQL execution (6 tests)

- The private identity and nonce tables, RLS and function grants are created.
- An authenticated service-role proof increments the counter and inserts
  exactly one nonce record.
- A repeated nonce or a stale counter is refused.
- Revoked/wrong signing-key ID and changed project grants refuse.
- Null proof and browser JWT role-spoof attempts fail.
- Rotating the signing key does not reset the monotonic counter.

### Full signed flow through PostgreSQL (4 tests)

A P-256 signing key is generated IN THE TEST PROCESS ONLY, its public
key is inserted in an ephemeral database fixture, and an HTTP request is
signed over the canonical method/path/body/counter/nonce/timestamp.

- The P10 server registry adapter fetches the actual public key via SQL,
  verifies the signature, and consumes a nonce through the actual P10 SQL
  function.
- Recreating the entire server authenticator does not bypass the durable
  nonce/counter checks; replay is rejected.
- When the database changes the worker's permitted projects, its next
  authenticated principal receives only the **current** grants, not cached
  old project access. The existing P6 claim boundary separately enforces
  matching the ticket to those grants.
- Revocation in the database refuses a properly signed next request.

The previous P8 PGlite migration tests are retained (11 tests).
**21 of 21 PGlite suite tests passed**.

## Important limitations

PGlite runs PostgreSQL **18.6**, while the Omnira Supabase database runs
PostgreSQL **17.6**. These are real database execution tests but do not
prove P10 migrations on PG17 or true multiple-session row-lock concurrency.
Those tests are still required before applying P10.

The DB adapter in the signed-flow fixture is a **test-only** implementation
of the Supabase client interface. The actual live service-role client,
identity enrollment and approval path are NOT connected or deployed.

The fixture inserts a disposable ACTIVE test identity. No real worker was
enrolled. The actual Windows account `omnira-media-worker` stays DISABLED.
No secret key was stored in GitHub, in Supabase or on disk.

Do not apply this migration to production, enable media execution,
or merge into main without independent review and real PG17 concurrency
verification of P10 itself.
