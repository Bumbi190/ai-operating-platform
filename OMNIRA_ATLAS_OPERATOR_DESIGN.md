# Atlas Operating Layer — Design: Atlas → Manager → Workflow → Agent

**Date:** 2026-06-13 · **Status:** Design only, no code · **Author:** platform audit

**Vision.** Atlas evolves from Advisor (talks about the operation) to Operator (runs it): analyze projects → identify opportunities/problems → create workflows when needed → launch them → delegate work to agents → monitor execution → report outcomes. This document defines the execution model and a phased path, grounded in the current code.

The reusable spine already exists and is solid: a **durable run engine** (`runs` + `claim_runs` SKIP-LOCKED + lease/reaper + kill switch), a **per-step agent runner** (`lib/ai/runner.ts`), a **project-isolation boundary** (`lib/atlas/isolation.ts`), and a **chat tool harness** (`app/api/chat/route.ts`). The gap is the wiring between Atlas's intent and that spine — not the spine itself.

---

## 1. Current state architecture

### 1.1 The pieces (code-verified)

```
Atlas (chat LLM)  ── app/api/chat/route.ts (1.3k lines): system prompt + ~14 tools + honesty guard
   │  tool_use
   ├─ READ:   list_workflows, get_run_status, get_records, get_dream_findings,
   │          validate_workflow, live context (gatherAtlasContext)
   ├─ ADVISE: ask_manager → ManagerAgent.chat()  ── lib/ai/manager.ts  (text only)
   ├─ TRACK:  delegate / delegate_dream_finding   ── writes manager_tasks rows (no run)
   └─ ACT:    trigger_workflow  ── inserts runs(status='pending')   ← ONLY real execution
                 │
Durable engine    ▼
   pg_cron ── GET /api/runs/drain ── claim_runs() ── runSteps() ── runs: done/failed/retry
                                                        │
Agent layer                                             ▼  per step
   lib/ai/runner.ts ── loads agents row (system_prompt, model, config) ── calls Anthropic/OpenAI/image
```

### 1.2 Capability matrix (today)

| Operator capability | Exists? | Via | Real side effect | File |
|---|---|---|---|---|
| Analyze projects | partial | live context, `revenueIntel`, `contentScore` | read | `lib/atlas/context.ts`, `lib/atlas/revenue.ts`, `lib/atlas/content-score.ts` |
| Identify opportunities/problems | partial | `listOpportunities`, dream findings | read (precomputed) | `lib/atlas/opportunities.ts`, `lib/atlas/dream.ts` |
| Create workflows | ✅ | `save_workflow` | writes `workflows` def | `route.ts:1336-1358` |
| Launch workflows | ✅ | `trigger_workflow` | `runs(pending)` → drain | `route.ts:970-1004` |
| Delegate to agents | ❌ (tracking only) | `delegate` | `manager_tasks` row, **no run** | `route.ts:1211-1241` |
| Monitor execution | ✅ (per-id) | `get_run_status`, SSE stream | read | `route.ts:1056-1106` |
| Report outcomes | ✅ (read) | live context, `get_records` | read | `lib/atlas/context.ts` |

### 1.3 Behavioral facts driving the symptoms

- **Only `trigger_workflow` executes.** "Delegate" writes a tracking row; "ask the manager" returns prose; nothing converts either into a run. There is **no `manager_task → runs` bridge** and **no execute method on `ManagerAgent`** (only `chat`/`generateDailyPlan`).
- **Tool use is forced only on turn 0**, gated on `isActionIntent`/`isNavIntent` (`route.ts:700-706`). Conversational/follow-up phrasing → no forcing → the model can answer in prose.
- **The honesty guard is reactive.** `DELEGATE_CLAIM_RE`/`ACTION_CLAIM_RE` (`lib/atlas/honesty.ts:16-42`) detect "jag delegerar/startar/kör"; if the matching tool didn't fire, the guard *appends* "jag har faktiskt inte … än" (`route.ts:729-757`). It flags, it does not act → the "I'll do it" / "I didn't do it" split.
- **Agents are not first-class actors from chat.** An "agent" is a row referenced by a workflow step; the only way to "delegate to an agent" is to run a workflow whose step targets that `agent_id`. There is no direct "assign task to agent → it runs" path.

---

## 2. Desired Operator architecture

**Principle.** Every operator verb maps to exactly **one** tool whose handler produces the real side effect on the **one durable queue**; the model is **compelled** to call it when intent is operator; narration is never a substitute; the honesty layer becomes a *trigger of last resort*, not a disclaimer.

### 2.1 The execution model (Atlas → Manager → Workflow → Agent)

```
                 ┌─────────────────────────── ATLAS (Operator brain) ───────────────────────────┐
User goal ─────► │ 1 Analyze (live context, intel)   2 Detect opportunities/problems            │
                 │ 3 Decide: reuse workflow? create one? delegate? 4 Act via ONE tool per verb   │
                 └───────────┬───────────────────────────────┬───────────────────────┬──────────┘
                             │ plan?                          │ create                 │ launch / delegate
                             ▼                                ▼                        ▼
                    MANAGER (advisory planner)        create_workflow          launch_workflow / delegate_work
                    lib/ai/manager.ts                 → workflows row          → runs(status='pending')   [DURABLE]
                    .plan() / .planToWorkflow()                                        │
                    returns a WORKFLOW DRAFT ───────────────────────────────► (Atlas saves + launches)
                                                                                       ▼
                                                          DURABLE ENGINE: claim_runs → runSteps → done/failed
                                                                                       │  per step
                                                                                       ▼
                                                          AGENT: runner loads agents row, executes step
                                                                                       │
                                                          MONITOR (get_run_status / list_runs / SSE) ──► REPORT (Atlas)
```

Roles, sharply separated:
- **Atlas = Operator.** Owns intent → decision → action → monitoring → reporting. The only component that *acts*.
- **Manager = Planner (advisory).** Breaks goals into steps, prioritizes, proposes a workflow draft. Never the execution path. ("Manager proposes; Atlas disposes.")
- **Workflow = the unit of executable work.** A definition (`workflows.steps`) launched as a `run`.
- **Agent = the executor of a step.** Selected by `agent_id` within a workflow step; runs inside the durable engine.

"Delegate to an agent" therefore means: **create/select a workflow whose step targets that agent, then launch it as a durable run** — not write a tracking row.

### 2.2 Closed-loop autonomy (Advisor → Analyst → Operator)

1. **Analyst** (mostly exists): Atlas reads live context + intel and *names* opportunities/problems.
2. **Operator** (this design): Atlas turns a named opportunity into action — `create_workflow` (if none fits) → `launch_workflow`/`delegate_work` → monitor → report.
3. **Guardrails** keep it safe: publish confirmation, project isolation, single durable queue, kill switch, "never claim success without a tool result."

---

## 3. Gap analysis

| # | Gap | Impact | Severity |
|---|---|---|---|
| G1 | **No `manager_task → runs` bridge**; delegation writes tracking rows that never execute | "Delegate" is theatre | Critical |
| G2 | **Manager has no execute path**; "delegate to manager" routes to advisory `ask_manager` | Plans don't become runs | Critical |
| G3 | **Tool forcing is turn-0-only & intent-gated**; operator verbs on later/conversational turns aren't forced | Atlas narrates instead of acting | High |
| G4 | **Ambiguous routing**: "delegate/operate/kör planen" can land on `ask_manager` (no-op) instead of a writing tool | Non-deterministic execution | High |
| G5 | **Honesty guard is reactive**, not corrective; flags false claims but never triggers the action | User sees "I'll do it / I didn't" | High |
| G6 | **Agents aren't first-class actors** from chat; only reachable as workflow steps | No clean "assign to agent" verb | Medium |
| G7 | **Opportunity → action loop is open**: opportunities are read-only; nothing converts one into a launched workflow | Analyst, not Operator | Medium |
| G8 | **Monitoring is per-id**; no `list_runs` filter API for "what's running / failed now" | Weak closed-loop reporting | Medium |
| (G0) | fastPath drops live context for "sammanfatta …" (Issue 1) | Summaries look data-less | High but isolated; independent fix already staged |

---

## 4. Required tool changes

Collapse to **one unambiguous tool per operator verb**, documented in `TOOL_GUIDE` so the model has no no-op route:

| Verb | Tool (proposed) | Handler does | Replaces / relates to |
|---|---|---|---|
| Analyze | `get_records`, live context | read | unchanged |
| Detect | `get_opportunities` | read precomputed + on-demand | `listOpportunities` (exists) |
| **Create** | `create_workflow` | validate + write `workflows` | rename of `save_workflow` (alias kept) |
| **Launch** | `launch_workflow` | `runs(pending)` → drain | rename of `trigger_workflow` (alias kept) |
| **Delegate** | `delegate_work` (NEW) | resolve goal → workflow (reuse or create) → `runs(pending)`; link `manager_tasks.run_id` | replaces execution role of `delegate`/`ask_manager` |
| Plan | `ask_manager` (advisory) + `manager.planToWorkflow()` | returns a workflow DRAFT for Atlas to save+launch | `ask_manager` stays advisory |
| Monitor | `get_run_status`, `list_runs` (NEW) | read; filters project/status/workflow | adds list endpoint |
| Report | live context, `get_records` | read | unchanged |

Cross-cutting handler/orchestration changes:
- **Forcing matrix**: detect operator intent on *any* turn; set `tool_choice` to the specific writing tool (pattern already used for `navigate`).
- **Corrective honesty guard**: when an action/delegate claim is detected with no matching tool call, **re-prompt one turn with `tool_choice` forced** to the tool; keep the disclaimer only as the final fallback.
- **`manager_tasks.run_id`** (nullable FK) so a delegated task references the run it spawned.
- All new write tools resolve `project_id` through `assertProjectAllowed` (isolation preserved) and honor `execution_paused`.

---

## 5. Workflow execution path — Atlas chat → durable run

### 5.1 Target end-to-end (launch / delegate)

```
1. User: "delegera dagens nyhetsklipp till The Prompt-agenten"
2. Atlas classifies → operator intent = delegate  → tool_choice forced to delegate_work
3. delegate_work handler:
     a. resolve project (owner-checked)         → project_id
     b. resolve workflow: reuse matching active workflow OR call manager.planToWorkflow()
        → (optional) create_workflow → workflows row
     c. publish step? → require confirm_publish (else return needs_confirmation)
     d. INSERT runs { project_id, workflow_id, status:'pending', input, kind }
     e. (optional) INSERT/UPDATE manager_tasks { run_id }   ← tracking link
     f. return { run_id, status:'queued' }   ← real tool result
4. honesty guard: delegateToolUsed=true → NO disclaimer; Atlas reports the real run_id
5. pg_cron drain → claim_runs (SKIP LOCKED, lease) → runSteps → per step: runner loads agent → LLM/image
6. status → done/failed/retry; reaper recovers stuck leases; kill switch enforced in claim_runs
7. Monitor: get_run_status / list_runs / SSE stream → Atlas reports outcome + cost + duration
```

### 5.2 Why this is safe and non-duplicative
- Reuses the **single** durable queue (`runs`) and the existing claim/lease/reaper — no parallel executor (avoids the H1 engine-split trap).
- `delegate_work` and `launch_workflow` converge on the **same insert path** as today's `trigger_workflow`; only resolution logic (reuse vs create vs plan) differs.
- Confirmation, isolation, and kill-switch invariants are all enforced at the existing choke points.

### 5.3 Invariants (must hold)
Publish stays gated (`confirm_publish`); project isolation via `assertProjectAllowed`; one durable queue; never claim success without a run_id/tool result; `projects.execution_paused` honored.

---

## 6. Recommended implementation order

Each phase = own commit(s), build + tests green, reversible.

- **O0 — Foundations (no behavior change).** `manager_tasks.run_id` migration; intent-classifier + forcing-matrix unit tests; rename `save_workflow`→`create_workflow`, `trigger_workflow`→`launch_workflow` (keep aliases).
- **O1 — Reliable launch (highest leverage, lowest risk).** Force `tool_choice` to `launch_workflow` for launch intent on any turn; corrective guard for launches. ⇒ "starta workflow X" always runs; the false-claim message disappears for launches.
- **O2 — Delegation that executes (core bridge, G1/G2/G4).** Add `delegate_work` (resolve→workflow→run, link `run_id`); route "delegate/kör planen" to it; stop routing execution to `ask_manager`; corrective guard for delegation.
- **O3 — Manager as planner, Atlas as operator (G2).** `manager.planToWorkflow()` returns a draft Atlas saves+launches in one confirmed step; `ask_manager` stays advisory.
- **O4 — Opportunity → action loop (G7).** `get_opportunities` tool + an explicit "act on opportunity" path that drafts/launches a workflow from a named opportunity.
- **O5 — Monitor & report (G8).** `GET /api/runs` list endpoint + `list_runs` tool (project/status/workflow filters); surface progress via SSE. ⇒ closed loop: launch → monitor → report.
- **(Independent) G0 fastPath fix** — ship anytime; not part of the Operator chain.

---

## 7. H1 vs later phases

**H1 (engine hardening) — prerequisite-ish, but separable:** unify the two workflow execution engines so the durable **drain** path runs the rich executor logic (output validation, quality gate, **approval creation**, bug reporting) instead of the lightweight `runSteps`; add step checkpointing/idempotency; make `resume` durable; wire/remove `cancel_requested`. This is about *what happens inside a run* once launched.

**Operator (O0–O5) — this document:** about *getting from Atlas intent to a launched run* and back. It rides on whatever the drain path does.

Dependency: **O1/O2 share the durable queue with H1.** Two viable sequencings —
- **Recommended: H1 first, then O1–O2.** Operator launches then inherit validation/approvals/idempotency automatically; delegated runs are trustworthy from day one.
- **Alternative: O1 on the current drain path now**, accept that early Operator launches lack approval/quality gates, and inherit them when H1 lands. Faster Operator demo, weaker guarantees.

Belongs clearly to **later phases (post-Operator):** Dream-Engine learning from outcomes (recommendations/auto-opportunity detection), multi-step planning autonomy, and any move toward unattended execution.

---

## 8. Open decisions for Andre

1. **Delegation model:** `delegate_work` = create/launch a workflow (recommended) vs a separate task-queue drainer.
2. **Autonomy default:** require an explicit in-chat confirmation before any launch, or auto-run non-publish workflows immediately?
3. **Manager's future:** keep advisory planner (recommended) or invest later in a truly executing manager?
4. **Sequencing:** H1 before O1–O2 (safer, recommended) or O1 now on the current drain path (faster)?
5. **Agent-as-actor:** is "delegate to agent X" always expressed as a one-step workflow targeting that `agent_id`, or do we want a dedicated lightweight `run_agent` tool?
