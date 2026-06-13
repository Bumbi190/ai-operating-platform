# Omnira — Full Platform Audit & Atlas P1 Plan
**Date:** 2026-06-12 · **Branch:** `fix/supabase-ssr-upgrade` (HEAD `8b626d9`, clean) · **Status:** Build passing, 0 TS errors

Verified against current code by four parallel deep audits. Old doc findings re-checked — several are fixed, several persist, and new issues were found.

---

## 1. Current Architecture Summary

**Monorepo shape:** `apps/web` is the entire product (Next.js 14.2.29 App Router, ~101 API routes, ~25k lines lib). `apps/remotion` = real (Lambda video render). `apps/API` + `apps/supabase` = **empty dead scaffolding**. `packages/db` = SQL source of truth (core RLS lives here, not in migrations). `workers/hermes` = Python FastAPI web agent (Playwright + Gemini). `supabase/migrations` = 32 migrations.

**Database:** 48 tables. Core 7 (`projects, agents, workflows, runs, run_logs, outputs, memories`) have owner-scoped RLS from `packages/db/schema.sql`; most newer tables got RLS via migrations; **`media_scripts` and `media_news_items` have NO RLS and nullable `project_id`**.

**Scheduling:** Dual substrate — Vercel cron has only 2 jobs (heartbeat, bugscanner); **pg_cron inside Supabase drives ~20 jobs** via `omnira_cron.call_vercel()` with `CRON_SECRET` bearer auth. Several live schedules (youtube, stripe-snapshot, dream, account-snapshot) exist only in the live DB, not in migrations.

### Modules

| Module | Lives in | State |
|---|---|---|
| **Atlas** | `lib/atlas/*` (23 files), `app/api/chat/route.ts` (1,332 lines), `(platform)/atlas/*`, `lib/nav/registry.ts` | Chat brain + ~14 tools (trigger_workflow, delegate, navigate, save_workflow…). Context snapshot w/ 45s cache. Isolation boundary (`isolation.ts`) is good, fail-closed |
| **Projects** | `lib/project/*`, `api/projects/*`, `[slug]/layout.tsx` | Slug→project resolution is RLS-correct & cached. ProjectProvider exists |
| **Workflows** | `lib/ai/workflow-runner.ts` + `workflow-executor.ts` | ⚠️ **Two divergent engines** (see risk #1). Steps = linear JSONB chain, `{{var}}` interpolation |
| **Agents** | `agents` table, `lib/ai/runner.ts` (759 lines) | Untyped JSONB `config`; Familje character bibles hardcoded in generic runner |
| **Runs** | `api/runs/*`, `20260603_durable_runs.sql` | **Durable queue: solid.** `claim_runs` (SKIP LOCKED) + lease + reaper + kill switch, pg_cron drain/min |
| **Memory** | `lib/ai/memory/*`, `lib/atlas/action-memory.ts` | `memories` is a god-table (4+ concerns via `source` string). No embeddings/pgvector anywhere |
| **Marketing** | `lib/marketing/*`, dispatched via `runs.kind` | Familje-only by convention; handler depth partly stubbed ("Fas 1") |
| **Media Pipeline** | `lib/media/*` (24 files), ~50 routes | Durable step1–4 split + excellent pipeline-retry drainer. ⚠️ Parallel `autonomous` monolith duplicates it |
| **Outputs** | `outputs` table, `lib/ebook/*` | `monthlyPdfTemplate.ts` = 1,341-line god-file |
| **BI** | `lib/business`, `lib/os`, `lib/stripe`, `lib/cost` | Cost tracking has a single choke point (`lib/cost/track.ts`) — good. Fragmented across 5 tables |
| **Manager** | `lib/ai/manager.ts` (451), `MissionControlClient.tsx` (1,038) | Overlaps Atlas as "central orchestrator" — boundary blurred |
| **Approvals** | `api/approvals/*`, executor path | ⚠️ Only created on the executor/resume path, never on the production drain path |

### What's genuinely good
- Durable run engine (claim/lease/reaper/kill-switch) matches its design doc and is well-built
- Heartbeat monitor: dual-scheduler cross-check + domain-evidence detection + deduped alerts
- Publishing idempotency (`external_id`) and layered media retry
- `lib/atlas/isolation.ts` fail-closed boundary, locked by tests
- `lib/nav/registry.ts` — single source of truth for navigation, Atlas emits logical destinations
- `lib/atlas/workflow-authoring.ts` validator — already the graph-integrity core a visual designer needs

---

## 2. Risks Discovered (ranked)

### CRITICAL — security / correctness
1. **Two divergent workflow engines; production runs the weaker one.** The pg_cron drain path (`api/runs/drain` → `workflow-runner.ts::runSteps`) has **no output validation, no quality gate, no approval creation, no bug reporting**. The rich `workflow-executor.ts` only runs on resume. Worse: `lib/ai/resume.ts:64` uses `void executeWorkflow(...)` — **fire-and-forget, non-durable**, the exact anti-pattern the durable design eliminated. Two functions named `executeWorkflow` with different signatures.
2. **IDOR on by-id routes.** `api/media/news/[id]`, `api/media/scripts/[id]`, `api/approvals/[id]` (GET+PATCH): admin client, no project-ownership check — any authenticated user can read/approve/publish any project's rows by UUID.
3. **Unvalidated query-param scoping.** `api/media/news` & `api/media/scripts` GET: `project_id` from query string, unverified; **omitting it returns ALL projects' rows**. POST inserts body verbatim.
4. **`media_scripts`/`media_news_items` have no RLS** and nullable `project_id` (`20260520_media_tables.sql`) — no DB backstop behind the leaky routes above.
5. **CRON_SECRET fail-open.** Every cron route guards with `if (cronSecret && …)` — if the env var is unset, all cron/drain/publish routes become public.
6. **`cancel_requested` is a dead feature.** Migration added the columns; no code reads or writes them; `'cancelled'` was never added to the status CHECK. Operators cannot actually cancel a run.

### HIGH — architecture
7. **Admin client is the default (~150 call sites)** incl. `(platform)/layout.tsx` and most user-facing pages; isolation rests on hand-written `.eq('project_id', …)` per query. `applyProjectScope` is opt-in — same lib functions are scoped in chat, unscoped in `atlas/operations/page.tsx:40`.
8. **RLS isolates users, not projects.** All policies are `owner_id = auth.uid()` — with one owner, zero project-to-project DB isolation.
9. **Hardcoded project assumptions:** `lib/atlas/operations.ts:140-258` (fixed 3-project shape — new projects invisible), `token-store.ts:31` + article layer defaulting to The Prompt, Familje character bibles in `lib/ai/runner.ts`, name-string platform matching in `system/page.tsx:137`, `@theprompt.news` in `instagram.ts:234`.
10. **No step idempotency on drain retries** — `runSteps` re-runs ALL steps from step 1 on every retry (burns credits, duplicates side effects). Executor supports `startFromOrder`; drain doesn't use it.
11. **Untyped DB boundary:** 209 `as any` + 107 `: any`/`AnyDb` — type safety stops exactly at the data layer.

### MEDIUM
12. Global ActivityRail unscoped on every route (`layout.tsx:44-52`). 13. `maxDuration=300` on ~9 routes — verify Vercel plan is Pro, else silent 60s truncation. 14. Orphaned pg_cron schedules not in migrations. 15. God-files: `chat/route.ts` 1,332, `monthlyPdfTemplate.ts` 1,341, `MissionControlClient.tsx` 1,038, `system/page.tsx` 1,120. 16. Manager↔Atlas responsibility overlap. 17. Dead scaffolding (`apps/API`, `apps/supabase`); `packages/agent-skills` likely unused. 18. Duplicate `autonomous` media monolith vs durable step1–4.

---

## 3. Atlas P1 Readiness

| Dimension | Score | Verdict |
|---|---|---|
| Workflow orchestration | 6/10 | Durable engine + authoring validator exist; **linear-only**, no DAG/branching, triggers partly inert, no canvas UI |
| Execution tracking | 8/10 | `run_logs` (tokens/duration per step) + `cost_events` joinable via `run_id` — strongest area. Agent identity by name-join (fragile); no run-level cost rollup |
| Observability | 5/10 | Hierarchy queryable in data model, fragmented in UI (3+ competing activity surfaces); no per-workflow rollup |
| Run tracking APIs | 5/10 | Good: create/detail/SSE-stream/resume. Missing: list endpoint w/ filters, joined detail (logs+cost+agents) |
| Project context | 8/10 | `getProjectBySlug` + `ProjectProvider` + `isolation.ts` + nav registry = exactly the "global Atlas, scoped drill-down" pattern needed. Project identity split code/DB |
| **Overall** | **6/10** | Substrate is real and durable. Gaps: orchestration expressiveness + consolidated read surfaces. **Hardening required before P1** |

---

## 4. Recommended Implementation Plan (Phase 2 — Hardening)

Small, safe phases. Each = own commit(s), build + tests green before next.

### H0 — Security closure (do first, ~1 day)
- Add ownership checks (resolve row's `project_id` → `assertProjectAllowed`) to `api/media/news/[id]`, `api/media/scripts/[id]`, `api/approvals/[id]`, and the query-param GET/POST routes (reject missing/foreign `project_id`)
- Migration: enable project-scoped RLS on `media_scripts`/`media_news_items`, set `project_id NOT NULL` (backfill first)
- Fail-closed CRON_SECRET: throw at module load if unset, in a shared `requireCronAuth()` helper replacing the 25+ inline checks

### H1 — Engine unification (~2–3 days, biggest correctness win)
- Make drain dispatch to **one** engine: fold executor's validation/quality-gate/approval/bug-reporting into the drain path (or have drain call `executeWorkflow` with checkpointing)
- Step checkpointing: persist completed step state on `runs.context`, resume from `startFromOrder` on retry — no re-running step 1
- Fix resume: requeue as `pending` (durable) instead of `void executeWorkflow(...)`
- Wire `cancel_requested`: cooperative check at step boundaries + relax status CHECK + UI button — or remove the columns
- Delete the duplicate `executeWorkflow` wrapper; one name, one signature

### H2 — ProjectContext & scoping consistency (~2–3 days)
- Introduce a typed scoped data-access helper (`scopedDb(projectIds)`) that forces project scope at the type level for non-RLS tables; migrate the leaky surfaces first (media, approvals, activity)
- Scope or label the global ActivityRail
- Move `BUSINESS_PROFILES` (identity/aliases) into `projects.settings`; make `atlas/operations.ts` iterate projects instead of the hardcoded 3-shape
- Extract Familje character config out of `lib/ai/runner.ts` into per-project `settings`/agent config; remove The Prompt default fallbacks (require explicit project)

### H3 — Atlas substrate (~2 days)
- Add `agent_id` FK to `run_logs` + `cost_events` (stop name-joins)
- `run_metrics` view (or denormalized columns): total tokens/cost/duration per run; per-workflow rollup (success rate, p50 duration, cost)
- `GET /api/runs` list endpoint with `?project&status&workflow&limit&cursor`; `GET /api/runs/[id]/detail` joining logs + costs + decisions
- Commit the live pg_cron schedule into a migration (youtube, stripe-snapshot, dream, account-snapshot, warmup) so schedules are reproducible

**Explicitly NOT doing now** (avoid unnecessary refactors): splitting chat/route.ts god-file, RLS project-membership model, removing Manager, deleting dead scaffolding — note them, defer.

---

## 5. Atlas P1 Roadmap (Phase 3 — after hardening)

**Evolution: Dashboard → Analyst → Advisor → Operator.** P1 = Dashboard→Analyst.

### P1.1 Workflow Designer
- Extend `WorkflowStep` model: `depends_on[]`, optional `condition` → DAG (linear chains remain valid subsets)
- Engine: topological execution in unified runner; parallel branches later
- Canvas UI: React Flow, reusing `validateWorkflowDraft` (live graph validation) and `WorkflowStepGraph`/`execution-graph.ts` as read-layer
- Node palette = step taxonomy: agent / tool / publish / approval-gate / trigger
- Wire `trigger: cron` → generic pg_cron dispatch per workflow; generic webhook dispatch (isolation scaffolding exists)

### P1.2 Execution Visibility + Run Tracking
- One **Activity instrument** replacing the 3 competing surfaces, answering: running? failed? succeeded? cost? duration?
- Run detail = trace tree: Run → steps → agent, tokens, cost, duration, inputs/outputs (data already in `run_logs`+`cost_events`; H3 APIs serve it)
- Filters from nav registry (`status ∈ failed/running/done/queued/stalled`) — Atlas chat deep-links into them

### P1.3 Observability hierarchy
- Global → Project → Workflow → Run → Agent drill-down, each level a rollup of the next (workflow rollup from H3)
- Atlas stays global; project drill-down rides `applyProjectScope` + ProjectProvider

### P1.4 Knowledge Layer (Obsidian/Graphify-inspired, not cloned)
- Enable pgvector; embed `memories`, `platform_memory`, outputs, decisions
- Entity/relationship model seeded from what exists: `agent_decisions` + `memory_refs` (weighted edges) + `dream_issues` (stable issue identities)
- Bidirectional links: run ↔ memory ↔ decision ↔ output; `MemoryGraph.tsx` as visualization seed
- Contextual retrieval API for Atlas chat (semantic, project-scoped)

### P1.5 Dream Engine Foundation
- Already latent: `dream_issues` ledger, nightly dream cron, `cost_events`, `revenue_events`, `content_feedback`, `agent_scorecards`
- P1 adds: outcome records per run (success/failure/cost vs. baseline), opportunity detection writing to `opportunities`, recommendations surfaced in Atlas — **no autonomy**, recommendations only

### P1.6 Delegation (design-for, build later)
- Flow User → Atlas plan → workflow selection → delegation already has primitives: chat tools `trigger_workflow`/`delegate`/`ask_manager`. P1 keeps Atlas as planner, Manager as task coordinator; merge consideration deferred to P2

---

## 6. Files Expected to Change

**H0:** `app/api/media/news/[id]/route.ts`, `app/api/media/scripts/[id]/route.ts`, `app/api/approvals/[id]/route.ts`, `app/api/media/news/route.ts`, `app/api/media/scripts/route.ts`, new `lib/api-auth` cron helper, ~25 cron routes (mechanical), new migration `*_media_rls.sql`
**H1:** `lib/ai/workflow-runner.ts`, `lib/ai/workflow-executor.ts`, `lib/ai/resume.ts`, `app/api/runs/drain/route.ts`, `app/api/runs/[id]/resume/route.ts`, migration for status CHECK + cancel wiring, run detail UI (cancel button)
**H2:** new `lib/supabase/scoped.ts`, `app/(platform)/layout.tsx`, `lib/atlas/operations.ts`, `lib/atlas/identity.ts`, `lib/media/token-store.ts`, `lib/article/{approval,store,pipeline}.ts`, `lib/ai/runner.ts`, `atlas/operations/page.tsx`
**H3:** migration (`agent_id` FKs + `run_metrics` view + cron schedules), `app/api/runs/route.ts`, new `app/api/runs/[id]/detail/route.ts`, `lib/cost/track.ts`, `lib/ai/workflow-runner.ts` (log agent_id)
**P1:** new `lib/atlas/designer/*`, `app/(platform)/atlas/activity/*` (rebuilt), `lib/atlas/workflow-authoring.ts`, `lib/supabase/types.ts` (WorkflowStep), pgvector migration, `lib/atlas/knowledge/*` (new)
