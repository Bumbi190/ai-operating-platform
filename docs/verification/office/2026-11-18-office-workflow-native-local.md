# Saved Office workflow consumer: local Unreal acceptance

The saved Blueprint now acknowledges preparation before the companion polls workflow status, and acknowledges application before the browser can detach. A real PIE run used this chain to send Familje-Pling to the film room, interrupt leisure on busy, return home through AI navigation, and resume walking on idle. Owner/session, DB RPC, upstream HTTPS and the held game-process lease were synthetic. This is an isolated review candidate; canonical installation and production activation remain incomplete.

## Ownership and preserved state

- Continue owned branch `feat/office-workflow-status-20261118` in `D:\Projekt\Omnira\Worktrees\office-workflow-status-20261118`, parent `77cf80bd72e0043603a6edafde19b68840afd5f2`. No new branch, PR, push, merge or deployment.
- The read-only preflight returned `review_required / matching_local_branch`, no PR candidates, and the exact owned worktree. Manual continuation decision: `reuse_existing`. The original machine receipt is retained unchanged.
- Main observed at `8f73dfc21be4bb9e3656e3bf53b5c651a9ea66f4`. The branch retains the three unmerged Office base commits described in the preceding server/connection reports.
- Old Office worktree remains untouched. Its already modified `design-bundle.json` still hashes to `f4a4c921a78d721e58f163438cfd69ce45a5546dbff3db0061ce1dc4f2c62c16`.
- No production schema, ledger, environment, credentials, installed URI/bootstrap, voice/model execution or paid service was changed. The new feature flag remains default OFF. The SQL migration and its expected177/observed178 migration gate are unchanged.

## Private protocol and actual native acknowledgement

The private `omnira.office.workflow-presence.v1` frame has exactly18 fields: schema, scope, visit_state, visit_id, avatar_id, project_id, agent_id, revision, observed_at_unix, expires_at_unix, workflow_state, coverage, workflow_state_known, workflow_busy, identity, data_state, execution, work_verified. `visit_state` is preparing, active or closed. The public server DTO remains twelve fields.

Preparation is bounded to15 seconds and holds the target. Only a fresh preparation frame can pin the immutable visit/avatar/project/agent binding and configured target/path. Active data cannot establish a binding. Valid complete idle permits leisure; busy reserves the character at home; malformed, unknown, expired or closed data holds. This represents workflow reservation/status, with execution always `not_verified`.

The native Blueprint writes `<avatar>.json.native-ack.json`, schema `omnira.office.workflow-native-ack.v1`, exact14 fields: schema, scope, phase, visit_id, avatar_id, project_id, agent_id, revision, observed_at_unix, expires_at_unix, workflow_state, workflow_state_known, workflow_busy, execution. A native prepared acknowledgement must precede upstream polling. A matching native applied acknowledgement must precede browser confirmation/detach. A missing acknowledgement cannot keep renewing the visit indefinitely. The companion caps its monotonic native deadline by the source lease.

The acknowledgement parser bounds input to4096 bytes, rejects duplicate keys, nonfinite/unsafe revisions, wrong primitive types, redirected/nonregular files, wrong scope/binding and stale state/timestamps. Unreal writes the acknowledgement without atomic replacement; torn reads are unconfirmed and retried. This is a trusted local companion/filesystem boundary, not remote attestation against arbitrary local writers.

Engine source inspection showed that Blueprint JSON field getters coerce some primitive types. The graph therefore clones the parsed object, writes all canonical typed fields, and compares normalized JSON and the exact field count before acceptance. Native negative smoke testing confirms that a string-valued boolean is rejected. The Unreal parser itself does not reject duplicate raw JSON keys; no such claim is made. Companion and acknowledgement parsers do reject them.

The native receiver checks source wall time and a monotonic deadline on real ticks, including while paused, and polls JSON at4Hz. Cached frame fingerprints prevent same-revision mutation/renewal. Fresh higher revisions can recover, except after closure. **One immutable visit is accepted per native game world. A new workflow visit after closure requires restarting Office.** The browser failure text states this limitation.

## Saved assets

Project: `C:\Users\Andre\Projects\Omnira\Design\Agent-Campus-3D\UnrealPilot\Omnira_Office_CastQA_v83`, Unreal5.8.4.

| Item | Saved path | SHA256 |
| --- | --- | --- |
| New629-node consumer | `/Game/OmniraGameplayV83/PrivateWorkflow/BP_OfficeWorkflowPresence` | `19b1d37f3f5eb341feb5b5aba5735b9a832986d02971ac20d032730db35700f5` |
| Separate review map | `/Game/OmniraRealismLab/Maps/Previews/Omnira_Office_WorkflowConsumer_Review_20261118` | `34ae7f645f18adcd6763cb1d29171f6de936f521fac3ab2af52f6093e2464db7` |
| Preserved previous workflow test map | `/Game/OmniraRealismLab/Maps/Previews/Omnira_Office_WorkflowBridge_Review_20261118` | `548020997112717cb84b0c6c5fbaf79baeb17336345314bbf14698ff65e03b67` |

The new consumer was built as an ordinary Actor; the old test bridge was not renamed. Only Familje-Pling is assigned. The saved instance and class defaults are OFF and unbound. Prompt-/Handlar-Pling are not connected. Reopening the saved review map preserves all1726 previous actor signatures, adds one consumer for1727 total, and matches264 protected file hashes. Its dependency audit records27 Game/Engine packages, no missing packages. Prior B.16 screen-material deviation is inherited as the documented baseline, not restored to its earlier hash. The additional two protected files were observed at the start of this step, not retroactively certified against unarchived historical bytes.

## Actual engine evidence

`evidence/2026-11-18-workflow-native/smoke.json` passed with actual saved Blueprint ticks and native files:

- Native prepared/applied acknowledgements.
- Fractional revision and coerced boolean rejected; maximum safe integer revision9007199254740991 accepted.
- Fresh higher revision recovery, wrong-scope hold, closed hold, and same-process rebind refusal.

`runtime.json` passed with151 movement/status samples. The actual Node browser controller and HTTP handlers called the real loopback Python companion, wrote actual private frames, and received real Blueprint acknowledgements. `native_ack_fixture=false`. Browser controller detached before the walk phases. Real native AI navigation and animation gave:

- Film leisure animation curve1.0 after walking to the film room.
- Busy interrupted leisure0.2875s after the source observation and returned home; final distance92.21cm includes the capsule centre height relative to the home navigation point, within the95cm test bound.
- Fresh idle resumed walking, measured25cm/s at the first movement observation.
- A2s lease expired across2.7s real pause while world time advanced0.0s; native state became unknown/hold.
- Closure, expired replay and another visit in the same world remained held; peer characters remained unchanged.
- Actual native screenshot: `Workflow_native_film.png`. No NPC teleport was used. The temporary camera/player positioning was test-only, PIE ended, and no test activation or temporary actors were saved.

`audit.json` passed after reopening the saved level in interactive editor PID728. `cold-asset-audit.json` passed in a separate fresh commandlet process PID48872, exit0, loading the Blueprint/class defaults and hashing the map/protected files. It did **not** load the world or repeat gameplay.

An earlier optional headless world audit failed with EXCEPTION_ACCESS_VIOLATION in LevelEditor while calling the interactive level-loading path (commandlet exit1). Its log is retained as `independent-audit-failed.log`; it is not acceptance evidence. No cold-world/gameplay or independent reviewer acceptance is claimed. The safer separate-process asset-only audit and interactive saved-world audit cover different scopes.

## Code verification

Final `verification.json` captures seven real process exit codes, all0: Node75/75, companion Python70/70, workflow/legacy/activity transports, SQL3/3 and scoped strict TypeScript with0 diagnostics. No packages were installed. SQL uses disposable network-isolated cached postgres:16 fixtures, no production data. Full app typecheck and Next build were not run.

The headless transport/unit suites explicitly use `workflow_ack_fixture.py` to simulate the native side. Those are separate from the actual PIE test, whose harness does not import that fixture. Their native claim must not be conflated.

During development, missing native preparation exposed a lock held across relay invalidation; that deadlock was fixed and the missing-ack test now passes. An earlier regression run hit a transient Windows PermissionError in an old fixture reading atomically replaced files. The fixture now retries only PermissionError/FileNotFoundError for at most0.5s; malformed JSON and persistent failures still fail. The earlier red receipt/log is retained alongside the final green logs. No runtime guarantee is inferred solely from that fixture retry.

Re-run focused code verification with `scripts/office-launcher/verify_office_workflow.py --node-path <existing node_modules> --receiver <existing pure receiver> --output <new empty evidence directory>`. Native builders/tests require the existing project, matching saved source map and protected baseline. Run `audit_office_workflow_native.audit(...)` inside the interactive editor only. `audit_office_workflow_cold_asset.py` is the separate-process asset/default check. Native test scripts and fixtures are not imported by the installed launcher.

## Remaining integration

The canonical `Saved/OfficeWorkflowInstall/installation.json` is absent. Isolated preview receipts deliberately do not satisfy `canonical_saved_workflow_v1`. No canonical map transaction, separate canonical finalizer/runtime/audit proof or installed bootstrap upgrade was performed. The strengthened guard still requires that complete chain, reviewed dependencies and hashes. Old installed activity receipts cannot certify the changed module set.

Next: complete canonical installation/rollback and independent-process world/runtime evidence using an appropriate full editor/game launch, then the existing migration/base-commit and owner/session/upstream TLS deployment checks. Continue with the established Familje binding only. Do not fabricate installation receipts from this preview evidence or enable production flags to bypass the remaining work.

Engine log copies in Git trim trailing whitespace; original engine log bytes remain in the original PC test-output directory.
