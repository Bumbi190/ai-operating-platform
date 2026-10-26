# Local-text offline regression command

From the repository root:

```text
npm run test:local-text-offline --workspace=apps/web
```

Use `npm.cmd` where PowerShell execution policy requires it. This command runs
the existing `lib/local-text/**/*.test.ts` discovery with at most two workers.
The default full-suite command is unchanged. It uses the real monorepo contract
source and keeps the local cache in the ignored web `.temp/` directory.

The dedicated configuration forces `LOCAL_TEXT_E2E`, `LOCAL_TEXT_E2E_REVIEW` and
`LOCAL_TEXT_SQL_E2E` to `0`, even if the calling shell has opted in. The four
existing SQL/GPU/worker integration cases therefore remain pending. They require
separate authorization and are not covered by a successful offline result.
No new skips are added to those tests or to the default test configuration.

The command's setup replaces global `fetch` and the common process-launch APIs
from both `node:child_process` and `child_process`, including default imports.
Reaching these guards fails the test after execution even if the handler catches
the immediate error. Tests can still inject their own controlled adapters. This
is a unit-test boundary check, not a general network/process sandbox: adding a
new external transport requires reviewing and guarding that boundary as well.

On 25 October 2026, the command passed 232 tests across 32 discovered files;
the four existing integration cases were pending. Four temporary negative
controls separately verified that a caught fetch error and named/default process
launch errors still fail the command, including after clearing mock history.
Independent attempt counters preserve that evidence across fixture mock resets.
Those controls were removed afterward.
Scoped strict TypeScript for the configuration/setup passed. Execution reports
are retained in the local Work review artifacts, outside the repository.

Issue #533's missing authoritative project-wide DB incident fence remains open.

On 26 October 2026, the offline command passed 315 tests with the same four
integration cases pending. Four additional reconciliation API controls explicitly
pause project A's incident read while same-owner healthy project B completes.
A then returns valid evidence, a returned error, a thrown error or malformed
evidence. B remains readable before and after A settles; A never gains retry,
resume or enrollment authority. Promise barriers establish this response order
without timing sleeps. The paused request is drained during cleanup even if an
assertion fails. These are mocked API isolation controls, not actual database
concurrency or a positive healthy-project dispatch test. The affected API suite
passes 42 tests; the scoped strict TypeScript check also passes.

Five further owner-qualification controls pause A's owner RPC while B completes.
No A inventory read occurs before its owner reply; valid evidence leads to the
blocked inventory, returned/thrown errors to 503, and refused/malformed replies
to 404. B's following response stays unchanged. The same offline command now
passes 320 tests with four existing integration cases pending; the reconciliation
API suite passes 47. Scoped strict TypeScript passes. These Promise-controlled
adapter tests do not establish real owner/RLS enforcement or DB transaction order.

Two test-first UUID controls reproduced a false missing-job count when a valid
incident/job UUID differed only in letter casing. The read-only API now compares
already-validated UUIDs case-insensitively within the scoped retained-job set.
Both case directions pass, while another project's retained job still cannot
fill A's missing history and open incidents remain blocked without authority.
This is adapter robustness evidence, not an observed production-format failure.
The offline command passes 322 tests with the same four pending integration cases;
the reconciliation API suite passes 49, and scoped strict TypeScript passes.

Cloud snapshot controls additionally cover malformed job/stage/attempt UUIDs and
a mismatched project in pending, saved-response and saved-human states. Fifteen
cases first failed before primitive UUID/project checks moved ahead of every
snapshot continuation. Invalid snapshots now use the existing failed/source-
unavailable finalization and perform no apply/advance or provider access. The
validated job ID is retained without string coercion. Two valid saved-state
controls preserve the existing finalization/apply order under the real hold.
This is adapter validation evidence, not an observed malformed production RPC or
proof of DB authority. The offline command passes 339 tests with the same four
integration cases pending; the held cloud suite passes 31. Scoped strict
TypeScript passes and independent review found no material issues.

Pending cloud stages also require an explicit primitive review mode: `human` or
`governed_openai`. Six adapter cases first failed because missing, null, unknown
or non-string modes reached the mock reviewer in the existing simulated future-
clearance tests. They now route to human handling before profile/reviewer access.
Three positive human-mode stage controls and the existing governed-mode control
remain valid. The canonical fixture now includes the mode returned by the frozen
snapshot RPC; its source already supplies a default for absent configuration.
No new source-hold override is introduced, and saved-response recovery ordering
is unchanged. Offline verification passes 348 tests with four integration cases
pending; the cloud behavior suite passes 17 and scoped strict TypeScript passes.
This is post-clearance adapter robustness, not a production provider-dispatch
observation or permission to clear the hold.

This command does not include that separate RED source-contract assertion or
prove actual database privileges, multi-device concurrency, healthy-project
dispatch, physical model behavior or full CI. Keep the production disable flag
and source-controlled release hold in place. Offline tests grant no retry,
recovery, enrollment, deployment or release authority.
