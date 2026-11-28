# Growth release PR 658 — hosted CI follow-ups, 28 November 2026

PR: https://github.com/Bumbi190/ai-operating-platform/pull/658. Initial integration head: fde98120cde05e6da4fafb3468aa23b2b98e514a.

## SDF1B transition parity and canonical text

At the initial head, all three required checks (Atlas isolation, Memory M4 and Trading canon) and the Vercel Preview build passed. Eighteen of 19 Actions workflows passed. SDF1B failed one of 13 SQL tests because its parity test started 196 psql processes within the unchanged five-second test deadline. The other 12 SQL cases passed.

Initial failure: https://github.com/Bumbi190/ai-operating-platform/actions/runs/46119729164/job/140901361206.

Commit 2824c80d43526c9a0ebb812f87fe4363274ae0b6 compares the same 14-by-14 transition matrix in one ordered PostgreSQL query. It asserts cardinality and every exact from/to/TypeScript-oracle tuple. The original migration 80 hash pin remains unchanged; its test normalizes CRLF checkout text to canonical LF bytes verified against the Git blob. No lifecycle transition, SQL migration, authority policy, concurrency test or timeout changed.

Local evidence:

- Actual old/proposed callback ASTs and the actual TypeScript oracle ran against the exact extracted SQL helper on fresh isolated PostgreSQL 16.
- Old callback: 196 queries and assertions, 39,237 ms. New callback: one query and 197 assertions, 212 ms. These are local Windows/Docker transport timings, not hosted runner timings.
- A deliberately false SQL helper was rejected at proposed-to-authorized. The fixture mutation was rolled back and the unchanged helper passed again.
- Canonical SQL hash stayed unchanged. The owned fixture had no network, published ports or host binds and was removed.
- Seven separate contract files passed all 214 tests, with no failed, pending or todo cases.
- Independent read-only review found no material issue in the parity change.

This local SQL proof covers the parity callback, not the entire 13-case SQL suite. Hosted SDF1B subsequently passed at commit 2824c80.

## SDF1C fixture boundaries

The unchanged SDF1C suite passed all 362 cases at the initial head. At commit 2824c80, two tests exceeded the unchanged five-second deadline. One packs four claim fixtures and a required 3.5-second real authorization-expiry wait into one test; the other prepares 22 proposal fixtures before its bounded-discovery assertions. The first test took 4,954 ms even in the earlier passing run.

Failure: https://github.com/Bumbi190/ai-operating-platform/actions/runs/46120654129/job/140904204572.

The follow-up splits actual authorization expiry into its own test and retains the real 3.5-second sleep and all original non-receipt assertions. The original zero-receipt assertion over four run IDs becomes equivalent zero-receipt assertions over three IDs and one ID. A nested beforeAll prepares the same 22 proposals immediately before the bounded-discovery test, after earlier discovery cases have run. All bounded-limit and oldest-first assertions stay in the original test. Default test and hook timeouts remain unchanged.

The per-file anti-skip floor increases from 22 to 23; the complete SDF1C workflow now expects 363 cases. No real concurrency, fencing, cancellation, credential, authorization or authority-policy case is removed or relaxed.

Local checks: TypeScript parse passed, source inventory preserved every original non-receipt expectation, and actual Vitest collection found 23 cases. Collection does not execute SQL behavior. Fresh hosted SQL execution on the follow-up commit remains required.

## Additional real-expiry branch separation

At commit 00499b350cb73c921b2a440ebf6836f285cbbcb3, recovery-expiry cases 11a/11b and bounded discovery case 18 passed. The complete SDF1C run had 362 passed and one timeout: the original heartbeat case 7 took 5,039 ms while combining its real 3.5-second expiry wait with a separate runtime-cap fixture.

The follow-up splits heartbeat expiry and runtime-cap assertions into separate cases. A systematic scan also separates case 16 eligibility fixtures from its independent real discovery-expiry wait. All 119 complete expectation statements remain exactly preserved as a normalized AST-text multiset. The five real pg_sleep calls remain in their original order (3.5, 1.1, 3.5, 1.6 and 1.6 seconds), with every original authorization interval retained. Remaining individual sleep cases 8 and 19 took 2,098 and 2,578 ms in that same run; neither is changed.

No application, migration, credential, authorization, cancellation, concurrency or isolation implementation changes. No timeout change, disabled test or weakened assertion. The per-file floor is now 25 and the complete SDF1C workflow expects 365 cases. Actual Vitest collection finds 25 cases; full hosted SQL behavior on the follow-up head remains required. Independent read-only review found no material issue.
## Release scope

The complete application-build proof remains at the initial integration head; these follow-ups modify no application or dependency inputs. Live dashboard/data wiring, pilot activation, whole-Web regression and broader security/release decisions remain pending. This draft PR is not a merge or production release, and no database activation was performed.
