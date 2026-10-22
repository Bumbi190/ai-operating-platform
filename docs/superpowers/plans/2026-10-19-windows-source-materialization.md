# Atlas Windows Source Materialization and Node Fixture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task. Preserve the already selected Native method: root implementation, one fresh gpt-6-astra high whole-range review, one material RED→GREEN fix pass with the complete named gate; no repeated reviewer.

**Goal:** Transfer one explicitly selected, immutable Omnira source snapshot into an owned Docker named volume and prove a fixed offline Node/Vitest fixture with a prepared immutable Linux dependency image, without activating a real code job.

**Architecture:** Extend the Windows native isolation adapter with a retained read-only workspace lease, bounded raw Git-object reads, deterministic source manifest/tar and an attempt-scoped volume/container pipeline. A separate operator-only setup prepares Linux dependencies from exact pinned descriptors; runtime cannot install, build, pull or select arbitrary commands. The TypeScript facade accepts binding identifiers only and returns bounded evidence, never execution authority.

**Tech Stack:** Existing TypeScript/Vitest, installed .NET8/Win32/Git and Docker Desktop WSL2; built-in System.Formats.Tar/SHA256. No PackageReference or host dependency install. Linux npm preparation is an explicit setup action described below.

**Spec:** docs/superpowers/specs/2026-10-18-atlas-first-code-job-design.md section2 and infrastructure acceptance criteria; docs/superpowers/specs/2026-10-18-atlas-independent-review-design.md implementation order1. Previous proof: docs/verification/2026-10-18-windows-workspace-sandbox.md. Concrete planning inputs: docs/verification/2026-10-19-materialization-planning-evidence.json.

## Scope, current evidence and global constraints

- Planning BASE08471634c418b8fcfcd895d6d419b1e25473377d, clean branch codex/atlas-code-worker-design-20261018. Preserve this worktree and the existing locked proof at C:/Users/Andre/Projects/Omnira/.worktrees/c435e423-d964-428b-b5c0-4060d89ce3c6; no second real proof worktree.
- The existing request binds repository github.com/bumbi190/ai-operating-platform, workId c435e423-d964-428b-b5c0-4060d89ce3c6, base d3f9fcc1045026042f6bb9c0cd302ed0b7283127 and the original synthetic admission/claim/fence in planning evidence. Recheck the actual branch/lock/clean status/current approved ref. Ref drift blocks; do not fetch, rebase or replace the request.
- This document is the written plan review stage. Only read-only metadata and planning documents have been produced; no source implementation, image pull/build, volume, container or dependency installation occurred while planning.
- Retain all six HostProfile paths and executable hashes. Current qualification and actual request-stream peer verification remain mandatory. No caller root, endpoint, executable, environment, image, command, volume name or arbitrary file path.
- FILESYSTEM_WRITES_ENABLED remains false. No patching or arbitrary host write API. Runtime source bytes come from pinned Git objects, never copied from local files/node_modules. Host executes only trusted infrastructure operations; the project fixture runs inside its container. Normal developer verification suites are separate from Atlas job execution.
- Keep the original Alpine health profile unchanged:128MiB/.5CPU/no mounts. Introduce a separate Node-fixture profile with the exact limits below; do not silently raise the health profile.
- Runtime remains network none, uid/gid10001, cap-drop ALL, no-new-privileges, read-only image rootfs, private IPC, restart no, pids64, memory/swap536870912 bytes, NanoCpus1000000000, nofile256:256, no devices/host namespaces/sockets/published ports/bind mounts.
- Writable locations are exactly one attempt-owned local named volume at /workspace/repo and /tmp tmpfs rw,noexec,nosuid,nodev,size=67108864,mode=1777. No Docker-volume driver options or caller-specified mount configuration.
- Runtime native total180000ms:150000ms work plus independent30000ms cleanup INSIDE total; outer185000ms. Fixed fixture child maximum90000ms. Cleanup-only30000ms/outer35000ms. Existing prepare/probe/cleanup deadlines unchanged.
- One runtime attempt creates at most one volume and one container. No retry/recreate/resume/upload replay after uncertain mutation. Persist the attempt ID before helper launch. Cleanup never starts or creates resources.
- The fixed source policy has exactly22 paths from planning evidence, max128 regular files, max1048576 bytes/file, max16777216 content bytes, max200 ASCII path bytes, max256 total tar entries and max17825792 tar bytes. Larger future source scope requires a new reviewed policy.
- Reject path ambiguity, case collisions, traversal, DOS/ADS/UNC/device paths, symlinks120000, submodules160000, executables100755, non-UTF8/NUL/binary input, LFS pointers and forbidden secret/config/dependency paths before content publication. Only mode100644 selected Git blobs are accepted.
- Deny any .git, .env*, .npmrc, .netrc, .ssh, .aws, .gnupg, credentials/secrets/node_modules segment and private-key/certificate-store file; deny reserved .omnira-source-manifest.json from source. No user config or local credential enters build or runtime.
- Scan selected text with these fixed detector families: PEM BEGIN labels containing PRIVATE KEY; provider token prefixes sk-proj-, sk-ant- or sk- followed by at least20 ASCII token characters [A-Za-z0-9_-]; AWS access-key IDs AKIA/ASIA followed by16 uppercase alphanumerics; and quoted literal assignments to api_key, apiKey, secret_access_key, password or private_key whose unescaped value is at least20 characters. Detector matching is case-insensitive for assignment field names only, scans at most the already bounded file bytes and never logs matched values. Detected content fails closed with no secret echo. This is a bounded detector, not a certificate that arbitrary source can contain no custom secret. The first policy's fixed pinned source also remains subject to owner/reviewer inspection.
- Keep model context export, worker patches, general project tests/typecheck, real admission/claim validation, paid model APIs, lifecycle ready, live callers/UI/routes/grants/enrollment/database, push/merge/deploy out of scope. The fixed fixture is an infrastructure proof, not a registered live command receipt or a general Node certification.
- No subscriptions or paid CI. No broad cleanup/prune or changes to existing images/volumes/containers/other plans. Capture baseline resources before approved setup. Preserve trusted owner/admin/kernel/tool-distribution assumptions and point-in-time evidence limits.

## Fixed source and toolchain inputs

Planning evidence lists all22 exact source paths: four dependency descriptors, apps/web/tsconfig.json, the existing sdf1a-code-work-contracts.test.ts and server-only stub, authorization/{build,derive,types}.ts and the12 direct code-work contract/policy modules. No recursive whole-repo export and no project Vitest configuration execution; image-owned fixture configuration supplies the fixed alias/include/cache policy.

Use the retained base's lock SHA25617ba6aedc7139835f0de6c62fc13c727682b737fe142ee7e99d452673625de80, NOT development HEAD's b24c69f9a32ff34f254365e1c14bb7503329a6ec7f0f15796bcedecc9852832f. Four descriptor SHA256 pins are exact in planning evidence. Lock v3 has1067 entries; TypeScript5.9.3, Vitest2.1.9, Vite5.4.21. Validate all external resolved URLs as public https://registry.npmjs.org and integrity-pinned; the two workspace links must resolve only to apps/web and packages/local-text-contract. No git/SSH/arbitrary URL/file dependency.

Node base is exactly docker.io/library/node@sha256:efd0ab5780c2d9ab1f0f869571a00d5edb17793bff4cce4a2792e3eb0ffc7562, linux/amd64, Node22.23.3. Digest was obtained from the official22.23.3-bookworm-slim manifest without a pull. Do not reuse the unrelated cached mutable node:22-bookworm image.

### Explicit operator setup permitted only after this written plan is approved

A fixed no-options scripts/provision-windows-toolchain.mjs uses pinned dotnet/Git/Docker, fresh minimal environment/empty Docker configuration and explicit npipe:////./pipe/dockerDesktopLinuxEngine. Require current host qualification before/after and the same backend/daemon identities; failures stop without repair or alternate tooling.

Create a fresh owned build context below this plan's scratch. Read ONLY the four fixed descriptors from the pinned Git base with replacement refs disabled; compare their SHA256 BEFORE writing any context. Add only the reviewed Dockerfile and image-owned fixture scripts. No whole checkout, .dockerignore bypass, user npm config, build secrets, SSH forwarding, proxy credentials or inherited build arguments.

Permit exactly one pull of the fixed Node digest and one build of the reviewed recipe, timeout900000ms/output8MiB, no automatic retry. Require at least8GiB free host space; failure stops without deleting anything else. Network is allowed only during this operator build's public dependency preparation, never during the fixture.

Dockerfile uses npm ci --ignore-scripts --include=dev --include=optional --no-audit --no-fund --userconfig=/dev/null --globalconfig=/dev/null --registry=https://registry.npmjs.org. No npm run/rebuild, arbitrary lifecycle command, peer-dependency fallback, lock regeneration or host node_modules copy. If the lock cannot install unchanged with these flags, stop with evidence instead of weakening them.

Final image contains only the pinned Node base, locked Linux dependencies at /opt/omnira/deps, fixed runner/config and owned /workspace/repo. Precreate /workspace/repo uid/gid10001 with exactly the trusted node_modules symlink to /opt/omnira/deps/node_modules; adjust the one known workspace dependency link to /workspace/repo/packages/local-text-contract. Dependency tree is root-owned/read-only in the final image. Record its sorted file/symlink inventory SHA256.

Source-owned ToolchainProfile starts unprovisioned. After the successful one-shot setup, the executor enrolls the observed immutable LOCAL image ID into the compiled source profile together with base digest, four descriptor pins, lock/recipe/runner/inventory hashes and actual Node/npm/TypeScript/Vitest versions, then rebuilds the helper. No mutable tag or request/env value is accepted. A local built image may have no RepoDigest: call its content-addressed Image.Id a local image ID, never invent a registry digest. The final independent review includes the enrolled profile/receipt.

Build cache and the two explicitly approved images may remain; no push/public registry publication. Record exact setup resource deltas and failures honestly.

## Review Focus

1. Git replace refs, checkout conversions or modified local files could substitute bytes despite a matching HEAD: read immutable objects with --no-replace-objects/GIT_NO_REPLACE_OBJECTS=1, verify Git blob SHA1 and source SHA256, refuse dirty/drifted workspace. Task1 tests.
2. An allowed filename hides a key/binary/symlink or malicious tar path: enforce mode/path/UTF8/secret/size rules before archive publication; tar has only fixed directories/regular files and one trusted internal manifest. Task1 tests.
3. Wrong lock, workspace link or package lifecycle escapes dependency preparation: exact descriptor hashes/public registries/ignore-scripts and read-only image inventory; runtime invokes fixed Node files directly. Task2 tests.
4. Daemon drift or lost create/upload/delete response causes replay or false absence: actual-peer checks, unchanged-daemon checks around EVERY accepted presence/absence, one attempt/mutex, no mutation retry. Task3 tests, retaining the previous F1 regressions.
5. Volume permissions, hidden mount options or cleanup races expose host paths or leak resources: inspect exact local volume/options/labels and actual container mount, prove uid10001 can write only the owned workspace/tmp, remove container then volume with bound404 confirmation. Task3/4 tests.

## Files and shared interfaces

Native apps/code-broker/native/windows-workspace:
- Create WindowsWorkspaceLease.cs: retained read-only validation of an EXISTING derived workspace, shared with WindowsWorktree.cs; absent target never causes prepare/add.
- Modify NativeProcess.cs, WorkspaceContracts.cs and WindowsGitProcess.cs for bounded raw byte capture and CLOSED SourceTree/SourceBlob operations. Existing string API and limits stay unchanged.
- Create SourceFixturePolicy.cs, SourceSnapshot.cs, DeterministicSourceTar.cs:22-path policy, verified Git bytes/manifest, canonical USTAR payload.
- Factor common transport from DockerProbeSession.cs into VerifiedDockerSession.cs; add DockerMaterializationSession.cs, MaterializationSpecification.cs, WindowsMaterializationFixture.cs and MaterializationContracts.cs. Keep old health semantics and its F1 safeguards.
- Create ToolchainProfile.cs (unprovisioned then explicitly enrolled ready profile).
- Modify Program.cs to accept exactly five closed modes: prepare, probe, cleanup-probe, materialize-fixture, cleanup-materialization; no operational broker CLI action.
- Create smoke/SourceSmoke.cs and MaterializationSmoke.cs; extend smoke Program only for source/materialization test modes.

Operator/image files: scripts/provision-windows-toolchain.mjs and toolchain/windows-fixture/{Dockerfile,fixture-runner.mjs,vitest-fixture.config.mjs,dependency-inventory.mjs} under apps/code-broker.

TS facade files: apps/code-broker/src/isolation/windows/source-{contracts,fixture}.ts; extend workspace-helper.ts only with the two fixed modes/timeouts and bounded existing transport. Public prepare/run-health/cleanup behavior unchanged.

QA: new apps/web/lib/qa/sdf-windows-{source-contracts,source-native,materialization,materialization-native,source-boundary}.test.ts, fixtures/sdf-windows-source-fixtures.ts. Update predecessor workspace-native, workspace-boundary and trusted-broker boundary assertions only as necessary to preserve exact mode/importer guards and reuse the already retained proof.

### Concrete contracts

All new stdin JSON remains strict duplicate/unknown/missing-key rejecting, <=4096 UTF8 bytes/depth16. Native materialize request is a flat object with exactly eight keys: schema,workId,repositoryId,pinnedBaseSha,admissionHash,claimId,fence,attemptId. Binding field validation is identical to WorkspaceRequest; schema is sdf.windows_materialization_request.v1 and attemptId is UUIDv4. Cleanup uses the identical eight fields with schema sdf.windows_materialization_cleanup.v1. No source path/policy/image/command/mount parameter; source policy is fixed sdf.windows_source_fixture.v1.

WindowsWorkspaceLease.OpenExistingAsync(WorkspaceRequest,CancellationToken) returns an internal IDisposable lease with fixed Repository/Parent/Target/Registration leases and ValidateUnchangedAsync; current config/ref/branch/lock/reciprocal identity and clean status must all be freshly verified. Existing reports/fixture IDs are not authority.

NativeProcess.RunBytesAsync has the same trusted executable/argv/cwd/env/process-job constraints as RunAsync and returns NativeBytesResult(ExitCode:int?,Stdout:byte[],TimedOut:bool,OutputLimit:bool). Only SourceBlob may use1048576 output bytes; SourceTree stays262144. Raw stderr remains bounded/sanitized. SourceGit lists the fixed paths with ls-tree -r -z --full-tree --long <pin> -- <fixed22paths>; only its validated opaque GitBlobReference may select cat-file blob <oid>. No filters/textconv/archive shell or generic Git verb. Recompute SHA1("blob "+decimalByteLength+"\0"+bytes) == oid.

SourceSnapshot.BuildAsync(WindowsWorkspaceLease,CancellationToken) returns internal SourceSnapshot(Binding,PolicyId,Files,ManifestBytes,ManifestSha256,ContentBytes). Each file entry is path,gitBlobId,sha256,byteLength and verified bytes. Canonical manifest key order is schema,binding,policyId,baseSha,files; files sorted ordinal ASCII with entry keys path,gitBlobId,sha256,byteLength. No timestamp/self-hash in canonical bytes. Schema sdf.windows_source_manifest.v1. Hash is SHA256 of those exact UTF8 bytes.

DeterministicSourceTar.Write(snapshot) uses built-in USTAR, epoch timestamps, uid/gid10001, directories0755, regular files0644, no PAX/global/link/device entries and no duplicate/colliding paths. Add only the trusted internal .omnira-source-manifest.json after source validation. Build entirely in bounded memory; no source-file spool or arbitrary host write.

NodeToolchainProfile is a closed unprovisioned|ready state. Ready binds the exact immutable local image ID, base digest, source policy, descriptor/lock/recipe/runner/inventory hashes and version strings. Changes to any pin make readiness invalid. No runtime discovery/enrollment or caller overrides.

The materialization report has exactly schema,status,attemptId,binding,reason,sourcePolicyId,manifest,manifestSha256,toolchainProfileHash,imageId,backendIdentityHash,daemonIdentityHash,fixture,containerRemoved,volumeRemoved,observedAt,productionAuthority. Schema sdf.windows_materialization_report.v1; productionAuthority always false. Status is verified_for_fixture|blocked|failed|cleaned.
- verified_for_fixture requires nonnull valid manifest/profile/image/peer/daemon, the exact22 selected files, a valid fixture result and BOTH confirmed removals.
- cleaned requires reason null, manifest/fixture null, both removals true and no execution/file-verification claim.
- blocked/failed require a closed nonnull reason and fixture null; already observed valid-format hashes/manifest may remain, never invented success.
- Reasons: input_invalid,host_unqualified,workspace_unverified,stale_base,source_policy_denied,secret_pattern_found,source_limit,blob_unavailable,toolchain_unprovisioned,toolchain_mismatch,attempt_in_progress,resource_conflict,peer_changed,protocol_invalid,archive_invalid,materialization_unverified,fixture_failed,deadline_exceeded,cleanup_retained.

Fixture result is a strict exact-key object including schema=sdf.node_fixture_result.v1 and uid,gid,nodeVersion,typeScriptVersion,vitestVersion,totalTests,passedTests,failedTests,skippedTests,exitCode,durationMs,sourceManifestSha256,beforeAfterSourceEqual,stdoutSha256,stderrSha256,redactedStdout,redactedStderr. Require uid/gid10001, pinned versions, totalTests>0, passed==total,failed/skipped==0,exit0,matching manifest and unchanged source. Logs are bounded/redacted/untrusted evidence; no private model reasoning. Combined returned redacted logs<=65536 UTF8 bytes; whole report<=262144.

TS public functions runWindowsSourceFixture(input:unknown):Promise<MaterializationReadResult> and cleanupWindowsSourceFixture(input:unknown,attemptId:string):Promise<MaterializationReadResult>. Both public input values use parseWindowsWorkspaceRequest and the existing sdf.windows_workspace_request.v1 schema; run converts the validated binding to the native flat materialization request and generates/stores attemptId before invoking native. Input cannot supply it. Cleanup validates its separate UUIDv4 argument and converts the same binding to the native cleanup schema. Result is observed/report or unavailable/reason/attemptId:string|null, same closed transport vocabulary as workspace-helper. No injected public options and no automatic retry.

## Task 1: Retained immutable source snapshot

**Interfaces:** consumes fixed WorkspaceRequest/profile/path/process/config policies; produces WindowsWorkspaceLease, SourceSnapshot and deterministic tar used by Task3.

- [ ] Write SourceSmoke and source-contracts tests FIRST. Cases: valid22-file snapshot, dirty/untracked drift, missing/replaced registration, malicious per-worktree config, replace-ref substitution, CRLF local bytes not substituted for Git bytes, wrong blob SHA, binary/NUL/invalidUTF8, symlink/submodule/executable, case/ADS/traversal, tracked .env/key, recognizable token, LFS pointer, per-file/total/count limits, deterministic manifest/tar and forbidden tar types. Assert zero upload/resource calls on rejected source.
- [ ] Run native build/smoke source and new pure TS tests; observe missing exports/behavior RED before implementation.
- [ ] Factor the shared lease without changing PrepareAsync's public interface/retention semantics. All Git operations disable replacement objects; reject legacy graft metadata. Add only the closed raw tree/blob operations, verify exact bytes before UTF8/secret checks and before returning any content. No checkout/file-byte fallback or fetch.
- [ ] Implement the exact manifest/USTAR contracts. Pure test example: expect(()=>parseSourceManifest({...makeSourceManifest(),files:[{...file,path:'../.env'}]})).toThrow(); native tests must also attempt actual held-file/directory replacement rather than label a simulated error as success.
- [ ] Run source GREEN, existing path/process/worktree/config native smokes and relevant pure contracts; inspect only owned fixture cleanup and commit Task1 source.

## Task 2: Fixed Linux toolchain recipe and explicit qualification

**Interfaces:** consumes four pinned descriptors and source/manifest rules; produces enrolled NodeToolchainProfile and an independently inspected image/qualification receipt.

- [ ] Write failing tests for changed/missing descriptors, nonpublic/git/file dependency, unknown workspace link, npmrc/secret leakage, enabled lifecycle scripts, mutable/unprovisioned/wrong image ID, wrong Node/tool version, inventory drift and writable dependency tree. Test the image-owned runner's strict result decoder with total0/skipped/failure/oversized/duplicate/wrong-manifest cases.
- [ ] Implement the no-options operator script/recipe described above. Context must be a generated allowlist, not Docker build "." in any project checkout. A harmless install-script sentinel in an owned image fixture must remain unexecuted with ignore-scripts.
- [ ] Implement the image-owned runner/config: fixed Node entrypoint, one fork/worker, cache/temp under /tmp, only the existing sdf1a fixture. Invoke /usr/local/bin/node --max-old-space-size=192 /opt/omnira/deps/node_modules/vitest/vitest.mjs with fixed config/suite arguments, never npm run or repository-selected config. Capture child output/report with hard limits and actual exit/time.
- [ ] Runner verifies selected file hashes/types and the exact trusted node_modules link before execution; proves an exclusive fixed write/delete probe works in the owned volume; rechecks source/manifest/no unexpected files after the fixture. It never follows unknown symlinks. Validate the one-suite JSON result, not an exit0 or claimed summary alone.
- [ ] After pure/synthetic GREEN, perform the single approved operator pull/build; inspect immutable image ID/labels, inventory, Node22.23.3/TypeScript5.9.3/Vitest2.1.9 and npm version. Enroll actual ready constants, rebuild and test mismatch refusals. If setup fails, record blocked proof; no skip, alternative image, script enablement, lock update or paid upgrade.
- [ ] Commit recipe/operator/profile/tests with setup receipt facts in the verification report. Retain approved image/cache and leave unrelated cached node image alone.

## Task 3: Owned volume transfer, fixture execution and reconciliation

**Interfaces:** consumes SourceSnapshot, ready profile and current verified native peer; produces WindowsMaterializationFixture.RunAsync(request,attemptId,token) and CleanupAsync with the closed report.

- [ ] Write fake-stream/native tests RED for foreign volume/container, same-attempt concurrency, wrong peer zero bytes, changed daemon before/after404, missing mount/protection, nonlocal driver/options, lost volume-create/container-create/archive/start/delete replies, archive stream overflow/cancellation, no replay, volume-in-use and cleanup deadline. Preserve old F1 late-drift/lost-delete regressions.
- [ ] Acquire a nonblocking current-user attempt mutex derived only from UUID; conflict is attempt_in_progress. Fresh run refuses ANY existing derived resource even if labels look familiar. Abandoned ownership is cleanup-only, never a resume/re-upload path.
- [ ] Factor VerifiedDockerSession with a CLOSED internal operation grammar. New endpoints only: volume create/inspect/delete and bounded binary PUT to the known owned container's archive at fixed /workspace/repo. No generic route/method/body/export/exec/build/pull API. Every accepted presence/absence is bounded by unchanged-daemon checks before/after; preserve actual-stream peer checks and no-second-connect mutation guard.
- [ ] Derive names omnira-sdf-src-<attemptNoHyphens> and omnira-sdf-node-<attemptNoHyphens>. Labels exactly version1,attemptId,bindingHash,sourceManifestSha256,toolchainProfileHash under omnira.sdf.materialization.*. Volume driver local with no options. Actual volume/container inspections must match derived ownership, immutable image, exact sole named-volume mount/RW destination and full Node protections BEFORE upload/start.
- [ ] Create a stopped container with CopyData enabled for the owned empty volume; image directory ownership supplies uid10001 without a root runtime initializer. Upload the canonical tar once. The fixed image runner then verifies actual materialized bytes/ownership and runs the fixture. A permission/readonly mismatch blocks; never fall back to root, bind mount or writable rootfs.
- [ ] Wait at most90000ms for the fixed fixture, validate bounded multiplex logs and its exact report. Finally remove only the fully ownership-verified container, then its volume without force; confirm each absence on the original daemon. Lost mutation replies are reconciled once, never resent. A changed daemon/foreign/in-use/uncertain resource means failed/cleanup_retained; cleanup-only cannot claim verified_for_fixture.
- [ ] Run protocol GREEN and old peer/probe regressions. Internal short-budget test seam may prove actual cancellation/cleanup timing with1500ms+500ms; production values remain150000+30000 with no environment/caller selection. Commit Task3.

## Task 4: Closed facade, reusable proof fixtures and actual full-chain gate

**Interfaces:** exposes the two TS functions above; no CLI/routes/models/job lifecycle consumer.

- [ ] Write source/materialization DTO and transport tests RED: exact keys, request correlation, malformed/duplicate/oversized data, bad IDs/hashes/totals, inconsistent cleanup/authority, unsupported platform, lost reply retains preselected attempt and no retry. Example: expect(()=>parseMaterializationReport({...makeVerifiedReport(),volumeRemoved:false})).toThrow().
- [ ] Implement strict TS parsers/facade and the two source-owned helper mode/timeouts. Native rejects malformed stdin as well; JS-only validation is insufficient. AST/require/literal-dynamic-import checks plus read-only source search must show no operational caller. Old host still qualify-only; new native dispatcher exactly five modes.
- [ ] Make predecessor native harness use SDF_WINDOWS_FIXTURE_ROOT ONLY IN TEST CODE, validated inside this plan's repo-local scratch, with its original default retained for standalone old-plan use. Update workspace-native to REQUIRE a saved prepared proof fixture and always reread actual HEAD/branch/lock/clean status; remove implicit real worktree creation. Seed its current-plan receipt from the durable previous prepared report, not a new prepare call. Missing proof fails, never silently skips. No write into or cleanup of sibling plan scratch.
- [ ] Actual proof requalifies the existing c435e423 workspace and unchanged base, builds the22-file source manifest, creates one attempt volume/container, uploads exact Git bytes, proves uid10001 materialization and fixed Vitest count>0/no skips, then confirms removal of both resources. Source/main/proof worktrees remain unchanged/retained. Record bytes/hash/version/exit/time and accessible bounded redacted logs.
- [ ] Explicit cleanup proof uses a separate owned created-but-not-started attempt with saved binding/ID, and tests reconciliation without start/recreate. All actual resource creation is part of this approved fixture, never a live job; no daemon restart or foreign resource tampering.
- [ ] Capture before/after main HEAD/status/ref/config, retained worktree identity, all container/volume/image IDs and build-cache observations. Expected owned persistent changes: the approved Node base/toolchain images/cache only. No new real worktree or retained runtime volume/container on success. Record unrelated concurrent deltas without rollback or authorship claims.
- [ ] Run the full named17-file gate below and broker/web tsc. Require all native flags on Windows, no zero-test/required skip. Run git diff --check0; commit Task4.

Full gate, with SDF_WINDOWS_WORKSPACE_REQUIRED=1, SDF_WINDOWS_PROBE_REQUIRED=1, SDF_WINDOWS_HOST_REQUIRED=1, SDF_WINDOWS_IDENTITY_REQUIRED=1, SDF_WINDOWS_SOURCE_REQUIRED=1, SDF_WINDOWS_MATERIALIZATION_REQUIRED=1 and test-only SDF_WINDOWS_FIXTURE_ROOT fixed to this plan's absolute scratch:

~~~text
npm exec --workspace=apps/web -- vitest run lib/qa/sdf-windows-source-contracts.test.ts lib/qa/sdf-windows-source-native.test.ts lib/qa/sdf-windows-materialization.test.ts lib/qa/sdf-windows-materialization-native.test.ts lib/qa/sdf-windows-source-boundary.test.ts lib/qa/sdf-windows-workspace-contracts.test.ts lib/qa/sdf-windows-workspace-native.test.ts lib/qa/sdf-windows-probe.test.ts lib/qa/sdf-windows-probe-native.test.ts lib/qa/sdf-windows-workspace-boundary.test.ts lib/qa/sdf-windows-host.test.ts lib/qa/sdf-windows-host-native.test.ts lib/qa/sdf-windows-identity.test.ts lib/qa/sdf-windows-identity-native.test.ts lib/qa/sdf1c-broker-identity-id.test.ts lib/qa/sdf1c-trusted-broker.test.ts lib/qa/sdf1c2-broker-control-channel.test.ts --maxWorkers=2 --minWorkers=2
node node_modules/typescript/bin/tsc -p apps/code-broker/tsconfig.json --noEmit
node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit --incremental false
~~~

## Final review and handoff

- [ ] After all tasks/actual proofs, fresh independent gpt-6-astra high review of the entire execution BASE..HEAD, both approved specs, this plan, every ledger ruling and all five focus cases. One material RED→GREEN fix pass/full17-file gate/both typechecks; minor findings documented; no second reviewer.
- [ ] Commit docs/verification/2026-10-19-windows-source-materialization.md with actual counts/exits/image IDs/pins/resources, immutable source manifest, readable redacted fixture output, all rulings/costs and each reviewer declined-to-judge decision. Separate original251/251 evidence from new results.
- [ ] Update and reread Atlas Notion work track; preserve source branch and existing real proof. After durable report commit/handoff verification delete only THIS identity-checked plan scratch, never sibling plans or real worktrees. No push/merge/deploy/live claim.
- [ ] Preserve the selected Native execution method; do not ask the user to choose it again. This written plan is new reviewable scope; implementation/setup begins after its review, without further approval loops for already authorized steps.

## Inline self-review

Coverage: immutable source/path/secret/archive requirements→Task1; frozen Linux dependencies/no job installation→Task2; owned mount/current-peer/uncertainty/resource recovery→Task3; true fixture evidence/no live authority/unchanged host→Task4. All five review-focus cases have owning tests. Cross-task names/types/pins/limits above are the sole interfaces.

No generic model-selected file exporter, volume mount API, Node command API or live claim is introduced. The first profile's22 files and fixture command are deliberate limits; broader jobs/typecheck/model context require later reviewed profiles and authority wiring. Image.Id enrollment is an explicit setup output from a fixed recipe, not runtime auto-learning. Missing build/proof/image or unsupported installed-engine semantics remain blocking evidence rather than skipped success.

Primary references checked 2026-10-19:
- https://git-scm.com/docs/git-cat-file and https://git-scm.com/docs/git-ls-tree (raw object data/metadata).
- https://docs.docker.com/reference/api/engine/version/v1.51/ (closed volume/archive/container operations).
- https://docs.docker.com/engine/storage/volumes/ (copy-up and sole named-volume mount semantics).
- https://github.com/nodejs/docker-node and official Docker manifest metadata for the fixed linux/amd64 digest.
- https://docs.npmjs.com/cli/v10/commands/npm-ci/ (frozen lock/ignore-scripts; explicit npm run would still execute scripts and is not used).
- Installed .NET8 System.Formats.Tar API; no extra package.
