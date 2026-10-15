# Atlas builder studio workspace — verification, 2026-10-15

Status: implementation and one fresh final review/fix pass complete. Reviewed production migration applied and inspected. Protected merge and exact production deployment remain release gates; no signed-in production interaction is asserted.

## Scope

The first delivery adds `/build` as a canonical destination in desktop/mobile navigation and the command palette, opens one shared Atlas chat alongside the website preview, and supports existing owned projects and new studio workspaces. Historical project/session links are validated before redirect. Archive/trash/restore preserves source references, conversations and provider bindings; restore leaves execution paused and schedules no work.

Requested new/existing project roots are recorded as `pending_runner`. The exact existing root is preserved; changing the default parent does not move a bound project. No folder is claimed to have been created on the desktop. Reference-image uploads, project image generation, a desktop stream/runner, native repository maintenance and a specialist workforce remain later deliveries. This is a general website workspace, not an ecommerce implementation.

## Source and migration

Final runtime source: `cca191860f033bc05f1043918e60e3048cd5540b`, including the one final fix pass `dec28a80229f798d5f80c9741049bccb4368dd8f` and a clean merge of main `7a776d3cfbf512000c7bd999c707d59d0f60f634` (PR344). Fresh review covered `c4c34ec..c23dd67`; incoming Handlarborsen PR342/344 changes were preserved without overlapping feature edits.

New migration: `20261015041654_atlas_builder_studio_workspace.sql`, ledger name `atlas_builder_studio_workspace`.

SHA256 after LF normalization: `4a488c4febcf6f91f239f1ee07687ef36df2b392aaf3788023700376bda38bfa`.

The two previously applied website SQL files (`20261014065527_website_build_sessions.sql` and `20261014153354_website_build_planning_v1.sql`) compare unchanged against the prior release after LF normalization. Only the new migration appears in the migration diff. Canonical migration inspection succeeds at 119 files / 105 enforced / 14 grandfathered, with the frozen v2 lists unchanged; missing and duplicate studio ledger entries fail closed. The local guard's not-on-Vercel skip is not evidence of a production ledger check.

## Verification

| Check | Result |
| --- | --- |
| Studio browser on final combined source | 16/16 passed (2.7m), including menu/palette, actual Next entries, owner/parent boundaries, full brief recovery, no-storage idempotency and budget CAS recovery |
| Existing Atlas entry browser | 13/13 passed |
| Existing build surface browser | 5/5 passed, including persisted rendered-revision attribution |
| Existing conversation browser | 8/8 passed |
| Lifecycle SQL | 9/9 passed, including actual concurrent claim/commit/control transactions and bounded writer busy retry |
| Stop regression group | 195 passed, 88 opt-in SQL cases skipped |
| Navigation focused group | 103/103 passed |
| Integration migration/security/mobile/history group | 316 passed; one concurrency fixture lock-order failure subsequently corrected and rerun below |
| Final affected suite on combined source | 770/770 passed in 49 files, zero skips (363s). Includes incoming Handlarborsen QA, final fixes, all lifecycle/real-SQL/controller/worker/guard/security/navigation/history groups. |
| Typecheck on final source | Passed (exit 0), including final integration tests |
| Unfiltered Windows unit suite before final integration fixes | 12,420 passed / 381 failed / 1,110 skipped (502 files); this run is not green |
| Baseline comparison | A clean detached worktree at main c4c34ec reran 77 of the failing files: 71 files also failed there (363 failed / 3,029 passed / 14 skipped). Linux-only executable paths, missing Windows PSQL, path separators, CRLF hashes and pre-existing stale contracts are present on main. Six selected files passed on main; their studio-related menu/guard expectations and registry classifications were corrected on this branch. The remaining four legacy drain cases call the pre-planning entry without a decision and were not treated as a new feature regression; no full-green claim is made. |

Behavioral RED/GREEN evidence includes atomic ensure rollback/concurrent creation and response-loss recovery; exact child-to-project ownership even for two projects of the same owner; late capture/create/stream isolation after project switches; archive ordering against real worker writes; admission epochs across restore; and actual PostgreSQL deadlock RED before the writer/control NOWAIT fix. A real transient writer lock produces one committed revision after a bounded RPC retry; a true stale fence is never retried. Provider calls are not replayed by this retry.

The four new tables were moved from `created_not_live` into the live TENANT_RLS map only after successful production apply and effective catalog inspection; the registry now contains 109 rows. The earlier full-catalog capture timestamp remains unchanged and a dated four-row note records the update. No security gate exception was added. No migration guard override, fake ledger entry, fake green status, paid model execution, platform resume or project resume was used to produce this evidence.

The browser harness invokes the actual Next entry functions and scoped loader, adapts framework redirects/404 to localhost HTTP, and supplies a fixture capture transcript. It is not proof of a physical microphone or a production owner session. Screenshots at 390/980/1440 pixels were inspected for original palette and horizontal overflow. During initial regression work, three legacy screenshot calls retained an old plan's hardcoded output path; future screenshots use testInfo.outputPath and only this plan's directory. No sibling source or user data was altered.

## Production preflight and release

Read-only preflight confirmed the canonical stop/cancel/writer prerequisites exist; platform was unpaused; required project/agent/conversation/budget insert columns are supplied by the implementation; all four new studio tables were absent. No production mutation was included in this preflight. A fresh read of the real 141-name ledger, evaluated by the source guard, rejects exactly the missing `atlas_builder_studio_workspace` entry; no other missing or unknown migration was reported.

The first apply call was aborted without a reliable receipt. Before retrying, read-only reconciliation proved all four tables absent, zero matching ledger entries and zero active matching transactions. The exact reviewed SQL then succeeded via Supabase apply_migration: ledger name `atlas_builder_studio_workspace`, version `20261015100050`. All four tables have RLS and exactly one authenticated SELECT policy rooted in both owner_id and the project owner. Effective grants are authenticated/service_role SELECT only; no anon grant and no direct DML/TRUNCATE. All nine new routines deny anon/authenticated EXECUTE. Both budget append-only triggers and the projects resume guard exist. The live claim_runs body exactly equals the reviewed migration body, including the two lifecycle admission predicates. Catalog evidence is tracked in `ATLAS_BUILDER_STUDIO_PRODUCTION_CATALOG_20261015.json`.

PR #345 and seven ordinary GitHub boundary workflows were green at the final runtime SHA. The actual production 142-name ledger passes evaluateAppliedMigrationLedger against all 119 canonical source files / 105 enforced / 14 frozen grandfathered / 30 frozen legacy names: no missing, unknown or duplicate name. The two old applied SQL files are unchanged and the sole new SQL hash remains exact. Final metadata checks, protected merge and exact production deployment are recorded separately below; no bypass, fake ledger or paid production build is involved.

## Execution rulings

1. Task 2: Ruling: add per-project budget readiness to StudioProject — the new studio must explain and block missing budget before any paid first turn, even before a plan exists — cost if wrong: one extra scoped metadata query/project and an additive view field.

2. Task 2: Ruling: new studio creation requires an already verified owned Omnira project in the server-resolved scope, in SQL as well as TypeScript; an empty observer scope cannot mint a fresh builder project — creation does not infer organization ownership from a login — cost if wrong: an owner with an entirely empty portfolio must use the existing initial-project onboarding first. StudioView.canCreateProject exposes that outcome instead of an unusable composer.

3. Task 3: Ruling: the existing revenue page only reads budgets, so add an owner-scoped budget form/RPC with append-only audit and verified project billing for explicit studio turns — otherwise a new project cannot resolve its required missing-budget question from the product — cost if wrong: one additional private audit table/API and scoped metadata reads for studio chat; normal Atlas chat must retain its existing fast path.

4. Task 3: Ruling: explicit studio chat accepts any verified owned historical conversation in its exact owned project, without requiring a new creation intent - old project/session links must remain usable, while project/conversation ownership, budget and stop checks remain mandatory - cost if wrong: studio mode can be requested for an owner's ordinary project conversation, with its own project budget and narrower execution scope.

5. Task 4: Ruling: include lib/project/lifecycle/**/*.test.ts in the actual Vitest registry - the planned command currently excludes its new test directory, so its initial 'no tests found' is not behavioral RED - cost if wrong: the normal test command now also executes these isolated SQL lifecycle tests.

6. Task 4: Ruling: retain claim_runs' canonical run -> platform -> project lock order; lifecycle cancels only runs it can lock with SKIP LOCKED while holding the project, and a persisted lifecycle epoch permanently fences prior static writers/admission even after restore - waiting on every run under the project lock would deadlock with claim_runs and existing stop paths - cost if wrong: a concurrently locked old pending static row can remain as retained history instead of immediate cancellation, but it cannot be admitted or write; running work remains visibly stopping until checkpoint/reaper acknowledgement. New static generations carry the epoch at enqueue.

7. Task 4: Ruling: add active checks to mutation RPCs individually instead of website_build_check_access(p_write=true) globally - existing owner-only history/builder read RPCs also use p_write for ownership, so changing that helper would hide archived history - cost if wrong: future mutation RPCs must explicitly adopt the same active/project-lock guard.

8. Task 4: Ruling: batch owner-scoped lifecycle/settings/budget/request/run metadata for the project picker - the earlier per-project metadata reads grow with the portfolio and made opening the accumulating real-SQL browser fixture exceed 15 seconds, also exposing a product scalability issue - cost if wrong: metadata mapping moves into one loader batch, covered by the existing owner/linkage/read-error cases and a bounded-query regression.

9. Task 4: Ruling: normalize the stop-authority test scanner's two relative-path sites to forward slashes - its unchanged main-branch Windows paths include the test itself and mistake fixture strings for runtime stop callers, causing four false security failures; keep every security assertion intact - cost if wrong: a test-only path portability fix beyond the feature files. The focused stop run had 191 passing, 4 false failures and 88 opt-in SQL cases skipped; the lifecycle's actual claim/commit races use the owned real SQL fixture instead.

10. Task 5: Ruling: project-first writer/control RPCs acquire their run row NOWAIT and release the transaction with a retryable conflict when busy; writer busy is distinguished from a stale claim and will get bounded RPC-only retry, never a repeated provider call - the three-connection RED reproduced actual PostgreSQL deadlock detection in canonical claim_runs for both writer and control - cost if wrong: up to three short database retries for a transient writer lock, and a busy control request must be explicitly retried rather than falsely confirmed. Archive remains serialized by the project lock; every original claim/lease/generation check stays.

11. Task 5: Ruling: the legacy multi-turn conversation fixture uses 15-second semantic expectations and a 90-second scenario budget - its two RED cases showed a pending Atlas response at 5 seconds (no error), while the same real SQL/SSE persistence paths pass in neighboring cases; synchronous Docker SQL and cold module work are fixture overhead, not a production latency SLA - cost if wrong: these logical tests detect hangs later; no assertion, actual receipt or exact revision check is removed. Conversation/full-unit have not yet passed. Checkpoint current private-branch source to integrate non-overlapping current main before final verification/review; this is not Task 5 completion or release.

12. Task 5: Ruling: register the new migration as enforced at 119/105 and give its four pending tables intended TENANT_RLS classes without pretending they are live - the full suite exposed missing count registration and 12 unclassified-object security findings; frozen policy lists and every security gate remain intact - cost if wrong: the real deploy remains blocked until the reviewed migration is genuinely applied and verified.

13. Task 5: Ruling: preserve the original mobile destinations in their relative order while adding /build, and move text-only history proof to the actual shared controller used by both clients - obsolete source expressions no longer describe the approved shared conversation architecture; the replacement test inspects the actual second request after a full reply - cost if wrong: a future client bypass must still be caught by the delegation assertions and browser coverage.

14. Task 5: Ruling: the concurrent-start SQL fixture locks project before plan, matching the new archive-safe RPC entry order, and resets owned fixture stop state before starting - its old manually held plan-then-project lock created an artificial inversion with the new project-first guard; diagnostic RED was a real deadlock in the fixture's manual prelock, not in two normal start RPCs - cost if wrong: this fixture proves concurrent idempotent starts under the canonical lock protocol, not arbitrary out-of-protocol row locks.

15. Task 5: Ruling: use a 15-second test budget for the real-SQL chat regression instead of its default five seconds - the combined Windows fixture run timed out one otherwise pending confirmation-denial case under concurrent baseline CPU work; correctness assertions and provider stubs remain identical - cost if wrong: a logical hang is detected ten seconds later, and this fixture run makes no production latency promise.

16. Final: Ruling: actual runner/directory creation, junction/repository verification, desktop streaming and native maintenance remain later delivery packages - this implementation records pending roots and never claims physical filesystem work - cost if wrong: the user still cannot execute native project edits from this first studio release.

17. Final: Ruling: reference-image input/generation, fullstack relay, specialist workforce and runtime independent review remain later packages - preserve the approved first-delivery boundary and refuse global media execution from Studio - cost if wrong: these requested capabilities require subsequent delivery and cannot be inferred from visible tabs.

18. Final: Ruling: domain purchase, payments and permanent deletion remain outside this package, but normal protected deployment of this studio is already authorized by the approved plan/session - the reviewer grouped release operations with deferred integrations; distinguish them and complete the authorized deployment gates - cost if wrong: no domain/payment purchase is performed, and those integrations remain unavailable.

19. Final: Ruling: physical microphone reliability and signed-in production interaction are not established by fixture capture/browser results - retain that limit and verify the production deployment without inventing an owner session - cost if wrong: a device-specific voice or signed-in interaction defect may still need the user's real-device feedback.

20. Final: Ruling: retain unrelated Windows baseline failures as explicit known failures and preserve incoming PR344 by clean merge and affected checks - clean main reproduced 363 failures in 71 compared files; first-delivery scope does not authorize unrelated rewrites, and the focused plan explicitly permits honest baseline reporting - cost if wrong: the unfiltered suite remains non-green and an unrelated regression may remain outside the focused/required gates.

21. Final: Ruling: production apply, effective privileges/RLS, real ledger integrity, required CI/protected merge and exact deployment remain mandatory release evidence after the fix pass - the read-only reviewer did not establish them and their absence is not permission to claim release - cost if wrong: publication must remain pending until those real checks complete.

22. Final: Ruling: extend the Important fix pass to retain create intents in memory when session storage is unavailable - start currently reconstructs its key only from storage, so a lost response can mint a second key/project on retry; same-intent behavior is required even while the page remains open without storage - cost if wrong: reload recovery still depends on browser persistence, while in-page retries must preserve one intent.

## Fresh whole-branch review and one fix pass

One fresh gpt-6-astra reviewer returned **With fixes** on c23dd67: no Critical, three Important, one Minor. The executor accepted all Important findings and additionally ruled that missing sessionStorage must not change an in-page create intent. Exactly one fix pass was made, with behavioral RED before each implementation; no second review was dispatched.

| Finding | RED / GREEN evidence |
| --- | --- |
| Global media execution in Studio | Actual provider-returned run_media_step appeared in the old schema. Explicit capability allowlist now filters schemas and refuses dispatch; no media network call occurs, while ordinary operator chat retains access. |
| First brief lost after create | 8001+ characters, unavailable sessionStorage and unreadable committed workspace reproduced loss. Full in-memory handoff now retains exact text and requires a verified load; no automatic paid replay. |
| Configured zero/insufficient budget had no recovery | Missing edit action reproduced. Explicit prefill/edit/cancel with captured-value CAS now supports zero-to-100, refuses a concurrent stale edit and reloads the current value. |
| Executor: response loss without storage changed create key | RED observed different UUIDs. In-memory intent retention and completion tombstones now keep one key and exactly one project for in-page retry. Reload recovery still requires browser persistence. |

The same final combined runtime source passed all 770 affected tests, typecheck and all 42 browser cases (16 studio + 13 entry + 5 surface + 8 conversation). Earlier broad Windows/baseline limitations remain explicitly recorded above; this is not a full-unfiltered-green claim.

## Deferred minors

Switching Files/Desktop and returning remounts Preview and resets a selected historical revision/page/device to active/default. Rendered-revision acknowledgement still protects feedback attribution. Deferred cost: lost view continuity. No minor was silently fixed.

## Release record

Pending protected merge and exact production deployment evidence.

Final metadata verification: after promoting only the four observed tables into the 109-row live registry, schema-security invariant, migration-security gate, migration-guard-v2 and website migration-policy tests passed **239/239 in four files** (11.56s). `git diff --check` passed. Current main remained 7a776d3cfbf512000c7bd999c707d59d0f60f634. This metadata/documentation commit changes no runtime source relative to the fully tested cca1918.
