# Atlas Memory M4 — Release Report

**Branch:** `feat/atlas-memory-v2` (in sync with origin)
**Status:** Implementation-complete. Flags OFF. Merge-recommended; activation gated.
**Final audit:** all roadmap commits present; public interfaces stable; flags OFF; no Voice/Executive boundary violations; typecheck 0 errors; suite 423/426 (3 pre-existing, non-M4).

---

## 1. What was built

A multi-layer memory system (MLMS) that lets Atlas **observe → consolidate → recall**
operational experience, consumed by Executive Intelligence through a single read
boundary. Seven roadmap commits plus a pre-merge remediation:

| Commit | What |
|---|---|
| **C1** Schema | Private `atlas` schema: append-only `memory_events` spine + consolidated `memories`; RLS backstop; never PostgREST-exposed. |
| **C2** Emit + salience | `recordMemoryEvent` (non-throwing) → `public.atlas_record_event` wrapper; `atlas.salience` (one source of truth); central `event_type → class` map. |
| **C3** Consolidation + cron | `atlas.consolidate_memory_events` (events → beliefs, evidence-weighted) + `atlas.archive_stale_memories`; `*/5` + nightly cron. |
| **C4** Emitters (dual-write) | `recordMemoryEvent` wired post-terminal in approvals, article-review, and drain routes (legacy writes untouched). |
| **C5** Recall (shadow) + health | `public.atlas_recall` wrapper + `recallMemories` (scoped, salience-ranked, budgeted, diversity-capped) + `public.atlas_memory_health`. |
| **C6** Context injection (gated) | `memory-context.ts` — the Memory dimension of the Context Request; decisions → constraints, rest → recall items. |
| **C7** Backfill | Idempotent, non-destructive migrations: `platform_memory`, `content_feedback`, `dream_issues` → atlas; operator/incident source is a guarded no-op pending schema. |
| **C2/C3 fix** (review) | Real shadow-eval path (`applyInjectionGate`) + pin/focus ranking before the SQL limit (`atlas_recall` v2). |

---

## 2. Final architecture

```
WRITE (observe → remember)                         READ (recall → reason)
─────────────────────────                          ──────────────────────
app events (approval/drain/dream)                  Executive Intelligence
        │ recordMemoryEvent()  [flag ATLAS_MEMORY]          ▲  (consumes objects only)
        ▼                                                   │ resolveMemoryItems / resolveMemoryContext
public.atlas_record_event (SECURITY DEFINER)         memory-context.ts  [flag ATLAS_MEMORY_INJECT]
        ▼                                                   ▲  applyInjectionGate (shadow vs inject)
atlas.memory_events  ── consolidate (*/5) ──▶ atlas.memories   │ recallMemories()  [flag ATLAS_MEMORY_RECALL]
  (episodic spine)        archive (nightly)   (beliefs)        ▲
        └──────────────── salience@read (one fn) ─────────────┘ public.atlas_recall (SECURITY DEFINER)
```

**Principles upheld:** wrapper-only access (`atlas` never PostgREST-exposed);
functional-core / imperative-shell (`assembleMemoryPack`, `splitMemoryPack`,
`applyInjectionGate` are pure; I/O lives in shells); isolation enforced in SQL
**and** re-checked in TS; salience computed at read from a single function;
non-throwing side channels; **EI reaches Memory only via `recallMemories`** —
never the database directly.

---

## 3. Public APIs

**Write (emit):**
- `recordMemoryEvent(input, db?) → { id, deduped, skipped }` — non-throwing; flag `ATLAS_MEMORY`.

**Read (the EI contract):**
- `recallMemories(args) → MemoryPack` — scoped (`userId` or `projectIds`), salience-ranked, budgeted, diversity-capped.
- `assembleMemoryPack(rows, opts) → MemoryPack` — **pure** core (isolation belt, pin/focus, budget, diversity).
- `resolveMemoryContext(req) → { items, constraints }` — Context Request boundary; decisions → constraints.
- `resolveMemoryItems(req) → MemoryItem[]` — items-only seam for orchestrators.
- `applyInjectionGate(pack, flags) → { context, shadow, computed }` — **pure** staged-rollout gate.

**DB wrappers (service-role only; `atlas` not exposed):**
- `public.atlas_record_event(...)`, `public.atlas_recall(...)`, `public.atlas_memory_health()`.

> Interface stability: the read API is stable for merge. Two ergonomic refinements
> are recommended **before broad adoption** (post-merge): a discriminated `scope`
> union on `recallMemories` (review R6) and separating `memoryClass` from the
> `eventType` field (review R8). Neither changes behavior; both get harder later.

---

## 4. Feature flags (all OFF by default)

| Flag | Gates | Default |
|---|---|---|
| `ATLAS_MEMORY` | emit / dual-write | OFF |
| `ATLAS_MEMORY_RECALL` | compute recall (enables shadow) | OFF |
| `ATLAS_MEMORY_INJECT` | inject recalled memory into EI context | OFF |
| `ATLAS_VIEW_AWARENESS` | (existing) focus signal for recall | coordinate |

Staged semantics: `RECALL=1, INJECT=0` computes and **shadow-logs** (`[atlas-memory][shadow]`)
without injecting; `INJECT=1` requires `RECALL=1`.

---

## 5. Remaining future work (M5+)

**Before enabling injection (highest priority):**
- **C1 — SQL integration tests** (pgTAP/DB harness) for salience, consolidation, recall scoping/isolation, backfill idempotency. The SQL core currently has no automated regression test.

**Hardening (post-merge):**
- **R1** retention/partition for `atlas.memory_events` (unbounded growth).
- **R2** confidence decay / contradiction handling (today monotonic-up, "echo-naive").
- **R4/R5** route backfill through the wrapper; TZ-safe idempotency key.
- **R7** remove `[atlas-diag]` hot-path logging in `record-event.ts`.
- Operator/incident backfill (C7 source #4) once `public.memories` schema is confirmed.

**New capability (M5+):**
- Semantic memory (`fact_assertion`) + embeddings/vector recall.
- Decisions → system `[CONSTRAINTS]` **consumer** wiring (manager chat / `executive_brief`); the `constraints` channel is produced but not yet consumed.
- Optional graph backend (Graphify) behind the same recall interface.

---

## 6. Activation checklist (operator, post-merge — flags stay OFF at merge)

1. Apply migrations on a **scoped branch** (seed `public.projects` + legacy source tables), verify the SQL matrix, then prod via `apply_migration` (ledger-first); regenerate types.
2. **Codex C1–C7 review.**
3. `ATLAS_MEMORY=1` → dual-write live; watch `public.atlas_memory_health()` (emit volume, consolidation debt).
4. `ATLAS_MEMORY_RECALL=1` (+ `ATLAS_VIEW_AWARENESS=1`) → shadow logs; **evaluate relevance for several days.**
5. Run the three backfills once dual-write is stable (idempotent; re-run = 0 rows).
6. Land **C1 SQL tests** before injection.
7. **Only after a green shadow-eval:** `ATLAS_MEMORY_INJECT=1`.

Rollback is layered: flag-off at each tier → cron unschedule → `drop schema atlas cascade` (leaves `public`/legacy untouched).

---

## 7. Merge recommendation

**APPROVE** the merge of `feat/atlas-memory-v2`. The code is additive, isolated, and
flag-gated OFF — it cannot change production behavior at merge. Typecheck is clean;
the only red tests are 3 pre-existing, unrelated nav/route failures (Voice-UI
territory). Both activation blockers from the review (C2 shadow path, C3 pin/focus
ranking) are resolved.

**Two conditions to confirm at merge time:**
- **Merge scope:** the branch carries the Intelligence/EI recovery **and** Memory M4 — merging brings both; confirm that's the intended unit.
- **Do not enable any flag** until the activation checklist (esp. C1 SQL tests and a real shadow-eval) is complete.
