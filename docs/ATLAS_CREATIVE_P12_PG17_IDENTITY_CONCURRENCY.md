# Atlas Creative P12 — PostgreSQL 17 identity and replay acceptance

Date: 2026-10-21
Branch: `feat/atlas-creative-p12-pg17-proof`
Base: P11 Draft PR #468 (P10 identity migration)

## Executed tests

`scripts/creative-tools/pg17-docker-fixture/run-pg17-p10.mjs` executes the
exact **unapplied** P7 and P10 migrations in a disposable PostgreSQL 17.11
container and tests row-lock contention with separate PostgreSQL connections.

The runner pins the previously downloaded official PostgreSQL 17 image by
SHA-256 digest, uses `--network none`, publishes no ports, mounts no host
files, and uses an ephemeral, RAM-backed database. It removes only the
container it created in `finally` and refuses container-name collisions.

The old P9 test runner was not changed. The P12 copy additionally waits for
**the actual PostgreSQL server** to answer SQL rather than relying solely
on the temporary `pg_isready` response during initialization.

The 15 passing integration checks include:

- Correct PostgreSQL 17 major version, Docker network/port isolation.
- P7 migration, service-role grants, one-use claims and actual two-connection
  reservation race (one winner, one refusal).
- P10 migration produces private identity and nonce tables and no enrolled
  workers.
- P10 first monotonic counter and nonce are accepted, stale counter and
  duplicate nonce are rejected.
- Wrong signing key, wrong canonical project UUID, browser-role spoofed
  service claim, and revoked identity are rejected.
- **Two real PostgreSQL sessions concurrently consume the same P10 nonce
  and counter.** Exactly one gets true, one gets false, the counter records
  the winning value, and exactly one nonce receipt is stored.
- Two simultaneous sessions attempting **different nonces but the same counter**
  also produce exactly one accepted proof and one nonce receipt.

`POSTGRES_HOST_AUTH_METHOD=trust` is used **only inside the no-network,
no-ports disposable test container**. This setting must never be copied to
a shared, exposed or production database.

## Run on Hultgren

Requires Node 22, Docker Desktop, and the cached pinned PostgreSQL 17 image:

```powershell
node scripts/creative-tools/pg17-docker-fixture/run-pg17-p10.mjs
```

Production Omnira uses Supabase PostgreSQL 17.6; this fixture uses PostgreSQL
17.11. Same major version, but **not a complete copy** of Supabase, triggers,
extensions, grants, or cloud operator policies.

## Security limits

These tests demonstrate SQL replay atomicity, **not** actual worker
enrollment, production registration, independent human approval, signed
request handling across a live HTTP route, or OS worker isolation.

The registered `HultgrenCreative01` worker in tests is synthetic, uses a
dummy public-key string and exists only in temporary test storage. The
actual Windows account `omnira-media-worker` remains disabled. Nothing
is enrolled or deployed. No Supabase SQL writes, migrations, deployments,
new cloud services, or media processing were performed.

Before allowing a live creative job: reviewer-approved server enrollment
with revocation and exact project UUIDs, protected signing-key storage,
independent operator approval, trusted SQL connector, signed HTTP replay
handling, and verified restricted Windows process/network boundary must
all be completed.

**GO:** continue code review of the creative-only server integration.
**NO GO:** apply SQL to production, enable worker execution, or publish.
