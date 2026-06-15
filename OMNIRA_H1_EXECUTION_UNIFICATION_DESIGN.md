# H1 — Execution Unification: One Durable Run Engine

**Date:** 2026-06-13 · **Status:** Design + exact scope, no code · **Prerequisite for:** Operator phases O1–O5

**Goal.** Make the durable run engine the **single execution path for the entire platform**. Every run — cron-launched, manually launched, resumed, and (later) Atlas/Operator-launched — flows through one engine that provides: sequential agent steps, output validation, quality gates, **approval creation**, bug reporting, **step-level idempotency on retry**, durable lifecycle (pending → running → done/failed/retry/cancelled), lease/reaper recovery, the kill switch, and a **side-effect/approval policy** so non-destructive work auto-runs while destructive work is gated.

This is the foundation the Operator builds on: once H1 lands, anything Atlas launches inherits the final execution semantics automatically.

---

## 1. Current state — three divergent execution behaviors (code-verified)

| Path | Entry | Runs steps via | Status owner | Validation / quality / approval / bug-report | Idempotent retry | Durable |
|---|---|---|---|---|---|---|
| **Drain (production happy path)** | pg_cron → `GET /api/runs/drain` | `workflow-runner.ts::runSteps` | drain route | **None** | **No** — re-runs ALL steps from step 1 | ✅ |
| **Resume** | `POST /api/runs/[id]/resume`, Action Center | `workflow-executor.ts::executeWorkflow` | the executor | ✅ full | ✅ skips completed steps | ❌ **fire-and-forget** |
| **Manual execute** | `POST /api/runs/execute` | `workflow-runner.ts::executeWorkflow` (thin wrapper) | wrapper | None | No | synchronous |

Evidence:
- `lib/ai/workflow-runner.ts::runSteps` (23–74): no validation, no quality gate, no approval, no bug report, **no `startFromOrder`** → every drain retry re-executes completed steps (wasted spend, duplicate image generation).
- `lib/ai/workflow-executor.ts::executeWorkflow` (37–336): validation + 1 retry (114–159), image quality gate (180–239), output (251–257), **approval + email (259–284)**, bug reporting (311–334), and resume skip via `startFromOrder`/`existingContext` (44–63).
- `app/api/runs/drain/route.ts` (43–48): drain calls `runSteps` for non-marketing runs — i.e. the production path uses the **weaker** engine. Marketing kinds dispatch to `MARKETING_HANDLERS` (39–42).
- `lib/ai/resume.ts:64`: `void executeWorkflow(...)` + sets `status='running'` (58–62) directly — **bypasses claim_runs/lease**. In serverless the function can be killed after the HTTP response.

### Confirmed defects this creates
1. **Capability divergence.** A run completing on the drain path produces **no approval and no quality gate**; the *same run on resume* does. The happy path is the weaker one.
2. **Non-idempotent retries.** Drain re-runs all steps on each attempt (`runSteps` has no checkpoint) — burns credits, can double-post/double-generate.
3. **Resume can strand runs forever.** Reaper recovers only `status='running' AND lease_until IS NOT NULL AND lease_until < now()` (verified in live `reap_stuck_runs`). `resume.ts` sets `running` with **no lease** → a died resume is never reaped.
4. **Two `executeWorkflow` functions, different signatures** (`workflow-runner` vs `workflow-executor`) — latent confusion.
5. **Latent approval-email bug.** Executor looks up the workflow with `.from('workflows').eq('id', runId)` (executor 261–265) — matches workflow id against the *run* id; should be `run.workflow_id`. Approval emails say "Okänt workflow."
6. **`cancel_requested` is dead** — columns exist; no code reads them; `runs.status` CHECK lacks `'cancelled'`.

---

## 2. Target — one engine, one path

```
                       ┌──────────────────────── SINGLE DURABLE ENGINE ────────────────────────┐
launch sources         │                                                                        │
  cron / manual /      │  runs(status='pending')                                                │
  Atlas Operator ────► │        │  pg_cron every min                                            │
                       │        ▼                                                                │
                       │  GET /api/runs/drain ── claim_runs() [SKIP LOCKED, lease, kill switch]  │
                       │        │                                                                │
                       │        ▼  per claimed run                                               │
                       │  executeRun(run)  ◄── THE ONE executor (rich + checkpointed)            │
                       │     • load steps                                                        │
                       │     • skip already-completed steps (idempotent resume/retry)            │
                       │     • per step: runner → validate → 1 retry                             │
                       │     • image/quality gate                                                │
                       │     • write output                                                      │
                       │     • POLICY GATE: side-effect class → auto-finish OR create approval   │
                       │     • bug report on failure                                             │
                       │        │                                                                │
                       │        ▼                                                                │
                       │  status: done / failed / pending(retry) / awaiting_approval / cancelled │
                       │  reaper recovers expired leases (incl. fixed null-lease case)           │
                       └────────────────────────────────────────────────────────────────────────┘
```

**One function** (`executeRun`, the merged rich executor) is the only place steps run. Drain calls it. Resume becomes "requeue as pending" (no direct execution). Manual execute enqueues + (optionally) drains inline through the same function. Marketing handlers keep their `kind` dispatch but share the same status/lifecycle ownership.

---

## 3. Exact scope

### In scope (H1)
1. **Unify on one executor.** Promote `workflow-executor.ts::executeWorkflow` to the single step engine `executeRun(db, run, { startFromOrder })`. Drain calls it instead of `runSteps`. Delete `workflow-runner.ts::runSteps` and the duplicate `executeWorkflow` wrapper (or make them thin re-exports during transition).
2. **Status ownership = the drain/engine, not fire-and-forget.** The engine returns a result; the drain route sets `done/failed/pending(retry)` exactly as it does today (so lease/reaper invariants hold). The executor stops self-setting `running`/`done` when called from drain (single owner of status).
3. **Step-level idempotency / checkpointing.** Drain computes `startFromOrder` from completed `run_logs` (the logic already in `resume.ts:44-56`) and passes it + `existingContext` so **retries never re-run completed steps**. Make this the default for every claim, not just resume.
4. **Durable resume.** `resume.ts` requeues the run as `status='pending'` (reset `error`, `attempts` policy, clear `claimed_at`/`lease_until`) instead of `void executeWorkflow(...)`. The drainer then picks it up and resumes from the first incomplete step. Removes the fire-and-forget stranding (defect #3).
5. **Side-effect / approval policy gate (integrates the autonomy decision).** Introduce a side-effect classification so the engine can decide auto-finish vs gate:
   - Class `NON_DESTRUCTIVE` (analysis, research, monitoring, reporting, lead-qualification, data collection, workflow generation, optimization) → **auto-finish, no approval** (Operator may launch unattended).
   - Class `GATED` (publish, external API calls, deletions, spend/payments, production-system changes, customer-facing actions) → engine sets `status='awaiting_approval'` and creates an `approvals` row; nothing external happens until approved.
   - Carried as workflow/step metadata (e.g. `workflows.side_effect_class` and/or per-step `step.gated=true`), evaluated in the engine. Default for unclassified = `GATED` (fail-safe).
6. **Cancel.** Add `'cancelled'` (and `'awaiting_approval'`) to the `runs.status` CHECK; engine reads `cancel_requested` at each step boundary and stops cleanly (status `cancelled`); claim_runs already skips paused projects. Wire a cancel button later (UI is O5/optional).
7. **Bug fixes:** executor workflow lookup `eq('id', runId)` → `eq('id', run.workflow_id)` (defect #5); reaper also recovers `status='running' AND lease_until IS NULL` older than a grace window (defect #3 belt-and-suspenders).
8. **Idempotent external side effects.** Confirm publish/external steps remain keyed on `external_id` (already true in `lib/publishing`) so even a re-entered step can't double-post.

### Out of scope (later phases)
- Branching/DAG workflows (linear chain stays; Atlas P1 designer territory).
- Cancel UI polish, run-list API/filters (O5).
- `manager_tasks.run_id` and the Operator tools (O0–O5).
- Per-workflow cron scheduling, knowledge layer, Dream-engine learning.

---

## 4. Idempotency model

- **Step completion = an `assistant` `run_logs` row for that `step_order`** (already written by the engine). On (re)entry, completed orders are skipped and their outputs restored from `runs.context`.
- **`startFromOrder`** is computed every claim, so a lease-expiry re-claim resumes rather than restarts.
- **External actions** (publish/post) are idempotent on `external_id`; a re-run of a publish step is a no-op if already posted.
- **Approvals** are created once per run (guard on existing approval for the run) so re-entry can't spawn duplicates.

Net: re-claiming, retrying, and resuming all converge on the same safe, resumable behavior.

---

## 5. Schema / migration changes

- `runs.status` CHECK → add `'cancelled'`, `'awaiting_approval'`.
- `workflows.side_effect_class` (text, default `'gated'`) and/or per-step `gated` flag in `workflows.steps` JSON.
- `reap_stuck_runs()` updated to also catch null-lease stuck `running` rows beyond a grace interval.
- (No `manager_tasks.run_id` here — that's Operator O0.)

All additive/backward-compatible; default `gated` is fail-safe.

---

## 6. Risks & mitigations

- **Behavior change on the happy path** (drain now validates + may gate): mitigate by classifying current cron workflows explicitly as `NON_DESTRUCTIVE` so they keep auto-finishing; publish steps were already confirmation-gated.
- **Approval volume**: only `GATED` runs create approvals; analysis/reporting won't.
- **Migration of `runs.status` CHECK**: deploy CHECK change before code that writes new statuses.
- **Hidden callers of `runSteps`/wrapper**: grep + keep thin re-exports for one release.

---

## 7. Test & acceptance plan

**Acceptance — "single execution path" verified when:**
1. Grep shows step execution happens in exactly one function; `runSteps` and the duplicate `executeWorkflow` are gone (or re-export the unified one).
2. A drained run produces validation + quality gate + (for `GATED`) an approval — i.e. drain == former resume capability.
3. A run that fails mid-way and is retried/resumed **does not re-run completed steps** (assert via `run_logs`/cost).
4. A killed resume is recovered by the reaper (no permanently-`running` rows).
5. A `NON_DESTRUCTIVE` workflow auto-finishes with no approval; a `GATED`/publish workflow lands in `awaiting_approval` and performs no external action until approved.
6. `cancel_requested` on a queued/running run yields `status='cancelled'` at the next step boundary.

**Tests:** unit (startFromOrder computation, policy classifier, validators), integration (enqueue→drain→done; enqueue→fail→retry-skips-completed; resume durability; gated→approval), and the existing isolation suite stays green.

---

## 8. Files expected to change (when approved)

- `lib/ai/workflow-executor.ts` — becomes `executeRun`; add checkpoint params from drain; policy gate; fix workflow lookup; stop owning status when driven by drain.
- `lib/ai/workflow-runner.ts` — remove `runSteps`/wrapper (or thin re-export).
- `app/api/runs/drain/route.ts` — call unified engine with `startFromOrder` + `existingContext`; handle `awaiting_approval`/`cancelled`.
- `lib/ai/resume.ts` — requeue as `pending` (durable), drop `void executeWorkflow`.
- `app/api/runs/execute/route.ts` — route through the unified engine (enqueue or shared call).
- `lib/ai/policy/side-effects.ts` (new) — side-effect classification + gate decision.
- migrations — `runs.status` CHECK (+`cancelled`,`awaiting_approval`), `workflows.side_effect_class`, `reap_stuck_runs` null-lease fix.
- `lib/qa/` — new tests per §7.

---

## 9. Then: Operator O1–O5

With H1 done, the durable engine is the one path. Operator phases wire Atlas intent → this engine:
O1 reliable launch · O2 workflow-based delegation (delegate_work → run) · O3 manager-as-planner · O4 opportunity→action · O5 monitor/report. Operator launches inherit validation, quality gates, approval policy (auto-run non-destructive / gate destructive), idempotency, and recovery for free — exactly the requirement that drove "H1 first."
