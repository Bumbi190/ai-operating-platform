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

This command does not include that separate RED source-contract assertion or
prove actual database privileges, multi-device concurrency, healthy-project
dispatch, physical model behavior or full CI. Keep the production disable flag
and source-controlled release hold in place. Offline tests grant no retry,
recovery, enrollment, deployment or release authority.
