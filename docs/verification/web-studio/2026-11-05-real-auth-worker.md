# Web Studio: approved preset admission and real worker

Command: `node apps/web/scripts/test-website-auth-local.mjs --run --application --routes --next-http --worker`

Extends the real Auth/SSR/Next HTTP fixture with production Studio creation, budget, plan start, session and revision routes. The test creates a new fictional Studio project through HTTP, uses its factory builder and conversation, saves a plan bound to the version-pinned cinematic registry, then explicitly approves its mockup and plan as the real synthetic owner.

Admission checks require an actionable missing-budget refusal and zero jobs after refusal; a stored zero-kronor monthly budget; denial for the other user; idempotent start with exactly one pending website run. Zero budget here is intentional for a deterministic preset with no paid work, not evidence that provider spend is permitted. Provider-backed spend admission is separate.

The worker test calls canonical claim_runs through PostgREST. It does not manually stamp a claim, seed a build session, replace the worker or fake the provider. The actual executeWebsiteBuildRun must refuse a wrong claim and execute with the canonical claim. A beforePaidStep hook throws if any paid step is attempted; local fetch allowlisting and the internal Docker network also prohibit provider dispatch. The preset compiles from the bound registry and commits the first preview through actual SQL RPCs. Owner HTTP reads must return a ready session and five-page artifact with the approved binding, while the other user receives 404.

The owned disposable database receives a synthetic platform_config row with automation_paused=false only if absent; an existing paused row is never unpaused. This is test runtime state after the schema replay, not production configuration or parity evidence. Parent checks require one run marked websiteBuildCompleted and zero cost_events. The worker function creates a preview; drain-owned terminalization of the run is not exercised.

Bug found: planning/store.ts did not recognize SQL PROJECT_BUDGET_REQUIRED and converted it to BUILD_UNAVAILABLE / HTTP 503. A regression test failed with the observed 503, and the first real HTTP acceptance failed at worker_missing_budget_is_actionable. The minimal fix adds this known refusal to the existing error mapping, returning the existing budget guidance as HTTP 409. SQL admission and all authorization controls remain unchanged. A second regression check retains sanitized HTTP 503 for unknown database failures.

Receipt: docs/validation/website-real-auth-worker-20261105.json. Completion requires parent/route checks and owned-resource cleanup. The earlier Auth, cookie, ownership, approval and middleware-refresh cases run in the same fixture. No production, hosted branch or paid generation is involved.

Remaining: full browser UI; ordinary model-generated builds and provider spend admission; drain terminalization; feedback/revision recovery, media fetching and full export through this combined environment; hosted acceptance. This is a deterministic preset worker proof, not general AI generation or full production parity.

Verified run finished 2026-11-05T12:22:03.696Z: completed=true, 51/51 parent checks and 76/76 HTTP/session/worker checks passed. The 189 schema steps completed with Auth preserved; canonical claim, wrong-claim refusal, idempotent queue admission, first ready five-page preview, reviewed binding and foreign-user denial all passed. Zero paid steps and zero cost_events. Four owned containers and the network were removed; subsequent labelled-container and temporary-build inventories were empty.

Regression/related tests: 2/2 budget-error tests and 9/9 cinematic-binding tests passed (11 total), including separate source/media integrity and ZIP/project-delivery verification. Those ZIP tests are separate from combined HTTP worker acceptance. JavaScript syntax, bundle import execution and git diff --check passed. The shared-fixture full application suite was not run; unrelated dirty showroom and calendar files were preserved.
