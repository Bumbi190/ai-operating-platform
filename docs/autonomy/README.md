# Omnira Autonomy Foundation

**Status:** Canonical v0.2 (Phase 0 — documentation only, nothing here executes) · revised 2026-09-23

> **Read this first.** This tree is the entry point for any work on delegating
> software-development missions to a coding worker (Claude, Codex, or a future
> model/provider). It applies to Claude, Codex, Atlas, and human developers
> alike. It does not replace, restate, or override any canonical document it
> references — it points at them.

## 1. What this is

The Omnira Autonomy Foundation defines how Omnira/Atlas can delegate a
**substantial, scoped software-development mission** to a coding worker and
get back a **tested, independently reviewed pull request** — without a human
supervising every intermediate step.

This is a foundation, not a product. Phase 0 (this tree) establishes
vocabulary, contracts, and boundaries. It deliberately does not build a
dispatcher, does not invoke a model, and does not touch production execution.

## 2. The canonical principle

> **Cognition proposes; Omnira governs.**

Agents, skills, and models supply reasoning, code, and procedural judgment.
None of that is authority. This is not a new rule invented for this
workstream — it is the same rule already governing every other authority act
in Omnira. `apps/web/lib/atlas/authorization/types.ts` states it for human
approvals:

> "A correct recommendation made by an unauthorized actor is not an
> authorized decision. Technical capability must never be mistaken for
> authority." (§10.4)

Coding workers are, structurally, the same case: a Claude or Codex worker may
be highly capable and produce a correct patch. That does not make the patch
authorized to merge, deploy, or touch anything outside its granted scope.
Authority is still granted by Omnira's existing governance and authorization
primitives, never by the worker, the model, or the skill that invoked it.

**Concretely, this means:** a coding worker's own claim that its patch is
correct is a *proposal*. It becomes real only when deterministic gates and an
independent reviewer accept it, and — depending on its risk level — a human
grants promotion. Never on the worker's own say-so.

## 3. Future architecture (target shape, not built yet)

```
Andre
  → Atlas
    → Mission                      (docs/autonomy/MISSION-CONTRACT.md)
      → Context Router             (docs/autonomy/CONTEXT-ROUTING.md)
      → Skill Router                (existing: .claude skill/agent routing)
      → Model Router                (docs/autonomy/MODEL-ROUTING.md)
        → Worker                    (Claude, Codex, ...)
          → Capability / Governance boundary   (existing: lib/atlas/code-work/capability.ts,
                                                 lib/atlas/authorization/*)
            → execution              (NOT built in Phase 0 — no dispatcher exists yet)
              → deterministic verification   (docs/autonomy/EVALUATION-GATES.md)
              → independent review            (docs/autonomy/EVALUATION-GATES.md)
              → evaluation                     (docs/autonomy/EVALUATION-GATES.md)
              → promotion policy               (docs/autonomy/RISK-AND-AUTHORITY.md)
              → PR / deploy
```

**Phase 0 is not the complete implementation of this diagram.** It documents
the shape, defines a provider-neutral Mission Contract, defines risk/authority
levels, and identifies exactly where each stage should plug into architecture
that already exists (see [PHASE-0.md](./PHASE-0.md) §3). Nothing in this tree
grants a worker any new capability.

## 4. Reading order

1. [PHASE-0.md](./PHASE-0.md) — what this slice does and does not do, and the
   existing architecture it builds on.
2. [MISSION-CONTRACT.md](./MISSION-CONTRACT.md) — the provider-neutral mission
   envelope.
3. [RISK-AND-AUTHORITY.md](./RISK-AND-AUTHORITY.md) — the four mission risk
   levels and how they relate to (and differ from) Chapter 18's Autonomy
   Licensing Model.
4. [MODEL-ROUTING.md](./MODEL-ROUTING.md) — provider-neutral worker selection.
5. [CONTEXT-ROUTING.md](./CONTEXT-ROUTING.md) — progressive context loading
   against existing Memory and Knowledge systems.
6. [EVALUATION-GATES.md](./EVALUATION-GATES.md) — deterministic gates plus
   independent review, before a mission's output can be promoted.

## 5. What already exists and must not be duplicated

Before writing any code against this foundation, read the systems it
extends — do not re-implement them:

- **`apps/web/lib/atlas/mission/*`** (Chapter 20, Executive Mission Brief V1)
  and **`apps/web/lib/atlas/delegation/*`** / **`apps/web/lib/atlas/workpackage/*`**
  (Chapter 21) — the real, canonical Mission → Delegation Envelope → Work
  Package chain. **This document's "Mission Contract" is not a new Mission
  type** — see MISSION-CONTRACT.md §0.
- **`apps/web/lib/atlas/code-work/*`** ("SDF-1A/1B1/1B2") — an existing,
  merged, execution-free contract/lifecycle/persistence/operator-review stack
  for the last hop of that chain, bounded code work specifically (see
  MISSION-CONTRACT.md §2 for the relationship).
- **`apps/web/lib/atlas/authorization/*`** — the canonical human-authorization
  vocabulary (`AuthorizationStatus`, principal, target, effectiveness).
- **`apps/web/lib/ai/anthropic.ts`** (`getAnthropic`) — the sanctioned,
  governed chokepoint for reaching a model provider.
- **`apps/web/lib/atlas/knowledge/*`** and **`apps/web/lib/atlas/memory/*`** —
  the existing Knowledge Provider and Atlas Memory systems.
- **`apps/web/lib/atlas/isolation.ts`** — project isolation.

Related memory: `omnira-vnext-gate-architecture`, `omnira-workflow-instance-core-pr1`.
