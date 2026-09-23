# Phase 0 — Scope and Findings

**Status:** Canonical v0.2 · revised 2026-09-23

**v0.2 correction (owner review before merge):** v0.1's audit missed a
canonical Mission concept that already exists one layer above SDF-1A —
Chapter 20's Executive Mission Brief V1 (`lib/atlas/mission/types.ts`) and
Chapter 21's Delegation Envelope / Work Package chain
(`lib/atlas/delegation/*`, `lib/atlas/workpackage/*`). MISSION-CONTRACT.md
was rewritten (v0.2) to map onto these real types instead of inventing a
parallel `Mission` schema. RISK-AND-AUTHORITY.md, MODEL-ROUTING.md and
EVALUATION-GATES.md were each corrected to match — see their own v0.2
changelog notes. §2 and §4 below reflect the corrected audit and design.

## 1. What this phase is

Phase 0 establishes the canonical vocabulary and interface recommendations
for delegating software-development missions to a coding worker
(Claude/Codex/other). It is **documentation and design only**. No runtime
code, dispatcher, provider wiring, or CI change ships in this phase.

## 2. Repository audit summary (base: `origin/main` @ `df2e66daaba8de9bca635995b107782a33f594fa`)

**The single most important finding: Omnira already has a mature, merged
execution-free stack for "bounded code work" missions**, built across three
already-merged branches (internally called SDF-1A/1B1/1B2), plus one
**unmerged, paused** branch (SDF-1C1, broker/device identity — per repository
discipline, not touched, not restarted, not built on by this phase):

| Slice | State | What it is |
|---|---|---|
| SDF-1A (`lib/atlas/code-work/{types,lifecycle,patch-protocol,path-policy,policy,capability,command-registry,evidence,worker-registry,repository-registry}.ts`) | Merged (main) | Pure, execution-free mission/admission contracts, lifecycle state machine, capability allow/forbid list, evidence vocabulary |
| SDF-1B1 (`lib/atlas/code-work/control-plane/store.ts` + migration) | Merged (main) | Postgres persistence, fencing tokens, hash-chained receipts |
| SDF-1B2 (`control-plane/operator-*.ts`, `CodeWorkDetail.tsx`, `CodeWorkReviewCard.tsx`) | Merged (main) | Human review/grant/deny/cancel surface, reusing the existing `AuthorizationStatus` vocabulary |
| SDF-1C1 (`apps/code-broker/`, `lib/atlas/code-broker/*`) | **Unmerged, paused** (`feat/omnira-sdf1c1-broker-identity`, worktree only) | Cryptographic device/broker identity for a human's own machine, distinct from the worker identity in SDF-1A |

**The load-bearing gap: no dispatcher exists anywhere in this stack.** SDF
has built the contract, the persistence, and the human-review surface, but
nothing that actually invokes a model, streams patch operations back, or
enforces stop-conditions at runtime. That gap is precisely where this
Phase 0's design is meant to eventually connect: the canonical
`MissionRecord → DelegationEnvelope → WorkPackage` chain, translated
(MISSION-CONTRACT.md) into `CodeWorkAdmissionV1`, then routed
(CONTEXT-ROUTING.md, MODEL-ROUTING.md) and verified (EVALUATION-GATES.md) —
as the missing execution layer for the contract that already exists, not as
a parallel Mission schema.

**A second, equally important finding, added in v0.2: Omnira already has a
canonical Mission, one layer above SDF-1A.** Chapter 20's Executive Mission
Brief V1 (`lib/atlas/mission/types.ts`, `MissionRecord`) is a mature, typed
mission object with `objective`, `successCriteria`, `allowedActions`/
`forbiddenActions`, `tools`, `dataScope`, `risks` (`low`/`medium`/`high`
severity — a **third** risk vocabulary, distinct from both Chapter 18's
L0–L6 and this phase's Mission Risk Level 0–3), `approvalGates`,
`escalationTriggers` (escalates to a **human** role, never a model),
`stopConditions`, `evidenceRequirements`, `budget`, and — most importantly —
`authority`/`authoritySource`/`authorityRecord`, which already separates
capability from authority at the Mission level. Chapter 21's
`DelegationEnvelope` (`lib/atlas/delegation/*`) and `WorkPackage`
(`lib/atlas/workpackage/*`) sit between the Mission and SDF-1A: "Mission ⊇
Delegation Envelope ⊇ Work Package," and SDF-1A's `CodeWorkGovernancePins`
already pins into exactly this chain (`mission.{id,version,hash}`,
`delegation.{envelopeId,hash}`, `workPackage.{id,hash}`). **v0.1 of
MISSION-CONTRACT.md invented a new `Mission` schema that ignored this chain;
v0.2 replaces it with a mapping onto these real types instead.**

Other reused/adjacent architecture (do not duplicate — see each doc's
references):

- `lib/atlas/authorization/*` — canonical human-authorization vocabulary,
  already stating the same "capability ≠ authority" principle this
  workstream is built on (§10.4).
- `lib/ai/anthropic.ts` (`getAnthropic`) — the one governed model chokepoint
  that exists; Anthropic-only today, no generic provider abstraction.
- `lib/atlas/knowledge/*`, `lib/atlas/memory/*` — existing Knowledge Provider
  and Atlas Memory; Memory is currently largely starved (verify counts before
  relying on recall).
- `lib/atlas/isolation.ts` — project isolation.
- Chapter 18 — Autonomy Licensing Model (`docs/architecture/executive-intelligence/.../chapter-18-autonomy-licensing-model.md`)
  — a **different**, already-canonical L0–L6 vocabulary for production
  workflow autonomy. Explicitly disambiguated in RISK-AND-AUTHORITY.md §0 to
  prevent collision with this phase's Mission Risk Level 0–3.
- `.github/workflows/*-boundary.yml` — the existing narrow, anti-skip-floor
  CI gate pattern EVALUATION-GATES.md follows.

**Worker capability, verified against source (MODEL-ROUTING.md §1a):**
SDF-1A's only registered worker, `claude_patch_v1`, has `toolAccess`,
`shellAccess`, `gitAccess`, `directFilesystemAccess`, and
`workerNetworkAccess` all set to `'none'`/`false`, and requires
`vmBackedLinux: true` isolation. A dispatcher for this worker would produce
structured file-operation proposals only — it is **not** equivalent to
running Claude Code or Codex autonomously, and must never be made so by
loosening these flags.

No G1–G25 canonical governance backlog document was found in this repository
— those are informal workstream tags used in commit messages and code
comments only. This phase does not invent one.

## 3. File scope of this PR

```
docs/autonomy/README.md
docs/autonomy/PHASE-0.md
docs/autonomy/MISSION-CONTRACT.md
docs/autonomy/RISK-AND-AUTHORITY.md
docs/autonomy/MODEL-ROUTING.md
docs/autonomy/CONTEXT-ROUTING.md
docs/autonomy/EVALUATION-GATES.md
```

No file outside `docs/autonomy/` is touched. No existing file is modified.

## 4. Smallest implementable next slice

**Status: implemented as Phase 1A, PR #269 (`apps/web/lib/atlas/code-work/mission-translation/`).**
The text below is kept as the design record; it now describes what shipped,
not a future proposal.

The smallest safe next step is **not** a dispatcher (that's a much larger,
higher-risk piece requiring real process execution, real model calls, and
real stop-condition enforcement under load). Given how mature SDF-1A/1B1/1B2
already are, the smallest *safe and obviously non-duplicative* next slice
turned out to be:

**A live Work Package evaluation → Admission translator** — a pure function,
in the same execution-free spirit as SDF-1A itself, gated on
`resolveWorkPackage()`'s own live-usability check rather than trusting a
stored `WorkPackage`'s contract data alone (MISSION-CONTRACT.md §5 has the
full rationale, including why the input is `WorkPackageEvaluation` and not a
raw `WorkPackage`):

```ts
// Actual location: apps/web/lib/atlas/code-work/mission-translation/translate.ts
// (a new sibling subdirectory of code-work/, not a new top-level file — see
// the closed-file-list note below)

function translateWorkPackageToAdmission(
  evaluation: WorkPackageEvaluation,    // caller already called resolveWorkPackage();
                                         // rejected if !evaluation.usable
  riskLevel: 0 | 1 | 2 | 3,             // docs/autonomy/RISK-AND-AUTHORITY.md §2
  bindings: CodeWorkMissionBindings,    // docs/autonomy/MISSION-CONTRACT.md §5 —
                                         // workId/repository/worktree/files/requiredCommandIds/worker,
                                         // ALL resolved by the caller from live state
): MissionTranslationResult
```

Properties this function has, by direct analogy to SDF-1A's existing
modules:
- Gated on live usability: rejects immediately if `evaluation.usable` is
  `false`, before touching anything else. A stored Work Package's own
  `authority`/`allowedActions`/`tools` are contract data, not proof it is
  still usable now.
- Pure and non-authoritative — no I/O, no Git, no model call, no DB write,
  and **no minted hash, id, or authorization target of its own** (same
  discipline as `lib/atlas/code-work/policy.ts` and `control-plane/derive-admission.ts`,
  which already take a real `WorkPackage` as an input to check against, never
  as something to derive).
- Rejects, never broadens: when `evaluation.workPackage`'s declared
  capabilities exceed what `capability.ts` permits, when `riskLevel` has no
  policy defined, when a `requiredCommandIds` entry has no matching
  `CodeWorkCommandId` (EVALUATION-GATES.md §1a), or when the supplied
  `workId` is not UUID-shaped (SDF-1B's real persistence column is Postgres
  `uuid`; SDF-1A's own contract layer is deliberately unaware of that,
  so this translator carries the one check SDF-1A cannot) — every one of
  these is a rejection, never a silent broadening of scope.
- Produces a `CodeWorkAdmissionV1` that is then handed to the **existing**
  SDF-1A admission validator (`policy.ts`) unchanged — this function's output
  must pass the same gate a hand-built admission would, and
  `validateCodeWorkPackageAttenuation` still re-checks it against the real
  `WorkPackage`, exactly as it does today.
- The default worker identity is read from `worker-registry.ts`'s
  `CLAUDE_PATCH_V1`, never a second copy of `provider`/`modelId`.
- Adds zero new persistence, zero new authorization vocabulary, zero new
  evidence classes — reuses SDF-1B1/1B2/`authorization/*`/`mission/*`/
  `delegation/*`/`workpackage/*` as-is.

**Architecture note found while implementing:** `code-work/` and its
`control-plane/` subdirectory are each guarded by a closed-file-list test
(`sdf1a-code-work-contracts.test.ts`, `sdf1b-control-plane-boundary.test.ts`).
The translator therefore lives in a new sibling subdirectory,
`code-work/mission-translation/`, mirroring the existing `control-plane/`
precedent, rather than as a new top-level file in either directory.

**Next step, not built:** design the dispatcher itself as its own,
separately reviewed, Level-2-risk phase (it is exactly the kind of "agent
runtime" change RISK-AND-AUTHORITY.md classifies as sensitive) — scoped
explicitly to `claude_patch_v1`'s actual, current capability
(MODEL-ROUTING.md §1a): structured file-operation proposals inside an
isolated worktree, not interactive tool/shell/git/network use. Full Claude
Code/Codex-equivalent worker support is a later, separately reviewed worker
adapter and sandbox/broker decision, not an assumed extension of this slice.

## 5. Non-goals (confirmed not touched by this PR)

Trading autonomy, production trading rules, autonomous production
deployment, autonomous merging, the complete Mission Runtime, a large
multi-agent framework, Omnira Memory replacement, project architecture
replacement, UI redesign, restarting SDF-1C1, Kubernetes, distributed
workload identity, a complete policy engine, or unrestricted
shell/network/filesystem authority for any agent.

## 6. External references (inspiration only, no dependency added)

Deep Agents, Microsoft Agent Framework, DSPy, mini-SWE-agent, OpenInference,
DeepEval, Inspect AI, Promptfoo, AgentCompass, OWASP Agent Control Standard,
Microsoft Agent Governance Toolkit, OpenID AuthZEN, Open Policy Agent,
OpenFGA, Kubernetes Agent Sandbox, MCP security guidance, LlamaFirewall,
SPIFFE/SPIRE. None are installed. Patterns from these may be extracted
selectively, behind Omnira-owned interfaces, in later phases.
