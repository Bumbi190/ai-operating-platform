# Atlas Memory M4 — Merge-Readiness Report

**Branch:** `feat/atlas-memory-v2` (canonical Memory branch, cut from latest `main`)
**Scope:** Updated after the pre-merge review + remediation of activation blockers C2/C3.
**Verification basis:** code/migrations/tests on the branch (not memory).

---

## 1. Verdict

Memory M4 is **functionally complete and code-ready** behind feature flags, all of
which are **OFF by default**. The code is safe to merge as-is (flags OFF ⇒ no
behavior change). The two **activation blockers** raised in the pre-merge review —
**C2** (a real shadow-eval path) and **C3** (pin/focus ranking before the SQL
limit) — are now **resolved** (see §5b). The remaining gates before *activation*
are the standard H1.P5 ones: apply migrations on a scoped branch then prod via the
ledger, Codex review (C1–C7), and a shadow-eval before enabling injection — plus
**C1** (SQL integration tests), deferred to a separate follow-up milestone. One
pre-existing, non-M4 test failure set (nav/route) is the only red in the suite.

---

## 2. All seven roadmap commits — complete

| Commit | Deliverable | Artifacts on branch | State |
|---|---|---|---|
| **C1** Schema | `atlas` schema + events + memories + RLS | `2026061612000{0..3}_atlas_{schema_init,memory_events,memories,memory_rls}.sql` | ✅ |
| **C2** Emit + salience | `recordMemoryEvent` + wrappers + salience + class map | `record-event.ts`, `atlas_record_event_fn`, `atlas_salience_fn`, `atlas_event_type_to_class_fn` | ✅ |
| **C3** Consolidation + cron | consolidate fn + archive sweep + cron | `atlas_consolidate_fn`, `atlas_memory_cron` | ✅ |
| **C4** Emitters (dual-write) | `recordMemoryEvent` wired post-terminal | `approvals/[id]`, `content/articles/[id]/review`, `runs/drain` routes + emit test | ✅ |
| **C5** Recall (shadow) + health | `atlas_recall` + `atlas_memory_health` + `recallMemories` | `atlas_recall_fn`, `atlas_memory_health`, `recall-memories.ts`, recall test (9) | ✅ |
| **C6** Context injection (gated) | Memory dimension of Context Request | `memory-context.ts`, brief seam, context test (7) | ✅ |
| **C7** Backfill | idempotent, non-destructive data migrations | `backfill_{platform_memory,content_feedback,dream_issues,operator_memories}.sql` | ✅ (see §6) |

Commit log (M4 portion): `baf021e` (C5) → `b5bd478` (C6) → `872867b` (C7).
C1–C4 were already present on the branch (carried from prior work).

---

## 3. Public interfaces Executive Intelligence will consume

EI consumes Memory **only** through this path; it never reads the database directly:

```
Memory (atlas.*)  →  public.atlas_recall (SECURITY DEFINER wrapper)
                  →  recallMemories()            [lib/atlas/memory/recall-memories.ts]
                  →  resolveMemoryContext() / resolveMemoryItems()   [lib/atlas/intelligence/memory-context.ts]
                  →  Executive Intelligence (brief orchestrator seam, future consumers)
```

**Stable read API (the EI contract):**

- `recallMemories(args) → MemoryPack` — scoped, salience-ranked recall. `args` accepts
  `userId` (user scope) or `projectIds` (EI/system scope), `focus`, window/limit/budget.
- `assembleMemoryPack(rows, opts)` — **pure** core (isolation belt, pin/focus salience,
  budget, diversity). Unit-tested without mocks.
- `resolveMemoryContext(req) → { items, constraints }` — the Context-Request boundary;
  decision-class memories → `constraints`, the rest → recall `items`. Gated by
  `ATLAS_MEMORY_INJECT`.
- `resolveMemoryItems(req) → MemoryItem[]` — items-only convenience for orchestrator seams.
- DB wrappers (service-role only; `atlas` never PostgREST-exposed): `public.atlas_recall`,
  `public.atlas_record_event`, `public.atlas_memory_health`.

**Confirmed:** the only files referencing `atlas_recall` are `recall-memories.ts` and
`memory-context.ts`. No EI producer or consumer touches `atlas.*` or the DB directly.

---

## 4. Architecture & safety conformance

- **Responsibility boundary** — `Memory → recallMemories() → Context Request → EI`. ✅
- **Functional-core / imperative-shell** — pure cores (`assembleMemoryPack`,
  `splitMemoryPack`); I/O isolated to shells (`recallMemories`, `resolveMemoryContext`,
  orchestrators). ✅
- **Isolation guardrail** — enforced in SQL (`atlas_recall` returns world + allowed
  projects only) **and** re-checked in TS (assemble belt); unit test: *foreign project → 0 rows*. ✅
- **Decisions = data, not instructions** — decision-class memories routed to `constraints`,
  excluded from the recall pack. ✅
- **Non-throwing side channels** — emit and recall never break the host operation. ✅
- **All flags OFF by default** — `ATLAS_MEMORY`, `ATLAS_MEMORY_RECALL`, `ATLAS_MEMORY_INJECT`
  (each gated on `=== '1'`). ✅
- **No Voice-UI / AtlasRuntime changes** — C5–C7 touched only `lib/atlas/memory`,
  `lib/atlas/intelligence` (memory-context + brief seam), and migrations. ✅

---

## 5. Quality gates

- **Typecheck:** `tsc --noEmit` — **0 errors** (full project).
- **Tests:** full suite **423 / 426 pass**. New Memory tests: **20/20** (recall 9, context 11).
- **The 3 failures are pre-existing and NOT M4:** `lib/qa/view-context.test.ts` (×2) and
  `lib/nav/registry.test.ts` (×1) — navigation/route resolution, last touched by
  `a0bb5e0` (supabase-ssr checkpoint), no Memory import path. **C5/C6/C7 + the C2/C3
  remediation added 0 regressions.**

## 5b. Activation-blocker remediation (post-review)

- **C2 — real shadow-eval path: RESOLVED.** `resolveMemoryContext` now stages on both
  flags via a pure `applyInjectionGate`: `ATLAS_MEMORY_RECALL` ON + `ATLAS_MEMORY_INJECT`
  OFF computes the pack and **shadow-logs** what *would* be injected (`[atlas-memory][shadow]`)
  while returning empty — so operators can evaluate relevance before enabling injection.
  Pure gate tested in all three flag states.
- **C3 — pin/focus before the SQL limit: RESOLVED.** New migration
  `20260617150200_atlas_recall_pin_focus_ranking.sql` (CREATE OR REPLACE) orders + limits
  `atlas_recall` by **effective** salience (pin → 1.0; +0.15 focus) while still returning
  base salience, so pinned/focus rows can't be dropped by the LIMIT. The TS layer re-applies
  the same formula (cross-referenced in both files; its regression test belongs to the C1 suite).
- **C1 — SQL integration tests: DEFERRED** to a separate follow-up milestone (per direction),
  unless required to safely complete C2/C3 — it was not. Still the top test-coverage gap before
  *enabling* (the SQL core — salience/consolidate/recall scoping/backfill idempotency — has no
  automated regression test yet).

---

## 6. Blockers & open items before merge / activation

**Required before activation (operator / H1.P5):**
1. **Apply migrations on a scoped Supabase branch** (seeded with `public.projects` for FKs),
   then prod via `apply_migration` (ledger-first): C1–C7 schema/fn/cron + the three backfills.
   Regenerate types (`supabase gen types`) — this also drops the temporary `as any` casts in
   the intelligence store.
2. **Codex review checkpoints C1–C7** (the plan mandates Codex review before significant merge).
3. **Shadow-eval** before enabling injection: `ATLAS_MEMORY=1` → `ATLAS_MEMORY_RECALL=1`
   (+ `ATLAS_VIEW_AWARENESS=1`) → evaluate relevance for several days → backfill →
   only then `ATLAS_MEMORY_INJECT=1`. (All post-merge; flags stay OFF at merge.)

**Documented, non-blocking:**
4. **Operator/incident backfill (C7 source #4)** is a **guarded no-op** — `public.memories`
   DDL is not in the repo, so per "verify schema before write" no rows are written. Author
   the `INSERT … SELECT` once the schema + discriminator are confirmed on a branch.

**Housekeeping / scope notes:**
5. **Pre-existing nav/view-context test failures (3)** are red in the suite. They are
   Voice-UI route tests, not M4 — decide whether a green suite is a merge gate and route
   them to the nav/Voice owner. Not caused by M4.
6. **Merge scope:** `feat/atlas-memory-v2` = `main` + the **Intelligence/EI recovery**
   (`033cb7d`) + **M4 (C5–C7)** + docs. Merging it brings the whole Intelligence layer too,
   not just Memory M4 — confirm this is the intended merge unit.
7. **Push:** `872867b` (C7) is local-only — `git push` to update `origin/feat/atlas-memory-v2`.

---

## 7. Activation runbook (post-merge, for reference)

1. Apply migrations (branch → prod, ledger-first); regenerate types.
2. `ATLAS_MEMORY=1` → dual-write live; watch `public.atlas_memory_health()` (emit volume,
   consolidation debt).
3. `ATLAS_MEMORY_RECALL=1` (+ `ATLAS_VIEW_AWARENESS=1`) → shadow recall logged; eval relevance.
4. Run the three backfills once dual-write is stable; re-run is a no-op (idempotent).
5. **Only after a green shadow-eval:** `ATLAS_MEMORY_INJECT=1`.

Rollback is layered (flag off at each tier; cron unschedule; `drop schema atlas cascade`
leaves `public` untouched).
