# Windows host qualification verification — 2026-10-18

The Windows desktop passed the fixed-object and read-only Docker qualification. The result is `qualified_for_health_probe`, **not permission to execute a code job**. This phase is implemented and tested locally on branch `codex/atlas-code-worker-design-20261018`; the worktree is preserved. No push, merge, production enrollment, grant, or deployment was performed.

## Source and scope

Approved plan: `docs/superpowers/plans/2026-10-18-windows-host-qualification.md` (0ee96ab6013e20de5ef607a7b7be107c24fc0cc0).
Spec: `docs/superpowers/specs/2026-10-18-atlas-first-code-job-design.md`, section 1.

| Task | Commit | Result |
|---|---|---|
| Fixed target registry / native file proof | 43b6f3c | Source-owned paths and SHA pins; per-component path, reparse, case, owner and DACL checks |
| Actual Docker peer / read-only observation | d4aae3f | Retained pipe and process handles; verified peer before HTTP; GET /version and GET /info only |
| Closed report / TypeScript facade | 59b2fd6 | Fixed helper launch, pinned runtime, strict schema and consistency checks |
| Real Windows tests / build boundary | caf09ec423791fc984e44f3cdd946fade03e8941 | Required native tests and dependency-free build script |


Review range: `0ee96ab6013e20de5ef607a7b7be107c24fc0cc0..caf09ec423791fc984e44f3cdd946fade03e8941`. Predecessor identity code is the base and was not reimplemented.

Native project: `apps/code-broker/native/windows-host`. Facade: `apps/code-broker/src/isolation/windows/host-qualification.ts`. No broker operational endpoint, authority registry, database, or existing Mac/Linux admission guard changed. The broker CLI remains generate/enroll/diagnostic. Qualification is a local library result and the native helper accepts exactly `qualify`.

## Actual observation

Native JSON timestamp: `2026-10-18T16:35:55.879Z`.
Schema: `sdf.windows_host_qualification.v1`; profile: `andre_desktop_windows_v1`.
All six checks were true with empty reasons; Docker was Linux / Docker Desktop / microsoft-standard-WSL2. The connected named-pipe server resolved to the fixed Docker backend, with current-user token SID, pinned file bytes/ACL evidence, retained process handle and creation-time identity.

| Fixed target | Source-owned path | Pinned executable SHA256 |
|---|---|---|
| git | C:/Program Files/Git/cmd/git.exe | bd1bf0469426e2e67a27300176303b5e43e1dda81babc1c24c9c2ce627b97960 |
| docker | C:/Users/Andre/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe | 6c699720bb9523dedb9eb5d22a49951ea9210dbdb1314a3554029eee9be76896 |
| backend | C:/Users/Andre/AppData/Local/Programs/DockerDesktop/resources/com.docker.backend.exe | 37deeeae5bf632014b22fc6487cb9a531072f8d32d062acf6982a914fa6e8585 |
| dotnet | C:/Program Files/dotnet/dotnet.exe | 7967467e8bad9c686de2ab2c1994112d5331a7c3d20f0b8a4fff7480221a1c37 |
| checkout | C:/Users/Andre/Projects/Omnira/Code/ai-operating-platform | directory identity and ACL evidence; no content hash pin |
| worktree_parent | C:/Users/Andre/Projects/Omnira/.worktrees | directory identity and ACL evidence; no content hash pin |

Built helper DLL SHA256: `5f1911bbb49f4ad8c11bd0117201f0e8aadd882614e403ef45f20cfe780ff42b`. Build outputs are ignored. Updating an installed executable changes its pin and blocks qualification until a separately reviewed profile update; replacement hashes are never learned automatically.

Docker backend identity hash: `f5d2496af79d13ad924797355ddb026f13928873d1739f9286f6199fbad7bd56`.
Daemon identity hash: `097b04099237066832a5574e26cb1708df26ff5007ae0165f7135bea76df3601`.
These are correlated local observations, not independent VM or hardware attestation. Snapshot hashes are not future execution authority.

## Validation

Required flags: `SDF_WINDOWS_HOST_REQUIRED=1`, `SDF_WINDOWS_IDENTITY_REQUIRED=1`.
**164/164 focused Vitest tests passed across seven files, with no skips.**

| Suite | Tests |
|---|---:|
| sdf-windows-host.test.ts | 38 |
| sdf-windows-host-native.test.ts | 10 |
| sdf-windows-identity.test.ts | 33 |
| sdf-windows-identity-native.test.ts | 5 |
| sdf1c-broker-identity-id.test.ts | 13 |
| sdf1c-trusted-broker.test.ts | 16 |
| sdf1c2-broker-control-channel.test.ts | 49 |
| Total | 164 |

The native host smoke additionally reported 52 named assertions inside the native test, not 52 extra Vitest cases. It proves native path-with-spaces acceptance, a real owned junction refusal, a deliberately unsafe owned-file ACL refusal, alias input refusal, fixture cleanup, a wrong native pipe process receiving zero HTTP bytes, bounded HTTP failure handling, and real Docker peer success.

Native builds used installed .NET SDK 8.0.204 and the existing cleared-source NuGet.Config, with zero warnings/errors and no PackageReference, installation, or upgrade.
Both checks passed:
- `node node_modules/typescript/bin/tsc -p apps/code-broker/tsconfig.json --noEmit`
- `node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit --incremental false`

Focused command:
```powershell
npm exec --workspace=apps/web -- vitest run lib/qa/sdf-windows-host.test.ts lib/qa/sdf-windows-host-native.test.ts lib/qa/sdf-windows-identity.test.ts lib/qa/sdf-windows-identity-native.test.ts lib/qa/sdf1c-broker-identity-id.test.ts lib/qa/sdf1c-trusted-broker.test.ts lib/qa/sdf1c2-broker-control-channel.test.ts --maxWorkers=2 --minWorkers=2
```

Build command:
```powershell
npm --prefix apps/code-broker run native:build:windows-host
dotnet build apps/code-broker/native/windows-host/smoke/Smoke.csproj --configfile apps/code-broker/native/windows/NuGet.Config -c Release
```

Observed RED before implementation/setup:
- Task 1 smoke failed compilation because policy/evidence types were absent.
- Task 2 smoke failed compilation because peer/connector types were absent.
- Portable host suite failed importing the absent facade.
- Required native suite failed before the package helper existed; it was not treated as a passing skip.
- A first real fixture under system Temp was correctly refused because other accounts had mutation rights. Moving the fixture to the owned worktree allowed it without weakening policy.

The TypeScript tests explicitly exercise timeout/overflow error classification, malformed JSON, missing/linked bootstrap files, changed runtime pin, unknown/missing/extra schema fields, duplicate target IDs/reasons, inconsistent status and malformed hashes/timestamps. Controlled callback failures prove error branches; they do not simulate an adversarial replacement of the trusted helper.

Checkout git status, Docker container IDs and Docker image IDs were identical before and after the required run. Worktree paths/branches/locks were unchanged; raw porcelain HEAD values changed through our normal local commits. The helper contains no Git/shell/process-launch, worktree/container lifecycle, file/ACL writing, or image-pull operation. Test fixture writes are isolated from product files and machine ACLs.

## Independent review

Independent fresh-context whole-range review by gpt-6-astra (high), using the approved Native method: **0 Critical, 0 Important, 1 Minor**. Reviewer read spec, plan, rulings, source range and unchanged production guard; reproduced the minor through the actual parser. Reviewer did not rerun suites or independently capture typecheck exit codes; the implementer read those process exit results (both 0).

Deferred minor: a blocked report with a failed backend or dotnet check can retain a non-null Docker projection in the TypeScript parser. Native composition skips Docker for failed prerequisites, so such output is contradictory. It remains blocked and cannot create positive qualification or execution authority. Suggested future regression: reject non-null Docker unless backend and dotnet both pass. Minor deferred under the approved one-review/fix-material-findings workflow.

The reviewer found actual same-stream peer validation, native object checks, conservative ancestor policy, cancellation/retained-handle lifetime and fixed endpoint/bounds consistent with the plan. No material finding required a code fix or second review.

## Rulings made

1. Use an explicit BASE/RED/GREEN/commit ledger instead of unavailable remote shell task scripts. Reason: equivalent workflow on Windows without installing tooling. Cost if wrong: manual bookkeeping could omit a task/evidence link; commits and actual outputs were cross-checked.
2. Put random harness fixtures under this plan's owned worktree directory rather than system Temp. Reason: Temp has untrusted mutation ACLs and is correctly rejected. Cost if wrong: another host/cwd may block the smoke until an equivalently trusted owned fixture location is provided; no production ACL is repaired.
3. Use an abstract Stream observation seam for deterministic fault tests, while production always owns the actual NamedPipeClientStream and retained process handle. HTTP receives a cancellable borrowed view to keep the pipe handle available for revalidation. Reason: test timeouts/oversize/peer changes without replacing Docker or permitting caller-selected endpoints. Cost if wrong: future callers could misuse a test seam or alter stream lifetime; the closed production entrypoint and native tests are the present boundary.
4. Keep the approved branch/worktree locally, using the focused required suite instead of the generic finishing skill's full-suite/menu flow. Reason: the approved plan explicitly excludes full-repository runs and push/merge/deploy, and already chooses preservation. Cost if wrong: unrelated baseline failures remain outside this phase; no integration readiness beyond this range is claimed.

5. Actual Docker process replacement/restart resistance was judged from source, real current-peer proof and injected negative cases, without replacing/restarting the daemon. Reason: this is an observation-only approved plan. Cost if wrong: native race behavior beyond those tests may remain unproven; no report is reused as execution authority.
6. Hostile owner/admin/kernel or reviewed-installation compromise remains outside this boundary. Reason: the desktop owner/helper is the trust root of this stage. Cost if wrong: a compromised trusted host can falsify its own observation; this is not attestation.
7. Windows sandbox/worktree execution and code-job authority remain disabled. Reason: this phase qualifies metadata only. Cost if wrong: it does not yet deliver autonomous code editing; a later execution gate is still required.
8. Previous identity implementation and its three deferred minors remain unchanged. Reason: that separately reviewed predecessor is this range's base. Cost if wrong: its documented minor limitations remain until a separate change.
9. Full-repository health and POSIX behavior are not inferred from focused Windows success. Reason: the approved plan excludes known broader baseline failures and unavailable WSL Node runtime. Cost if wrong: unrelated integration/platform issues can remain outside this proof.

## Limits and next gate

- Actual OS proof is Windows only. The broader repository has known prior failing tests; it was not rerun. WSL has no Node runtime; POSIX execution was not verified.
- Stale/exited/changed-peer negative behavior uses the internal seam. A real wrong-process pipe is tested, and actual Docker identity/liveness checks pass. No legitimate Docker process, installation, or pipe ACL was changed to manufacture an adversarial replacement.
- The trusted Windows owner/admin, kernel and reviewed helper installation remain bootstrap assumptions. Same-user privileged WSL access is not a security boundary. This does not attest a hostile host.
- This is host metadata qualification only. The pinned Alpine probe image is absent and was not pulled. No container/worktree/job/model tool was started by the helper.
- The predecessor's three deferred minor findings remain unchanged: unsupported-platform CLI stack placement; some separate CNG native failure coverage; early-close fixture teardown timing. This phase adds no production registration/grant.
- Next implementation gate: protected Windows Git/worktree preparation and an actual bounded sandbox health execution. Only after that come file editing/testing/diff evidence, job orchestration and delegated workers. Atlas does not yet autonomously rewrite project code.
