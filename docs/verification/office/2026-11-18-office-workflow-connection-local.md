# Office workflow visit — browser and companion continuation

A separately opted-in workflow visit now runs through the existing browser visit controller, owner-scoped server grant, fixed native read, private loopback handshake and atomic receiver output. After confirmed detach the browser transports no more status; the companion continues polling while its pinned game process lives. Busy reserves the selected Pling, complete idle permits leisure, unknown/expired/unavailable status holds. This remains a **local, uninstalled candidate**, not a production connection or proof of model/tool execution.

## Provenance and scope

Continues `feat/office-workflow-status-20261118` in `D:\Projekt\Omnira\Worktrees\office-workflow-status-20261118`, from server commit `f62f9f28ad630620d61fa79bf29d0abb7200fe31`. No new branch/worktree/PR was created. The branch still depends on the three unmerged Office commits documented in the server report. Main was not merged or modified.

The new read-only preflight returned `review_required`, suggesting PR #581 by metadata similarity. Its actual head/base, description and all 78 changed file paths were reviewed: it implements Familje-Stunden weekly social draft preparation, not Office transport, and contains **no Office/Campus file overlap**. Manual continuation decision `reuse_existing` and the original machine result are saved separately; the automated result was not rewritten or claimed as new-branch approval. PR #581 and its worktree were untouched.

## Behavior and boundaries

- `OfficeConnectionPanel` offers a new unchecked workflow-status checkbox only when a companion advertises `workflowProtocol: 1`. Step activity and workflow status are mutually exclusive choices. With no explicit selection, the grant remains identity-only.
- `OfficeVisitConnection` requires that capability, a matching new `workflow_state_v1` grant/protocol, fresh native projection for the exact visit/avatar/project/agent, consistent hold booleans, and an exact scoped confirm receipt. It does not publish server DTOs or downgrade to activity/identity when workflow scope fails.
- The existing relay gains an optional workflow capability (default false). Exact scope and immutable selection are enforced at prepare and confirm. No provisional attach may keep renewing after its 15-second pending deadline. Hide before confirmation revokes; confirmed hide detaches. Disconnect, process death, invalid source or authority expiry clears to explicit unknown/hold.
- `OfficeVisitClient.workflow_presence` uses the existing disposable bounded HTTPS worker and **only** `https://omniraos.se/api/atlas/office/visits/workflow/presence`. Certificate/hostname checks, no redirect following, dedicated in-memory visit secret, duplicate-key rejection and the existing total exchange deadline are retained. No browser cookie/session token is copied to the companion.
- The pure policy from the previously tested `SourceTools/WorkflowStatus20261118/workflow_state.py` is now owned in Git as `office_workflow_state.py` for this companion; only its caller documentation changes. The external Unreal source remains untouched. The `PresenceReceiver` subclass composes that policy and uses the existing exclusive writer and atomic file writer.
- New private native frame schema: `omnira.office.workflow-presence.v1`. It contains only the exact visit binding, revision/times, reservation state/coverage, conservative native booleans and truthful identity/execution markers. It is **not** the test-only bridge format and does not make an arbitrary file writer authenticated. Re-reading a revision does not change the frame bytes or extend its monotonic deadline.
- Existing identity and step-activity paths retain their default protocol/shape. Same exact loopback origin/host/bearer, bounded POST bodies, no browser `/snapshot`, one writer, hard four-hour process budget and stop/revoke behavior remain in place.

The new standalone `office_workflow_visit.py --workflow-visit` is **not installed or URI-registered**. It refuses before game launch, output-directory creation, port or browser work unless `check_workflow_native` accepts a separate canonical installation. It has no URL/project/command/source override. The guard checks the exact source set, project/map/native consumer, dependency hashes and recorded closure acceptance, separate proof hashes/process IDs, committed artifact state and map rollback backup. This is local recorded-integrity checking, not remote device attestation.

**Actual current installation:** `Saved/OfficeWorkflowInstall/installation.json` does not exist on Hultgren. The proposed canonical `PrivateWorkflow/BP_OfficeWorkflowPresence` consumer, its real acceptance receipts, installer and expanded installed bootstrap are not produced by this change. Thus the candidate CLI cannot advertise this capability against the current Unreal installation. Synthetic guard fixtures are deliberately labelled as such; passing them is not native acceptance. Do not fabricate a receipt or rename the earlier test bridge.

## Verification

`2026-11-18-workflow-connection-verification.json` records actual process exit codes and matching logs:

| Check | Result |
| --- | --- |
| All Office Node tests, including real connect panel/controller | 75/75 pass |
| New workflow receiver/relay/client/integrity tests plus legacy companion regressions | 63/63 unittest pass |
| Workflow browser → HTTP → loopback companion → receiver/file | Pass; 3 native source reads, idle → busy → idle after browser detach; process exit clears to unknown/hold and revokes |
| Existing identity visit transport | Pass |
| Existing step-activity bundled-entry transport | Pass |
| Existing and new disposable PostgreSQL fixtures | 3/3 pass |
| Strict Office policy/HTTP/browser/controller/connect-panel import graph | 0 diagnostics |
| `git diff --check` | Pass |

The integrated transport uses actual browser-controller code and HTTP handlers over real local HTTP/loopback sockets, real Python relay/receiver and real atomic files. Owner authentication, DB RPC rows, upstream HTTPS socket and game-process lease are **synthetic**. Browser detach is a controller operation in the test, not a real authenticated browser session. No live TLS, genuine owner login, installed workflow bootstrap or Unreal gameplay is claimed. Earlier native gameplay evidence in the main report remains historical, separate evidence.

Regression exercises include absent capability, default scope, conflicting consent, downgrade/foreign binding/expired acknowledgment, held/lost confirm, late source after game exit, replay, source failure, explicit disconnect, expiry, missing/changed native/source/proof artifacts, and refusal before side effects without native acceptance. The production HTTPS construction test uses a doubled socket; the existing worker deadline tests cover stalled DNS/body reads.

A second self-review checked provisional ownership, late-response rejection, replay/deadline stability, native proof/dependency coverage, rollback scope, UI disclosure and legacy behavior. It tightened the new integrity gate to hash recorded native dependencies and reject redirected files, missing/null artifact hashes and duplicate transaction order. This was **not independent agent review**.

Reproduce with the expanded existing runner:

```powershell
python scripts/office-launcher/verify_office_workflow.py --node-path <existing-node_modules> --receiver <existing-workflow_state.py> --output <verification-directory>
```

It borrows existing dependencies only for its subprocesses, performs no installs and uses the already-cached network-isolated `postgres:16` fixtures. Logs/receipt from this continuation have a separate dated prefix and do not replace the earlier server checkpoint.

## Activation and preservation

No production schema, ledger, environment flag, credential, workflow, model, voice, schedule or service was changed. No new paid dependency, push, PR, merge or deployment. The existing URI handler and installed bundle were not altered. Changed source hashes mean the old activity-installation receipts cannot certify a **newly rebuilt** bundle; leave the currently installed bundle intact until a separately reviewed full upgrade is accepted. No old integrity check was relaxed.

The new workflow migration from the server checkpoint is unchanged and still unapplied outside disposable fixtures. The canonical count remains 178 against the unchanged expected 177; no full-build or release readiness is claimed. Full app build/typecheck, actual browser CORS/TLS/login, native workflow consumer/install/expanded-bootstrap acceptance and production query profiling remain gates.

The review map stays at SHA256 `548020997112717cb84b0c6c5fbaf79baeb17336345314bbf14698ff65e03b67`. The old Office worktree's pre-existing modified generated design bundle stays at `f4a4c921a78d721e58f163438cfd69ce45a5546dbff3db0061ce1dc4f2c62c16`. No Unreal asset, old worktree or active native installation was written in this step.

Next is a separately saved ordinary native consumer for the new frame, staged actual tick/leisure/return/expiry tests, full dependency and install acceptance plus the complete fixed installed bootstrap. After that, reviewed migration/base integration and a genuine signed-in owner visit may establish a live chain. Keep production activation disabled until those checks and the concrete activation review are complete.
