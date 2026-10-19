# Atlas Protected Windows Workspace and Sandbox — blocked checkpoint

Actual verification date: 2026-10-19, Europe/Stockholm. **Tasks1–3 complete; Task4 incomplete. No release/production approval claim.**

Execution BASE: 91925590e160e0a258c2867e50b0e92480f3a603.
Local branch: codex/atlas-code-worker-design-20261018.
Implementation checkpoints: 189f4205da39bf08e7a460971d6d0f785b8a0493 (paths/processes), 9095c803f645c995d2cae8d824dfd9d275b0816b (Git/worktree), 9b826035a60d9d6a5cb23d484829e81cea5bcb5f (verified-peer sandbox), 79843c23cd342fd534e3528e091a4004fe9897e0 (facade/tests, blocked checkpoint).

## Results

| Check | Actual result |
| --- | --- |
| Predecessor baseline |164/164 in7files, exit0|
| Native path/process smoke |27 named assertions pass, including retained rename/config/reparse denial and actual Job Object descendant termination|
| Native synthetic worktree/entry smoke |53 named assertions pass, exact Git/config parity, concurrency/base drift/retention, malformed bounded entry|
| Native probe smoke |29 named assertions pass, wrong peer zero bytes, lost replies, foreign ownership refusal, cleanup-only semantics, 30s total budget including cleanup|
| New TS unit suites |74/74 initially GREEN|
| Final named required gate |249 passed,1 failed,250 total,12files, **no skips**, exit1,55.70s|
| Broker typecheck |exit0|
| Web typecheck, --incremental false |exit0|
| Native smoke build |exit0,0warnings,0errors|
| Whitespace |staged check0 after removing one blank-line trailing space; no runtime source change after tests|

Exact final gate is the 12-file command in the approved plan, with all four SDF_WINDOWS_*_REQUIRED flags set to1, maxWorkers/minWorkers2. Logs retained in the plan-owned scratch because Task4 is blocked. No full-repository/POSIX live gate or paid CI claimed.

## Real workspace blocker and retained request

The actual public TypeScript facade -> fixed .NET helper returned **observed/refused/unsafe_git_config**, workspaceRetained=false. Registered common config has extensions.worktreeConfig=true; the approved policy explicitly rejects this mode. Main config.worktree is absent. Do not edit shared settings or silently loosen the audit to obtain a passing result.

Saved request:

```json
{
  "schema": "sdf.windows_workspace_request.v1",
  "workId": "c435e423-d964-428b-b5c0-4060d89ce3c6",
  "repositoryId": "github.com/bumbi190/ai-operating-platform",
  "pinnedBaseSha": "d3f9fcc1045026042f6bb9c0cd302ed0b7283127",
  "admissionHash": "662d9af499e4d6fbc0c7e97b276d8526559a0658b6899eab63cc9a04880cec1d",
  "claimId": "2e0f09eb-cf7e-4619-834b-d78aa0ca5a7a",
  "fence": 1
}
```

Reconciliation confirmed target absent, branch show-ref exit1 and no reciprocal worktree registration. **No real proof worktree was created or retained.** A saved request is not evidence that a worktree exists. Repeated gates refuse automatic second creation while this request remains; their single failed test reports that manifest guard. The earlier real helper refusal is recorded separately in real-workspace-blocked.json and task4-real-proof.log. Required proof remains RED rather than skipped.

Next reviewable proposal: docs/superpowers/plans/2026-10-19-windows-worktree-config-compatibility.md. It audits retained applicable per-worktree config instead of changing repository settings; original refusal remains active until approved. Reuse/reconcile this same saved request, never a second random proof workId.

## Real Docker proof

One approved operator setup pulled the exact fixed digest once via pinned Docker executable and explicit npipe, fresh empty config, after current host qualification. No login/default context/image substitution/runtime pull. Linux/amd64 confirmed. Receipt at 2026-10-19T05:40:18.242Z.

```json
{
  "setup": {
    "at": "2026-10-19T05:40:18.242Z",
    "operatorSetup": true,
    "ref": "docker.io/library/alpine@sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6",
    "pulled": true,
    "imageId": "sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6",
    "os": "linux",
    "architecture": "amd64",
    "backendIdentityHash": "f5d2496af79d13ad924797355ddb026f13928873d1739f9286f6199fbad7bd56",
    "daemonIdentityHash": "097b04099237066832a5574e26cb1708df26ff5007ae0165f7135bea76df3601",
    "productionAuthority": false
  },
  "finalRealProbe": {
    "status": "observed",
    "report": {
      "status": "ok",
      "attemptId": "6244fbac-95a8-4da2-a5c2-4856c103d6d8",
      "reason": null,
      "backendIdentityHash": "f5d2496af79d13ad924797355ddb026f13928873d1739f9286f6199fbad7bd56",
      "daemonIdentityHash": "097b04099237066832a5574e26cb1708df26ff5007ae0165f7135bea76df3601",
      "imageId": "sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6",
      "containerId": "0555fee122ff4f6d349bbb0905d4447efe706615b09b1b13e2cb6b68f68f45f0",
      "uid": 10001,
      "gid": 10001,
      "inspected": [
        "network=none",
        "rootfs=read-only",
        "user=non-root numeric",
        "cap-drop=ALL",
        "no-new-privileges",
        "not privileged",
        "pids-limit",
        "memory limit",
        "swap bounded",
        "cpu limit",
        "no bind mounts",
        "no mounts",
        "no docker socket",
        "tmpfs only /tmp noexec",
        "env allowlist",
        "no secret env",
        "image=pinned digest",
        "image id matches",
        "no devices",
        "no host namespaces",
        "no published ports",
        "fixed entrypoint"
      ],
      "containerRemoved": true,
      "schema": "sdf.windows_sandbox_probe.v1",
      "productionAuthority": false
    }
  }
}
```

Actual final probe returned ok, uid/gid10001, all22 protections, confirmed removal. Separate actual not-started container inspection and explicit attempt-scoped cleanup passed. Cleanup success uses cleaned, never a false execution ok. Fixed busybox id only, no repository code/test command.

## Resource comparison and limits

Main checkout HEAD, tracked status and approved origin/main ref unchanged. Existing40container IDs identical after owned probes; no image removed; exactly one extra image ID, the approved digest. Image rows41→42. No automatic broad cleanup.

The full worktree snapshot differs: our implementation HEAD advanced as expected; the pre-existing atlas-harvey-sales and omnira-calendar worktree HEADs also advanced concurrently. Their paths/branches/registration structure remained present. This executor did not mutate those worktrees and does not claim byte-identical global registration HEADs or attribute those concurrent commits to this work.

No live code job, model dispatch, server claim, lifecycle ready, UI/routes, database/grants, enrollment, push, merge or deployment. Filesystem-writes setting and POSIX guards unchanged. Runtime cannot pull/build or accept caller paths/commands/env/endpoints. Current desktop owner/admin/kernel and trusted installed tool/helper distribution remain outside hostile-host attestation.

## Review status

One fresh whole-range independent review is **pending**, not clean or passed: Task4's required real workspace proof has not completed. Preserve the selected Native method; do not spend its one final reviewer before the compatibility extension and real proof are ready. No new deferred minor claims in this incomplete increment; predecessor deferred items remain outside scope.

## Rulings I made (chronological; exhaustive checkpoint)

- Ruling: remote skill shell scripts and writing-good-tests.md provider resource unavailable — explicit owned ledger/briefs/test logs/BASE/commits preserve the approved workflow — cost if wrong: manual bookkeeping may omit evidence.
- Ruling: generic worktree/TDD full-suite/install defaults are overridden by the approved plan's existing-worktree/no-install/named-focused-gates constraints — avoids unrelated known baseline and paid CI — cost if wrong: full-repository/POSIX health remains outside this proof.
- Ruling: split internal Win32 process/handle primitive into NativeProcess.cs, leaving the finite Git grammar/neutral-home adapter for Task2 where its repository context is available — makes Job Object, inheritance and quoting independently testable without a production test command — cost if wrong: one extra internal file/interface must stay unreachable from external DTOs.
- Pre-flight ruling: cleanup-probe cannot truthfully return probe status ok because it never executes id. Add closed status cleaned for successful cleanup only, uid/gid null and inspected=[], reason null, containerRemoved true; run must reject cleaned, cleanup must reject ok — distinguishes reconciliation from a proven run without granting authority — cost if wrong: one extra native/TS union variant relative to the plan sketch.
- Ruling: extract fixed create/inspect/log policy into ProbeSpecification.cs and link the predecessor's internal BorrowedPipeStream.cs source into the new assembly — existing public peer connector is reused without broadening the read-only host helper's visibility or modes — cost if wrong: an extra policy file/parity boundary and two assemblies compiling one shared internal stream wrapper require their named regressions.
- Ruling: interpret blocked-host "no mutating helper" as zero resource-mutating operations, enforced inside the freshly qualified native helper; do not promote a saved/read-only JSON qualification to execution authority or add a redundant JS preauthorization gate — native blocked-host regression must show zero HTTP/create — cost if wrong: the trusted native process starts before it can report blocked, but performs no container/worktree mutation.
- Ruling: preserve the explicit unsafe worktreeConfig refusal rather than change shared repository configuration or weaken the security policy to obtain GREEN — current plan cannot prove the registered real workspace on this host; a reviewed extension is needed — cost if wrong: Task4 remains incomplete and its required real proof stays RED.
- Focused gate RED248/250, no skips: expected real-workspace blocker plus predecessor exact child_process import allowlist (4, now5). Ruling: update predecessor boundary test to name ONLY the planned fixed workspace-helper fifth transport, preserving exact importer equality and the new no-operational-caller AST gate — necessary companion to the authorized new native adapter — cost if wrong: that one new infrastructure process boundary is permitted; no generic execution/importer allowance. All independent native path/process/worktree and actual helper-death descendant tests passed.

## Continuation

Preserve local branch/worktree, the saved request and this plan-owned scratch/ledger. Do not delete them under the successful-finish cleanup rule while blocked. Approve/execute the narrow compatibility addendum, complete the real proof and required gate, then independent review/one material fix pass and final report. No permission is needed again for already approved original plan steps.
