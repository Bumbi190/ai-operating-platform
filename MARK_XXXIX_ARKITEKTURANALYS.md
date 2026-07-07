# Mark-XXXIX — Architecture Analysis for Omnira

_Senior AI-systems-architect review. Read-only analysis of the `Mark-XXXIX-main` repository (~12,200 lines of Python, Gemini-based desktop "JARVIS" assistant by FatihMakes, CC BY-NC 4.0). No files were modified. Compared against Omnira (Next.js / Supabase / Vercel multi-tenant AI operating platform)._

---

## 0. Executive summary (read this first)

Mark-XXXIX and Omnira are two halves of the same dream, built from opposite ends.

**Mark-XXXIX is a local _embodiment_ layer.** It runs as a single Python process on the user's own machine, wrapped around Google's **Gemini Live native-audio** model. Its entire value is that it can _hear, see, and physically operate the computer in front of it_ — launch apps, move the mouse, drive real browser profiles, read the screen with vision, talk back with sub-second latency. It is a brilliant **hands-and-eyes** system and a mediocre **brain-and-backend** system: no durability, no multi-tenancy, no persistence beyond a 2 KB JSON file, no observability.

**Omnira is the inverse.** It is a cloud-native _brain_: durable workflows, multi-tenant token vaults, cron pipelines, cost tracking in SEK, BI, a content engine that publishes to three platforms twice a day. What Omnira lacks is exactly what Mark-XXXIX has — a body that can touch the user's desktop and a real-time voice/vision loop that feels alive.

So the strategic read is simple: **Mark-XXXIX is worth mining for its embodiment patterns (voice loop, vision-driven clicking, real-profile browser control, local OS automation), not its architecture.** Almost nothing in its _systems_ design should be copied wholesale into Omnira — Omnira is already more mature there. But several of its _interaction_ designs are genuinely worth lifting.

The rest of this document goes finding-by-finding with exact files, design decisions, scalability limits, and production-readiness, then ends with the four requested lists (A copy / B Omnira-does-better / C lessons / D roadmap).

---

## 1. Overall architecture

**How it works.** A single Python process (`main.py`, 880 lines) boots a PyQt6 GUI (`ui.py`, 1,503 lines) on the main thread, then spawns the agent on a daemon thread. The agent (`JarvisLive`, `main.py:489`) opens one persistent WebSocket to Gemini Live (`models/gemini-2.5-flash-native-audio-preview-12-2025`, `main.py:46`) and runs four cooperating asyncio tasks inside a single `TaskGroup` (`main.py:836-840`): `_send_realtime` (mic→model), `_listen_audio` (mic capture), `_receive_audio` (model→app, incl. tool calls), `_play_audio` (speaker out). Everything else is "actions" — 19 modules under `actions/` — invoked through Gemini function-calling.

**Exact files.** `main.py` (orchestrator + tool registry + voice loop), `ui.py` (GUI), `core/prompt.txt` (21-line system prompt), `config/__init__.py` (`api_keys.json` loader), `agent/` (planner/executor/queue/error handler), `memory/` (JSON memory + config), `actions/*.py` (the 19 tools).

**Design decisions.** (1) _Model-as-runtime_: the Gemini Live session is the event loop — there is no internal router; the model decides which tool fires. (2) _Local-first, zero-subscription_: all state on disk, one API key, no server. (3) _Thread-per-concern_: GUI thread, agent asyncio loop, and blocking tools offloaded via `loop.run_in_executor` (`main.py:577+`). (4) _Self-healing connection_: the `run()` loop reconnects every 3 s on any exception (`main.py:842-849`) and uses `SessionResumptionConfig` (`main.py:559`).

**Scalability limitations.** Single process, single user, single machine. No horizontal scale, no queueing across machines, GUI and agent share a process so a GUI stall can starve audio. Reconnect loses in-flight tool state.

**Production-ready?** As a **personal desktop app, yes** — it's a coherent, runnable product. As a **platform, no** — no auth, no isolation, no telemetry, secrets in a plaintext JSON file (`config/api_keys.json`).

---

## 2. Agent orchestration

**How it works.** Two distinct orchestration paths coexist:

1. **The Live model itself** handles 90% of interactions — it calls one tool, gets a `FunctionResponse`, speaks. Dispatch is a 130-line `if/elif` chain in `_execute_tool` (`main.py:562-697`).
2. **A separate "agent" subsystem** (`agent/`) handles explicit multi-step goals. When the model calls the `agent_task` tool, `main.py:651-655` submits the goal to a global `TaskQueue` singleton (`agent/task_queue.py`), which runs it on a worker thread through `AgentExecutor` (`agent/executor.py`).

**Exact files & mechanics.**
- `agent/task_queue.py` — `TaskQueue` (priority list + daemon worker, `max_concurrent=1` default), `Task` dataclass ordered by `(priority, created_at)`, module singleton via `get_queue()`.
- `agent/executor.py` — `AgentExecutor.execute()` (`:172`): sequential `for step in steps`, **3 retries/step**, `MAX_REPLAN_ATTEMPTS=2` (`:170`), three-tier recovery RETRY→SKIP→ABORT/FIX, lazy per-tool imports, `_run_generated_code()` writes Python to a temp file and runs it under a 120 s subprocess timeout, plus an output-language translation pass (`_translate_to_goal_language`).
- `agent/error_handler.py` — `analyze_error()` (lite model picks RETRY/SKIP/REPLAN/ABORT) and `generate_fix()` (stronger model rewrites the step into code). Critical steps can't be SKIPped (`:93-95`); defaults to REPLAN on any failure.

**Design decisions.** Two-tier model use (cheap model to plan/triage, stronger model to fix) is smart and cost-aware. The executor is a hand-rolled state machine rather than a framework (no LangGraph etc.). Cancellation via `threading.Event` checked between steps.

**Scalability limitations.** Strictly sequential steps (no DAG, no parallel fan-out). `max_concurrent=1` means one goal at a time. Queue is an in-memory list (`O(n log n)` re-sort per submit, lost on shutdown, unbounded — no backpressure). Two LLM round-trips per error recovery with no caching or timeout on those calls.

**Production-ready?** **Medium.** Robust for a single forgiving user; not for throughput, compound failures (only 2 replans), or durability.

---

## 3. Memory systems

**How it works.** A single flat JSON file `memory/long_term.json` with six hard-coded buckets: `identity, preferences, projects, relationships, wishes, notes` (`memory/memory_manager.py:24-30`). Each entry is `{"value": str, "updated": "YYYY-MM-DD"}`. Writes are guarded by a process-local `threading.Lock`. On every Live connection, `format_memory_for_prompt()` (`:163`) renders memory to ≤2,000 chars of plain text and prepends it to the system prompt under the header _"[WHAT YOU KNOW ABOUT THIS PERSON — use naturally, never recite like a list]"_. The model writes memory itself via the `save_memory` tool (`main.py:451`, handled silently at `:567-583`).

**Design decisions.** Memory is _model-curated_ (the LLM decides what's worth storing) and _prompt-injected_ wholesale rather than retrieved. Hard caps keep it inside the context window: `MEMORY_MAX_CHARS=2200`, per-value truncation 380 chars, oldest-first trimming by timestamp (`_trim_to_limit`, `:51`).

**Scalability limitations.** This is the weakest subsystem. No embeddings, no semantic retrieval, no relevance ranking — it's "load the whole tiny blob every turn." It cannot scale past ~a few dozen facts; older facts are silently deleted. Single-file, single-machine, no concurrency safety across processes, no audit trail. File-processing results are never folded back into memory (no cumulative learning).

**Production-ready?** **No / alpha.** Fine as a "remembers my name and that I like pizza" feature; unusable as durable knowledge.

---

## 4. Tool registry & tool execution

**How it works.** Tools are declared **statically** as a Python list `TOOL_DECLARATIONS` (`main.py:64-503`) — ~20 entries in Gemini's `function_declarations` JSON-schema format — passed into `LiveConnectConfig.tools` (`main.py:553`). Execution is the `if/elif` dispatcher in `_execute_tool` (`main.py:562-697`): each branch maps a tool name to an `actions/*.py` entry-point function with the uniform signature `tool(parameters: dict, response=None, player=None, ...) -> str`. Blocking tools run via `loop.run_in_executor`; vision runs on its own daemon thread.

**Design decisions.** Schema-first function calling (the right call vs. parsing free text). Uniform tool signature makes adding a tool mechanical. A separate, prompt-only tool catalog exists inside `agent/planner.py`'s `PLANNER_PROMPT` for the multi-step path — so there are effectively **two** tool registries, defined in different formats.

**Scalability limitations.** Adding a tool requires edits in **two-to-three** places (schema list + dispatch branch + planner prompt) with no single source of truth, no validation that planner tools match real signatures, and no dynamic/plugin registration. The `if/elif` chain and the ~6 KB static schema block don't scale to hundreds of tools.

**Production-ready?** **Medium.** Solid and reliable at ~20 tools; needs a real registry before it grows.

---

## 5. Desktop automation

**How it works.** `actions/computer_control.py` (499 lines) wraps **PyAutoGUI** (`FAILSAFE=True`, 50 ms pause) for type/click/hotkey/scroll/move/drag/screenshot. Window focus is OS-specific: PowerShell `AppActivate` on Windows, AppleScript `System Events` on macOS, `wmctrl`/`xdotool` on Linux (`_focus_window`, `:172-206`). Long text is pasted via clipboard rather than typed (`_smart_type`). `actions/desktop.py` does wallpaper/desktop org with per-OS backends (`ctypes`/`winreg`, `osascript`, `gsettings`/`qdbus`/`xfconf`/`feh`). `actions/open_app.py` has per-OS launchers. The standout: **`_screen_find()` (`computer_control.py:208`)** sends a screenshot to `gemini-2.5-flash-lite` with _"Locate '<desc>'. Reply: x,y or NOT_FOUND"_ — i.e. **vision-driven clicking**, no brittle coordinate scripting.

**Design decisions.** Real cross-platform parity (genuine Win/Mac/Linux branches everywhere, not Windows-only). Vision-as-locator instead of image-template matching. Clipboard-backed typing for speed/reliability.

**Scalability limitations.** Single-threaded and serial (~50 ms/action; 100 clicks ≈ 5 s). No retry/backoff on a failed focus or a `NOT_FOUND` vision result → the step just dies. Vision adds a 0.5–2 s network round-trip per locate and is rate-limited by Gemini quota. No OCR fallback.

**Production-ready?** **Partial.** Great for normal human-paced tasks on one machine; fragile under latency, no recovery path when vision misses.

---

## 6. Browser automation

**How it works.** `actions/browser_control.py` (892 lines) drives **Playwright** against the user's **real browser profiles** (`launch_persistent_context` with `headless=False`, `--disable-blink-features=AutomationControlled`, real UA strings). A `_BrowserSession` runs an async loop in a daemon thread; a `_SessionRegistry` keeps **multiple browsers alive simultaneously** (chrome/edge/firefox/brave/opera/…) with platform-specific profile paths and a `~/.jarvis_profiles/<browser>` fallback. Navigation/click/type use **DOM locators** with a fuzzy cascade — `smart_click()` / `smart_type()` try role, text, alt, aria-label, placeholder, label before giving up.

**Design decisions.** Persistent _real_ profiles = the user's logins/cookies are already there (no re-auth, far more useful than a sandbox). Anti-automation flags + real UA to avoid bot detection. DOM-first (fast, reliable) rather than pixel/vision for the web — a deliberate split from the desktop path.

**Scalability limitations.** No session pooling/lifecycle management; opening the same profile twice can conflict. DOM-only means it fails on canvas/image-only/CAPTCHA pages with no vision fallback (the desktop `_screen_find` trick isn't wired into the browser path). Hardcoded 30 s navigation timeout.

**Production-ready?** **Closest to production of any subsystem.** Multi-browser, real-profile Playwright with a fuzzy-locator cascade is genuinely strong; the gaps are pooling and a vision fallback.

---

## 7. Planning & task decomposition

**How it works.** `agent/planner.py` — `create_plan(goal)` (`:98`) calls `gemini-2.5-flash-lite` with a ~300-line `PLANNER_PROMPT` that documents the tools and demands JSON `{goal, steps[]}` where each step has `{step, tool, description, parameters, critical}`, **max 5 steps**. `replan()` (`:141`) uses the stronger `gemini-2.5-flash`, given completed steps + the failed step + error, to produce a revised remainder-plan. Malformed plans degrade to a single `web_search` fallback (`_fallback_plan`).

**Design decisions.** Pure LLM decomposition into a **flat linear list** (no dependency graph). Cheap model to plan, stronger model to replan. Defensive guardrails (strip code fences, swap dangerous `generated_code` for `web_search`). The core system prompt actively _discourages_ planning — `core/prompt.txt` says route to `agent_task` only for explicit 3+ step requests — so most work stays single-shot.

**Scalability limitations.** No parallelism, no dependencies, no parameter validation against real tool signatures, 5-step ceiling, full-replan-from-scratch (not incremental). Tool catalog lives in prompt text → drifts from reality.

**Production-ready?** **Medium-low.** Works for short, mostly-independent chores; not for branching or long-horizon tasks.

---

## 8. Voice systems

**How it works.** This is the crown jewel. `main.py` uses **Gemini Live native audio** end-to-end — no separate STT/TTS. Mic is captured with `sounddevice` at 16 kHz, streamed raw (`_send_realtime` / `_listen_audio`), and the model streams back 24 kHz PCM played via a `RawOutputStream` (`_play_audio`). A `_speaking_lock` + `_is_speaking` flag implements **echo suppression** (don't send mic audio while JARVIS talks, `main.py:709-717`). A `_turn_done_event` tracks end-of-turn to flip UI state LISTENING↔SPEAKING. Voice = "Charon" (`main.py:556`). Input/output transcriptions are logged to the GUI. A second voice loop lives in vision: `actions/screen_processor.py` opens its **own** Live session so the vision module can _speak directly_ while the main agent stays silent.

**Design decisions.** Single-model speech (lowest possible latency, multilingual for free). Half-duplex echo control via a software flag rather than hardware AEC. Session resumption + 3 s auto-reconnect for resilience. Text input coexists with voice (hybrid input).

**Scalability limitations.** One session per process; reconnection drops mid-turn audio; no barge-in (can't interrupt JARVIS mid-sentence — the mic is gated off while speaking). 24 kHz mono only.

**Production-ready?** **Yes, for single-user.** This is the most polished part of the system and the clearest thing Omnira can learn from.

---

## 9. Knowledge management

**How it works.** `actions/file_processor.py` (832 lines) is a single dispatcher `file_processor()` (`:1057`) that detects file type by extension and routes to a per-type handler covering **11+ formats**: images (Gemini Vision: describe/OCR/resize/convert), PDF (pdfplumber/PyPDF2 → Gemini, capped 50 k chars), DOCX/TXT/MD, CSV/XLSX (pandas → analyze/filter/sort/stats), JSON, code (explain/review/fix/optimize/test), audio (Gemini transcription), video (ffmpeg/Gemini), archives, PPTX, with an AI fallback for unknown types. Output is written to `{name}_{action}.{ext}`. The GUI lets you drag-drop a file; `main.py:660-668` auto-fills `file_path` from `ui.current_file`.

**Design decisions.** Breadth over depth — one entry point, every common format, lean on Gemini's multimodality instead of local ML. Results land as files, not as searchable knowledge.

**Scalability limitations.** Monolithic ~800-line function. Each call is a blocking Gemini round-trip with **no caching** (re-analyzing the same PDF costs twice). Hard content caps truncate large docs. Crucially: **processing output never feeds memory or any index** — there's no RAG, no document store, no cross-session recall. It's a converter, not a knowledge base.

**Production-ready?** **Medium for conversion, no for knowledge management.** Impressive format coverage; not a real knowledge layer.

---

## 10. Strengths worth copying

In priority order, the patterns that are actually good engineering:

1. **Native-audio voice loop** (`main.py`) — one model for STT+reasoning+TTS = lowest latency, free multilingual, software echo-suppression. The whole `_listen/_send/_receive/_play` quartet is a clean reference design.
2. **Vision-as-locator** (`computer_control._screen_find`) — "send screenshot, ask for x,y" replaces brittle coordinate/template scripting with a model call. Elegant and robust.
3. **Real-profile, multi-browser Playwright** (`browser_control.py`) — persistent contexts on the user's actual profiles means real logins, no re-auth, with a fuzzy-locator cascade and anti-detection flags.
4. **Two-tier model economics** (planner/error_handler) — cheap model to plan/triage, strong model only to fix. Direct cost control.
5. **Self-healing session loop** (`main.py:842`) — resumption config + 3 s reconnect; the agent survives network blips.
6. **Model-curated silent memory** (`save_memory` tool) — the model decides what's worth remembering and stores it without narrating. Good UX pattern even if the storage is weak.
7. **Uniform tool signature** (`tool(parameters, response, player, …) -> str`) — makes tools trivially composable and pluggable.
8. **Cross-platform parity done properly** — genuine Win/Mac/Linux branches in desktop/open_app/browser, not a Windows-only afterthought.
9. **Vision module owns its own voice** (`screen_processor.py`) — a sub-agent with its own Live session that speaks directly while the main agent yields. Nice multi-agent handoff pattern.
10. **Clipboard-backed typing** for long text — small, pragmatic reliability win.

---

## 11. Weaknesses to avoid

1. **Flat-JSON memory with no retrieval** — 2.2 KB cap, oldest-first deletion, no embeddings. Does not scale; Omnira must not regress to this.
2. **Tool catalog duplicated in 2–3 places** (schema list + dispatch + planner prompt) with no single source of truth or validation → drift.
3. **In-memory, non-durable task queue** — lost on shutdown, unbounded, `O(n)` ops, `max_concurrent=1`. No persistence/recovery.
4. **Strictly sequential planning** — no DAG, no parallelism, 5-step ceiling, only 2 replans.
5. **Secrets in plaintext** (`config/api_keys.json`) — no vault, no rotation.
6. **No observability** — `print()` statements only; no metrics, tracing, or audit trail.
7. **No caching anywhere** — every file/error/vision call re-hits Gemini.
8. **No real isolation/sandbox for generated code** — `_run_generated_code` writes to a temp file and executes it locally with a bare-`except` cleanup.
9. **GUI and agent share a process** — a UI stall can starve the audio loop.
10. **No tests, no CI, no rate-limit/backoff handling** — single failure aborts the task.

---

## 12. Features that would be valuable inside Omnira

Mapped to Omnira's current gaps (from `OMNIRA_GAP_ANALYS_CTO.md`: Atlas "reports but doesn't act", voice lacks barge-in, no desktop reach):

- **A desktop "hands" agent** — Omnira lives in the cloud and can't touch the user's machine. A Mark-style local companion (PyAutoGUI + Playwright real-profile + `_screen_find` vision) would let Atlas _execute_ on the user's computer, closing the "agent acts, not just suggests" gap.
- **Native-audio voice loop for Atlas** — Omnira's voice is at ~75% and lacks barge-in; Mark's `_speaking`/`_turn_done` machinery and reconnect loop are a ready blueprint (and a barge-in upgrade target).
- **Vision-driven UI automation** — `_screen_find` as a service Atlas can call to operate arbitrary desktop apps without integrations.
- **Universal file_processor** — one drag-drop endpoint covering 11+ formats would slot straight into Omnira as an ingestion front-door (then wire output into Omnira's real DB instead of `{name}_summarize.txt`).
- **Two-tier model routing** — formalize "cheap-to-plan, strong-to-act" in Omnira's run engine for cost control.
- **Real-profile browser sessions** — for Omnira workflows that need authenticated browsing on behalf of the user.

---

## A) Top 10 ideas Omnira should copy

1. **Gemini native-audio voice loop** (incl. software echo-suppression + session resumption) → upgrade Atlas voice and add barge-in.
2. **Vision-as-locator** (`_screen_find`) → a callable "find this on screen, give me coordinates" primitive.
3. **Local desktop-automation companion** (PyAutoGUI + per-OS focus) → give Atlas a body on the user's machine.
4. **Real-profile multi-browser Playwright** with fuzzy-locator cascade → authenticated, human-like web automation.
5. **Two-tier model economics** (lite plans/triages, strong fixes/acts) → bake into Omnira's run engine cost layer.
6. **Model-curated silent memory** writes (the `save_memory` UX) → but back it with Omnira's Supabase + embeddings, not flat JSON.
7. **Universal multi-format file_processor** as a single ingestion endpoint.
8. **Self-healing session loop** (resumption + auto-reconnect) for any long-lived Omnira agent connection.
9. **Sub-agent that owns its own voice/turn** (vision module pattern) → clean multi-agent handoff for Atlas delegation.
10. **Uniform pluggable tool signature** → tighten Omnira's tool/skill interface toward one shape.

## B) Top 10 things Omnira already does better

1. **Durable, persisted workflows** (`durable_runs`, `pipeline_retry` migrations) vs. Mark's in-memory queue lost on exit.
2. **Multi-tenancy & token vaults** (`g1_multitenant_platform_tokens`, `token_health`) vs. single-user, single API key.
3. **Real persistence** (Supabase/Postgres + migrations) vs. a 2.2 KB JSON file.
4. **Cost tracking in SEK per project/provider/agent** (85% mature) vs. zero cost awareness.
5. **Observability & ops** (cron heartbeat, token health, evaluation memory) vs. `print()` only.
6. **Scheduled/automated pipelines** (pg_cron briefings, competitor scans, content 2×/day) vs. ad-hoc local reminders.
7. **End-to-end business pipeline** (news→script→voice→render→publish to IG/FB/YouTube + comment replies) vs. desktop chores.
8. **Cloud deploy & scale** (Vercel/Next.js/workers) vs. one desktop process.
9. **Security posture** (`api-auth`, multi-tenant tokens, safeguards migration) vs. plaintext secrets.
10. **BI / intelligence layers** (Atlas Context Brain, Growth/Opportunity/Revenue scaffolds) vs. no analytics at all.

## C) Architecture lessons learned

- **Embodiment and intelligence are separable layers — and you can win one without the other.** Mark nails the body; Omnira nails the brain. The lesson isn't "rewrite Omnira like Mark," it's "give Omnira a thin Mark-style _client_ as its hands and ears." Keep the brain in the cloud, push a lightweight embodiment agent to the edge.
- **Let the model be the router, but never the system of record.** Mark's model-as-runtime is great for latency and UX; its undoing is that _state_ also lives wherever the model last left it (a JSON blob, a temp file). Omnira's discipline — durable runs, Postgres, retries — is exactly the missing half.
- **One source of truth for tools.** Mark's 2–3 parallel tool catalogs are the canonical "this will drift" smell. Omnira should keep a single registry that emits both the model schema and the dispatch binding.
- **Latency is a feature, and it comes from collapsing layers.** Native-audio (one model, no STT/TTS hop) is why Mark feels alive. Adopt the collapse where it matters; keep layers where durability matters.
- **Cheap-model-plans / strong-model-acts is real, bankable cost control** — and it's trivial to adopt.
- **Retrieval, not stuffing.** Mark proves the dead-end of "load all memory every turn." Omnira should go straight to embeddings + ranked recall.

## D) Suggested Omnira roadmap inspired by this repository

**Phase E1 — Omnira "Hands" (local companion).** A small signed desktop agent (Python) that connects to Omnira and exposes Mark's strongest primitives as remote tools: `desktop_control` (PyAutoGUI + per-OS focus), `browser_control` (real-profile Playwright), and `screen_find` (vision-as-locator). This directly closes the Gap-analys complaint that _"Atlas reports/suggests but doesn't close the loop to an executed action."_ Ship behind explicit per-action user confirmation.

**Phase E2 — Atlas voice v2 (native-audio + barge-in).** Port Mark's `_listen/_send/_receive/_play` loop and `_speaking`/`_turn_done` echo-suppression into Atlas; add the barge-in that Mark lacks (gate mic _back on_ on detected user speech). This takes Voice from 75% to "delightful," using Mark as the reference implementation.

**Phase E3 — Ingestion front-door.** Adopt the universal `file_processor` as a single drag-drop/upload endpoint, but **wire its output into Supabase + embeddings** (not `{name}_summarize.txt`). This becomes the long-missing knowledge/RAG layer — succeeding precisely where Mark fails.

**Phase E4 — Unified tool registry + two-tier routing.** Refactor Omnira's tool/skill interface to a single source of truth that emits both the model schema and the executor binding (avoiding Mark's drift), and formalize cheap-plan/strong-act routing in the run engine for cost control.

**Phase E5 — Sub-agent voice handoff.** Use Mark's vision-module pattern (a sub-agent that owns its own real-time channel and speaks directly while the parent yields) as the template for Atlas delegating to specialist agents that report back in-voice.

_Sequencing note, per Omnira's own CTO gap-analysis:_ none of this should outrank getting **one** Omnira business to actually transact. Treat E1–E5 as the _embodiment track_ that runs alongside — not instead of — the revenue track. Mark-XXXIX makes Omnira feel alive; it doesn't make it solvent.

---

### Files referenced (for traceability)

`main.py` · `ui.py` · `core/prompt.txt` · `config/__init__.py` · `agent/planner.py` · `agent/executor.py` · `agent/task_queue.py` · `agent/error_handler.py` · `memory/memory_manager.py` · `memory/config_manager.py` · `actions/computer_control.py` · `actions/desktop.py` · `actions/open_app.py` · `actions/browser_control.py` · `actions/screen_processor.py` · `actions/file_processor.py` · `actions/web_search.py` · `actions/code_helper.py` · `actions/dev_agent.py`
