# Web Studio: real local Auth and PostgREST proof — 2026-11-05

Continuation of PR #368 from local e5b2875. First real Auth/API backend proof in this workstream.
This does not claim that the WebBuilder UI or worker has been tested with real authentication.

## Implemented test

apps/web/scripts/test-website-auth-local.mjs --run creates an independently named, labelled temporary
Docker network and four containers: Supabase PostgreSQL, GoTrue, PostgREST and an internal Node HTTP client.
All images are cached and pinned by immutable digest. --pull=never is mandatory. The daemon must be local.
The internal network has no external gateway; no ports are published and no host directories are mounted.
Database cron launching is off. The database listens within its own isolated network so Auth/PostgREST
can connect; it is not published on the host.

The test uses the image's actual auth.uid() helper and the GoTrue-managed auth schema/migrations.
There is no hand-written auth.users stub, fake password verifier or fabricated user access token.
A synthetic service JWT bootstraps two fictional confirmed accounts through the real admin API;
user access/refresh tokens come from real password login. Secrets are randomly generated for each run,
stay out of receipts and are redacted from failure diagnostics.

A dedicated fictional webbuilder_auth_probe table exercises row-level policies through PostgREST.
It is a narrowly scoped Auth/RLS probe, not the production projects table or WebBuilder schema.
Auth and Rest HTTP calls run from the internal client container, not through exposed host ports.

## Verified result

Receipt: docs/validation/website-real-auth-local-20261105.json
completed=true; 28/28 checks passed; all four containers and the owned network removed.
Containers are deleted with their disposable volumes. Existing Supabase stacks were not modified.

Verified against actual services:
- Two real admin-created test identities and password logins.
- Wrong password refusal and server validation of the user access token.
- Successful refresh that preserves the same user identity.
- Two users see only their own row.
- Cross-user filtered read returns no rows and cross-user update affects no rows.
- Owner reassignment and inserting for the other user are denied by WITH CHECK.
- Anonymous access is denied; the synthetic service role can access both fictional rows.
- Sign-out succeeds and the current refresh token cannot obtain another session afterwards.
  Existing access JWTs are not asserted to become immediately invalid on sign-out.

Operational checks also cover the local daemon, internal network, absence of published API ports,
service readiness, existing managed auth.uid(), and disabled cron launching.

## Reproduction

node apps/web/scripts/test-website-auth-local.mjs --run

The script requires the four recorded images already cached. Missing images fail without downloading.
It writes a nonsecret receipt and, on failure, redacted diagnostics to the host temporary directory.
Cleanup checks ownership labels before deleting only this run's resources. A cleanup failure prevents success.

Configuration was checked against the official Supabase self-hosted compose:
https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml
The cached GoTrue v2.197.0 matches the referenced compose version at lookup time.

## Remaining acceptance work

1. Attach the reviewed application schema to a fresh real-Auth target without overwriting the managed auth schema.
   The earlier 189-step fixture-assisted replay and catalog evidence are separate proofs; this run does not combine them.
2. Use real sessions/cookies through the actual WebBuilder UI and APIs. Exercise plan/design approval,
   project boundaries and the cost gate, rather than directly seeding a build session.
3. Run the full worker and preview/revision/export flow. Paid model calls need an explicit test budget;
   no provider model or external publishing was called here.
4. If hosted acceptance is still needed, use a separately authorized data-less target and scoped preview envs.
   The provider quoted 0.01344 USD/hour for a branch in the existing organization; no confirmation or creation occurred.
   The account currently has only the production/default Supabase branch. Official branching documentation confirms
   that projects with migration history can replay that history rather than clone a complete schema, so the known
   baseline/provenance gap remains relevant to any hosted branch.

No production data/schema, real accounts, shared local stacks, Vercel envs or deployments changed.
No new hosted cost. No push or merge performed.
