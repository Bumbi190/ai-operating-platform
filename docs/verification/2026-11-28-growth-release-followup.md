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

## Follow-up on head 8247f811 and isolated SQL prerequisites

Full Web run https://github.com/Bumbi190/ai-operating-platform/actions/runs/46130356160 retained its JSON artifact successfully. The 839 configured files produced 738 passing, 99 failing and two skipped files (console distinct-file counts); 16,615 passing, 192 failing and 287 skipped assertions, zero todo, total 17,094. More assertions executed after bootstrap repairs; the changed counts alone do not establish regression causality. All 20 automatic checks and the Vercel preview build passed on that head. Full Web remains RED.

The third remaining psql /dev/stdin argument, in bindMatrix, is changed to the documented stdin filename "-"; SQL text and assertions remain unchanged.

A real Linux/current-lock paired proof executed the same 93 autonomy SQL cases. A disposable underprivileged service_role baseline passed 88 and failed five. Changing only that disposable role to the canonical Supabase BYPASSRLS setting yielded 93 passed, zero failed/skipped/todo. This does not grant privileges in production or weaken owner/negative controls.

The manual Full Web runner now prepares its own fresh PostgreSQL 17 service roles. PostgreSQL 17 matches existing Survival/authority assertions; the focused PostgreSQL 16 workflows remain unchanged. Its sandbox probe image is the same exact Alpine digest used by the focused SDF gate.

For WebsiteBuild, a CI-only helper refuses any pre-existing compatibility container name and records a newly created container's immutable ID, image and run label before startup. It uses no network, host ports or binds, and only disposable PostgreSQL tmpfs data. Cleanup checks the recorded exact identity and labels. The canonical existing bootstrap script supplies a template; each test file clones a separate database with a validated numeric name. Two workers bound resource use without changing explicit concurrency assertions. The original fixture and local developer databases are not reused.

Five new negative safety cases were first observed failing for their expected assertions and then passing. A separate actual PG16/current-lock proof bootstrapped the canonical fixture and ran two unchanged SQL files (three cases) with two workers: all passed, with three distinct databases (base plus two clones). The owned container was removed; the old stopped local fixture remained stopped and unchanged. This is a bounded real transport/template proof; PostgreSQL 17 and whole-suite behavior still require the fresh hosted run.

Existing release HOLD, six low dependency findings and unresolved older-main CodeQL alerts remain. No merge, production deployment, data activation, capture or pilot is approved by these prerequisite changes.

The independent review found that Docker endpoint environment overrides could bypass context inspection. Both new paths now reject DOCKER_HOST and DOCKER_CONTEXT overrides before any Docker call, including preparation/cleanup and the bootstrap child environment. Four additional negative cases were observed failing before that fix; all nine safety cases now pass. No test assertion was removed or weakened.

## Additional fixture and Vitest compatibility follow-up

Two Anthropic SDK test doubles used arrow implementations that Vitest 4 cannot construct. Only those implementations now use constructable functions returning the same objects. All thirteen existing cases failed before with constructor errors and passed afterward, with zero skips; request payloads and assertions are unchanged.

The manual runner now also supplies a separate adversarial PostgreSQL 17 service for existing 2PC refusal proofs. Its initdb argument sets max_prepared_transactions=10; the canonical service remains at zero, and setup verifies both postures before testing. A real isolated PG16 configuration probe confirmed that the same initdb mechanism makes the default reject PREPARE with55000 and the separate fixture accept a prepared transaction and rollback; both containers were removed. This proves configuration mechanics only; hosted PG17/full-Survival evidence is still required.

The existing analysis-draft fixture refuses to pull images itself. Runner setup provisions its real Supabase17.11.0.004 amd64 image by the exact manifest digest e85bc10ac5b141223b289e1e8dc8d448cf3df92501917149db0366b9c5aaf053, verified against the registry, and assigns its original version tag. No fixture/version/assertion is substituted.

The publish route's two mutually exclusive syntactic publishing calls shared the same fresh authorization inside the retry callback, but the unchanged guard requires one call site per authorization. They now form one publishing call with an optional tuple argument. Existing two-argument no-capture/retry calls and three-argument first capture calls are preserved exactly; capture remains disabled. Four existing suites/78 cases pass, including stops, dry run, channel independence, idempotency, capture and retry argument arity. The same static inventory reports one offender before and zero after. The full unchanged structural suite still needs hosted Linux execution.

The unchanged image-client/ElevenLabs provider sources and their uncertainty guard were compared byte-for-byte with main after LF normalization. That is source provenance only, not a clean runtime/security verdict or permission to waive their failing tests. Security findings remain open.
