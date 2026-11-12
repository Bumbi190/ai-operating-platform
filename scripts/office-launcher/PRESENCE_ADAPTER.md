# Private Office presence adapter — 12 November 2026

## Current state
The read-only receiver, paired-loopback transport and minimal protected web page are implemented locally. One native receiver is saved beside the existing Familje-Pling in the approved private Windows Office. Real owner-session pairing, workflow execution and global Nova voice are NOT yet accepted end to end. Web changes are not published.

## Receiver contract
- Explicit avatar/project/registered-agent UUID selection; never assign the first agent automatically.
- Match project, slug and agent in BOTH trusted binding V036 and Campus snapshot v2 DTOs. Reject wrong scope, duplicates, incomplete reads and unsupported schemas.
- Source identity expires within20seconds, also bounded by a local monotonic deadline. Replay, old messages and clock rollback cannot renew it. Step request evidence has a separate90second lifetime and never proves execution.
- Output always keeps execution=not_verified, work_verified=false, animation=ambient. Only sanitized short names and bounded evidence/deadlines cross the file boundary. No prompts, models, voice IDs, credentials or commands.
- Atomic output comes from the receiver itself; caller-mutated dictionaries cannot be published through this API.
- Schema/source names are version checks, NOT credentials. Authentication/scope belongs to the paired browser's protected same-origin GET routes; the local pairing key does not attest a signed server DTO. See PAIRED_RELAY.md.

## Installed private native consumer
- Fixed world /Game/OmniraRealismLab/Maps/Omnira_HQ_Office_Visit in Omnira_Office_CastQA_v83. Existing 1420 actors remain unchanged; one tagged TextRenderActor is attached without weld to SkeletalMeshActor_3 / Pling | Familje. No rig/gameplay changes.
- New receiver /Game/OmniraGameplayV83/PrivatePresence/BP_OfficePrivatePresence consumes only Saved/OfficePresence/office-familje-pling.json under the verified project. Built-in Runtime JsonBlueprintUtilities is enabled in .uproject; native logic makes no Python/network/model/task calls.
- Validate exact schema/avatar, fresh verified identity, execution not_verified and work false. Input status text and optional step fields are ignored; fixed caption remains Arbetsstatus okänd. Identity text clears before risky parsing and when the file is missing, invalid or stale.
- Native UTC doubles plus independent GetAccurateRealTime receipt deadline; same expiry cannot revive after expiration. Per-frame expiry runs even when world is paused. Real disk reads are throttled to0.5seconds. Camera-facing refresh shares that throttle (deferred minor: up to0.5seconds lag).
- The new label uses an owned unlit copy of the engine font material to remain readable in the dark room. Engine source/font silhouette and all existing room materials are preserved.
- Current verified map410099dc001f46dee1b9ea20856865faf1771b5f30935385fb127e3925932727. Receiver uassetbd0d3742925c53d19d898b252ef5a07979760ea0e180e3ad689a46e89a87d85a. Material63cc3f3cd781fc7945959406de301765458cf02176931c4404f9ef52007e1412.

## Installation and evidence
Run only separate exclusive UE processes with this exact approved project. Scripts validate canonical active .uproject, Content mount, physical map, loaded world/current persistent level and exclusive editor PID before writes. Existing unrelated Unreal sessions block writes.

1. install_unreal_presence.py:19 native graph behavior assertions BEFORE any save; guarded project/BP/map install. Idempotent existing-asset check validates actual source/uasset hashes, runtime plugin and exact parent/label. It does not overwrite a drifted receiver.
2. style_unreal_presence.py: scoped journaled material correction; independently verifiable with -OfficePresenceVerifyStyleOnly. It does not change the graph or engine material. If a presentation write is interrupted, use the recorded transaction with office_install_guard.OwnedInstallTransaction.recover and its exact map/manifest/material allowlist before restarting; never delete assets to force a retry.
3. verify_unreal_presence_runtime.py: regular editor -ExecCmds="py <script>" (NOT auto-exiting ExecutePythonScript). Loads the actual SAVED actor into real PIE. It verifies fresh native Tick, then pauses and proves identity/text expires with stopped writer/file unchanged. No EnablePlugins override; proves persisted project config.
4. finalize_unreal_presence.py: a NEW separate commandlet checks all1420 baseline actors, actual BP/material/plugin/source, and installed-actor PIE proof bound to current map hash before setting installed=true.
5. review_unreal_presence.py: unsaved explicit scene captures of the actual room; only temporary camera/new-label orientation touched, no map save.

Saved/OfficePresenceSetup contains installation.json, fresh_process_audit.json, runtime_expiry_proof.json, presentation_proof.json, actors_before.json and transaction journals. The immutable Before_OfficePresence_1670a176418f.umap retains the entrance logo before receiver addition; config backupBefore_OfficePresence_e022b5f07304.uproject. Before_ReadablePresence_f95a8b49699a.umap retains the installed receiver before its material correction. Never reset/clean the project or restore over unrecorded changes.

Projection test fixtures hold the SAME exclusive writer lease as the real relay. Failed lock/read acquisition never deletes a real projection. Cleanup runs independently for unpause, PIE stop, file restoration and hash audit; any failure makes the proof fail. Only fixture-owned known bytes can be restored.

## Verification scope
- Windows combined Python suite69/69: launcher10, receiver22, real HTTP relay13, install/fixture/recovery guards8, starter16. Linux tests also pass. Native19 actual Blueprint checks include real rendered text, strict input rejection, monotonic expiry/nonrevival and newer-source reconnection.
- Fresh real PIE of the saved receiver passes paused-world stopped-writer expiry, without plugin override, with unchanged map. Separate finalizer and no-write idempotence audit pass. Synthetic identities only; no backend auth, live voice, workflow completion, packaging or another-machine claim.
- Actual TypeScript source/controller -> actual Python HTTP -> safe file integration passes. Reused source45tests, browser/middleware14regressions, affected existing middleware31tests, actual TSX SSR, TypeScript and Next compile-only pass. These are NOT real owner/browser/CORS acceptance or a full production build.
- Whole app Vitest remains RED129failed files/444failed tests. Catalog .superpowers/office-launcher-20261112/full-suite-failures.md; no unrelated source changed to hide failures. Release checks and fresh-main reconciliation remain open.

## Remaining integration
1. Explicit opt-in foreground relay starter is implemented/tested locally (office_pairing.py); integrate/accept its release flow. No service/autostart or new dependency is installed.
2. Prepare/review the web release against current main and complete production build/CI checks. Current branch remains local/uncommitted by instruction.
3. Accept one actual owner-session -> selected registered agent -> browser local-network permission -> relay -> this saved private Pling end to end.
4. Only then connect real runtime receipts/workflow actions and existing global Nova voice/chat, and expand further figures. A decorative robot never gets a new permanent worker merely by existing.

No new fee, API key, DB migration, model call, workflow run, commit, push or deploy. Active Nova Desktop worktree is preserved.

## Latest local build verification
Full npm run build --workspace=apps/web passed exit0 on12November with the existing public client configuration supplied only to the process. Actual Office/connect and both API routes are in output. No private key copy, .env file, DB migration or deployment. Next configuration skips type validation; separate prior tsc passed and starter changes are Python only. Whole app Vitest remains RED129files/444tests (isolated DB fixtures, Windows tool/path/container dependencies and remaining assertions); this is not release clearance.
