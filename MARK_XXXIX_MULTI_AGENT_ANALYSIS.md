# Mark-XXXIX — Multi-Agent Analysis + Omnira Agent-Hierarchy Design

_Read-only analysis. Primary files: `main.py` (`JarvisLive`), `agent/task_queue.py`, `agent/planner.py`, `agent/executor.py`, `agent/error_handler.py`, `actions/screen_processor.py`, `memory/memory_manager.py`. No files modified. Self-contained for handing to another model/advisor._

---

## 0. TL;DR

**Mark-XXXIX is a single-agent system.** There is exactly **one** reasoning agent — the Gemini Live conversational orchestrator in `main.py` — plus one **specialist sub-process** (the vision module, which has its own Live session but no return channel) and a **non-conversational worker pipeline** (`planner → executor → error_handler`) hidden behind the `agent_task` tool. None of these are peers, none negotiate, none share state. There is **no message bus, no blackboard, no handoff protocol, no agent-to-agent communication, and the entire `agent/` subsystem is memory-blind** (it never reads or writes the user's long-term memory — verified by search). It is **hub-and-spoke delegation to a single worker**, not a collaborating multi-agent society.

For Omnira the lesson is that you cannot grow this into Global/Project Atlas by adding more `if/elif` — you need a **supervised hierarchy** with **tiered, isolated memory** and a **brokered communication layer**, which is what the second half of this document designs.

---

## 1. Single agent vs multi-agent

**Single agent, with one sub-process and one worker pipeline.** The whole system contains only **two** Gemini Live sessions (verified — `grep` for `live.connect` returns exactly two):

| Component | File | Is it an "agent"? | Role |
|---|---|---|---|
| **Conversational orchestrator** (`JarvisLive`) | `main.py:489` | **Yes** — the only true agent | Hears, reasons, selects/calls tools, speaks. Owns memory + the session. |
| **Vision module** (`screen_process`) | `screen_processor.py:276` | Sub-agent (specialist) | Own Live session; analyzes screen/cam; **speaks directly to the user**; no return value to the orchestrator. |
| **Planner / Executor / Error-handler** | `agent/*.py` | **No** — a function pipeline | Behind `agent_task`. A sequence of LLM _calls_, not autonomous agents. |

So "agents" in the marketing sense don't exist. There's one brain (the Live orchestrator), one eye that talks on its own (vision), and one back-office worker (the agent pipeline) that the brain can hand a goal to. No two of them reason concurrently about a shared task, and no two of them exchange messages.

## 2. Planner architecture

The planner is a **stateless, single-shot LLM function**, not an agent:

- `create_plan(goal)` (`planner.py:174`) calls `gemini-2.5-flash-lite` with the `PLANNER_PROMPT` and returns JSON `{goal, steps[]}`, **max 5 steps**, each step `{step, tool, description, parameters, critical}`.
- The plan is a **flat linear list** — no dependency graph, no branching, no parallelism. The prompt explicitly forbids any inter-step data flow: _"NEVER reference previous step results in parameters. Every step is independent."_ (`planner.py:22`).
- `replan(goal, completed, failed_step, error)` (`planner.py:234`) regenerates the remaining plan from scratch on failure, using a stronger model (`gemini-2.5-flash`).
- It is **not a participant in a conversation** — it gets a goal string, returns JSON, and disappears. It holds no state between calls and cannot ask the orchestrator or the user anything.

This is "LLM-as-decomposer," a classic plan-then-execute pipeline, executed by one worker — distinct from multi-agent planning where planners and executors are separate, communicating roles.

## 3. Task delegation

Delegation exists in exactly **one direction and one hop**: orchestrator → worker.

- When the Live model calls the `agent_task` tool, `main.py:651-655` maps a priority and calls `get_queue().submit(goal, priority, speak=self.speak)`, then **returns immediately** with `"Task started (ID: …)"` — fire-and-forget.
- The `TaskQueue` (`task_queue.py`) is a **priority list with a single daemon worker** and **`max_concurrent=1` by default** (`:38`) — so delegated tasks run **one at a time**, not as a team. The worker lazily instantiates **one shared `AgentExecutor`** (`:45`) and runs the planner→executor pipeline.
- There is **no delegation between workers, no sub-delegation, no task tree.** A task cannot spawn collaborating subtasks; the executor just iterates its 5 steps. The vision module is "delegated" to only in the sense that the orchestrator starts a thread and goes silent (`main.py:638`) — there's no task object, no tracking, no result.

So delegation is **one supervisor handing a whole goal to one worker**, never a team decomposition.

## 4. Agent communication

**There is no agent-to-agent communication.** Verified: no message bus, blackboard, pub/sub, inbox, or handoff primitive exists anywhere in the repo. All "communication" is **callbacks aimed at the human**, not at other agents:

- The `Task` dataclass carries two callables — `speak` and `on_complete` (`task_queue.py:30-31`). On completion the worker invokes `on_complete(task_id, result)` and uses `speak()` to voice updates **to the user**. These are upward status reports to the human, not lateral messages to peers.
- The **vision sub-agent has no return channel at all** — it speaks to the user directly and the orchestrator is instructed to stay silent (`main.py:638`, `core/prompt.txt`). The orchestrator never learns what vision saw, except by hearing it like the user does.
- The planner, executor, and error-handler pass plain Python values (dicts/strings) **within one call stack** — that's function calls, not agent messaging.

Net: the topology is a **star with the human at the center of every edge.** Components report to the user; they do not talk to each other.

## 5. Shared memory

**No shared memory across components — and the agent subsystem is memory-blind.** Verified by search: nothing under `agent/` references `long_term`, `memory_manager`, `load_memory`, or `update_memory`.

- The user's long-term memory (`memory/long_term.json`, six buckets) is owned and used **only by the Live orchestrator** — read in `_build_config` (`main.py:520`) and written via the `save_memory` tool. The planner/executor/queue **never see it**, so delegated tasks run without the user's context, preferences, or identity.
- The executor keeps **ephemeral per-run state** in local dicts (`completed_steps`, `step_results`) that exist only for the duration of one `execute()` call and are discarded after. There is no persistent, shared, or cross-task store.
- The vision module shares nothing — separate process, separate session, no write-back.

So there is no "shared workspace" any two components read and write. State is either (a) the orchestrator's private memory, or (b) a worker's throwaway locals. This is the single biggest blocker to turning Mark into a multi-agent system: **collaboration requires shared, governed state, and there is none.**

---

## 6. Verdict

| Question | Answer |
|---|---|
| Single vs multi-agent | **Single agent** + 1 fire-and-forget vision sub-process + 1 single-threaded worker pipeline |
| Planner | Stateless single-shot LLM decomposer; flat 5-step list; independent steps; no graph |
| Delegation | One-hop, one-direction (orchestrator → 1 worker); `max_concurrent=1`; no task tree |
| Communication | **None between components**; callbacks report to the human only |
| Shared memory | **None**; agent subsystem is memory-blind; only the orchestrator owns memory |

**Architecture name:** supervised hub-and-spoke with a single worker — *not* a multi-agent collaboration. It is a perfectly reasonable shape for a one-user desktop assistant and a dead end for an org-scale operating platform.

---

## 7. Design: Omnira agent hierarchy (Global Atlas → Project Atlas → project agents)

**Thesis:** Omnira needs a **supervised hierarchy**, not a flat swarm. Autonomy is bounded at each tier; collaboration happens through **governed shared state and brokered messages**, never free-for-all chat; and **project isolation is the invariant that the communication layer is built to preserve, not bolt on.** This also directly closes the gap your CTO analysis named — _"Agent Management 60%: delegate→tasks exist, but agents don't execute delegated tasks autonomously; no feedback loop."_

### 7.1 The tiers

```
┌─────────────────────────── GLOBAL ATLAS (org chief-of-staff) ───────────────────────────┐
│ • Owns ORG memory (identity, cross-project goals, P&L rollups)                            │
│ • Sees only REDACTED, permitted summaries from projects — never raw project data         │
│ • Delegates DOWN to Project Atlas; brokers ACROSS projects                               │
│ • Supervisor pattern: bounds autonomy, resolves cross-project conflicts                  │
└───────────────┬─────────────────────────────────────────────┬────────────────────────────┘
                │ delegate (scoped task envelope)              │ delegate
                ▼                                              ▼
   ┌──── PROJECT ATLAS — "The Prompt" ────┐        ┌──── PROJECT ATLAS — "Familje-Stunden" ──┐
   │ • Owns PROJECT memory (isolated)      │        │ • Owns PROJECT memory (isolated)         │
   │ • Project-scoped secrets (vault)      │        │ • Project-scoped secrets (vault)         │
   │ • Plans; delegates to project agents  │        │ • Plans; delegates to project agents     │
   │ • Reports UP via redacted summaries   │        │ • Reports UP via redacted summaries      │
   └──────┬───────────────┬────────────────┘        └──────────────────────────────────────────┘
          ▼               ▼
   ┌─ content agent ─┐  ┌─ growth agent ─┐  ┌─ browser agent ─┐  ┌─ desktop agent ─┐
   │ specialist      │  │ specialist     │  │ runtime: browser│  │ runtime: desktop│
   └─────────────────┘  └────────────────┘  └─────────────────┘  └─────────────────┘
          └──── share a PROJECT BLACKBOARD (governed, project-scoped) ────┘
```

### 7.2 Global Atlas

- **Role:** organization-level chief of staff and the **only** tier allowed to coordinate across projects. It owns **org memory** (identity, strategy, cross-project objectives, financial rollups) and a **portfolio view** assembled *only* from redacted summaries that each Project Atlas chooses to publish.
- **Authority:** delegates whole objectives **down** to Project Atlas instances; never reaches into a project's raw data, secrets, or agents directly. Cross-project work is **brokered**, not executed by Global Atlas itself.
- **Pattern:** a **supervisor** — it sets goals, arbitrates conflicts (two projects wanting the same budget/asset), and enforces org policy. It does not micromanage project internals.

### 7.3 Project Atlas

- **Role:** per-project orchestrator, the analog of Mark's single Live agent but **scoped to one project.** Owns **project memory** (isolated store), **project-scoped secrets** (Omnira token vault / `g1_multitenant_platform_tokens`), and the project's enabled tool set (from the Tool Registry design).
- **Authority:** plans within the project and **delegates to project-specific agents**; runs the closed delegation loop (assign → execute → verify → report) that Mark lacks. Reports **up** to Global Atlas only as **redacted summaries/events** it is permitted to share.
- **Isolation invariant:** a Project Atlas **cannot read another project's memory, secrets, or blackboard.** It only knows what Global Atlas brokers to it.

### 7.4 Project-specific agents

- **Role:** specialist workers registered into one project's scope — e.g. content, growth, **browser agent** (`runtime: browser-agent`), **desktop agent** (`runtime: desktop-agent`) from the earlier designs. They self-register their tools into the project namespace (per the Tool Registry).
- **Collaboration:** within a project they share a **governed Project Blackboard** — a project-scoped shared-state store (shared memory done right, the thing Mark has none of) plus a **project task queue** with durable, recoverable runs (reuse Omnira's `durable_runs`). They coordinate by reading/writing structured entries on the blackboard and by exchanging **task envelopes**, not free-form chat.
- **Bounded autonomy:** an agent executes delegated tasks autonomously **inside its capability grants**, posts results/observations back to the blackboard, and escalates to Project Atlas on failure — the feedback loop your gap analysis says is missing.

### 7.5 Cross-project coordination (without breaking isolation)

This is the crux. Projects **never talk to each other directly.** All cross-project flow goes through **Global Atlas as a broker**, over an explicit **coordination channel** with three guarantees:

1. **Brokered, not peer-to-peer.** Project A cannot address Project B. A publishes a *request/event* to Global Atlas; Global Atlas decides whether to forward a **redacted, policy-checked** version to B. No shared blackboard spans projects.
2. **Redaction + capability checks at the boundary.** What crosses is summaries and explicit, granted artifacts — never raw memory, secrets, or PII. Each cross-project grant is a short-lived capability token scoped to exactly the shared artifact (ties to the Tool Registry's capability model). Enforce with Supabase **row-level security** keyed by `project_id`/`workspace_id`.
3. **Auditability.** Every cross-project message (envelope + redaction + grant) is logged and streamed — so isolation is *provable*, not assumed.

Example: the Growth agent in "The Prompt" discovers a tactic useful to "Familje-Stunden." It can't message that project. It posts an insight to its Project Atlas → which publishes a redacted summary up to Global Atlas → which, under policy, delegates a new task down to Familje-Stunden's Project Atlas. Knowledge flows; raw data and credentials never cross.

### 7.6 Memory tiers (the shared-state model Mark lacks)

| Tier | Scope | Store | Who reads/writes |
|---|---|---|---|
| **Org memory** | Global | org-scoped table | Global Atlas only |
| **Project memory** | One project | project-scoped table (RLS by `project_id`) | That Project Atlas + its agents |
| **Project blackboard** | One project | shared-state store, project-scoped | That project's agents (collaboration) |
| **Agent scratch** | One run | ephemeral | One agent, discarded after run |

Each tier is physically/logically isolated; higher tiers see lower tiers **only through published, redacted summaries.** This replaces Mark's "one private blob + throwaway locals" with a governed, multi-tenant memory hierarchy.

### 7.7 Communication & delegation mechanics

- **Delegation envelope:** `{from_tier, to_agent, objective, project_ctx, capability_token, idempotency_key, deadline}` — durable (recoverable via `durable_runs`), so delegated work survives restarts (Mark's queue is lost on exit).
- **Within a project:** shared blackboard + task queue (cooperative, concurrent — drop Mark's `max_concurrent=1`).
- **Across projects:** brokered event/request channel through Global Atlas, redacted + capability-gated + audited.
- **Supervisor-bounded autonomy:** each tier can act autonomously within its grants and must report results upward; supervisors arbitrate and can preempt — avoiding the instability of fully autonomous swarms while still closing the execution loop.

### 7.8 What to copy from Mark vs invert

- **Copy:** the single-orchestrator-owns-the-conversation model (it maps cleanly onto *Project* Atlas); cheap-model-plans / strong-model-replans; fire-and-forget delegation for long jobs (but make it durable and tracked).
- **Invert:** memory-blind workers → **tiered shared memory**; no communication → **governed blackboard + brokered cross-project channel**; `max_concurrent=1`, one worker → **concurrent project agents under a supervisor**; lost-on-exit queue → **durable runs**; flat hub-and-spoke → **Global→Project→agent hierarchy with isolation as the invariant.**

### 7.9 Phasing

- **v1.0** — formalize **Project Atlas** as a scoped orchestrator with isolated project memory + project blackboard; close the delegate→execute→verify→report loop for project agents (fixes the "agents don't execute autonomously / no feedback loop" gap).
- **v1.1** — **Global Atlas** as supervisor over multiple Project Atlas instances; org memory + redacted roll-up summaries.
- **v1.2** — **brokered cross-project coordination channel** with redaction, capability grants, RLS, and audit.
- **v1.3** — register **browser-agent** and **desktop-agent** as project-scoped specialists into the hierarchy (ties the prior two designs together).

**One-line summary:** Mark is a single supervised agent with a memory-blind worker and no inter-agent channel; Omnira should become a **three-tier supervised hierarchy — Global Atlas over Project Atlas over project specialists — with tiered isolated memory and a brokered, redacted, audited cross-project channel, so collaboration scales while project isolation stays an enforced invariant rather than a hope.**

---

### Files referenced

`main.py` (`JarvisLive` `:489`, `_build_config` `:520`, `agent_task` submit `:651`, vision dispatch `:638`) · `agent/task_queue.py` (`Task` `:23-31`, `TaskQueue(max_concurrent=1)` `:38`, single worker, `on_complete`/`speak` callbacks) · `agent/planner.py` (`create_plan` `:174`, `replan` `:234`, independent-steps rule `:22`) · `agent/executor.py` (single shared `AgentExecutor`, ephemeral `step_results`) · `actions/screen_processor.py` (second Live session `:276`, no return channel) · `memory/memory_manager.py` (orchestrator-only long-term memory) · _verified absent:_ message bus / blackboard / `agent/`-side memory access.
