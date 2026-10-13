# Atlas P1 genuine local HTTP stack verification

Date: 2026-10-13. Base: `eae067ded151c9f321860bb1fb283e2174c46469`.
Scope: save → retry → history → persisted API detail/refetch, in a disposable
synthetic local environment. No production or protected preview write, production
flag change, external SaaS branch, or Handlarbörsen repository/database access.

## Reproduce

With the repository's dependencies already installed offline and these images cached:

- `public.ecr.aws/supabase/postgres:17.11.0.004`
- `public.ecr.aws/supabase/gotrue:v2.197.0`
- `public.ecr.aws/supabase/postgrest:v16.4`
- `node:22-bookworm`

Run from `apps/web`:

```powershell
node scripts/verify-analysis-drafts-http-local.mjs
```

The runner sets Docker API compatibility `1.47` only in its child-process
environment. It refuses existing resource names and app `.env*` files, never
pulls images, and does not install dependencies. It generates fresh synthetic
JWT signing material and passwords for each run. GoTrue's admin endpoint creates
two confirmed synthetic users with the authenticated role; its password token
endpoint authenticates them. The returned genuine sessions are encoded into
Supabase SSR cookies. Production middleware and `resolveProjectAccess` call
GoTrue `getUser`; auth is not replaced by a stub or asserted caller ID.

Next dev serves the actual API route modules on `127.0.0.1`, with their default
production service, source reader, contract, store and Supabase clients. Only the
local child environment sets `ATLAS_ANALYSIS_DRAFTS_ENABLED=true`.

PostgreSQL, GoTrue, PostgREST and a Node HTTP forwarder share a uniquely named
Docker `--internal` network. All four containers have zero published ports and
no data-volume mounts. Docker Desktop suppresses port publication on this
internal network, so a loopback-only host gateway forwards requests through
`docker exec -i` to genuine HTTP connections inside the network. This forwarder
passes request method/path/headers/body and upstream status/headers/body; it
implements no session, query, persistence or RPC logic.

The Next process preloads `analysis-drafts-e2e-fetch-guard.mjs`, which rejects
non-loopback global fetch and TCP socket connections. The runner explicitly tests
both rejection paths. Windows process environment is whitelisted; no production
Supabase/project/provider environment is inherited by Next. Telemetry is disabled.

## What the completed run proved

A complete run exited **0** after these checks:

| Check | Observed result |
|---|---|
| Genuine GoTrue password sessions | Owner and unrelated synthetic user authenticated |
| Actual owner-bound project resolver | Named project columns readable through real PostgREST owner RLS; unrelated user receives no project |
| Fresh frozen source | Companies 10 registered / 6 verified; bids 2 total / 0 last 24 h; valid fresh synthetic snapshot and successful audit |
| Company proposal POST | 201, persisted UUID, `created=true`; persisted creator matches authenticated owner |
| Identical company retry | 200, same UUID, `created=false`; SQL confirms one draft and one created event at this point |
| Owner history/detail/refetch | 200; exact frozen draft body unchanged between independent HTTP requests |
| Anonymous history | 401 |
| Unrelated user list/save/detail | 404; real project RLS returns zero rows |
| Bid proposal POST/retry | 201 then 200, same bid UUID; frozen detail/refetch 200 |
| Combined history/counts | Both rule streams present; two drafts/two created events, zero superseded events |
| Refresh existing source row | Same snapshot UUID; captured time changes by 1 µs |
| Retry old selector after refresh | 409, no extra draft/event |
| Historical detail after refresh | Exact original frozen draft remains; current applicability is `new_evidence` |
| Isolation | Unique internal network only, zero Docker port bindings, loopback host gateway; external app fetch/socket denial tested |
| Cleanup | Owned Next process-tree termination succeeds and child exit is confirmed; gateway closes; all owned containers/network removed and absence verified |

Recorded successful source-refresh run:
company draft `55380082-92ba-4cd3-9cd2-3e14cbb960df`;
frozen API draft SHA-256
`01fb984465c9c7bfe218747a638c76c9ff5bbd685d892bd5153ceb13f09d3999`.
These synthetic identifiers vary by run and are not retained in a database.

Cleanup attempts every owned resource and aggregates errors rather than abandoning
later resources on the first failed removal. It uses `docker rm --force --volumes`
only for its own containers. A cleanup failure makes the run fail. The cached PG
image's `Config.Volumes` was separately inspected and is null.

## Exact schema boundary and limitations

This is **genuine HTTP auth → API → service/store → PostgreSQL persistence proof**.
It is not browser click/navigation/reload proof or production readiness approval.
The refetch creates new HTTP requests with the same authenticated session; it
does not restart Next or drive the product UI. Browser fixtures and fake-store
tests remain separately labeled.

The schema is the existing
`lib/qa/fixtures/analysis-drafts-local-bootstrap.sql` dependency fixture, augmented
with only the named columns used by `getProjectBySlug`:
`name, color, settings, execution_paused, paused_at, paused_reason`.
It enables real PostgreSQL RLS on synthetic projects with the select policy
`owner_id = auth.uid()`. It replaces the bootstrap legacy-only claim helper with:

```sql
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;
```

Those settings come from actual PostgREST JWT verification. This fixture helper
does not establish the definition or grants of `auth.uid()` in a live deployment.
GoTrue migrations install its actual auth tables; fixture-only fixed dummy users
remain separate from the two real synthetic login users. The project owner is
updated to the real synthetic login UUID.

The runner applies actual repository P1B/P1E/P1 migration bytes, normalized to LF:

| Migration | SHA-256 |
|---|---|
| `20261010100000_handlarborsen_marketplace_snapshots.sql` | `ee59a8c936dc0692715e60b1f4ec2e4870681c9433fbde384ff8d1d434441653` |
| `20261010130000_handlarborsen_guarded_snapshot_store.sql` | `9cef7582c17b5812aac242c6fafa48d9f8d3f1c86122332cea6edc0d22b2fe20` |
| `20261012183305_atlas_analysis_drafts.sql` | `0582d94689b34e6704c26a830b879741d233ff81a7139bf28ce3642e83000738` |

The selector hash is calculated from persisted source using the actual SQL
encoding function. The actual service independently reloads that source and
derives the proposal using its TypeScript contract before calling the real RPC.
No API responses or database reads/writes are replaced by an in-memory fixture.

This is not a canonical full-schema replay. Execution/workflow/run/approval tables
are absent from the minimal dependency fixture, so this run does not count live
execution-system side effects or establish live migration/grant correctness.
Full SQL concurrency/immutability/privilege scenarios remain covered by
`verify-analysis-drafts-local.mjs`; its proof is a separate layer. No historical
schema repair or migration-guard bypass was performed.
