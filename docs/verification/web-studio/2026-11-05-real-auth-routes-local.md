# Web Studio: actual route exports with real SSR cookie sessions

Command: `node apps/web/scripts/test-website-auth-local.mjs --run --application --routes`

Extends the isolated real Auth/canonical application fixture. The test compiles actual route exports and their application dependencies into a temporary Node bundle, copies it into the owned internal client container and invokes handlers with real Request objects. The harness supplies Next 14 request/action AsyncLocalStorage and RequestCookies. It does not start a Next HTTP server or browser and does not execute middleware.

The Supabase SSR SDK builds cookie sessions from GoTrue-issued password/refresh tokens. App createClient(), auth.getUser(), resolveProjectAccess(), owner-scoped project enumeration, createAdminClient(), planning validation/stores and SQL RPCs all run unchanged. There are no mocked Auth responses, allowed-project lists or RPC results. The server-only build marker uses the existing repository test stub because this is a Node server test rather than a Next compilation; no authorization code is replaced.

A temporary HTTP gateway inside the client container forwards only /auth/v1/ to GoTrue and /rest/v1/ to PostgREST. It fabricates no responses. Fetch destinations are allowlisted to these internal services. The SSR session client uses a separate synthetic anon key, never the service key. Secrets arrive through stdin and do not enter the receipt or temporary bundle.

Coverage: missing/invalid cookies, real user/project resolution, own/foreign settings and plans, same-origin refusal, foreign agent rejection, body identity override rejection, real plan validation/save/read/idempotency, generation of three review options, mandatory mockup review, explicit mockup approval and plan approval attributed to the actual session user. All responses must be private/no-store. No build start or paid provider is invoked; the parent harness verifies zero build jobs.

Source receipt: docs/validation/website-real-auth-routes-local-20261105.json. Completion and all outer/route checks must pass, with all owned containers and network removed. Temporary host bundle files are deleted. Existing dirty showroom and calendar files are outside this change.

Remaining acceptance: actual Next HTTP routing, browser login/UI and middleware cookie refresh; approved build admission/cost gate and worker; preview/revision/export flow; Storage HTTP and any hosted target. Fixture-assisted 189-step replay is not standalone ledger or complete production parity evidence.

Verified result, finished 2026-11-05T11:55:46.931Z: completed=true; 48/48 parent checks and 37/37 route/session checks passed; 189/189 schema steps applied with managed Auth preserved. All four owned containers and the network were removed; a subsequent labelled-container inventory was empty. No build jobs were created. Bundle compilation/import execution, JavaScript syntax checks and git diff --check passed. Validation used this self-contained integration runner; the unrelated shared-fixture application suite was not run.
