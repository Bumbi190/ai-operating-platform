# Office workflow reservation status — local server candidate

A new, dormant server scope can distinguish a complete selected-agent workflow census from unavailable data. An authorized fresh empty census permits leisure; active workflows reserve the selected Pling; incomplete or contradictory data holds the avatar at its office. This is workflow reservation, **not proof of model/tool execution**. The native production transport is not connected by this change.

## Scope and provenance

- Work ID: `OFFICE-WORKFLOW-STATUS-20261118`.
- Branch: `feat/office-workflow-status-20261118`.
- Isolated Windows worktree: `D:\Projekt\Omnira\Worktrees\office-workflow-status-20261118`.
- Base: `62074441ba3270a253477a6eaeb0a306ff68b995` from the existing Office worktree. **This is not main.** It includes three local Office commits (`062668e`, `6a04ed9`, `6207444`) which main does not contain. Their integration remains a separate dependency.
- Main observed during preflight: `8f73dfc21be4bb9e3656e3bf53b5c651a9ea66f4`. Approved new-branch receipt: `2026-11-18-workflow-preflight.json`.
- Original Office worktree remains unchanged, including its pre-existing modified generated design bundle (SHA256 `f4a4c921a78d721e58f163438cfd69ce45a5546dbff3db0061ce1dc4f2c62c16`).

## Server behavior

`POST /api/atlas/office/visits/workflow` creates a **new** `workflow_state_v1` grant with explicit string `nativeWorkflowProtocol: "1"`, same-origin verified owner and live session. It reuses the existing quota, fresh UUIDv7, selected project/agent checks and established `office-familje-pling` avatar. It does not silently upgrade identity/activity grants or add new avatar mappings.

`POST /api/atlas/office/visits/workflow/presence` accepts only the dedicated native visit secret boundary; cookie, browser origin and bearer-token fallback remain rejected. SQL rechecks live owner/session/project/agent membership and revocation before renewing the existing visit lease and increasing its scoped revision under a row lock. Workflow data is read only; visit metadata is written. The existing revoke endpoint handles this scope too.

Both new routes return unavailable before auth/RPC work unless the server process has the exact environment value `OMNIRA_OFFICE_WORKFLOW_STATUS_ENABLED=true`. No environment configuration was changed. Runtime is Node, dynamic and uncached. Existing routes retain their behavior and use the extracted shared owner/RPC adapter.

The classifier inspects stored run snapshots for the exact selected project and agent, not current workflow templates or project totals:

| Evidence | Decision |
| --- | --- |
| Complete census, no nonterminal selected-agent workflow | `idle`, complete |
| Valid pending/running/awaiting-approval selected workflow | `busy`, complete |
| Running claim expired, missing or contradictory | `unknown`, incomplete |
| Malformed membership, missing schema or a 12-candidate cap hit | `unknown`, incomplete |
| Unknown/contradictory terminal state involving the selected agent | `unknown`, incomplete |

All candidate snapshots are validated before unrelated agents are skipped. Normal finished `done/failed/cancelled/rejected` rows are excluded; ambiguous rows cannot disappear into an idle decision. Candidate count is bounded before unpacking JSON, each snapshot has 1–100 typed steps with unique orders. This bounds inspected candidates, **not scanned rows or total snapshot bytes**; production query/index profiling is still required.

The HTTP response is the existing exact 12-key `omnira.office.workflow-state.v1` DTO with `execution: not_verified`. No run IDs, raw facts, claim IDs, prompts, logs, inputs, names, credentials or session IDs are exposed in it. Validity is at most 20 seconds and additionally bounded by the visit and any running claim. It is a point-in-time observation, not a lock preventing future workflows from starting.

## Verification on Hultgren

`2026-11-18-workflow-verification.json` records real subprocess exit codes, with captured logs beside it:

- All `test_office*.cjs`: **65/65 pass**, including 14 new policy/HTTP/server-route tests and existing Office authentication/activity/UI regressions.
- **3/3 PostgreSQL unittest fixtures pass** using the already-cached `postgres:16` image. Owned disposable containers have `--network none`, no published ports, synthetic identities/content, tmpfs storage and explicit cleanup.
- The new SQL fixture checks old scopes, no replay upgrade, wrong secret, owner change, moved agent, logout, revocation, missing columns, malformed/oversized membership, unrelated selection, cap hits, function privileges and real trusted/unprivileged SQL roles. Six concurrent successful reads produce six distinct consecutive revisions.
- Six actual local SQL results pass through the real HTTP handler with a mocked RPC transport, then the existing pure native receiver: idle → pending busy → running busy → expired-claim unknown → contradictory-terminal unknown → normal-terminal idle. Receiver expiry then returns unknown/hold. RPC/network authentication in this fixture is synthetic; this is **not a live Supabase/native connection**.
- External receiver SHA256: `357e20238a0ca21329b9c630b786dd71ed8e4d25f6c92e9c69d7b33ec1cbfe19` from `SourceTools\WorkflowStatus20261118\workflow_state.py`; it was imported read-only, not copied or edited.
- Strict TypeScript check of the pure Office policy/HTTP import graph: **0 diagnostics**. Server adapters and route wiring are exercised by runtime tests. Whole-app typecheck, Next build and a real PostgREST/session flow were not run; no full-build acceptance is claimed.
- `git diff --check` passes. The existing native WorkflowBridge map remains at SHA256 `548020997112717cb84b0c6c5fbaf79baeb17336345314bbf14698ff65e03b67`. This step did not run PIE or modify Unreal assets.

Reproduce from this worktree with existing dependencies and cached Docker image:

```powershell
python scripts/office-launcher/verify_office_workflow.py --node-path <existing-node_modules> --receiver <existing-workflow_state.py> --output <verification-directory>
```

The receiver option is an optional cross-project fixture input. Without it, the database/HTTP tests still run and the receipt states that native receiver integration was not requested. The separate historical `test_presence_contract.cjs` is a standalone CLI requiring Campus/output arguments; it is not included in the `test_office*.cjs` runner.

Early local harness attempts failed due to nested PowerShell environment expansion and then invoking that standalone CLI without arguments; no product test failure was hidden. The final Python runner captures exit codes without shell pipelines, avoiding PowerShell's stderr-as-error formatting for successful unittest output.

## Deployment boundary and remaining integration

Migration `20261118093000_office_workflow_state.sql` is new and was applied only to disposable fixtures. Existing migration files and the migration guard were not edited. The source-only guard correctly blocks with **expected 177 canonical SQL files, observed 178** (`2026-11-18-workflow-migration-source-gate.json`). Production ledger was not queried. Do not bypass the guard or call this candidate release-ready; canonical count reconciliation and reviewed migration application remain necessary.

No push, PR, merge, deployment, production schema/credential/role change, new spend, real visit or workflow execution occurred. Only the existing single Familje avatar mapping is supported here. Prompt/Handlar remain unbound in production.

Next implementation is a separately negotiated browser/companion workflow capability and authenticated ordinary native transport, with immutable verified bindings, safe detach/revoke behavior, stale-data hold and installation hashes. The test-only JSON bridge must not be renamed into a production transport. Keep the feature flag absent/off until that chain, the base dependencies, migration governance and production review are complete. Rollback before deployment is simply leaving this local branch unused; no live rollback is needed.
