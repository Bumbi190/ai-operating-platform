# Phase 0 Affected File Map

This map lists relevant existing files only. Phase 0 created no implementation files.

## UI

- `apps/web/app/(platform)/intelligence/graph/page.tsx` - `/intelligence/graph` route and page shell.
- `apps/web/components/platform/intelligence/IntelligenceGraphClient.tsx` - mode tabs, API fetching, System Map search, filters, selection, unavailable/empty states.
- `apps/web/components/platform/intelligence/NodeInspector.tsx` - selected-node detail panel and runtime route links.
- `apps/web/components/platform/Sidebar.tsx` - navigation entry added by PR #44.
- `apps/web/lib/nav/registry.ts` - route registry entry for Intelligence Graph.

## Graph Rendering

- `apps/web/components/platform/intelligence/GraphCanvas.tsx` - SVG graph renderer, viewBox zoom/pan, SVG labels, focus/selection, simple running/failure visuals.
- `apps/web/components/platform/intelligence/force-layout.ts` - deterministic custom force layout, node radius, seeded initial positions and capped iterations.
- `apps/web/lib/intelligence/graph-contract.ts` - normalized node/edge contract, allowed taxonomies, validators, response caps and sanitizers.

## Runtime

- `apps/web/lib/intelligence/operations-graph.ts` - Live Operations snapshot graph builder.
- `apps/web/lib/atlas/isolation.ts` - project allow-list and fail-closed project scoping helpers.
- `apps/web/lib/atlas/context.ts` - Atlas context snapshot from project-scoped DB reads.
- `apps/web/lib/atlas/runtime.tsx` - client Atlas voice/workspace runtime, not a graph runtime source.
- `apps/web/lib/ai/manager.ts` - Manager operational context and task model; includes a known global cost read caveat for `run_logs`.
- `apps/web/app/api/runs/drain/route.ts` - durable run lifecycle owner.
- `apps/web/lib/ai/workflow-executor.ts` - step execution, run logs, output persistence, validation and cancellation hooks.
- `apps/web/lib/ai/run-create.ts` - run creation path.
- `apps/web/lib/ai/resume.ts` - failed-run resume path.
- `apps/web/lib/ai/fencing.ts` - claim-id fencing for run writes.
- `apps/web/lib/ai/policy-gate.ts` - approval gate decision from `runs.policy_class`.

## APIs

- `apps/web/app/api/intelligence/graph/system/route.ts` - authenticated System Map API.
- `apps/web/app/api/intelligence/graph/operations/route.ts` - authenticated Live Operations API.
- `apps/web/app/api/approvals/[id]/route.ts` - approval detail and mutation endpoint with project access and status-guarded run transition.
- `apps/web/app/api/approvals/route.ts` - approval collection/create endpoint.
- `apps/web/app/api/runs/[id]/stream/route.ts` - SSE-like polling stream for run logs, not used by the graph.
- `apps/web/app/api/v1/runs/route.ts` - API run creation.
- `apps/web/app/api/v1/runs/[id]/route.ts` - API run detail.
- `apps/web/app/api/runs/[id]/cancel/route.ts` - cancel action.
- `apps/web/app/api/runs/[id]/resume/route.ts` - resume action.

## Database

- `apps/web/lib/supabase/database.types.ts` - generated Supabase schema types; repository source of truth for generated table shapes.
- `apps/web/lib/supabase/types.ts` - bridge aliases and app-specific unions, including `RunStatus`.
- `apps/web/supabase/migrations/20260613_h1p1_execution_policy_foundation.sql` - run status CHECK and workflow `side_effect_class`.
- `apps/web/supabase/migrations/20260617_h1p4_pr2_run_rejected_status.sql` - adds `rejected` to run statuses.
- `apps/web/supabase/migrations/20260614_h1p3_run_steps_snapshot.sql` - immutable run step snapshot.
- `apps/web/supabase/migrations/20260616_h1p4_run_policy_snapshot.sql` - per-run policy snapshot.
- `apps/web/supabase/migrations/20260614091000_h1p5_runs_claim_id.sql` - claim id on runs and claim/reaper rotation.
- `apps/web/supabase/migrations/20260614091500_h1p5_runs_cancel_requested.sql` - run cancellation flags.
- `supabase/migrations/20260603_durable_runs.sql` - durable run attempts, leases, claim/reaper functions and cron.
- `supabase/migrations/20260603_marketing_engine_foundation.sql` - approval columns and approval status CHECK.
- `supabase/migrations/20260609_manager_task_dream_link.sql` - manager task linkage fields.
- `apps/web/supabase/migrations/20260622_atlas_signals.sql` - `atlas_signals`.
- `supabase/migrations/20260629_120000_atlas_intelligence.sql` - service-role `atlas_intelligence`.
- `supabase/migrations/20260629_120100_atlas_entities.sql` - service-role `atlas_entities`.
- `supabase/migrations/20260611_atlas_actions.sql` - Atlas action ledger.
- `supabase/migrations/20260603_cron_heartbeat.sql` - cron heartbeat operational health.
- `apps/web/supabase/migrations/20260623_150200_collector_runs.sql` - collector run status.

## Security

- `apps/web/app/(platform)/layout.tsx` - platform authentication gate and global shell data reads.
- `apps/web/lib/supabase/server.ts` - cookie-bound Supabase server client.
- `apps/web/lib/supabase/admin.ts` - service-role client; server-only and no-store fetch.
- `apps/web/lib/auth/project-access.ts` - project access resolution and authorization helpers for user-facing APIs.
- `apps/web/lib/atlas/isolation.ts` - allow-list, impossible-id fail-closed behavior and project scope helpers.
- `apps/web/tests/isolation/README.md` - isolation testing approach.
- `apps/web/tests/isolation/routes.test.ts` - route isolation tests.
- `apps/web/tests/isolation/tables.test.ts` - table isolation tests.
- `apps/web/tests/isolation/route-manifest.json` - route inventory.
- `apps/web/tests/isolation/sql/omnira_isolation_inventory.sql` - SQL inventory.

## Graphify

- `.agents/skills/graphify/SKILL.md` - local Graphify skill pipeline and command behavior.
- `.agents/skills/graphify/.graphify_version` - current skill version marker (`0.9.9`).
- `.agents/skills/graphify/references/*.md` - Graphify references for update, watch, exports, hooks, query, merge and extraction.
- `.graphifyignore` - excludes secrets, `.agents`, dependencies, builds, media, generated artifacts and local state from Graphify scans.
- `.gitignore` - ignores `graphify-out/` and `apps/web/data/intelligence/`.
- `graphify-out/graph.json` - raw local Graphify artifact, gitignored.
- `graphify-out/graph.html` - raw local Graphify HTML visualization, gitignored and not served.
- `graphify-out/manifest.json` - raw local scan manifest, gitignored.
- `apps/web/scripts/import-system-graph.ts` - import/sanitize script that writes `apps/web/data/intelligence/system-graph.json`.
- `apps/web/data/intelligence/system-graph.json` - sanitized local app artifact, gitignored.
- `docs/intelligence-graph.md` - current architecture/runtime notes for the MVP and future production artifact design.

## Tests

- `apps/web/lib/intelligence/graph-contract.test.ts` - contract validation, path safety and response cap behavior.
- `apps/web/lib/intelligence/graphify-import.test.ts` - Graphify import, secret/path rejection, label sanitization and confidence behavior.
- `apps/web/lib/intelligence/system-graph.test.ts` - overview/community/neighborhood response metadata behavior.
- `apps/web/lib/intelligence/operations-graph.test.ts` - project isolation and derived runtime relation behavior.
- `apps/web/lib/qa/run-status.test.ts` - run status behavior outside graph.
- `apps/web/lib/qa/h1p5-fencing.test.ts` - claim fencing behavior.
- `apps/web/lib/qa/h1p5-cancel.test.ts` - cancellation behavior.
- `apps/web/lib/qa/h1-resume.test.ts` - resume behavior.
- `apps/web/lib/qa/policy-gate.test.ts` - policy gate behavior.
- `apps/web/lib/qa/atlas-intelligence-producers.test.ts` - Atlas intelligence producer coverage.

## Documentation

- `docs/architecture/intelligence-graph/book/OMNIRA_INTELLIGENCE_GRAPH_BOOK_v1.0.pdf` - canonical founder-approved architecture.
- `docs/architecture/intelligence-graph/book/OMNIRA_INTELLIGENCE_GRAPH_BOOK_v1.0.docx` - canonical book source package document.
- `docs/architecture/intelligence-graph/book/OMNIRA_INTELLIGENCE_GRAPH_EDITORIAL_REPORT.md` - canonicalization/editorial status.
- `docs/architecture/intelligence-graph/book/OMNIRA_INTELLIGENCE_GRAPH_SOURCE_MANIFEST.md` - source manifest.
- `docs/intelligence-graph.md` - current MVP implementation note and production artifact design.
- `docs/architecture/history/OMNIRA_ATLAS_INTELLIGENCE_ADR.md` - Atlas intelligence store and future Graphify backend context.
- `docs/architecture/history/OMNIRA_ATLAS_INTELLIGENCE_MODEL_REVIEW.md` - graph-backend-as-store future note.
- `docs/architecture/history/OMNIRA_ATLAS_INTELLIGENCE_TAXONOMY.md` - intelligence object taxonomy context.
