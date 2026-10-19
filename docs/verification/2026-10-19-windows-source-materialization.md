# Windows source materialization — execution record
Plan: docs/superpowers/plans/2026-10-19-windows-source-materialization.md
Execution BASE: e38f297dca9af3323313878fb4dc9069e24f5024
Status 2026-10-19: Tasks1–2 verified locally; Task3 has a pure protection specification only; runtime transfer/fixture, full17-file gate and independent review remain. No live authority, push, merge or deployment.

## Completed source increment
Commit a535d0717546570159aac69f4459e6a67069c8ad.
Immutable raw Git objects, exact22-path policy, text/secret/path limits, source manifest and deterministic USTAR. Existing workspace lease checks registration/config/base/HEAD/branch/lock/clean state and retains handles. Replacement objects disabled and legacy graft metadata refused.
Observed RED: missing native/source exports and TS module; later nested binding schema regression31/32 failed before fix.
Final Task1 gate: source144 native assertions, path/process27, worktree52, worktree-config19; pure source/workspace contracts89/89 in2files; broker tsc0. Native build0warnings/0errors. The test-only new-plan fixture root avoids recreating predecessor scratch.

## Prepared Node image
Machine evidence: docs/verification/2026-10-19-node-toolchain-setup.json.
Base: docker.io/library/node@sha256:efd0ab5780c2d9ab1f0f869571a00d5edb17793bff4cce4a2792e3eb0ffc7562 (linux/amd64).
Actual immutable LOCAL image ID: sha256:3c16f0769a58c732a92dc1e7badcf327c86a24eec4bcd559801ba6b9783a3c54. This is observed local Image.Id, not a claimed published registry digest.
Profile hash: 0b65f5b70cba761aa46c033c357529c7cd89eca5ae7f1043055cfe1d587b3f52.
Exact retained-base lock SHA256:17ba6aedc7139835f0de6c62fc13c727682b737fe142ee7e99d452673625de80; all four descriptors checked before context creation and after npm ci.
Inventory:86893 entries; SHA256 0aeb2cd8a20c5b57c5e2a57283860e0b7d21e07831c90c3ec4b6b923a95d1ed3.
Observed versions: Node22.23.3, npm10.9.9, TypeScript5.9.3, Vitest2.1.9.
Lifecycle scripts disabled; the owned postinstall sentinel remained absent. Dependency files/directories are root-owned/read-only. No host node_modules or user config enters the eight-file context.
One approved base pull succeeded. The first CLI invocation rejected --progress before dispatch because a clean Docker config could not discover bundled Buildx. Reconciliation observed the original backend/daemon, only the base image addition, no container/volume delta and no iid file.
The first actual build used a temporary copy of the already installed Docker Inc-signed Buildx pinned SHA256 e97f22ffc483857ec876055c0c1f52290ffd3d881e60a4a08e658bd6d39692bb, with a separate exclusive once-only receipt and NO second pull. Actual build ref default/default/x45fdlslhu9jr47fhzusu03x4.
Operator duration829.64s within900s; inventory/freeze layer630.7s. No automatic retry of a dispatched or uncertain build occurred. Temporary tool configuration/copy removed; approved image/build cache retained. Before/after recorded container IDs and volume names are equal. Image listings do not prove deletion/absence of intermediate images.
Task2 gate: actual image re-read via the pinned Docker endpoint and checked by compiled native ToolchainProfile; profile8 and pure volume/container specification22 native assertions; contracts113/113 in3files; broker/web tsc0. No runtime project fixture has yet run inside the image.
Vite emits its existing CJS API deprecation warning in developer contract runs.

## Decisions carried to the remaining work
1. Reuse the linked worktree and existing dependencies; run the named bounded gate, not an unbounded suite — matches approved proportional scope. Cost if wrong: unrelated broad failures remain outside these green claims.
2. Bring the test-only fixture-root change forward — never recreate deleted predecessor scratch. Exact current root and its relative/exact MSYS marker only. Cost if wrong: required native tests block before fixtures.
3. Shorten random fixture names using full128-bit base64url — Git registration returned GIT_DIR too big; core.longpaths did not repair that limit and was reverted. Cost if wrong: synthetic creation fails; runtime source scope unchanged.
4. Prepare shares the existing-workspace final lease; omit duplicate immediate revalidation — OpenExisting already revalidates. Safe-config smoke now checks actual HEAD/read presence; malicious configs still require zero HEAD reads. Cost if wrong: redundant work could return; unsafe config remains blocking.
5. One selected test file may have multiple describe groups — installed Vitest2 reporter counts those separately. Matching positive passed-group totals and every assertion in exactly one file are mandatory. Cost if wrong: group totals may be miscounted; skipped/failed/empty assertions still block.
6. Use distinct build-owned empty npm user/global files — npm rejects loading the same config path twice. Isolated read-only characterization failed for one path and passed for two empty files. Cost if wrong: setup blocks; no user config or lifecycle permission is added.
7. Reconcile the proved pre-dispatch rejection and pin/expose only bundled Buildx for the authorized build — original pull/failed receipt retained, new once-only record, no extra pull or uncertain mutation replay. Cost if wrong: duplicate build/cache/network work; guards refuse lost replies, other failures, existing iid or resumed attempts.
8. Accept omitted/null/empty Cmd with the exact fixed entrypoint — observed Docker serialization omits empty Cmd; the new regression failed before the narrow decoder fix. Nonempty/nonarray commands remain refused. Cost if wrong: an unintended command could be accepted.
The pure Node resource specification was prepared while the single operator build was pending. No runtime volume/container mutation was introduced by that preparation.

## Remaining
Task3: closed verified transport, volume/container lifecycle, bounded archive upload, fixed fixture and cleanup/reconciliation; preserve original F1 before/after-daemon absence checks.
Task4: strict DTO/facade, durable attempt bookkeeping before helper launch, reused real proof fixture, actual offline chain, all17 named files/six required Windows flags, both typechecks, one independent gpt-6-astra high whole-range review and one material RED→GREEN fix pass.
Keep the branch and c435e423 proof worktree. Keep this plan's scratch until the final verified durable handoff; predecessor scratch stays untouched.
