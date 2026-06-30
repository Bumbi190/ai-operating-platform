# Atlas Intelligence Layer — Architecture Decision Record

**Status:** Approved · P0 (contracts + schema) implemented, producers pending
**Owner:** Andre Hultgren
**Scope:** The intelligence layer of Atlas — the domain that turns collected signals into refined, reusable intelligence objects consumed by Omnira Manager, future agents, and The Prompt. Establishes a dedicated `atlas_intelligence` domain, distinct from `atlas_signals`, behind a storage-agnostic repository.

---

## Why this exists

Atlas already collects and normalizes facts. Collectors v1 feed `atlas_signals`; the Score Engine computes `impact_score`; the Signal Platform (`lib/atlas/signals.ts`) exposes a clean query API including `querySignals` and `getSignalTimeSeries`. Atlas Memory M4 (`atlas.memory_events` + `atlas.memories`) records what Atlas observed and consolidates long-term belief.

What is missing is the layer **above** facts: the one that aggregates signals and memory into conclusions — briefs, trends, entity momentum, reasoning — with confidence and a traceable evidence chain. Today the only synthesis is `lib/atlas/executive.ts`, which recomputes an `ExecutiveSummary` on every call: ephemeral, unversioned, not evidence-linked, operator-only. There is no reusable intelligence object that Manager and agents can consume.

Atlas Intelligence fills that gap and becomes the **shared intelligence layer for the entire platform**.

---

## The two domains — Signals vs Intelligence

The single most important decision: Intelligence is a **separate domain**, not a new `atlas_signals` kind.

| | `atlas_signals` (Signal layer) | `atlas_intelligence` (Intelligence layer) |
|---|---|---|
| **Question answered** | "What happened?" | "What does it mean?" |
| **Content** | Normalized facts from collectors / score engine | Briefs, trends, entity momentum, reasoning |
| **Producer** | Collectors, Score Engine | Intelligence Producers (read signals + memory) |
| **Confidence** | Producer-embedded in payload | First-class column, 0–1, platform-wide |
| **Evidence** | None — a signal *is* the fact | Evidence chain tracing the signals/memory behind it |
| **Lifecycle** | Append-only, terminal | Append-only with `supersede` (track record) |
| **Subject** | content_id / project / source | Entity, content, project, or global |

They could share one table — both are append-only `kind`+`payload` logs. We deliberately keep them apart because they are different concepts that evolve independently, and conflating raw facts with derived conclusions muddies the pipeline. The price (a second table, technically a sixth store) is contained by the single repository and strict layering below.

---

## The pipeline — strict and one-directional

```
Collectors → Signals (atlas_signals) → Intelligence (atlas_intelligence) → Consumers
                                                                            (Manager, Agents, The Prompt)
```

- Producers read from Signals + Memory, never from Consumers.
- Consumers read Intelligence through one door (Context Retrieval); they do not derive intelligence from raw signals themselves.
- Each arrow is one-way. No layer reaches backwards.

---

## Storage-agnostic by design

The public architecture is the **TypeScript contract**, not the table. Everything goes through `IntelligenceStore` (`lib/atlas/intelligence/store.ts`). Postgres is the v1 implementation (`PostgresIntelligenceStore`). A graph backend such as **Graphify** can implement the same interface later — evaluated as a future implementation of Atlas Memory / Intelligence — **without changing any producer or consumer**. Graphify is explicitly out of scope for this milestone; no integration, no dependency.

```
        producers / consumers
                 │  (depend only on the interface)
                 ▼
        IntelligenceStore  ── interface ──┐
                 │                         │
   PostgresIntelligenceStore        (future) GraphifyStore
        atlas_intelligence                 graph backend
        atlas_entities
```

---

## Domain contracts (`lib/atlas/intelligence/types.ts`)

Five abstractions, all backend-independent:

- **Entity** — canonical subject, identity `(kind, key)`. Registry in `atlas_entities`.
- **Relationship** — graph-ready edge `{ from, type, to, confidence, evidence }`. Defined now; traversal not implemented in P0 (YAGNI).
- **Evidence / EvidenceChain** — `{ sourceKind, refId, weight, observedAt }[]`. Makes every conclusion auditable, referencing signals, memory, content, collector runs, other intelligence, or URLs.
- **IntelligenceObject** — the reusable unit: `{ kind, subject, summary, findings[], body, confidence, evidence, producedBy, version, producedAt, validUntil?, supersededBy? }`.
- **ContextQuery** — the Context Retrieval filter consumers use.

Confidence is `0–1` across the platform, matching `atlas.memories.confidence`, so it is comparable everywhere.

---

## Schema (v1 Postgres backend)

`public.atlas_intelligence` — append-only; lifecycle is `superseded_by`, never UPDATE-in-place or DELETE. `subject_ref` is free-text (entity key | content id | project id | NULL for global) with **no FK** — subjects span tables that have no common parent; producers own ref validity. `findings` / `body` / `evidence` are jsonb, validated at the producer boundary. RLS service-role-only, mirroring `atlas_signals`.

`public.atlas_entities` — canonical `(kind, key)` registry that `subject_ref` points at for entity subjects. Relationships are **not** a table in P0.

Migrations: `20260629_120000_atlas_intelligence.sql`, `20260629_120100_atlas_entities.sql`.

---

## Intelligence Producer pattern (P1+, not in P0)

Mirrors the existing Signal Producer: **functional core, imperative shell**. Producers are pure functions — input is pre-loaded signals/memory/entities, output is an `IntelligenceDraft`. An orchestrator loads inputs via `querySignals` / `getSignalTimeSeries` / memory recall, runs the producer, and persists via `IntelligenceStore.record`. The deterministic core owns confidence and evidence; an optional, bounded LLM step only narrates the `summary` prose — it never invents the numbers.

---

## Implementation phases

| Phase | Outcome | Status |
|---|---|---|
| **P0 — contracts + schema** | ADR, `types.ts`, `IntelligenceStore` + `PostgresIntelligenceStore`, `atlas_intelligence` + `atlas_entities` migrations. No producers, no wiring, no behavior change. | This change |
| **P1 — Brief producer** | Pure producer aggregating impact_score + collector signals (+ memory) into a persisted, versioned `executive_brief` / `brief` object with evidence chain. `executive.ts` refactored additively to produce/consume it. Codex review before merge. | Next |
| **P2 — Trend + entity momentum** | `getSignalTimeSeries` → deterministic trend detection; per-entity aggregation. | Later |
| **P3 — Context Retrieval + integration** | Manager / agents consume intelligence via the store; `context.ts` refactored to read intelligence objects. | Later |
| **P4 — The Prompt / newsletter** | The public Atlas Brief (see OMNIRA_ATLAS_BRIEF_ADR.md, phases 4–6) becomes a thin render layer over the same objects. | Later |
| **Graphify spike** | Evaluate a graph backend as an `IntelligenceStore` / Memory implementation. Separate, optional. | Future |

---

## What P0 deliberately does NOT do

- **No producer logic.** No briefs, trends, or reasoning are generated yet.
- **No consumer wiring.** `executive.ts`, `context.ts`, Manager, and agents are untouched. Importing the new modules has no side effects.
- **No Graphify.** No dependency, no integration; only a contract it can later satisfy.
- **No relationships table.** The contract exists; the table lands when a producer needs traversal.
- **No public read API / RLS opening.** Service-role only.
- **No behavior change.** Purely additive: new files + new tables.

---

## Decision log

- **Intelligence is a dedicated domain, not an `atlas_signals` kind.** Signals = facts ("what happened"); Intelligence = meaning ("what does it mean"). Separate tables, separate evolution.
- **All access flows through `IntelligenceStore`.** The interface is the public architecture; the backend is swappable (Postgres now, Graphify candidate later) without touching producers or consumers.
- **Strict pipeline Collectors → Signals → Intelligence → Consumers.** One-directional; no layer reads backwards.
- **Append-only with supersede.** Track record for free; intelligence is never mutated in place.
- **`subject_ref` is free-text with no FK.** Subjects span entities, content, clusters; producers own validity. Same reasoning as `atlas_signals.content_id`.
- **Confidence is 0–1, platform-wide.** Matches `atlas.memories` so confidence composes across layers.
- **Evidence chains are first-class.** Every conclusion is traceable to the signals/memory that produced it — intelligence is auditable, not a black box.
- **Producers are pure (functional core, imperative shell).** Data loading in the shell; LLM only narrates. Mirrors the Score Engine.
- **Coexists with — does not replace — `atlas.memories`, `platform_memory`, `opportunities`, `atlas_actions`, `atlas_signals`.** Intelligence is the synthesis layer none of them cover.

---

## File index

```
apps/web/
├── lib/atlas/intelligence/
│   ├── types.ts              # Entity, Relationship, Evidence, IntelligenceObject, ContextQuery
│   ├── store.ts              # IntelligenceStore interface (the public architecture)
│   └── postgres-store.ts     # PostgresIntelligenceStore (v1 backend) + createIntelligenceStore()
│
└── supabase/migrations/
    ├── 20260629_120000_atlas_intelligence.sql
    └── 20260629_120100_atlas_entities.sql

(root)
└── OMNIRA_ATLAS_INTELLIGENCE_ADR.md   # this document
```
