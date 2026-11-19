# Saved Office activity receiver — isolated staging

Continues local Office commit 062668e. The ordinary launcher still advertises no
v2 capability. This work saves and audits a separate lab receiver, not the live
Office installation. No push, deployment, production database mutation or real
agent/model/voice execution is performed.

## Reproduction and ownership

Unreal project: `Omnira_Office_CastQA_v83`, UE 5.8 on Hultgren.
Canonical map: `/Game/OmniraRealismLab/Maps/Omnira_HQ_Office_Visit`.
Staging map and Blueprint: `/Game/OmniraGameplayV83/ActivityStage20261113/`.
Isolated projection and receipts: `Saved/OfficeActivityStage20261113/`.

Run `office_activity_stage.py` in separate `UnrealEditor-Cmd` Python commandlets
with the switches below, in order. Each commandlet must fully exit before the
next Unreal process starts. A repeated build refuses existing stage files.

1. `-OfficeActivityStageBuild`: test graph, save only lab Blueprint and duplicate
   map, reload map, verify binding and original actors, record candidate hashes.
2. `-OfficeActivityStageAudit`: fresh load, exact saved actor verification, run
   20 behavior checks on instances of the saved class, restore synthetic fixture.
3. Run `verify_office_activity_stage_runtime.py` through normal editor `ExecCmds`
   for actual PIE. It never calls the authoring function or spawns a substitute
   receiver. It checks the saved PIE actor's name/class/parent and identity each
   tick, stops writing after native acknowledgement, observes pause while both
   deadlines independently expire, restores the fixture and quits.
4. `-OfficeActivityStageFinalize`: another fresh load and receipt/evidence gate.
   Output `staging_acceptance.json` always has `installed:false` and
   `live_launcher_enabled:false`.

`-OfficeActivityStageRollback` uses the guarded transaction's exact allowlist.
It removes only owned lab packages/candidate/baseline. Unknown file drift refuses
rollback before restoration; acceptance is invalidated before attempting it.
Historical proof files may remain, but no candidate means no finalization, and
every rebuild gets a new run ID.

## Dependency and evidence checks

The full artifact set binds stage map, Blueprint and sidecars if present,
project descriptor, baseline snapshot, six implementation/verification sources,
actual text font and texture package bytes, unlit font-mask material and its
hard/soft dependency closure. The actual font is the audited UE RobotoDistanceField;
unsupported fonts fail. UE 5.8 protects UFont.Textures from Python reads; actual
loaded embedded Texture2D font pages are enumerated through ObjectIterator and
their containing font package is hashed. Missing pages or registry queries fail.
Other room asset bytes are outside this staging presentation audit.

The canonical map, old receiver Blueprint, project descriptor, old text material
and three identity-installation receipts are compared byte for byte throughout.
All 1420 original actors' names/classes/labels/transforms/tags are preserved in
the lab. Only the old identity label is replaced there by the staged label,
attached 235 units above SkeletalMeshActor_3 / Pling | Familje.

Candidate, audit and PIE proofs must have the same run ID and exact artifact key
set/hashes, and distinct process IDs. The finalizer is a fourth independent
process. Incomplete acceptance claims and cleanup errors fail. Successful old
acceptance and operation proofs are revoked before candidate validation, so a
failed recheck cannot preserve a previous success. These are local integrity
checks, not an attestation against a malicious local administrator.

## Review and verification

Fresh-context review found 0 Critical, 4 Important and no deferred Minor issues.
All four Important findings received RED→GREEN regressions: dependency-failure
cleanup/quit, invalidation before failed checks or rollback, explicit actual font
roots with unavailable-registry rejection, and PIE actor/pause observation.
Runtime proof persistence is inside a finally-guaranteed quit path.

An actual rerun initially failed the old fixed 0.3-second activity observation
margin. Independent diagnostics showed Python wall time 1794598286.757 while the
last native actor tick had captured 1794598285.383, before its activity deadline
1794598286.431. A separate diagnostic run observed both expiry transitions under
pause when sampling after actual native ticks. The final verifier therefore
waits for the native captured clock to cross each deadline before asserting the
state, retaining the same-actor/pause checks and overall 45-second timeout.
This proves native per-tick expiry; it does not promise renderer wall-clock
latency under a stall. Diagnostic wrapper outputs are not accepted proofs.

Final-source Windows Python regression: **148/148, exit 0**, including 14 stage
tests. Final-source guarded rollback, rebuild and separate audit each exited 0.
Run ID: `2bdeb3c2936d45bc9565276f7724e614`. Audit PID 48684 passed 20 behavior
checks against saved class plus exact actor/presentation/baseline verification.

Final-source unmodified saved-actor PIE proof passed, PID 41408. It verified the
same saved actor and pause at both expirations, observed native activity expiry
at 1794598585.463 and identity expiry at 1794598587.880, with stopped projection
bytes unchanged. Protected Office artifacts and saved stage map remained exact;
there were no cleanup errors. This proof uses the final source hashes.

Saved stage map SHA256:
`bf375f89827f21153bec5cbc243486861f43c7d7442c8b60d3a71e838d6b0020`.
Saved stage Blueprint SHA256:
`5efcbe91f322061d9c1b2a564b0b075414b239b287a887085865678895467293`.
Canonical map SHA256 remains:
`cb51546039b052243b3db24f3f93131a48cf74d0af3d025be92260f5a7552010`.

Finalizer passed in a fourth process, PID 47004, exit 0, same run ID and 13 exact
artifact hashes. Its final receipt has `passed:true`, `installed:false`,
`live_launcher_enabled:false`, `real_auth:false` and
`workflow_execution_verified:false`. Audit proof hash:
`2e38b4fd1832285d42616cfb77fd1fa5ea01cccceeca9e6b4b47e0acc5fa2f87`.
Runtime proof hash:
`55ef526f9951549f0944c312cac0287a7aa18c8dc78438ac3a731b0d7e064408`.

## Remaining activation work

A later live installation needs a separate canonical-map transaction, equivalent
fresh-process and runtime acceptance bound to the actual relay directory, full
production readiness gate, release preflight and real-owner acceptance. A
staging receipt cannot authorize or enable that installation. This continuation
deliberately leaves the live v2 gate OFF, at the cost of repeating installed
verification when the real installation is authorized.
