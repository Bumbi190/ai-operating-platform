# Growth release: full-suite and dependency follow-up, 28 November 2026

Base: bb85f7cb5705e41419037a29f702d12960a151e7. Continue draft PR 658; no new branch, worktree, merge or production activation.

## Observed broad regression result

The actual manual Full Web Suite run https://github.com/Bumbi190/ai-operating-platform/actions/runs/46128773455 tested the exact base commit. All 839 configured files were seen: 737 passed, 100 failed and two skipped. Assertions: 16,528 passed, 186 failed, 380 pending/skipped, zero todo; total 17,094. Nested suite counters are not distinct-file counts. This is a RED release gate, not a full-suite success.

Observed setup causes include the absent hard-coded October Docker fixture, missing WebsiteBuild KEEP_DB seed, and two psql /dev/stdin ENXIO failures. Other failures include product/source contracts and canonical PostgreSQL-version requirements. Do not classify all 186 as harmless or introduced by this upgrade without paired evidence.

## Bounded changes

- Same direct dependency pins, workspaces, scripts and overrides. Transitive TypeScript-ESLint/minimatch, XML/Smithy and selector-parser dependencies are refreshed through their accepted ranges; Remotion 4.0.464 relocates without an upgrade.
- Root Node range is now ^22.13.0 || >=24, matching the new visitor-keys requirement and excluding unsupported Node 23. Current CI remains pinned to Node 22.22.3.
- Two SQL bootstrap calls use psql -f - instead of /dev/stdin. Their fixture SQL, assertions, migration lists, roles, timeouts and real concurrency cases are unchanged. Actual isolated PG16/Node22 Linux reproduction rejected /dev/stdin with ENXIO; the same SQL and flags with -f - returned 25, while invalid SQL still failed with SQLSTATE 42703. The owned container was removed.
- Full Web now retains its actual JSON report as a seven-day artifact even on failure. Existing execution and failure predicates are unchanged.

## Dependency validation before integration

Exact proposed lock SHA256: fc389025bcd71d4be015f9f751082ec9799c719283a12dad0f7cf50742f4aeb3. A fresh audit completed with zero critical, high and moderate findings, six low. npm audit exit 1 reflects the remaining findings, not a completed zero-finding scan.

Proposed graph installed with npm ci and install scripts disabled on Node 22.22.3. Paired actual APIs parsed 160 changed JS/TS files with matching token signatures, produced identical output in two small Tailwind/nested-CSS samples, and serialized an S3 DeleteObjects request identically through an in-memory handler; zero external requests. These are bounded compatibility probes, not application-wide/build/live-provider proof. Independent read-only review found no material integration blocker; fresh hosted CI on the follow-up head remains required.

## Remaining release gates

The full Web gate is RED and broader fixture/product failures remain. A local attempt to bootstrap the canonical WebsiteBuild SQL fixture timed out during its compile/bootstrap path; its owned container was removed, and the old stopped fixture remained untouched. No positive prerequisite receipt was fabricated.

Six low Remotion/esbuild findings remain. GitHub lists 82 open CodeQL alerts (60 high, 22 medium) on older main analysis, not a current clean scan of this head. Five alert paths overlap the integration; no alerts were dismissed. Security disposition, complete broad regression, merge/release review, and any separately approved data/capture/pilot work remain pending.

No customer data, external publication, production database, API key, schedule or paid model inference was changed.
