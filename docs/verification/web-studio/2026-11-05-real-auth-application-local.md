# Web Studio: canonical application SQL with real local Auth

Run: `node apps/web/scripts/test-website-auth-local.mjs --run --application`

The optional application mode combines the existing real GoTrue/PostgREST test with the verified 189-step canonical/legacy/synthetic bootstrap sequence. All source pins are checked before application SQL runs. It uses a fresh isolated database with two real fictional Auth users, preserves the managed auth.uid() definition, and checks both accounts survive schema installation. No Auth stubs are installed.

The database preloads pg_cron and pg_net and explicitly disables cron job launching. Pinned Storage schema prerequisites and local managed-default privilege fixtures support the replay. This remains fixture-assisted bootstrap evidence, not proof that the historical migration ledger alone can provision a hosted branch.

HTTP checks use real password-issued and refreshed user JWTs for project and plan reads. Server-only planning RPCs use the synthetic service role and a test-constructed principal derived from verified Auth identities. This does not exercise the actual Next.js context resolver. Tests cover builder selection, canonical plan save, idempotency, owner isolation, server-RPC denial for authenticated users, cross-project write refusal and rejection of builds without approval. No plan approval is bypassed or build session directly seeded.

Result receipt: `docs/validation/website-real-auth-application-local-20261105.json`. The receipt is authoritative for completion, individual checks and owned-resource cleanup. Syntax and whitespace checks are run separately.

The original Auth-only mode remains available without --application. All calls run inside a temporary internal Docker network, with cached images, no host mounts or published ports. Random credentials and tokens stay out of the receipt. Cleanup removes only this run's labelled resources and disposable volumes. No production changes, cloud branches or paid model calls occur.

Remaining: actual Next.js sessions/cookies and route/context validation; positive plan/mockup approval and cost gate; worker build, preview, revisions and export; Storage HTTP and hosted acceptance. Full production schema/security parity is not asserted.

Observed native PostgREST error contract: a cross-owner service RPC raises SQLSTATE P0002 / WEBSITE_BUILD_NOT_FOUND and is returned as HTTP 500 by this cached PostgREST version. The test asserts all three fields; it does not assert HTTP 404. This is a refusal proof, not approval of the public-facing error mapping. Next.js route behavior still needs separate acceptance.

The approval-refusal assertion requires an HTTP error plus SQLSTATE 55000 and PLAN_REVIEW_REQUIRED. It intentionally checks the database guard contract without assuming the eventual Next.js response status. Syntax checks: node --check for both scripts; git diff --check.

Verified run finished 2026-11-05T11:43:19.215Z: completed=true, 46/46 checks passed, 189/189 application steps applied, authPreserved=true. All four owned containers and the owned network were removed. No unapproved build jobs or cron runs were present.
