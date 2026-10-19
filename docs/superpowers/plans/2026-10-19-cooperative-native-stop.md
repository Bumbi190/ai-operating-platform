# Cooperative native stop bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax. Preserve the already selected Native method: root implements; one fresh independent final reviewer; one material RED→GREEN fix pass; defer minor findings; no second review.

**Status:** Approved by André 2026-10-19 16:33 Europe/Stockholm with four required adjustments, all incorporated below. Approved: offline native rebuild with already restored packages; in-place conversion of `materialize-fixture` and removal of the uncontrolled path; four bounded real native/Docker attempts (A–D) with the cached image. Not approved: push, merge, deploy, live activation, paid model jobs, pull/build of images, package installation.

**Goal:** Let the existing ExecutionLeaseGuard actually stop today's native materialization helper — before launch, at every side-effect boundary and while work is running — and always end in identity-checked cleanup, without a late result regaining validity or any publication right.

**Architecture:** Replace the helper's one-shot "stdin closed before execution" transport for `materialize-fixture` with a bounded bidirectional control protocol. The child announces closed checkpoints before each side effect and blocks until the parent answers `continue`; the parent answers only after a live guard checkpoint. A guard abort, `stop`, stdin EOF (parent death) or a missed reply cancels the native work token. The existing independent cleanup path (`RemoveAsync` with its own deadline and journal peer binding) runs regardless. A forced kill is the last resort and is always followed by the existing identity-checked `cleanup-materialization`.

**Tech Stack:** Existing TypeScript broker, .NET 8 native helper (SDK 8.0.204), Vitest and native smoke harness; installed Node/.NET/Docker only. No new dependencies.

**Spec:** docs/superpowers/specs/2026-10-18-atlas-first-code-job-design.md (Tester, resultat och avbrott; godkännandebevis 5) and docs/superpowers/specs/2026-10-18-atlas-independent-review-design.md (Budget, stopp och återhämtning; godkännandebevis 8). Predecessor: docs/verification/2026-10-19-live-execution-lease.md, rulings 8, 11 and 13.

## Intent, evidence and scope

Verified 2026-10-19: branch codex/atlas-code-worker-design-20261018, HEAD 53683a4fec176446153391451c3a5976d9497262, clean; product code 07e6aef. The 304/304 fifteen-file gate is the verified baseline; planning did not rerun it.

Observed in source:
- `workspace-helper.ts` launches via `execFile`, writes the request with `child.stdin.end(input)` and has only execFile's `timeout` kill. No parent→child signal exists after launch.
- `Program.cs` reads stdin to EOF, then runs with a per-mode `CancellationTokenSource` deadline. The token already reaches `NativeProcess` (Job Object, KILL_ON_JOB_CLOSE, TerminateProcess fallback) and every Docker request.
- `WindowsMaterializationFixture.RunAsync` already cleans in `finally` with a separate, non-linked cleanup token, verifies container/volume identity, uses `force=1` container delete and the persisted peer tuple. `CleanupAsync` is the existing identity-checked recovery.
- `ExecutionLeaseGuard` exposes `signal`, `checkpoint()` and `stop()`; it has no consumer.
- Boundary tests pin `apps/code-broker/native` and `src/isolation/windows` byte-for-byte to BASE 2dd4ec0 and assert the five native modes.
- `apps/web/lib/qa/fixtures/sdf-execution-lease-postgres.ts` hard-codes `WS=.superpowers/sdd/2026-10-19-live-execution-lease`, the predecessor scratch that was deliberately deleted. Its non-recursive `mkdirSync` therefore fails today; the SQL test cannot run until the fixture is moved (Task 0).
- Native builds use `apps/code-broker/native/windows/NuGet.Config`, which contains only `<clear />` package sources: restore is offline by construction. Existing `obj/project.assets.json` files are present.
- Node/libuv assigns ordinary Windows children to a kill-on-close job. If the broker process dies, a non-detached helper would be killed before its cleanup. Test C must observe this and the controlled spawn must not depend on it (see ruling 8).

Success for THIS increment: a controlled materialization cannot start without a live guard, stops at any phase within a bounded time, cleans only resources it owns, reports a closed `stopped` outcome, and no report delivered after stop can be read as success. It is still not a code worker: no model call, patch, reviewer dispatch, command selection or publication.

Selected approach: cooperative checkpoint protocol over the helper's own stdio for `materialize-fixture` only. Rejected: (a) `child.kill` around the current helper — skips the `finally` cleanup and leaves Docker resources; (b) stop-only channel without checkpoints — a stop arriving between Docker calls races the next mutation; (c) also converting `prepare`/`probe` now — more surface without a consumer; they stay one-shot and unchanged.

## Global Constraints

- Existing job maxima unchanged: two worker iterations, eight files, 131072 diff bytes, 1200 s total, 300 s per command; native `materialize-fixture` work 150000 ms and cleanup 30000 ms unchanged. Checkpoint waits consume the existing work budget; no deadline is raised.
- Review limits from the independent-review spec unchanged; nothing here dispatches a reviewer or model.
- No paid model call, dependency/package installation, image pull/build, production DB/migration/flag, push, merge, PR, deploy, CLI mode change or command-registry change. Frozen runner/image/profile and `docs/verification/2026-10-19-source-fixture-success.json` stay byte-identical.
- Native rebuild only through the existing `--configfile apps/code-broker/native/windows/NuGet.Config` (cleared sources). Any restore/network error = blocked evidence, no retry with another source.
- Raw claim token never reaches the native process, its stdin, logs or reports.
- Stop is terminal: no restart, no retry after stop/ambiguity, no late report clears the guard. Cleanup is NOT gated by lease liveness but by the reserved attempt id, journal peer tuple and resource identity, and never yields a usable fixture result.
- One broker-wide counter owner remains a precondition (predecessor ruling 13): the bridge receives an existing guard; it never constructs counters itself.
- Plan scratch (owned workspace): `.superpowers/sdd/2026-10-19-cooperative-native-stop`, created once by root with `plan-path` containing exactly `docs/superpowers/plans/2026-10-19-cooperative-native-stop.md` and `progress.md`. Test fixtures never create this root; a missing or mismatching `plan-path` fails. Never recreate `.superpowers/sdd/2026-10-19-live-execution-lease` or any other predecessor scratch.

## Real execution classes and their separate allowances

Three classes are kept apart in tests, evidence and the report. Only class N needs a dispatch decision; only class N is counted against the four approved attempts.

**N — Real native/Docker attempts (exactly four approved, each at most once).** A run of the real `OmniraBrokerWorkspace.dll materialize-fixture` that reserves an attempt id and may create Docker resources. Inputs: retained request from `docs/verification/2026-10-19-materialization-planning-evidence.json` (`retainedWorkspace.request`, proof worktree c435e423 at d3f9fcc read-only); enrolled cached image `sha256:354e46f6c5d5e046a2002b78f2d43931824b67110df42a40ab4204e269d1acd0`; network none; no pull/build. The four attempts:
- A. Guard refuses at `before_volume_create`: no volume or container is ever created.
- B. Guard refresh refuses while the real container runs (after `before_start`): container and volume absent afterwards; report `stopped`.
- C. The real broker parent process (a separate Node process running the controlled spawn) is killed during the container wait: the helper observes EOF and cleans by itself; absence confirmed.
- D. The real helper is forcibly terminated during the container wait: the bridge sees exit without report and performs exactly one identity-checked `cleanup-materialization`; absence confirmed.

Dispatch rules: each attempt requires root to write `n-<X>-intent.json` with `phase:"prepared"` in the plan scratch AND the env `ATLAS_NATIVE_STOP_DISPATCH=<X>` for that single run. The test flips the intent to `dispatched-once` before launch and writes `n-<X>-proof.json` with `wx`. An intent already `dispatched-once` without a proof means reconcile, never replay. Task-done verification, the final gate, the independent review and the fix pass NEVER set `ATLAS_NATIVE_STOP_DISPATCH` and never write intents; they only reuse proofs (class V).

Proof binding for reuse: each proof stores SHA-256 of the helper `OmniraBrokerWorkspace.dll`, `.deps.json`, `.runtimeconfig.json`, `OmniraBrokerHost.dll`; of native sources `Program.cs`, `NativeControlChannel.cs`, `WindowsMaterializationFixture.cs`, `MaterializationContracts.cs`; of broker sources `controlled-helper.ts`, `native-stop-bridge.ts`, `source-fixture.ts`, `source-contracts.ts`, `execution-lease-guard.ts`; the image id, toolchain profile hash, backend/daemon identity hashes and the retained request binding. Class V recomputes all of them. Any mismatch fails with `stale_real_evidence:<X>:<binding>` — never a skip, never an automatic redispatch. If a fix makes a proof stale, root records which attempt(s) are affected and asks André for exactly those re-runs before claiming them.

**P — Owned temporary PostgreSQL instances (separately approved).** Only for the existing real-SQL regressions in `sdf-execution-lease-sql.test.ts`. Only owned containers from the already cached image `sha256:ca0bd484cb98bf4b24eb1010e73fb3fcbd6714d240fbc1a10eea5b7dbecb641d` (PostgreSQL 16.15), `--pull=never`, `--network=none`, read-only root, tmpfs data, 512 MiB, one CPU, no ports/binds, label `omnira.plan=cooperative-native-stop` plus a per-instance `omnira.attempt` UUID. No hosted/production database. Each instance is created, used and removed by its own fixture with exact ID/name/label/image check and confirmed absence; receipts go to `pg-<uuid>/` in the plan scratch. Class P may recur on every gate run because it never touches native code or the retained proof; the report counts instances separately from class N.

**V — Verification-only reruns (recurring, no new real attempt).** Reuses class N proofs after rechecking bindings, rechecks Docker absence of each attempt's container/volume via the read-only smoke `check-materialization-absence`, and runs fake-Docker native smokes and TypeScript tests. A parse-only real-helper check (malformed first control line → nonzero exit, empty stdout) runs before any reservation, source read or Docker call and is not an attempt.

## Review Focus

1. Stop wins before launch or between checkpoints: no reservation/process when the first checkpoint is not live; no Docker mutation after the checkpoint that saw stop. Task 1/3, attempt A.
2. Stop, EOF, malformed control or missed `continue` during a long phase (source hashing, container wait): native work token cancels, cleanup still runs with its own deadline, container/volume absent afterwards. Task 1, attempts B/C.
3. A `verified_for_fixture` report, or any report, arriving after stop/abort: bridge returns `stopped`, fixture DTO discarded, guard stays aborted, no field can mark ready/publish. Task 3.
4. Helper hangs or is killed: bounded wait, forced termination, then one automatic identity-checked `cleanup-materialization`; unknown cleanup is surfaced, never reported as clean. Foreign or replaced-daemon resources are never deleted. Task 1/3, attempt D.
5. Frame abuse: oversize, duplicate keys, invalid UTF-8, unknown type/phase, out-of-order or repeated seq, extra frames after report, stderr output — all fail closed as `control_lost`/`invalid_report`. Task 1/2.

## Control protocol (sdf.native_control.v1)

Parent→child stdin: first line is the existing request JSON, UTF-8, ≤4096 bytes, terminated by `\n`. Then only `{"t":"continue","seq":n}` or `{"t":"stop"}` lines, each ≤128 bytes. EOF at any time = stop.
Child→parent stdout: NDJSON lines ≤8192 bytes, total ≤262144: `{"t":"checkpoint","seq":n,"phase":P}` with seq 1,2,3… then exactly one `{"t":"report","report":R}`; nothing after it. stderr must stay empty except the existing generic failure line on nonzero exit.
Closed phases, in order: `before_resources` (after host qualification and source snapshot, before any Docker mutation), `before_volume_create`, `before_container_create`, `before_upload`, `before_start`, `before_report`. A phase may not repeat or go backwards.
Child waits ≤4000 ms for the matching `continue` (guard read is ≤3000 ms). Timeout/mismatch/malformed → `control_lost`; `stop`/EOF → `stop_requested`. Stop also cancels in-flight non-checkpoint work (hashing, Docker wait) immediately via a linked token.
Report additions: status `stopped` with reason `stop_requested|control_lost`, `fixture:null`, existing `containerRemoved/volumeRemoved`; cleanup failure still maps to `failed/cleanup_retained`. `productionAuthority:false` unchanged. Native `MaterializationContracts.Reasons` and TS `source-contracts.ts` gain exactly these two reasons and one status.

## File map

Native (modify unless noted):
- apps/code-broker/native/windows-workspace/Program.cs — controlled transport for `materialize-fixture`; the other four modes unchanged in behavior; mode set unchanged.
- apps/code-broker/native/windows-workspace/NativeControlChannel.cs (new) — bounded stdin reader, frame parser, checkpoint await, linked stop token, `IStopCheckpoint`.
- apps/code-broker/native/windows-workspace/WindowsMaterializationFixture.cs — `IStopCheckpoint` at six phases; stop reason mapping; cleanup unchanged and never linked to stop.
- apps/code-broker/native/windows-workspace/MaterializationContracts.cs — two reasons, `stopped` status.
- apps/code-broker/native/windows-workspace/smoke/ControlChannelSmoke.cs (new), smoke/MaterializationDocker.cs (add `hold-wait` fault honoring cancellation), smoke/Program.cs (mode `control-channel`).

Broker:
- apps/code-broker/src/isolation/windows/controlled-helper.ts (new) — fixed spawn (same runtime hash, helper path, env, `shell:false`, `windowsHide`, detached per ruling 8), frame codec, kill fallback.
- apps/code-broker/src/runtime/native-stop-bridge.ts (new) — `runGuardedMaterialization`.
- apps/code-broker/src/isolation/windows/source-fixture.ts — `run` requires a guard and uses the bridge; `cleanup` stays guard-independent and one-shot.
- apps/code-broker/src/isolation/windows/source-contracts.ts — `stopped` status and two reasons.
- apps/code-broker/src/isolation/windows/workspace-helper.ts — `materialize-fixture` removed from the one-shot invoker; four modes remain there.

QA:
- apps/web/lib/qa/fixtures/sdf-execution-lease-postgres.ts — `WS` → `.superpowers/sdd/2026-10-19-cooperative-native-stop`; verify `plan-path` identity before use; never create the scratch root; label `omnira.plan=cooperative-native-stop` in both creation and `owned()` checks. No other behavior change; the SQL assertions are untouched.
- apps/web/lib/qa/fixtures/sdf-native-stop-parent.mjs (new) — minimal real parent for attempt C.
- apps/web/lib/qa/sdf-native-stop-bridge.test.ts (new; fake child streams, real guard with fake read/clock).
- apps/web/lib/qa/sdf-native-stop-process.test.ts (new; win32, required flag, classes N/V).
- apps/web/lib/qa/sdf-native-stop-boundary.test.ts (new).
- apps/web/lib/qa/sdf-execution-lease-boundary.test.ts and apps/web/lib/qa/sdf-windows-workspace-boundary.test.ts — deliberately re-based: new BASE = this plan's commit; the native/isolation diff may touch only the files listed above; five native modes; guard consumers limited to the bridge and QA.
- apps/web/lib/qa/sdf-windows-materialization-native.test.ts — not in the gate; its uncontrolled `materialize-fixture` stdin cases are updated to the new protocol so the file does not assert a removed path. It stays outside the gate because its real cases depend on deleted predecessor scratch (historical evidence only).

Exact contracts:
```ts
type GuardedMaterialization =
 | {status:'not_started';reason:'lease_not_live'|'input_invalid'|'unsupported_platform'}
 | {status:'observed';attemptId:string;report:MaterializationReport} // only if guard live at report and no stop sent
 | {status:'stopped';attemptId:string;reason:'stop_requested'|'control_lost'|'lease_lost';
    cleanup:'confirmed'|'retained'|'unknown';containerRemoved:boolean|null;volumeRemoved:boolean|null}
runGuardedMaterialization(input:unknown,guard:ExecutionLeaseGuard,deps?:BridgeDeps):Promise<GuardedMaterialization>
```
No result carries fixture output after stop, a publication/ready flag, or the claim token. `deps` is a test seam; the exported fixed instance uses fixed spawn, reservation and cleanup.

Bridge algorithm:
1. `await guard.checkpoint()`; not `live` or `signal.aborted` → `not_started`, no reservation, no spawn.
2. Reserve attempt (existing durable reservation), spawn, write request line, keep stdin open.
3. On each checkpoint frame: validate seq/phase order; `continue` only if `await guard.checkpoint()==='live'` and nothing stopped; otherwise write `stop` and end stdin.
4. On `guard.signal` abort at any moment: write `stop`, end stdin, mark stopped (idempotent).
5. On report: if stopped or guard not live → `stopped`, keep only containerRemoved/volumeRemoved as cleanup evidence. Else `observed`.
6. After stop, wait ≤35000 ms (cleanup 30000 + 5000) for the report. No report / exit without report / frame violation → kill own pid, then exactly one `cleanupWindowsSourceFixture(input, attemptId)`; `cleaned` → `confirmed`, `failed/cleanup_retained` → `retained`, anything else → `unknown`. No further retries.

## Task 0: Owned workspace and PostgreSQL fixture relocation

- [ ] Commit this plan. Create the owned scratch with `plan-path` and `progress.md`; record HEAD, branch, Docker image/container/volume snapshots and helper binary hashes as `baseline.json`.
- [ ] Change `sdf-execution-lease-postgres.ts` as specified. RED: run `sdf-execution-lease-sql.test.ts` once with the plan-path file temporarily absent → must fail on identity, not create the directory. GREEN: with plan-path present, the unchanged SQL assertions pass (class P instances, each removed and absence-confirmed).
- [ ] Commit Task 0.

## Task 1: Native control channel (RED→GREEN, fake Docker)

- [ ] Write `control-channel` smoke first: stop at each of six phases → no later Docker mutation recorded, cleanup removes owned resources, status `stopped/stop_requested`; EOF ≡ stop; stop during hashing and during `hold-wait` cancels promptly; missed continue → `control_lost`; wrong seq, duplicate keys, invalid UTF-8, >128-byte control line, unknown type → `control_lost`; second stop ignored; cleanup deadline not shortened by stop; foreign container/replaced daemon still `cleanup_retained`, never deleted; normal run with all continues still `verified_for_fixture`.
- [ ] Observe RED (unknown smoke mode / missing types), not a restore/network error.
- [ ] Implement. Rebuild helper and smoke; rerun existing fake smokes `materialization`, `materialization-spec`, `attempt-journal`, `toolchain` and new `control-channel` GREEN.
- [ ] Commit Task 1.

## Task 2: Parent framing and controlled spawn

- [ ] Tests first with fake child streams: request line bound, stdin kept open, frame bounds/order/duplicates/UTF-8, stderr non-empty, frames after report, exit without report, spawn ENOENT, bootstrap hash mismatch → no spawn. Kill only own pid; no shell, no PATH lookup.
- [ ] Observe RED, implement, GREEN plus broker typecheck. Commit Task 2.

## Task 3: Guard-driven bridge

- [ ] RED tests using the real `createExecutionLeaseGuard` with fake read/clock: guard not live → zero reserve/spawn; abort before first checkpoint, at each checkpoint, mid-phase; `verified_for_fixture` after stop → `stopped`; report after guard expiry → `stopped/lease_lost`; hang → kill at 35000 ms then exactly one cleanup; cleanup outcomes map to confirmed/retained/unknown; no second spawn or cleanup; signal stays aborted, later checkpoint `stopped`.
- [ ] Observe RED, implement, GREEN with existing guard/client tests and broker typecheck. Commit Task 3.

## Task 4: Real attempts A–D, boundaries, gate

- [ ] Write `sdf-native-stop-process.test.ts` and the boundary test. Class V cases first (missing proof without dispatch env must fail, stale binding must fail).
- [ ] Dispatch A, B, C, D once each, in that order, one Vitest invocation per attempt with only that file and `ATLAS_NATIVE_STOP_DISPATCH=<X>`. Stop the sequence after any unexpected result; never dispatch a fifth attempt. Record attempt ids, phases, timings, Docker snapshots before/after and absence.
- [ ] Run the final gate below (class P + V only). Commit Task 4, then task-done verification on the committed source (class V only).
- [ ] ONE fresh independent reviewer over BASE..HEAD, both specs, this plan, every ruling and the five Review Focus cases verbatim. Read-only; it runs nothing. One material RED→GREEN fix pass, then the same final gate. If the fix changes any proof binding, list the stale attempts and ask André; do not redispatch. Minors documented; no second review.
- [ ] Commit `docs/verification/2026-10-19-cooperative-native-stop.md` + `docs/verification/2026-10-19-cooperative-native-stop-evidence.json` (including class N proofs and class P receipts); update and reread only the Notion section "Arbetsspår – Atlas kodarbete och oberoende granskning"; delete only this plan's identity-checked scratch. No push/merge/deploy/live activation.

## Final gate (exact)

Run from `C:/Users/Andre/Projects/Omnira/.worktrees/atlas-voice-recovery-20261016` in PowerShell. Steps marked RUNS start processes; steps marked EVIDENCE only check saved artefacts and read-only state.

1. RUNS (local build, offline):
~~~text
& 'C:\Program Files\dotnet\dotnet.exe' build apps/code-broker/native/windows-workspace/OmniraBrokerWorkspace.csproj --configfile apps/code-broker/native/windows/NuGet.Config -c Release -o apps/code-broker/.native/windows-workspace
& 'C:\Program Files\dotnet\dotnet.exe' build apps/code-broker/native/windows-workspace/smoke/Smoke.csproj --configfile apps/code-broker/native/windows/NuGet.Config -c Release
~~~
Expect 0 warnings/0 errors. The resulting helper hashes must equal the class N proof bindings; otherwise stop with `stale_real_evidence`.

2. RUNS (native smoke harness, fake Docker only; no real Docker mutation):
~~~text
foreach($m in 'control-channel','materialization','materialization-spec','attempt-journal','toolchain'){ & 'C:\Program Files\dotnet\dotnet.exe' apps/code-broker/native/windows-workspace/smoke/bin/Release/net8.0-windows/WorkspaceSmoke.dll $m; if($LASTEXITCODE -ne 0){throw $m} }
~~~
Each prints `{"passed":N,"names":[...]}` with N equal to the number of names and stderr empty.

3. RUNS (Vitest: TypeScript tests, class P owned PostgreSQL instances, class V proof reuse and parse-only real helper check; no class N dispatch):
~~~text
$env:ATLAS_NATIVE_STOP_REQUIRED='1'; Remove-Item Env:ATLAS_NATIVE_STOP_DISPATCH -ErrorAction SilentlyContinue
npm exec --workspace=apps/web -- vitest run lib/qa/sdf-execution-lease-projection.test.ts lib/qa/sdf-execution-lease-http.test.ts lib/qa/sdf-execution-lease-client.test.ts lib/qa/sdf-execution-lease-guard.test.ts lib/qa/sdf-execution-lease-sql.test.ts lib/qa/sdf-execution-lease-boundary.test.ts lib/qa/sdf1a-code-work-contracts.test.ts lib/qa/sdf1b-code-work-control-plane.test.ts lib/qa/sdf1c-broker-identity-id.test.ts lib/qa/sdf1c-trusted-broker.test.ts lib/qa/sdf1c2-broker-control-channel.test.ts lib/qa/sdf-review-storage-service.test.ts lib/qa/sdf-review-storage-boundary.test.ts lib/qa/sdf-windows-source-boundary.test.ts lib/qa/sdf-windows-workspace-boundary.test.ts lib/qa/sdf-native-stop-bridge.test.ts lib/qa/sdf-native-stop-process.test.ts lib/qa/sdf-native-stop-boundary.test.ts --maxWorkers=2 --minWorkers=2 --reporter=default --reporter=json --outputFile=.superpowers/sdd/2026-10-19-cooperative-native-stop/gate.json
~~~
Pass criteria from gate.json: exactly 18 files, numFailedTests 0, numPendingTests 0, numTodoTests 0, every file with ≥1 test.

4. RUNS (typecheck and whitespace):
~~~text
node node_modules/typescript/bin/tsc -p apps/code-broker/tsconfig.json --noEmit
node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit --incremental false
git diff --check
~~~

5. EVIDENCE (read-only): class P receipts all `removed` with `absenceConfirmed:true` and no container labelled `omnira.plan=cooperative-native-stop` left (`docker ps -a --filter label=omnira.plan=cooperative-native-stop -q` empty, through the fixture's fixed Docker binary/config); class N proofs A–D present with matching bindings and attempt resources absent (rechecked inside step 3); predecessor scratch `.superpowers/sdd/2026-10-19-live-execution-lease` absent; proof worktree c435e423 clean at d3f9fcc; tombstones preserved.

## Rulings (cost if wrong)

1. Convert `materialize-fixture` in place; no sixth mode (approved) — cost: historical one-shot invocation is not reproducible without the bridge; historical 42/42 stays tied to its evidence.
2. Cleanup is lease-independent but attempt/peer/identity-bound — cost: cleanup can run without a live mandate; it can only delete resources bound to a reserved attempt and the original peer, and never returns a fixture.
3. Checkpoint waits come out of the unchanged 150 s budget — cost: slow lease reads make `deadline_exceeded` more likely; fail-closed, never extended.
4. Stop latency is bounded, not instantaneous: guard window ≤9 s plus ≤4 s control reply plus Docker request timeouts (predecessor ruling 11) — cost: up to ~13 s of continued in-container work after a remote revoke; no result from it can be accepted.
5. Forced kill only after 35 s grace, then one automatic cleanup — cost: a hung helper delays the stop outcome up to ~70 s; outcome `unknown` is surfaced and existing tombstones block reuse of that attempt.
6. Boundary tests are re-based deliberately to this plan's commit with an explicit allowed-file list — cost: a mistaken allow-list could hide an unintended native change; the reviewer receives the list verbatim.
7. Predecessor minors (SQL race barriers, dense formatting) stay deferred — cost: they remain open in the next report.
8. Spawn the controlled helper detached from libuv's kill-on-close job so that parent death becomes EOF-driven cleanup rather than an abrupt kill; the helper's own deadlines (≤185 s) bound its lifetime and its git children stay in its own job — cost: if the helper hangs after parent death it can outlive the broker for up to its deadline; attempt C measures this.
9. Real attempts are bound to exact binary/source/environment hashes and never re-dispatched automatically — cost: a late fix may leave real evidence stale and require André's explicit re-run approval before the claim can be made.
10. Owned PostgreSQL instances recur on every gate run and are reported separately — cost: more short-lived local containers; each is identity-checked and removed.

## Inline self-review

Coverage: stop before start → Task 3 step 1 / attempt A; during work → Task 1/3 / attempt B; lost mandate/expiry → guard abort cases in Task 3 and attempt B; broken connection → EOF in Task 1 / attempt C; late results → Task 3 / Focus 3; identity-checked cleanup on stop, error and kill → Task 1, attempt D, rulings 2/5; no validity restoration or publication → terminal guard, closed result union and boundary tests. André's four adjustments: PostgreSQL fixture relocation (Task 0, file map), class N vs V separation and stale-evidence rule, separate class P allowance, and the fully spelled final gate.
