# Atlas Creative P7 – database-backed staging design (NOT DEPLOYED)

Date: 2026-10-20
Branch: `feat/atlas-creative-p7-db`
Parents: creative #450, queue #457

## Scope of P7

An isolated, **unapplied** migration proposes `public.atlas_creative_queue_staging`
and the `atlas_creative_claim_staging_p7` SQL function. It is for reserving
preview-only creative work exactly once, not for executing PhotoCraft/FilmCraft.

- `work_id` stays a restricted text identifier compatible with the P5 prototype.
- `project_id` and `source_asset_id` are canonical UUID foreign keys.
- Input asset must still be active, belong to that same project, match its
  stored SHA-256, and have the appropriate medium for the selected recipe.
- Named worker, signed ticket digest, approval receipt digest, claim nonce hash,
  binary digest, and short ticket expiry are required fields.
- One row is selected `FOR UPDATE`; only `staged`, unclaimed and unexpired
  work can become `claimed_preview_only` with claim fence = 1.
- All objects are private: RLS enabled, no policies for browser roles, table
  grants and function execution restricted to service_role.
- SQL independently checks the service-role claim. A real host must derive the
  actual worker/project from authenticated identity, never from request JSON.
- No media bytes, file paths, tool commands, keys, upload, publishing,
  HTTP endpoints, timers or worker processes are created by this migration.

## Canonical project ID contract

P5 used illustrative project labels like `familje-stunden`. Actual Omnira
projects use UUIDs. A project label MUST NOT be treated as equivalent to a
canonical project UUID simply because a model generated it.

`apps/web/lib/media/creative-queue/sql-claim.ts` is a pure boundary requiring:
- canonical UUID project and source AssetId;
- authenticated creative worker identity and a project allowlist from a
  trusted internal server;
- the exact hashes of the verified signed ticket, prior approval and nonce.

It refuses pilot slugs and any worker/project mismatch, and returns a result
that is explicitly NOT execution/publishing authorization. The server must
issue production tickets using canonical project UUIDs before these modules
can be wired together; old signed demo tickets MUST NOT be silently rewritten
because changing a signed field invalidates the signature.

## Important pre-deploy items

1. No local `psql`, Docker CLI or Supabase CLI were discovered on PATH.
   SQL has not been applied or tested in Postgres, and structural Node tests
   do NOT prove the migration executes or handles database concurrency.
2. A reviewer must validate migrations and pgTAP/transactional integration
   tests in an isolated, throwaway Supabase environment before PROD push.
3. The application needs a trusted operator approval database transaction and
   signed worker-device enrollment (not available in this branch).
4. An authenticated creative HTTP route and trusted service-role claim store
   can only be added after the above authorization model is reviewed.
5. The disabled media worker must get verified network/process isolation and
   a fixed-operation sandbox; its ACLs alone are insufficient.
6. This migration alone must never be taken as permission for Atlas to run
   creative tools or publish media. `executionAuthorized=false` throughout.

## Tests

- `scripts/creative-tools/queue-sql-guard.test.mjs`: static structural and
  permission checks against migration source, NOT DB execution tests.
- `scripts/creative-tools/sql-claim.test.mjs`: a pure contract test against a
  mocked store; project UUID and worker binding checks.
- Previous P5/P6 tests and real local media fixture tests remain unchanged.

The migration was intentionally **not run against any Supabase project**.
