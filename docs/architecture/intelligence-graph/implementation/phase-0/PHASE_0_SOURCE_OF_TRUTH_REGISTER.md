# Phase 0 Source of Truth Register

Claim classification vocabulary:
- PERSISTED: authoritative row/table or durable artifact exists.
- DERIVED: computed from persisted rows or validated artifact.
- FRONTEND ONLY: exists only in client/UI state.
- PLANNED: explicitly documented but not provisioned/implemented.
- UNSUPPORTED: no reliable source found.
- UNKNOWN: repository evidence was insufficient.

## Entity Register

| Entity | Source location | Primary source of truth | Secondary/derived source | Snapshot/API source | Realtime source | Supported statuses | Supported transitions | Scope | Freshness | Correlation | Causation | History | Classification | Gaps |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Atlas | `apps/web/lib/atlas/runtime.tsx`, `apps/web/lib/atlas/context.ts` | No single graph entity table | Atlas context assembled from many tables | Not a graph node in `operations-graph.ts` | None for graph | Runtime UI states: `idle`, `briefing`, `advising`, `delegating`, `monitoring`; voice states in runtime | Frontend state transitions only | Platform/project context, not graph scoped | Generated context timestamp only | No graph correlation | No graph causation | Partial via memory/intelligence stores | FRONTEND ONLY / DERIVED | Canonical Atlas node is not implemented in graph runtime. |
| Manager | `apps/web/lib/ai/manager.ts`, `manager_tasks` | `manager_tasks` table for task rows | Manager context from runs/agents/approvals/tasks | Included as `task` nodes, not Manager node | None for graph | Task statuses from app type: pending/in_progress/done/failed/cancelled; DB type is text | Task transitions in Manager/dream paths, not graph-owned | Project nullable; scoped by allow-list where graph reads | Snapshot only | Task can link `run_id`/`workflow_id` | No event causation id | Persisted task rows | PERSISTED / PARTIALLY DERIVED | No canonical Manager graph node or authority gradient in graph. |
| Project | `projects` in `database.types.ts`, `operations-graph.ts` | `public.projects` | `getAllowedProjectIds` from owner_id | `/api/intelligence/graph/operations` | None for graph | None in graph; project has execution flags elsewhere | N/A | Owner-bound by `owner_id`; graph filters allow-list | Snapshot only | None | None | Persisted | PERSISTED | Project territories are not visualized canonically. |
| Agent | `agents` in `database.types.ts`, `operations-graph.ts` | `public.agents` | Workflow steps reference `agent_id` | `/api/intelligence/graph/operations` | None for graph | No durable agent runtime status in graph | N/A | `project_id` scoped | Snapshot only | Via run/workflow indirectly | No event causation id | Persisted config; no per-agent event history in graph | PERSISTED | No executing/idle status unless inferred from runs in future. |
| Workflow | `workflows`, `operations-graph.ts` | `public.workflows` | `workflows.steps` JSONB | `/api/intelligence/graph/operations` | None for graph | `active`/`inactive` derived from boolean | Workflow CRUD outside graph | `project_id` scoped | Snapshot only | Runs reference workflow_id | No event causation id | Persisted workflow rows and run history | PERSISTED / DERIVED | No canonical workflow badges/counts or schedule health in graph. |
| Run | `runs`, drain route, executor, operations graph | `public.runs` | `run_logs`, `outputs`, `approvals` | `/api/intelligence/graph/operations` | None for graph; `/api/runs/[id]/stream` polls logs outside graph | `pending`, `running`, `done`, `failed`, `awaiting_approval`, `cancelled`, `rejected` per `RunStatus` | claim -> running; done/failed/pending retry; awaiting_approval; approved -> done; rejected -> rejected; cancel -> cancelled | `project_id` scoped | Snapshot by hours window | No canonical correlation id | No canonical causation id | Persisted; error_history and logs exist | PERSISTED | No per-step event envelope for replay. |
| Tool | `run_logs.role='tool'` references exist; graph contract says no tool_calls table | No `tool_calls` table found | Logs may contain tool role/content | Not included in graph operations | None | Unsupported | Unsupported | Indirect by run only | Unknown | None | None | Log rows only | UNSUPPORTED | Canonical tool nodes need a real tool call source. |
| Output | `outputs`, executor | `public.outputs` | Final output from run execution | `/api/intelligence/graph/operations` | None for graph | Type text/pdf/image/json via app union; no output lifecycle in graph | Persist on execution; external publishing elsewhere | `project_id` and `run_id` | Snapshot only | Via run_id | No causation id | Persisted | PERSISTED | Graph does not load content body, intentionally minimized. |
| Approval | `approvals`, approval API, drain route | `public.approvals` | Run transition status guard | `/api/intelligence/graph/operations` | None for graph | `pending`, `approved`, `rejected`, `revised`, `returned`, `needs_input` per migration; UI types omit some | PATCH action approved/rejected/revised; run awaiting_approval -> done/rejected | `project_id` or parent run project; API checks access | Snapshot only | via `run_id` | No causation id | Persisted with reviewed_at/operator/reviewer_notes | PERSISTED | No expired/cancelled approval status found in current approval CHECK. |
| Failure | `runs.status='failed'`, `runs.error`, `last_error`, `error_history` | `public.runs` failure fields | Atlas operations/Manager context derive failures | `/api/intelligence/graph/operations` as failed run status | None for graph | `failed` run status | Reaper retries pending or fails; resume can reset failed to pending | `project_id` scoped | Snapshot only | No failure event id | No causation id | Persisted run row and error history | DERIVED / PERSISTED | No separate immutable failure fact table. |
| Incident | `bug_reports`, `cron_heartbeat`, docs mention incidents | No canonical incident table for graph | Bug/cron health adjacent data | Not included in graph operations | None | Unsupported for graph | Unsupported | Varies by table | Unknown | None | None | Adjacent tables only | UNSUPPORTED | Canonical incident lifecycle open/ack/resolved absent from graph. |
| Signal | `apps/web/supabase/migrations/20260622_atlas_signals.sql`, `lib/atlas/signals.ts` | `public.atlas_signals` | Producers such as impact score | Not included in graph operations | None for graph | Kind/version, no graph status | Append-only by convention | Project scope added in later evolution but initial table has nullable content_id only | Produced_at | None | None | Persisted append-only | PERSISTED | Not integrated into graph overlay. |
| Intelligence object | `atlas_intelligence`, store | `public.atlas_intelligence` | `PostgresIntelligenceStore` | Not included in graph operations | None | Kind/confidence/superseded_by | append/supersede | `project_id` nullable; service-role only | produced_at/window | Evidence chain references | Evidence only, no event causation | Persisted append-only | PERSISTED | Not graph-visible. |
| Graphify-derived structure | `graphify-out/graph.json`, `apps/web/data/intelligence/system-graph.json` | Raw local Graphify artifact, then sanitized app artifact | `graphify-import.ts`, `system-graph.ts` community summaries | `/api/intelligence/graph/system` | None | Static confidence EXTRACTED/INFERRED/DERIVED | Manual generation/import only | Codebase-wide, logged-in user access | `generatedAt` and `builtAtCommit` only | Static relations only | Static relations only | Local artifact history not versioned | DERIVED | Artifact stale, gitignored, not CI-delivered. |

## Source Details

### Projects

Evidence:
- `apps/web/lib/supabase/database.types.ts` table `projects` has `id`, `name`, `slug`, `color`, `owner_id`, `settings`.
- `apps/web/lib/atlas/isolation.ts` resolves allowed projects with `projects.owner_id = userId`.
- `operations-graph.ts` queries `projects` scoped by allowed ids and returns project nodes only when inside the selected scope.

Classification: PERSISTED.

### Runs

Evidence:
- `apps/web/lib/supabase/types.ts` defines `RunStatus`.
- `apps/web/supabase/migrations/20260617_h1p4_pr2_run_rejected_status.sql` defines the current run status CHECK.
- `apps/web/app/api/runs/drain/route.ts` owns claim, run execution and terminal/pending transitions.
- `apps/web/lib/ai/resume.ts` resets failed runs to pending with guard `.eq('status', 'failed')`.

Classification: PERSISTED.

### Approvals

Evidence:
- `supabase/migrations/20260603_marketing_engine_foundation.sql` defines approval status CHECK.
- `apps/web/app/api/approvals/[id]/route.ts` resolves project access before mutation.
- Approval PATCH updates the approval first, then conditionally transitions an awaiting run to done/rejected.

Classification: PERSISTED.

### Graphify

Evidence:
- `.graphifyignore` excludes `.env*`, credentials, `.agents`, dependencies, builds, media and artifacts.
- `apps/web/lib/intelligence/graphify-import.ts` rejects secret-like content and unsafe source paths.
- `docs/intelligence-graph.md` states `graphify-out/` and `apps/web/data/intelligence/` are gitignored and artifacts are not committed.
- No `.github` workflow files were present in the worktree.

Classification: DERIVED / PLANNED for production delivery.

## Entities Without Reliable Runtime Sources

- Tool calls: no `tool_calls` table or graph source.
- Per-step execution events: no canonical persisted event envelope.
- Correlation and causation: no graph event IDs in runtime sources.
- Incident lifecycle: no canonical incident table tied to failures for graph.
- Stale/unknown state: no graph freshness contract beyond timestamps.
- Freeze buffer: frontend control and event buffer absent.
- Realtime subscriptions: no graph subscription source.
- Semantic zoom/list view status parity: no parallel graph list model.
