# Mark-XXXIX — Tool Architecture Deep Audit + Omnira Tool Registry Design

_Read-only audit. Primary files: `main.py` (`TOOL_DECLARATIONS`, `_execute_tool`), `agent/planner.py` (`PLANNER_PROMPT`), `agent/executor.py` (`_call_tool`), `actions/*.py`, `core/prompt.txt`, `actions/computer_settings.py` + `actions/desktop.py` (the only safety guards). No files modified. Self-contained for handing to another model/advisor._

---

## 0. TL;DR

Mark's tool system is **schema-first Gemini function-calling with a hand-written `if/elif` dispatcher** — clean and reliable at ~20 tools, but it has no registry _as a thing_. Tools aren't registered, discovered, or scoped at runtime; they are **hardcoded in three separate places that must be kept in sync by hand**, and they already aren't: the planner's catalog still calls the product "MARK XXV," and the three lists carry **20 / 18 / 17** tools respectively. There is **almost no permission model** — exactly two micro-guards exist (restart/shutdown needs `confirmed=yes`; a weak `exec` sandbox in `desktop.py`), while file deletion, messaging, clicks, browser actions, and arbitrary Python execution all run with zero consent. For Omnira the takeaway is to invert this: **one declarative tool manifest as the single source of truth**, a **capability/permission layer**, **project-scoped isolation**, and a **runtime that future desktop/browser agents can register into dynamically.**

---

## 1. Tool registration

There is no registration mechanism — there are **three static, manually-authored catalogs**, plus a fourth dispatch site:

| # | Location | Form | Count | Consumed by |
|---|---|---|---|---|
| 1 | `main.py` → `TOOL_DECLARATIONS` (`:64-503`) | Gemini `function_declarations` JSON schema | **20** | The Live model (real-time path) |
| 2 | `agent/planner.py` → `PLANNER_PROMPT` (`:17-166`) | Prose tool catalog w/ params + examples | **17** | The planner LLM (multi-step path) |
| 3 | `agent/executor.py` → `_call_tool` (`:174-247`) | `import` + `if/elif` dispatch | **18** | The executor (multi-step path) |
| 4 | `main.py` → `_execute_tool` (`:562-697`) | `if/elif` dispatch | 20 | The Live path (invocation) |

A "tool" is simply: an entry in catalog #1 (schema), a branch in dispatcher #4, and — if it should be available to multi-step goals — an entry in #2 and a branch in #3. The implementation is an `actions/<name>.py` module exporting one function with the uniform signature `tool(parameters: dict, response=None, player=None, session_memory=None) -> str`.

**Proof of drift (this is the headline finding):**
- Catalog #2 opens with _"You are the planning module of **MARK XXV**"_ — a copy-paste fossil from an earlier version, never updated. The catalogs are edited independently.
- Counts disagree (20/18/17): e.g. `file_processor`, `save_memory`, and `agent_task` exist in the schema but not the planner catalog; `generated_code` exists in the executor but is **explicitly forbidden** in the planner prompt (_"NEVER use generated_code… It does not exist."_).
- There is **no validation** that the four sites agree, no schema shared between them, no test. Drift is silent and guaranteed to grow.

## 2. Tool discovery

**None — fully static.** No runtime enumeration, no plugin scanning, no manifest, no capability query. The model "discovers" tools only by reading the static schema/prompt that is injected once, at session start (`_build_config`, `main.py:520-560` prepends time + memory + system prompt and attaches `TOOL_DECLARATIONS`). Adding a tool requires a code edit and process restart; nothing is loaded or advertised dynamically. Atlas-style "what can I do here?" introspection is impossible.

## 3. Tool selection

Two independent selectors, one per execution path:

- **Real-time path — the Gemini Live model itself** performs native function-calling selection over `TOOL_DECLARATIONS`. Routing is shaped only by prose hints in `core/prompt.txt`: _"computer_settings: ALL single OS actions… agent_task: ONLY for complex, multi-step (3+ steps)… Do not call agent_task while you can accomplish it with a tool."_ So the system prompt is the routing policy.
- **Multi-step path — the planner LLM** (`create_plan`, `planner.py:174`) selects a tool per step from the prose catalog, emitting JSON steps `{step, tool, description, parameters, critical}`, **max 5 steps, every step independent** (the prompt forbids referencing prior results).

Selection is therefore **entirely model-driven** in both paths, with no deterministic router, no parameter validation against real signatures, and no disambiguation when two tools overlap (e.g. `computer_settings` vs `computer_control` vs `desktop_control`).

## 4. Tool execution

Two execution engines, two contracts:

**Real-time path — `_execute_tool(fc)` (`main.py:562`):**
- `save_memory` handled inline (silent). All others dispatched via `if/elif`.
- Blocking tools run on a thread pool: `await loop.run_in_executor(None, lambda: tool(parameters=args, player=self.ui))`. Vision and shutdown spawn their own daemon threads. `agent_task` submits to the global `TaskQueue` and returns immediately (`"Task started (ID: …)"`) — fire-and-forget, results delivered later via the queue's `speak` callback.
- Returns `types.FunctionResponse(id, name, response={"result": <string>})` to the model.

**Multi-step path — `_call_tool(tool, parameters, speak)` (`executor.py:174`):**
- Lazy per-tool `import` then call; returns a plain string.
- **Unknown tool → falls back to `_run_generated_code`** (`executor.py:245`), i.e. it asks an LLM to write Python and **executes it on the host** under a 120 s subprocess timeout. So an unrecognized tool name becomes arbitrary code execution.
- Wrapped by the executor's 3-retry / `analyze_error` / `replan` machinery (the richer error path).

Both ultimately call the same `actions/<name>.py` function. The uniform signature is the one genuinely good registry-like property: tools are interchangeable plug-ins at the call site.

## 5. Tool permissions

**Effectively none.** A full-repo search for consent/permission/allowlist surfaced only two guards:

1. **Destructive OS actions** — `computer_settings.py:567,635`: `_DANGEROUS_ACTIONS = {"restart", "shutdown"}` require `confirmed in ("yes","true","1","confirm")`, else it returns a "please confirm" string. This is the _only_ user-consent gate in the system.
2. **A weak `exec` sandbox** — `desktop.py:38-97` builds a restricted `__builtins__` dict for `exec(compile(...))`. It limits some builtins but still exposes `pyautogui`, `ctypes`, `winreg`, etc., so it is not a real sandbox.

Everything else runs unguarded with full user privileges: `file_controller` delete/move, `send_message` (sends real WhatsApp/Telegram messages), `browser_control` (acts on logged-in profiles), `computer_control` (arbitrary clicks/keystrokes), and `code_helper`/`dev_agent`/`generated_code` (**arbitrary Python on the host**). There is **no per-tool capability model, no scoping, no allowlist, no project boundary, no audit trail** beyond `print()`. The trust boundary is "the model decided to," full stop.

---

## 6. How tools are exposed to Gemini

`TOOL_DECLARATIONS` (a Python list of `{name, description, parameters: <OBJECT schema>}`) is attached to the Live session config: `types.LiveConnectConfig(..., tools=[{"function_declarations": TOOL_DECLARATIONS}], system_instruction="\n".join([time_ctx, memory, sys_prompt]))` (`main.py:545-560`). So the model receives, in one config object at connect time: current date/time, the user's rendered long-term memory, the system prompt (routing rules), and the full tool schema. That static bundle _is_ the tool interface — it never changes during a session.

## 7. How tools are invoked

The receive loop (`_receive_audio`, `main.py:743`) watches the stream: when `response.tool_call` arrives, it iterates `response.tool_call.function_calls`, awaits `_execute_tool(fc)` for each, collects `FunctionResponse`s, and calls `await session.send_tool_response(function_responses=...)`. The model then continues the turn (speaks/acts on the result). `agent_task` is the one async exception: it returns instantly and the `TaskQueue` worker later runs planner→executor and pushes spoken updates through the `speak` callback — decoupling long jobs from the voice turn.

## 8. How errors propagate

Two divergent error models:

- **Real-time path:** `_execute_tool` wraps dispatch in `try/except`; on failure it sets `result = f"Tool '{name}' failed: {e}"`, calls `speak_error()` (logs + says _"Sir, {tool} encountered an error…"_), prints the traceback, and **returns the error string as the function result**. The model sees the error text and decides what to say. No retry (the "One-Call Policy" forbids it). Errors are unstructured strings.
- **Multi-step path:** the executor catches per-step exceptions and routes them through `analyze_error()` → an `ErrorDecision` enum (RETRY/SKIP/REPLAN/ABORT), with up to 3 retries/step and 2 replans, and `generate_fix()` to rewrite a failing step into code. Critical steps can't be skipped. This path has real recovery; the real-time path has essentially none.

So the _same tool_ fails differently depending on who called it — a string to the model in one path, a structured decision-and-retry in the other. There is no unified `ToolError`.

## 9. How new tools are added

The current procedure (and its tax):

1. Write `actions/<name>.py` with the uniform signature.
2. Add a JSON schema entry to `TOOL_DECLARATIONS` (`main.py`).
3. Add an `if/elif` branch to `_execute_tool` (`main.py`).
4. (For multi-step) add a prose entry to `PLANNER_PROMPT` (`planner.py`).
5. (For multi-step) add an `import`+branch to `_call_tool` (`executor.py`).

**Up to four edit sites, no shared schema, no validation, no test, restart required.** This is precisely why the catalogs drift ("MARK XXV", 20/18/17). It works at 20 tools and degrades fast beyond that.

---

## 10. Summary scorecard

| Concern | Mark-XXXIX | Verdict |
|---|---|---|
| Registration | 3–4 hand-synced static lists | Drifting, no SoT |
| Discovery | None (static, restart-bound) | Absent |
| Selection | Model-driven, prompt-routed | OK at small N, no validation |
| Execution | Uniform-signature dispatch; unknown→arbitrary code | Clean core, unsafe fallback |
| Permissions | 2 micro-guards; else unguarded | Effectively none |
| Error model | Two incompatible paths | Unstructured / inconsistent |
| Adding tools | 4 edit sites, no tests | Doesn't scale |
| Observability | `print()` only | Absent |

**Good bones worth keeping:** schema-first function calling; one uniform tool signature; cheap-model-plans/strong-model-fixes; async fire-and-forget for long jobs. **Everything else needs a real registry.**

---

## 11. Design: Omnira Tool Registry

**Thesis:** replace Mark's 3-to-4 hand-synced lists with **one declarative manifest per tool as the single source of truth**, served by a **registry-as-a-service** that Atlas queries, a **policy/capability layer** that gates every call, and a **router** that dispatches to the right runtime — cloud worker today, **desktop agent and browser agent tomorrow**. Optimized for the five goals you named.

### 11.1 The tool manifest (single source of truth)

One declarative record per tool/version. Everything else (model schema, dispatch binding, planner catalog, docs, permission checks) is **generated** from it — killing the drift class entirely.

```yaml
tool: browser.click
version: 2
summary: "Click an element in the active browser page."
runtime: browser-agent            # cloud | desktop-agent | browser-agent
input_schema:  {type: object, ...} # Pydantic/Zod — validated both ways
output_schema: {status, observed_state, error?}   # structured, not a string
capabilities: [browser:interact]   # required capability grants
risk: medium                       # low | medium | high(destructive/spend)
consent: per_session               # never | per_session | per_call
scope: project                     # global | workspace | project
idempotent: false
observability: {emit_screenshot: true}
```

Registration becomes: **drop a manifest + handler; the registry validates and advertises it.** No edits to four files, no restart, no drift. A CI check rejects a manifest whose handler signature or schema disagrees with it.

### 11.2 Five subsystems

```
            ┌──────────────────────── Atlas (orchestrator) ───────────────────────┐
            │  1) DISCOVERY: query registry, scoped to {workspace, project, user}  │
            │  2) PLAN over the returned capability set                            │
            │  3) INVOKE via a uniform envelope                                    │
            └───────────────┬─────────────────────────────────────────────────────┘
                            ▼
   ┌──── REGISTRY (service) ────┐   manifests = single source of truth
   │ • register/version/advertise│  → generates: model schema, planner catalog,
   │ • scope & namespace tools   │    dispatch bindings, docs (no hand-sync)
   └───────────────┬─────────────┘
                   ▼
   ┌──── POLICY / CAPABILITY LAYER ────┐  every call passes through here
   │ • check capability grant (project) │
   │ • consent gate (risk=high → ask)   │
   │ • inject scoped secrets (vault)    │
   │ • rate/spend limits, allowlist     │
   └───────────────┬────────────────────┘
                   ▼
   ┌──── ROUTER ────┐  route by manifest.runtime + project context
   │ cloud worker   │  desktop-agent (user A's mac)   browser-agent (ctx N)
   └──────┬─────────┘
          ▼
   ┌──── EXECUTION (isolated per project) ────┐
   │ validate input → run → validate output →  │
   │ structured ToolResult{status,output,error,│
   │ observations} → audit/stream to Omnira    │
   └───────────────────────────────────────────┘
```

### 11.3 Optimized for your five targets

**A. Multi-project workspaces.**
- Every tool has a `scope` (global / workspace / project) and lives under a **namespace** (`browser.*`, `desktop.*`, `crm.hubspot.*`). Discovery is always scoped: Atlas asks "what tools for _this_ project?" and gets only the enabled, permitted set. Projects enable/disable tools and pin versions independently. (Reuse Omnira's existing per-project tables/`marketing_engine_foundation` patterns.)

**B. Atlas orchestration.**
- The registry is **queryable** (the discovery Mark lacks): Atlas introspects capabilities, plans against them, and invokes through one **invocation envelope**: `{tool, version, args, project_ctx, capability_token, idempotency_key}`. Results are **structured `ToolResult`** (not strings), so Atlas can verify and chain steps in a closed loop — directly enabling the "Atlas acts, doesn't just suggest" gap from your CTO analysis. Unify Mark's two error models into one `ToolError{code, retriable, remediation}`.

**C. Project isolation.**
- Each project executes in an **isolated context**: isolated secrets (Omnira token vault, `g1_multitenant_platform_tokens`), isolated state, isolated browser context/container, isolated filesystem root. A capability token is **project-scoped** — a tool call literally cannot touch another project's data or credentials. The policy layer enforces this before the handler runs (the boundary Mark has nowhere).

**D. Future desktop agents.**
- A desktop agent is just a **runtime that registers `desktop.*` tools dynamically** when it connects (advertising `desktop.click`, `desktop.type`, `desktop.screen_find`, each with `runtime: desktop-agent`, `consent: per_call` for risky ones). The router sends matching invocations to that user's machine; the closed-loop/verify spine (from the Desktop Agent v1 design) lives behind the same manifest contract. No core change to add a machine — it self-registers.

**E. Future browser agents.**
- Same pattern: a browser agent advertises `browser.*` tools (`navigate/observe/act/extract`) with `runtime: browser-agent`. The registry routes by active browser context; isolation gives each project its own context with vaulted auth. The Browser Agent v1 "observe→act→verify" loop plugs in as the handler — the registry doesn't care _how_ it works, only that it honors the manifest's input/output schema.

### 11.4 Permissions model (the missing layer)

- **Capability grants** declared per tool (`filesystem:write`, `browser:interact`, `desktop:input`, `network:send`, `spend:money`), granted **per project/user** by policy, materialized as short-lived **capability tokens** checked before every execution.
- **Consent gating by risk:** `low` runs silently; `medium` runs within an active session grant; `high` (delete, send, deploy, ad-spend) requires explicit per-call confirmation — generalizing Mark's lone `confirmed=yes` guard into a policy, not an `if`.
- **No "unknown tool → run arbitrary code."** Unknown tool = hard error. Code execution is its own high-risk, sandboxed, consent-gated tool, never a silent fallback.
- **Audit by construction:** every invocation (envelope + `ToolResult` + observation/screenshot) is streamed to Omnira — the observability Mark lacks entirely.

### 11.5 Phasing

- **v1.0** — manifest format + registry service + codegen of model schema/dispatch from manifests (eliminate the 4-site drift); structured `ToolResult`/`ToolError`; audit stream. Migrate the existing cloud tools.
- **v1.1** — policy/capability layer + consent gating + project-scoped secrets/isolation.
- **v1.2** — dynamic runtime registration; bring the **Browser Agent** in as a `browser-agent` runtime.
- **v1.3** — bring the **Desktop Agent** in as a `desktop-agent` runtime; per-call consent for high-risk desktop actions.

**One-line summary:** Mark proves the ergonomic core (schema-first calling + one uniform tool signature) and demonstrates, by its own drift and missing guards, exactly what a real platform must add — **one declarative source of truth, a capability/consent layer, project-scoped isolation, and a router that future desktop/browser agents register into instead of being hardcoded.**

---

### Files referenced

`main.py` (`TOOL_DECLARATIONS` `:64-503`, `_execute_tool` `:562-697`, `_build_config` `:520-560`, `_receive_audio` `:743`) · `agent/planner.py` (`PLANNER_PROMPT` `:17-166` — "MARK XXV" `:17`) · `agent/executor.py` (`_call_tool` `:174-247`, generated_code fallback `:245`) · `core/prompt.txt` (routing policy) · `actions/computer_settings.py` (`_DANGEROUS_ACTIONS` `:567,635`) · `actions/desktop.py` (`_build_sandbox` `:38-97`) · `actions/*.py` (uniform tool signature).
