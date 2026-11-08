# Web Studio — isolated PostgreSQL verification

Date: 2026-10-31. Worktree: atlas-builder-references-20261017; existing PR #368. Baseline 89286a6050ad4987ab9c71b1bd76f7bc655e770c. Local only; no push, main merge, hosted changes or paid AI call.

## What was exercised
The actual planning store, canonical website SQL functions, static compiler and build worker now have a repeatable isolated PostgreSQL proof for the new visual metadata. New integration cases verify:
1. Exact palette/font, canonical hash and three mockup references survive a database save/read.
2. A palette-only plan revision receives a different hash, invalidates old approvals, preserves its page list and leaves the stored old plan/mockup unchanged.
3. A different owner is refused even when the supplied principal includes the target project in allowedProjectIds.
4. An explicitly approved plan pins its exact mockup; duplicate start returns one session; the worker commits a first three-page preview; a subsequent color-only feedback produces a second immutable revision with the correct applied-feedback receipt. The previous preview is byte-for-byte preserved.

The fourth case uses a deterministic mocked model response for initial generation, feedback interpretation and the revised package. It tests the real worker and SQL, NOT whether a paid model generates good design or follows instructions. Auth identities and auth.uid are synthetic in this existing SQL fixture, NOT real GoTrue sign-in, browser cookies or HTTP middleware. The existing full Auth/Storage CI stack is unchanged and was not run locally.

## Test isolation
The old fixed-name container was found stopped and was not reused, restarted, renamed or deleted. Test-only target resolution now accepts an explicit UUID-bound temporary container in addition to the unchanged legacy default. Before mutation, identity and ownership labels are checked. For the new target: no network, no published port, no bind/named-volume mounts, running state and bounded memory/swap are required.
The runner used the already cached postgres:17-alpine image (sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24), a fresh password, network=none, tmpfs data, 192MiB memory/swap cap and one CPU. It used docker exec/Unix sockets, never a hosted endpoint. No image pull or package installation. The child environment does not pass existing API/database credentials.
The SQL runner explicitly differs from the heavier four-service Auth fixture: single PostgreSQL, lower resource cap, real SQL only. Existing full Auth tests remain Linux/CI-only.

## Evidence
- First real PostgreSQL run: **16/16 passed**, including four new flow cases and 12 existing mockup/pinning/security cases. Run dc77ff90-f067-4335-abe6-e41228a54736; owned database/container removed successfully. Before/after inventory: the same 42 existing container IDs/names, no added or removed unrelated containers.
- Test-target/opt-in guard suite: **6/6 passed**. Partial or invalid target IDs, wrong ownership labels, host mounts, exposed networking and unbounded resources rejected; missing opt-in stops before Docker.
- Focused code regressions: **147/147 passed**, including the actual chat-route contract with provider boundaries mocked.
- Expanded real PostgreSQL run: **53/53 passed** across visual-roundtrip (4), existing mockup store (12), SQL bootstrap (2) and build worker (35). Run f50e5cae-f585-4228-b06c-dd7e6b9226df; owned container removed, same 42 unrelated container IDs/names retained. Full web TypeScript exit 0.
- Broad command `npm test -- --bail=1 --maxWorkers=1 --minWorkers=1`: exit 1, stops at unchanged `lib/qa/mission-brief-v1.test.ts:384` public-status-list assertion (2 passed, 1 failed before bail). No new all-suite-green claim; the prior full-suite red evidence remains relevant.

## Reproduction
`WEBSITE_SQL_ROUNDTRIP=isolated-local node apps/web/scripts/run-website-sql-roundtrip.mjs` from the repository root (use PowerShell environment syntax on Windows). Opt-in, >=2GiB free host RAM, local Docker context and the cached image are required. The runner owns only its uniquely labelled container and removes it in finally.
Evidence is retained under `.superpowers/sdd/2026-10-31-web-studio-sql-roundtrip/` with per-run receipt, bootstrap/test logs, JSON test report and before/after container inventory. Do not upload local credentials or broad container inspect output.

## Changed scope and review
Only test infrastructure, test cases and internal documentation were changed. Production build logic, budgets, user authorization, SQL migrations, published routes and existing full Auth infrastructure are unchanged. Manual second-pass review checks lifecycle/ownership boundaries and production-source reuse; no independent review or security certification is claimed.

## Remaining gates
Real Auth/browser session integration for this exact commit, paid AI visual-quality/end-to-end evaluation with an approved budget, full production migration compatibility, independent review and broader failed-suite triage remain open. The premium dealership/showcase and 3D assets are not implemented by this test slice.

Lifecycle limitation: successful finally cleanup is evidenced twice. Abrupt OS/host termination is not tested or guaranteed. The runner does not claim a general OS sandbox.
