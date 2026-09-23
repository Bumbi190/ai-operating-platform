# Mission Contract

**Status:** Canonical v0.2 (Phase 0 — schema recommendation, not implemented) · revised 2026-09-23

**v0.2 correction:** v0.1 of this document invented a standalone `Mission`
schema. That was wrong — Omnira already has a canonical **Mission**, and this
revision replaces the invented schema with a mapping onto it. Read §0–§2
before anything else in this file.

## 0. Omnira already has a canonical Mission — do not invent another one

**Chapter 20 — Executive Mission Brief V1** (`apps/web/lib/atlas/mission/types.ts`,
805 lines, `MissionRecord`) is the real, structured, typed Mission in this
codebase. It already has: `objective`, `inScope`/`outOfScope`,
`successCriteria` (`MissionSuccessCriterion[]`), `allowedActions`/
`forbiddenActions` (`MissionActionBound[]`), `tools` (`MissionToolBound[]`),
`dataScope` (`MissionDataScope[]`), `risks` (`MissionRisk[]`, severity
`low`/`medium`/`high`), `approvalGates` (`MissionApprovalGate[]`),
`escalationTriggers` (`MissionEscalationTrigger[]`, escalating to a **human**
role — manager/project_executive/portfolio_executive/founder/governance/
specialist_reviewer), `stopConditions`/`pauseConditions`
(`MissionHaltCondition[]`), `evidenceRequirements`
(`MissionEvidenceRequirement[]`), `budget` (`MissionBudget`), and —
critically for §3 below — `authority` + `authoritySource` +
`authorityRecord`, which already separates *what the mission may decide*
from *why it is allowed to*.

It flows, per Chapter 21: **Mission ⊇ Delegation Envelope ⊇ Work Package**
(`lib/atlas/delegation/types.ts`'s `DelegationEnvelope`, `lib/atlas/workpackage/types.ts`'s
`WorkPackage`) — "Its parent is the Delegation, not the Mission" is the
module's own stated invariant. SDF-1A's `CodeWorkGovernancePins` already pins
into this exact chain: `mission.{id,version,hash}`, `delegation.{envelopeId,hash}`,
`workPackage.{id,hash}`.

**This document does not define a new Mission.** It defines the
**code-work-specific fields a `WorkPackage` must carry (or that a Mission's
existing bound fields must be populated with) when a Work Package is handed
to a coding worker**, and how that Work Package translates into SDF-1A's
`CodeWorkAdmissionV1`. Anywhere this document previously used the bare word
"Mission" to mean a new object, read it as "the governing `MissionRecord`
this Work Package descends from" instead.

## 1. Purpose

A coding-worker delegation is the last hop of an existing chain:

```
MissionRecord (Ch.20, lib/atlas/mission)
  → DelegationEnvelope (Ch.21, lib/atlas/delegation)
    → WorkPackage (Ch.21, lib/atlas/workpackage)
      → CodeWorkAdmissionV1 (SDF-1A, lib/atlas/code-work)  ← this document's actual subject
```

Nothing in this chain is a grant of authority by itself. A `WorkPackage`
"has been RECEIVED, not started" (its own module doc). Authority is proven
only by a live `MissionAuthorityRecord`/`AuthorizationStatus`, never by the
existence of any object in this chain — see §3.

## 2. Relationship to SDF-1A/1B1/1B2 — read this before designing anything

`apps/web/lib/atlas/code-work/` (SDF-1A/1B1/1B2) is a mature, merged,
execution-free contract for exactly one Work Package class: bounded code
work.

- `types.ts` defines `CodeWorkAdmissionV1`: the governance pins above, a
  repository binding, a pinned worker (`provider`, `modelId`, `adapterId`,
  `outputProtocol`), file-scope limits, an allowed-command-**id** list
  (`commands.approvedCommandIds: string[]` — not shell strings, see §4),
  numeric limits (`SDF1_LIMITS`), and required evidence classes.
- `lifecycle.ts` defines the state machine
  (`proposed → authorized → claimed → preparing → working → testing →`
  one of eight terminal states).
- `control-plane/store.ts` (SDF-1B1) persists runs with fencing tokens and a
  hash-chained receipt trail.
- `control-plane/derive-admission.ts` shows the **real** construction path
  today: a caller supplies a candidate `admission` plus a real `WorkPackage`;
  `deriveCodeWorkProposal` validates the admission, then calls
  `validateCodeWorkPackageAttenuation(workPackage, admission)` to prove the
  admission is contained inside that Work Package's own bounds, before
  hashing anything. **The Work Package is the source of truth the admission
  is checked against — a translator does not get to assert its own
  containment.**
- `control-plane/operator-*.ts` (SDF-1B2) is the human grant/deny/cancel
  review surface, built on the existing `AuthorizationStatus` vocabulary.
- **What SDF does not yet have: a dispatcher.** Nothing in this stack invokes
  a model, spawns a process, or applies a patch.

`feat/omnira-sdf1c1-broker-identity` (device/broker identity) is an
**unmerged, paused branch**. This Phase 0 does not build on it or assume it
will land as designed.

## 3. Fields — mapped onto real types, not reinvented

| This document's concept | Real backing type / field | Notes |
|---|---|---|
| Mission/work identity | `MissionRecord.missionId`, `WorkPackage.id` (Chapter 20/21) | Never invented by a translator — see §5. |
| `projectId` | `MissionRecord.projectId` | Must resolve inside `lib/atlas/isolation.ts`'s project boundary. |
| `repository` | New, SDF-1A-specific: `CodeWorkRepositoryBinding` (`types.ts`) | Chapter 20/21 have no repository concept — this is a legitimate code-work-only addition, carried on the `WorkPackage`, not the Mission. |
| `objective` | `MissionRecord.objective` | Reused verbatim — not re-authored per Work Package. |
| `acceptanceCriteria` | `MissionRecord.successCriteria` (`MissionSuccessCriterion[]`) | Reused, not duplicated. |
| `scope` | `MissionRecord.inScope` / `outOfScope` (string[]) | Reused. |
| `allowedPaths` / `forbiddenPaths` | New, SDF-1A-specific: `CodeWorkFilePolicy` (`path-policy.ts`) | Chapter 20's `MissionToolBound.restriction` is prose-shaped ("e.g. read-only, specific paths"); SDF-1A's path policy is the actual enforced, glob-checkable boundary. A code-work Work Package must populate SDF-1A's path policy, not rely on `MissionToolBound`'s free-text restriction for enforcement. |
| `allowedCapabilities` / `forbiddenCapabilities` | `MissionRecord.allowedActions` / `forbiddenActions` (`MissionActionBound[]`) at the Mission level; **enforced** at the code-work level by SDF-1A's `capability.ts` (`CODE_WORK_OPERATION_FAMILIES` / `CODE_WORK_FORBIDDEN_OPERATION_FAMILIES`) | A Work Package's declared capabilities must be a subset of what the Mission already allowed **and** a subset of what `capability.ts` permits. Neither layer may be skipped. |
| `riskLevel` (0–3) | **New** — see RISK-AND-AUTHORITY.md | Distinct from `MissionRecord.risks` (`MissionRisk[]`, named risks with `low`/`medium`/`high` severity). Mission Risk Level is a single overall promotion-oversight tier for a code-work Work Package; it may be *informed by* `risks`, but does not replace or renumber it. Never conflate the two scales. |
| `requiredChecks` | New — check-outcome ids, see §4 | Distinct from `MissionRecord.evidenceRequirements`, which is broader (screenshots, metrics, production observation). `requiredChecks` is specifically the deterministic-gate subset relevant to code work. |
| `requiredReview` | Derived from `riskLevel` policy (RISK-AND-AUTHORITY.md) | Independent-reviewer requirement; not itself an authority grant. |
| `authority` (required) | `MissionRecord.authority` (`MissionActionBound[]`) + `authoritySource` (`MissionAuthoritySource`) + a live `authorityRecord`/`AuthorizationStatus` proof | **Required on every Work Package, at every risk level.** See §5 — this replaces v0.1's `approvalPolicy: null`, which was ambiguous about whether "no policy" meant "no authority." It never does. |
| `humanApprovalRequired` (optional, in addition to `authority`) | `MissionRecord.approvalGates` (`MissionApprovalGate[]`) / `MissionGateResolution` | A **separate**, additional gate a specific risk level may require on top of `authority` — never a substitute for it. |
| `contextReferences` | Pointers into `lib/atlas/knowledge/*` / `lib/atlas/memory/*` | See CONTEXT-ROUTING.md. |
| `preferredWorker` | **New** — no Chapter 20/21 equivalent | A hint, not a binding pin (see MODEL-ROUTING.md). Today only `provider: 'anthropic'`/`adapterId: 'claude_patch_v1'` is wired. |
| `workerRetryEscalation` | **New**, and distinct from `MissionRecord.escalationTriggers` | `MissionEscalationTrigger` escalates a *mission condition* to a **human** role. This field escalates a *failed worker attempt* to a **stronger worker/model**, bounded by `SDF1_LIMITS.maxWorkerIterations` (currently 2). Do not merge these two concepts — one names a person, the other names a model. |
| `completionDefinition` | `MissionRecord.completionConditions` (string[]) + `evidenceRequirements` + SDF-1A's `ready_for_human_review` terminal state | A Work Package is "complete" only when all three agree — never the worker's own claim. |

## 4. `requiredChecks` vs. executable command authority — these are not the same thing

`requiredChecks` describes **required evaluation outcomes** (e.g. "typecheck
passes," "the fixture test suite passes"). It is never a shell string and is
never translated into argv directly.

Executable commands come **only** from SDF-1A's registered command ids
(`lib/atlas/code-work/command-registry.ts`, `CODE_WORK_COMMANDS`). As of this
writing exactly two commands are registered:

- `sdf1.proof.typecheck` → `npm run typecheck` (fixed, no arguments)
- `sdf1.proof.fixture_test` → `vitest run lib/qa/sdf1a-code-work-contracts.test.ts`
  (one hardcoded enum value — not an arbitrary suite path)

**There is no registered command for lint, build, or an arbitrary Vitest
path.** A Mission→Work Package translation step that needs one of those
checks and finds no matching `CodeWorkCommandId` must **reject the
translation** with an explicit "unmapped required check" violation — it must
never fall back to constructing a shell string, and never silently drop the
check. This PR does not expand `CODE_WORK_COMMANDS`; doing so is a separate,
reviewable change to SDF-1A itself.

## 5. Authority is never inferred — the translator's real input shape

**Status update:** this slice is now implemented — see
`apps/web/lib/atlas/code-work/mission-translation/{types,translate}.ts`
(Phase 1A, PR #269). The shape below reflects what actually shipped, not
the earlier illustrative sketch.

A Mission→Admission translator must not manufacture `CodeWorkGovernancePins`,
a repository binding, or any hash. Those are authoritative bindings that
already exist elsewhere by the time translation happens — the translator's
job is to carry them through unchanged, not to derive them. It also must not
treat a stored `WorkPackage`'s own contract fields
(`authority`/`allowedActions`/`tools`) as proof that the package is usable
*right now*: a Delegation can be revoked, or a Mission can end, after a
Work Package was cut from it. The real chain is:

```
stored WorkPackage (contract data, lib/atlas/workpackage/types.ts)
  → resolveWorkPackage()                          (server-only, re-asks the live
                                                     Delegation/Mission chain)
    → WorkPackageEvaluation { usable, reason, workPackage, ... }
      → translateWorkPackageToAdmission()          (PURE — takes the evaluation,
                                                     refuses one that isn't usable)
        → CodeWorkAdmissionV1 candidate
          → validateCodeWorkAdmission / validateCodeWorkPackageAttenuation
            (existing, unchanged)
```

`resolveWorkPackage()` is `server-only` and does real reads, so the
translator never imports or calls it — exactly like
`control-plane/principal-write.ts`'s `proposeCodeWork`, it takes an
already-resolved `WorkPackageEvaluation` from its caller:

```ts
import type { WorkPackageEvaluation } from '@/lib/atlas/workpackage/types'
import type { CodeWorkFilePolicy, CodeWorkRepositoryBinding, CodeWorkAdmissionV1 } from '@/lib/atlas/code-work/types'

interface CodeWorkMissionBindings {
  workId: string                      // SDF-1B's own run identity — must be UUID-shaped
  repository: CodeWorkRepositoryBinding
  worktree: { branchPrefix: string }
  files: CodeWorkFilePolicy
  requiredCommandIds: string[]
  worker?: { provider?: string; modelId?: string; adapterId?: string; adapterVersion?: number; outputProtocol?: string; capabilityId?: string; capabilityVersion?: number } | null
}

function translateWorkPackageToAdmission(
  evaluation: WorkPackageEvaluation,  // caller already called resolveWorkPackage(); rejected if !evaluation.usable
  riskLevel: 0 | 1 | 2 | 3,
  bindings: CodeWorkMissionBindings,  // resolved by the CALLER from live state, never guessed
): { ok: true; admission: CodeWorkAdmissionV1; riskPolicy: unknown } | { ok: false; rejection: unknown }
```

Note there is no `mission`/`delegation` field in `CodeWorkMissionBindings`:
`evaluation.workPackage` already carries `missionId`/`missionVersion`/
`missionBoundHash`/`envelopeId`/`delegationBoundHash` directly (Chapter 21's
own field set), and the existing `validateCodeWorkPackageAttenuation`
already requires these to equal the admission's governance pins exactly —
a separate binding would only be a second place for them to drift.

Properties this function must have:

- **Gated on live usability, not stored contract data.** Rejects immediately
  if `evaluation.usable` is `false` — a stored Work Package's own
  `authority`/`allowedActions`/`tools` never substitute for the live check
  `resolveWorkPackage()` already performed.
- **Pure and non-authoritative.** It never mints a hash, a delegation id, a
  work-package id, or an `AuthorizationTarget`. Every field in `bindings` is
  supplied by a caller that already resolved it against live state (the same
  discipline `derive-admission.ts` already follows for `WorkPackage`).
- **Rejects, never broadens.** If `workPackage`'s declared capabilities
  exceed what `capability.ts` allows, if `riskPolicy` has no defined policy
  for the Work Package's risk level, or if a `requiredChecks` entry has no
  `CodeWorkCommandId` mapping (§4), the function returns
  `MissionTranslationRejection` — it never widens scope to make translation
  succeed.
- **Output still passes SDF-1A's own gate.** The produced `CodeWorkAdmissionV1`
  is handed to the existing `validateCodeWorkAdmission` (`policy.ts`)
  unchanged — this function's output is not trusted merely because it came
  from a translator.

## 6. Worked example

> Category: "Implement a scoped frontend/backend feature and return a tested PR."

This example shows the **Work Package-level fields** a code-work delegation
needs, assuming a `MissionRecord` already exists and has already authorized
this work (via `authority`/`authoritySource`/a live `AuthorizationStatus`
grant — not shown here, since that grant is a precondition, not a mission
field to invent).

```jsonc
{
  "workPackageId": "wp_2026-09-23_atlas-project-tag-filter",
  "missionId": "mission_...",            // real MissionRecord.missionId — resolved, not invented
  "projectId": "proj_omnira_core",
  "repository": {
    "provider": "github", "owner": "Bumbi190", "repo": "ai-operating-platform",
    "baseBranch": "main", "baseSha": "df2e66daaba8de9bca635995b107782a33f594fa"
  },
  "objective": "Add a tag filter dropdown to the Project Command Center list view.",
  "acceptanceCriteria": [
    "Selecting a tag filters the visible project list client-side",
    "No tag selected shows all projects (existing behaviour unchanged)",
    "New Vitest coverage for the filter logic"
  ],
  "allowedPaths": ["apps/web/app/projects/**", "apps/web/components/projects/**"],
  "forbiddenPaths": ["apps/web/lib/atlas/**", "supabase/migrations/**", "**/*.sql"],
  "allowedCapabilities": ["code.worktree.patch.v1"],
  "forbiddenCapabilities": ["git.commit", "git.push", "network.egress", "db.migrate"],
  "riskLevel": 1,
  "requiredChecks": ["sdf1.proof.typecheck"],
  "_note_on_requiredChecks": "Only registered command ids may appear here today (§4). A lint/build/arbitrary-suite check cannot be expressed until CODE_WORK_COMMANDS registers one — that is a separate SDF-1A change, not something this example may fabricate.",
  "requiredReview": { "independentReviewer": true, "humanApprovalRequired": false },
  "authority": { "resolvedFrom": "an existing, live AuthorizationStatus grant — required, never null" },
  "preferredWorker": { "provider": "anthropic", "adapterId": "claude_patch_v1" },
  "workerRetryEscalation": { "maxAttempts": 2 },
  "completionDefinition": {
    "completionConditions": ["see acceptanceCriteria"],
    "requiredChecks": ["see above"],
    "terminalState": "ready_for_human_review"
  }
}
```

This is a **Mission Risk Level 1** Work Package (RISK-AND-AUTHORITY.md): no
migration, no auth, no memory, no governance change. At Level 1 the target
policy is deterministic gates + independent review with no *additional*
standing human-approval gate — but `authority` is still required and
non-null, because capability is never authority (§0, §5).

## 7. What this is not

- Not a new Mission type. §0.
- Not a replacement for `CodeWorkAdmissionV1`, `DelegationEnvelope`, or
  `WorkPackage`. This document sits at the code-work-specific edge of a chain
  that already exists.
- Not a source of authority. `authority` only ever *references* an existing,
  live grant; it cannot invent permission, and `humanApprovalRequired` is
  additive to it, never a substitute.
- Not Claude-specific. `preferredWorker.provider` is a hint string, not an
  enum tied to one vendor.
