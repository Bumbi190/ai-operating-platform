# Atlas Creative P9 — PostgreSQL 17 concurrency acceptance

Date: 2026-10-20
Worktree: `feat/atlas-creative-p9-pg17`
Parent: `feat/atlas-creative-p8-dbtests` (Draft PR #462)

## Result

The **exact P7 unapplied migration** runs in PostgreSQL 17.11, tested with
Docker Desktop locally on HULTGREN (not Supabase).

8 checks passed:

1. Container starts isolated with Docker `--network none`, no published ports.
2. Real P7 migration applies against disposable project/asset fixtures.
3. Anonymous/authenticated roles have no SQL claim permission.
4. Valid claim receives `claimed_preview_only` fence 1, replay is rejected.
5. Browser role cannot spoof service-role JWT and execute the claim.
6. A missing approval digest is rejected.
7. A foreign-project media asset is refused.
8. **Two PostgreSQL 17 client sessions compete for the same job**. The first
   claims while holding its transaction open for 2 seconds. The second waits
   on the row lock then fails; exactly one commit succeeds, fence remains 1.

After testing, the disposable container is removed. No other Docker containers
or projects were started, stopped, reconfigured or touched by the P9 test.

## Reproduce safely

Prerequisites: Node 22, Docker Desktop running, Docker CLI. Image is pinned to
the digest used in the test.

From `scripts/creative-tools/pg17-docker-fixture`:

```powershell
& 'C:\Program Files\Docker\Docker\resources\bin\docker.exe' pull postgres@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24
node .\run-pg17.mjs
```

The runner refuses a container name collision, uses only a unique
`omnira-creative-pg17-p9-<PID>` name, starts Docker with **no networking,
ports or host mounts**, uses RAM-backed temporary data, and removes only its
own container in `finally`. The test-only Postgres trust setting must NEVER
be reused in a network-connected or production container.

It reads the repository P7 SQL migration; there is no source code or
production database mutation.

## Limits / outstanding blockers

- PostgreSQL 17.11 matches **major version 17**, not the current reported
  Supabase minor 17.6; the Docker fixture is not a full Supabase clone.
- Real two-client row-lock contention is now tested. It does NOT establish
  app-level lease, crash recovery, exactly-once *media execution*, or
  trustworthy distributed operator approval.
- The P7 staged queue is still inactive in production. It is PREVIEW ONLY:
  not allowed to start PhotoCraft/FilmCraft or publish.
- Worker identity enrollment and revocation, canonical Asset admission,
  independent human approval, network/process sandbox tests, and server-backed
  signed queue remain unimplemented.
- `omnira-media-worker` must stay disabled until those boundaries are verified.

## Status

**GO:** continue code review / implement narrowly-scoped server queue next.
**NO GO:** merge database migration to production or enable autonomous editing.
