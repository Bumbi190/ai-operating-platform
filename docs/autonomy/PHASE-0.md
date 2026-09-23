# Phase 0 — Scope and Findings

**Status:** Canonical v0.1 · 2026-09-23

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
Phase 0's Mission Contract → Model Router → Context Router → Evaluation
Gates design is meant to eventually connect — as the missing execution layer
for the contract that already exists, not as a parallel contract.

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

## 4. Smallest implementable next slice (design only — not built in this PR)

The smallest safe next step is **not** a dispatcher (that's a much larger,
higher-risk piece requiring real process execution, real model calls, and
real stop-condition enforcement under load). Given how mature SDF-1A/1B1/1B2
already are, the smallest *safe and obviously non-duplicative* next slice is:

**A Mission → Admission translator** — a pure function, in the same
execution-free spirit as SDF-1A itself:

```ts
// Recommended location: apps/web/lib/atlas/code-work/mission-translation.ts
// (beside, not inside, SDF-1A's existing pure validators)

function translateMissionToAdmission(
  mission: Mission,                    // docs/autonomy/MISSION-CONTRACT.md
  riskPolicy: RiskLevelPolicy,          // docs/autonomy/RISK-AND-AUTHORITY.md §2
): CodeWorkAdmissionV1 | MissionTranslationRejection
```

Properties this function must have, by direct analogy to SDF-1A's existing
modules:
- Pure — no I/O, no Git, no model call, no DB write (same discipline as
  `lib/atlas/code-work/policy.ts`).
- Rejects (does not throw past a boundary) when a Mission's
  `allowedCapabilities` exceeds what `capability.ts` permits, or its
  `preferredWorker` doesn't match a real `worker-registry.ts` entry, or its
  `riskLevel` policy isn't defined yet.
- Produces a `CodeWorkAdmissionV1` that is then handed to the **existing**
  SDF-1A admission validator (`policy.ts`) unchanged — this function's output
  must pass the same gate a hand-built admission would.
- Adds zero new persistence, zero new authorization vocabulary, zero new
  evidence classes — reuses SDF-1B1/1B2/`authorization/*` as-is.

**Implementation sequence, if/when approved:**
1. Add `Mission` and `RiskLevelPolicy` types (docs already specify the
   shape) under `lib/atlas/code-work/mission.ts` or a clearly-marked sibling
   — not inside `types.ts` itself, to keep SDF-1A's existing exports stable.
2. Add the pure `translateMissionToAdmission` function plus a
   `MissionTranslationRejection` type, with unit tests mirroring the style of
   SDF-1A's existing 454-line test file.
3. Wire nothing else. No API route, no dispatcher, no UI. The translator is
   callable from a test or a future CLI, not from production, until a
   dispatcher exists to call it for real.
4. Only after that: design the dispatcher itself as its own, separately
   reviewed, Level-2-risk phase (it is exactly the kind of "agent runtime"
   change RISK-AND-AUTHORITY.md classifies as sensitive).

This phase does **not** implement step 1–4 above. It records the sequence so
the next slice has an exact, pre-agreed starting point instead of a fresh
design discussion.

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
