# Web Studio: real Next HTTP boundary on an internal local target

Command: `node apps/web/scripts/test-website-auth-local.mjs --run --application --routes --next-http`

The new mode builds a minimal Next 14 standalone app. Its API files re-export the production WebBuilder route functions; middleware.ts is copied byte-for-byte from the current app. The fixture supplies only a minimal layout/page, its own build configuration and five planning/settings routes. This is not the full WebBuilder UI or deployment build.

Build-time environment removes Supabase/provider/deployment variables; no production .env is copied into the test source. Next telemetry is disabled. Compilation runs on the host, then the standalone server is copied into the owned client container and runs there. No Next or backend port is published, no host directory mounted, and all services remain on the temporary internal network. The client memory limit is 512 MiB in HTTP mode.

The test runner supplies a local gateway for real Auth/PostgREST and synthetic anon/service keys. SSR cookies come from real GoTrue password tokens. In HTTP mode each route operation makes a real fetch to the standalone Next server, so Next constructs request state and executes the real middleware before the route. The earlier two direct access-resolver assertions are retained as supplemental checks; they are not counted as HTTP requests. The unauthenticated fixture page must redirect to /login, proving middleware page containment is active.

Coverage includes unauthenticated/invalid cookies, owner and foreign settings/plans, cross-origin writes, foreign agent selection, identity-override fields, canonical plan save/read/idempotency, mockup review and session-attributed plan approval. No build start is invoked. All planning/settings responses must remain private/no-store.

Authoritative receipt: docs/validation/website-real-auth-next-http-20261105.json. Completion requires all parent and route checks plus owned-container/network cleanup. The parent runner also checks no build jobs or cron executions were created. Both the temporary standalone build and the test bundle are removed.

Remaining: browser-driven full UI login/navigation and browser persistence of refreshed cookies, approved build/cost admission and worker/preview/export; Storage HTTP and any hosted target. The 189-step fixture-assisted bootstrap remains distinct from standalone ledger readiness or complete production parity.

Refresh test: the SSR cookie's local expires_at metadata is aged while retaining the real, unchanged GoTrue access and refresh tokens. The real Next middleware must call the real refresh endpoint, preserve the owner in the downstream settings route, return updated Set-Cookie headers and retain private/no-store. This does not fabricate or sign a user JWT, and does not claim that an actual expired access JWT or browser persistence was exercised.

Verified run finished 2026-11-05T12:06:11.496Z: completed=true; 48/48 parent checks and 43/43 HTTP/session checks passed; 189/189 schema steps applied with managed Auth preserved. Four owned containers and the owned network were removed. No build jobs or cron runs were created. Bundle import execution, standalone build, JavaScript syntax checks and git diff --check passed. No production changes, cloud resources or paid model calls. The unrelated shared-fixture full app suite was not run.
