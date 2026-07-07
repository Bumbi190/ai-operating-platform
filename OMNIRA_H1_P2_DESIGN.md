# H1.P2 — Unify on one executor + drain checkpointing (design, pre-implementation)

**Date:** 2026-06-13 · **Status:** Design for review — NO code yet · **Phase:** H1.P2 (after P1 schema foundation, before P3 durable resume)

**Objective.** Make the production **drain path run the single rich executor** instead of the lightweight `runSteps`, and make retries **resume from the first incomplete step** instead of re-running from step 1. Policy gating (auto vs approval) stays **dark until P4** — P2 changes *how* steps run and *idempotency*, not *what gets gated*.

---

## 1. Exact files changed

| File | Change | Risk |
|---|---|---|
| `apps/web/lib/ai/workflow-executor.ts` | Extract the step loop into a pure core `executeRunSteps(db, run, steps, opts)` that runs steps with validation+retry+quality-gate+logs+context+output and **throws on failure** — but does **NOT** set `runs.status` and does **NOT** create approvals. The existing `executeWorkflow(...)` becomes a thin wrapper = core + (status done/failed) + approval, kept for resume/manual until P3/P4. | Medium |
| `apps/web/lib/ai/checkpoint.ts` (new) | `computeCheckpoint(db, run)` → `{ startFromOrder, existingContext }` from completed `run_logs`. Shared by drain now, resume in P3. | Low |
| `apps/web/app/api/runs/drain/route.ts` | For non-marketing runs: compute checkpoint, call `executeRunSteps(...)` (was `runSteps`). Drain **keeps owning** `done/failed/pending(retry)` exactly as today. | Medium |
| `apps/web/lib/ai/workflow-runner.ts` | Delete `runSteps` and the duplicate `executeWorkflow` wrapper; re-point `/api/runs/execute` to the executor wrapper. (Or leave thin re-exports for one release.) | Low |
| `apps/web/app/api/runs/execute/route.ts` | Use the executor wrapper instead of `workflow-runner::executeWorkflow` (one engine). | Low |
| `apps/web/lib/qa/h1-checkpoint.test.ts` (new) | Unit tests for `computeCheckpoint` + executor core skip logic. | none |

Not touched in P2: `resume.ts` (P3), policy gate / `side_effect_class` / approval-on-drain (P4), `cancel`/reaper/workflow-lookup bug (P5). Marketing `kind` dispatch in drain is unchanged.

---

## 2. Architecture diff (before / after)

**Before P2**
```
drain (non-marketing)  ── runSteps()  [no validation, no quality gate, no cost log,
                                        no approval, NO checkpoint → reruns ALL steps]
                          drain sets done/failed/retry
resume                 ── executeWorkflow()  [rich: validate, quality gate, approval]  (fire-and-forget, P3 fixes)
manual /api/runs/execute ─ workflow-runner::executeWorkflow()  [thin wrapper over runSteps]
  → THREE step-running implementations; production uses the weakest
```

**After P2**
```
                         ┌─ executeRunSteps()  ← THE single step loop
                         │     load agent → interpolate → runStep
                         │     → validate (+1 retry) → quality gate
                         │     → run_logs + context + output + cost_events
                         │     → throws on failure; does NOT set status/approval
   drain (non-marketing) ┤  computeCheckpoint(run) → {startFromOrder, existingContext}
                         │  calls executeRunSteps(...); drain owns done/failed/retry
   manual execute ───────┤  executeWorkflow() wrapper = executeRunSteps + status(+approval*)
   resume (still P3) ────┘  executeWorkflow() wrapper (made durable in P3)
   → ONE step-running implementation; production path == rich path
```
\* approval creation stays in the wrapper only (resume/manual), exactly as today; the **drain path creates no approval in P2** — same as current drain behavior. Approval-on-completion for the drain path is added deliberately in **P4** via the policy gate.

---

## 3. How the drain path uses the unified executor

`app/api/runs/drain/route.ts`, non-marketing branch, pseudo-diff:
```ts
// BEFORE
const { data: wf } = await db.from('workflows').select('steps').eq('id', run.workflow_id).single()
const steps = parseWorkflowSteps(wf?.steps)
await runSteps(db, run.id, run.project_id, steps, (run.input ?? {}) as Record<string,string>)

// AFTER
const { data: wf } = await db.from('workflows').select('steps').eq('id', run.workflow_id).single()
const steps = parseWorkflowSteps(wf?.steps)
const { startFromOrder, existingContext } = await computeCheckpoint(db, run)   // NEW
await executeRunSteps(db, run, steps, {                                        // was runSteps
  initialInput: (run.input ?? {}) as Record<string,string>,
  existingContext,
  startFromOrder,
})
```
- **Status ownership stays with the drain** (lines 49–71 today): on return → `done`; on throw → `pending` (retry, if `attempts < max_attempts`) or `failed`, with `error_history`, `claimed_at/lease_until` cleared. The lease/reaper invariants are untouched.
- `executeRunSteps` is the executor's loop minus the self-`status`/approval/finalization tail — so there is exactly one place steps run.
- Cost logging (`cost_events`) now happens on the drain path too (the executor's `runStep` passes `cost`/`runId`), closing a current gap.

---

## 4. Checkpointing — how completed steps are identified

`computeCheckpoint(db, run)` (mirrors the proven logic in `resume.ts:44-56`):
1. Read `run_logs` for this `run_id` where `role='assistant'` and `step_order IS NOT NULL` → set of **completed orders** (an assistant row means that step produced output and its `context[output_key]` was persisted at the time, per the executor writing context after each step).
2. `existingContext = run.context ?? {}` — the per-step outputs already persisted (drain/executor write `runs.context` after every step).
3. Sort steps by `order`; `startFromOrder = first step whose order ∉ completed orders` (or `0` when none are complete → first attempt runs everything).
4. The executor's `pendingSteps = steps.filter(s => s.order >= startFromOrder)` already skips earlier steps and reuses their `existingContext` values (executor lines 52–63).

Properties:
- **First attempt:** no assistant logs → `startFromOrder = first order` → all steps run (identical to today).
- **Retry after failing at step k:** steps `< k` are skipped, their outputs reused from `context` → **no re-run, no duplicate spend/side-effects**.
- **Idempotent external steps:** publish/post remain keyed on `external_id`, so even a re-entered step can't double-post.
- **Safety on context loss:** if `existingContext` is missing a skipped step's `output_key` (e.g. context wasn't persisted), the interpolation would see a gap — mitigation: treat a step as completed only if BOTH an assistant log exists AND its `output_key ∈ context`; otherwise re-run it. (Stricter than resume.ts; prevents resuming with a hole.)

---

## 5. Test plan

**Unit (`lib/qa/h1-checkpoint.test.ts`, runs in CI/vitest):**
- `computeCheckpoint`: no logs → `startFromOrder=firstOrder`, empty context; logs for orders [0,1], fail at 2 → `startFromOrder=2`, context has 0&1; missing-context-hole → step re-run (not skipped).
- Executor core skip: given `startFromOrder=2`, steps 0–1 not invoked, 2+ invoked (mock `runStep`).
- Validation/quality-gate paths unchanged (existing executor behavior preserved).

**Integration (local / preview, scripted against a test workflow):**
- Fresh run end-to-end: enqueue → drain → `done`, output + logs + `cost_events` written.
- Inject a step failure → drain marks `pending` (retry) → next drain tick resumes from the failed step; assert steps before it are NOT re-invoked (check `run_logs` count / `cost_events`).
- Exhaust `max_attempts` → `failed` with `error_history`.
- A text-only workflow (no images) → quality gate is a no-op (doesn't falsely fail).
- Existing cron media workflow (Generate Script / Fetch AI News) → still completes.

**Type/build:** `tsc --noEmit` clean; full `vitest` green (incl. isolation suite); spot-build the changed routes.

**Acceptance for P2:** one step-running implementation in the tree (`runSteps` gone/re-export); drained runs get validation + quality gate + cost logging; a retried run does not re-run completed steps; existing workflows still complete. (No change to what gets gated — that's P4.)

---

## 6. Rollback plan

- **Code rollback:** P2 is a single commit on `h1/execution-unification`. Revert = `git revert <sha>` (or redeploy the previous main). No schema change in P2, so a code revert fully restores the prior drain path (`runSteps`). The P1 migration is independent and stays (inert).
- **Fast mitigation without revert:** keep `runSteps` as a thin re-export for one release and gate the drain call behind an env flag (`H1_UNIFIED_EXECUTOR=1`). If a problem appears in production, unset the flag → drain falls back to the old path within one deploy, no code change. (Recommended; decide in review.)
- **Data safety:** P2 writes only `run_logs`, `runs.context`, `outputs`, `cost_events` — same tables as today. Checkpointing is read-only inference from existing rows; worst case on a bug is a step re-running (cost), not data loss. The strict "assistant-log AND context-key" rule (§4) prevents resuming into a hole.
- **Blast radius:** drain processes `CLAIM_LIMIT=3` runs/tick under a lease; a bad deploy affects at most in-flight runs, which the reaper re-queues. No irreversible action (publishing stays on its own confirm-gated path; approval/policy untouched in P2).

---

## 7. Decision requested

Approve P2 implementation as specified? Two sub-decisions for review:
1. **Feature flag (`H1_UNIFIED_EXECUTOR`) for instant rollback** — include (recommended) or commit straight to the unified path?
2. **`runSteps` removal** — delete now, or keep as a thin re-export for one release (safer)?

On approval I implement P2, run tsc + tests + a diff, and present the next checkpoint before P3 (durable resume).
