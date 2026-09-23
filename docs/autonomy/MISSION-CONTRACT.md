# Mission Contract

**Status:** Canonical v0.1 (Phase 0 — schema recommendation, not implemented)

## 1. Purpose

A **Mission** is the provider-neutral envelope Atlas hands to a Context
Router / Model Router when it wants a coding worker (Claude, Codex, or a
future worker) to do bounded, substantial work and return a tested,
independently reviewed pull request.

A Mission is a *proposal for delegated work*, not a grant of authority. It
carries no capability by itself — see [RISK-AND-AUTHORITY.md](./RISK-AND-AUTHORITY.md).

## 2. Relationship to the existing SDF stack — read this before designing anything

Omnira **already has** a mature, merged, execution-free contract for exactly
one class of mission — "bounded code work" — in
`apps/web/lib/atlas/code-work/` (internally called SDF-1A/1B1/1B2):

- `types.ts` defines `CodeWorkAdmissionV1`: governance pins (mission id/
  version/hash, authorization target, delegation envelope, work-package
  hash), a repository binding, a pinned worker (`provider`, `modelId`,
  `adapterId`, `outputProtocol`), file-scope limits, an allowed-command list,
  numeric limits (`SDF1_LIMITS`: max 2 worker iterations, max 8 changed
  files, max 131072 diff bytes, max 1200s total runtime), and the required
  evidence classes (`CODE_WORK_RECEIPT_CLASSES`).
- `lifecycle.ts` defines the state machine
  (`proposed → authorized → claimed → preparing → working → testing →`
  one of eight terminal states, including `ready_for_human_review`,
  `tests_failed`, `scope_violation`, `stale_base`, `policy_denied`).
- `control-plane/store.ts` (SDF-1B1) persists runs with fencing tokens and a
  hash-chained receipt trail.
- `control-plane/operator-*.ts` and
  `app/api/atlas/code-work/[workId]/route.ts` (SDF-1B2) are the human
  grant/deny/cancel review surface, built on the existing
  `AuthorizationStatus` vocabulary rather than a new one.
- **What SDF does not yet have: a dispatcher.** Nothing in this stack invokes
  a model, spawns a process, or applies a patch. `capability.ts` and
  `patch-protocol.ts` say so explicitly in their own comments.

**The Mission Contract defined below is not a competing schema.** It is the
outer envelope a Context Router / Model Router uses to decide *what kind of
work this is* and *who should do it*, before translating it into a
worker-specific admission contract. For the "bounded code work" mission
class specifically, that translation target is `CodeWorkAdmissionV1` —
**a future Mission→Admission translator should consume a Mission and emit a
`CodeWorkAdmissionV1`, not reimplement admission, lifecycle, persistence, or
evidence.** Other future mission classes (non-code work) would translate into
their own, not-yet-designed admission contracts.

`feat/omnira-sdf1c1-broker-identity` (device/broker identity for a human's
own machine) is an **unmerged, paused branch**. Per repository discipline,
this Phase 0 does not build on it, does not restart it, and does not assume
it will land as designed.

## 3. Fields

| Field | Type | Notes |
|---|---|---|
| `missionId` | string (stable id) | Maps to `CodeWorkGovernancePins.mission.id` when translated for code work. |
| `projectId` | string | Must resolve inside `lib/atlas/isolation.ts`'s project boundary. Never inferred from repository path alone. |
| `repository` | `{ provider, owner, repo, baseBranch, baseSha }` | `baseSha` pin exists so a stale base can be detected — SDF already has a `stale_base` terminal state for this. |
| `objective` | string (human-readable) | One or two sentences. Not itself an acceptance criterion. |
| `acceptanceCriteria` | string[] | Concrete, checkable statements. Feeds `completionDefinition` below and the reviewer's rubric. |
| `scope` | string (freeform description) | The intended shape of the change, for a human/reviewer's orientation — not enforced; `allowedPaths`/`forbiddenPaths` are what's enforced. |
| `allowedPaths` | string[] (globs) | Enforced at the capability boundary. Analogous to SDF-1A's path-policy allow-list. |
| `forbiddenPaths` | string[] (globs) | Always wins over `allowedPaths` on overlap. |
| `allowedCapabilities` | string[] (capability ids, e.g. `code.worktree.patch.v1`) | Must be a subset of what the worker's pinned adapter actually supports — never assumed. |
| `forbiddenCapabilities` | string[] | Explicit denials (e.g. `git.commit`, `network.egress`) — SDF-1A's `capability.ts` already forbids some of these unconditionally for all missions. |
| `riskLevel` | `0 \| 1 \| 2 \| 3` | See RISK-AND-AUTHORITY.md. Determines `requiredReview` and `approvalPolicy` floor. |
| `requiredChecks` | string[] (check ids) | Deterministic gates the output must pass — see EVALUATION-GATES.md. Never optional regardless of risk level. |
| `requiredReview` | `{ independentReviewer: boolean, humanApprovalRequired: boolean }` | The floor is set by `riskLevel`; a mission may require more, never less. |
| `approvalPolicy` | reference to an existing `AuthorizationTarget`/policy, or `null` for Level 0 | Must resolve through `lib/atlas/authorization/*`. A Mission never defines its own approval semantics. |
| `contextReferences` | `{ knowledgeRefs: string[], memoryRefs: string[], docRefs: string[] }` | Pointers, not payloads — see CONTEXT-ROUTING.md. |
| `preferredWorker` | `{ provider?: string, modelHint?: string, adapterId?: string }` (all optional) | A hint, not a binding pin — the Model Router may override it (see MODEL-ROUTING.md). Today only `provider: 'anthropic'` has a wired adapter (`claude_patch_v1`). |
| `retryEscalationPolicy` | `{ maxAttempts: number, escalateTo?: preferredWorker-shaped hint }` | SDF-1A currently hardcodes `maxWorkerIterations: 2` with no escalation; this field documents the target shape for when escalation exists, and must not exceed SDF's numeric limits until SDF itself raises them. |
| `completionDefinition` | `{ acceptanceCriteria: string[], requiredChecks: string[], terminalState: 'ready_for_human_review' }` | A mission is "complete" only when it reaches a terminal state that satisfies all three — completion is never merge, deploy, or the worker's own claim. |

## 4. Worked example

> Category: "Implement a scoped frontend/backend feature and return a tested PR."

```jsonc
{
  "missionId": "mission_2026-09-23_atlas-project-tag-filter",
  "projectId": "proj_omnira_core",
  "repository": {
    "provider": "github",
    "owner": "Bumbi190",
    "repo": "ai-operating-platform",
    "baseBranch": "main",
    "baseSha": "df2e66daaba8de9bca635995b107782a33f594fa"
  },
  "objective": "Add a tag filter dropdown to the Project Command Center list view.",
  "acceptanceCriteria": [
    "Selecting a tag filters the visible project list client-side",
    "No tag selected shows all projects (existing behaviour unchanged)",
    "New Vitest coverage for the filter logic"
  ],
  "scope": "One new filter component plus its wiring into the existing list view; no API or schema changes.",
  "allowedPaths": ["apps/web/app/projects/**", "apps/web/components/projects/**"],
  "forbiddenPaths": ["apps/web/lib/atlas/**", "supabase/migrations/**", "**/*.sql"],
  "allowedCapabilities": ["code.worktree.patch.v1"],
  "forbiddenCapabilities": ["git.commit", "git.push", "network.egress", "db.migrate"],
  "riskLevel": 1,
  "requiredChecks": ["tsc --noEmit", "next lint", "vitest apps/web/app/projects", "next build"],
  "requiredReview": { "independentReviewer": true, "humanApprovalRequired": false },
  "approvalPolicy": null,
  "contextReferences": {
    "knowledgeRefs": [],
    "memoryRefs": [],
    "docRefs": ["docs/architecture/... (Project Command Center design doc, if one exists)"]
  },
  "preferredWorker": { "provider": "anthropic", "adapterId": "claude_patch_v1" },
  "retryEscalationPolicy": { "maxAttempts": 2 },
  "completionDefinition": {
    "acceptanceCriteria": ["see above"],
    "requiredChecks": ["see above"],
    "terminalState": "ready_for_human_review"
  }
}
```

This is a **Level 1** mission (see RISK-AND-AUTHORITY.md): no database
migration, no auth, no memory, no governance change — so it may, once the
runtime exists, merge automatically after required checks plus independent
review, with no standing human-approval requirement per mission. It is not
wired to any production execution today.

## 5. What this is not

- Not a replacement for `CodeWorkAdmissionV1`. A Mission is upstream of it.
- Not itself a source of authority. `approvalPolicy` only ever *references*
  an existing authorization target; it cannot invent permission.
- Not Claude-specific. `preferredWorker.provider` is a hint string, not an
  enum tied to one vendor.
