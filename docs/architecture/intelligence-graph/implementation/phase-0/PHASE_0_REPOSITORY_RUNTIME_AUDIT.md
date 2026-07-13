# Phase 0 Repository and Runtime Audit

Status: Phase 0 audit only. No Intelligence Graph functionality was implemented.

Verified environment:
- Worktree: `/Volumes/2T_SSD_AI/Projects/Omnira/.worktrees/omnira-intelligence-graph`
- Branch: `feat/omnira-intelligence-graph`
- HEAD: `a94f21d Merge pull request #47 from Bumbi190/docs/intelligence-graph-book-v1`
- `origin/main...HEAD`: `0 0`
- Initial working tree: clean
- Git lock files: none found under `.git`

## Executive Summary

The current Intelligence Graph is an MVP created in PR #44 (`bf51782`) and documented in `docs/intelligence-graph.md`. It provides two working views:

- System Map: static architecture view loaded from a sanitized local Graphify import.
- Live Operations: read-only runtime snapshot built from existing Supabase tables.

Execution Replay is explicitly disabled in the UI because the repository does not yet have a per-step persisted event contract with ordering, correlation and causation.

The current implementation is directionally aligned with the canonical architecture as a Phase 0/MVP base, but it does not yet satisfy the canonical product. The largest missing areas are visual language, semantic zoom, collision-aware labels, realtime events, freeze/stale/unknown states, list view, responsive/mobile strategy, performance telemetry and production Graphify delivery.

Recommendation: `RETAIN AND INCREMENTALLY EXTEND`. The SVG/DOM stack can carry Phase 1 and much of Phase 2 if the visible graph remains capped and aggregated, but Phase 3-5 must introduce a stronger runtime event contract, render scheduler, quality levels and measurement before any claim of canonical Live Operations.

## Current Graph Implementation

Entry points:
- `apps/web/app/(platform)/intelligence/graph/page.tsx` defines `/intelligence/graph` and delegates all data to the authenticated graph APIs.
- `apps/web/components/platform/intelligence/IntelligenceGraphClient.tsx` owns view mode, search, filters, selection, inspector state and API fetches.
- `apps/web/components/platform/intelligence/GraphCanvas.tsx` renders the graph.
- `apps/web/components/platform/intelligence/NodeInspector.tsx` renders selected node metadata and links to existing Omnira routes.

Data contracts:
- `apps/web/lib/intelligence/graph-contract.ts` defines the normalized graph model, allowed node kinds, allowed relations, validation, response caps and path/label sanitization.
- `apps/web/lib/intelligence/system-graph.ts` loads `apps/web/data/intelligence/system-graph.json`, validates it and serves overview, community and neighborhood views.
- `apps/web/lib/intelligence/operations-graph.ts` builds runtime graph snapshots from real Supabase rows.

APIs:
- `apps/web/app/api/intelligence/graph/system/route.ts` requires a logged-in user, loads System Map, supports overview/community/neighborhood/search, and returns honest unavailable states for missing/invalid artifacts.
- `apps/web/app/api/intelligence/graph/operations/route.ts` requires a logged-in user, validates `project` and `hours`, then calls `buildOperationsGraph` with a service-role client plus explicit user project scoping.

## Rendering Stack

Verified stack: DOM/SVG.

Evidence:
- `GraphCanvas.tsx` renders a root `<svg>`, `<line>`, `<circle>` and `<text>` elements.
- Zoom and pan are implemented through `viewBox` state in `GraphCanvas`.
- Node focus/selection is handled by SVG groups with `tabIndex`, `role="button"`, `aria-label`, Enter and Space handlers.
- No Canvas or WebGL renderer is present in the graph implementation.
- No graph library such as d3, React Flow or Cytoscape is in `apps/web/package.json`.

Layout:
- `apps/web/components/platform/intelligence/force-layout.ts` implements a deterministic custom force layout.
- Initial positions are seeded with an FNV-1a hash of node id.
- The layout is computed in `useMemo` on the main thread.
- Iteration budget is capped by node count: 220, 140 or 80 iterations.
- Graph response caps are `LIMITS.MAX_RESPONSE_NODES = 600` and `MAX_RESPONSE_EDGES = 1500`.

The stack is not currently a hybrid renderer. It is SVG with React state, a deterministic main-thread layout and SVG text labels.

## Current System Map

System Map is sourced from the local imported artifact:
- Raw Graphify output: `graphify-out/graph.json` (gitignored)
- Sanitized app artifact: `apps/web/data/intelligence/system-graph.json` (gitignored)
- Loader path: `apps/web/lib/intelligence/system-graph.ts`

Observed artifact metadata:
- Raw Graphify version marker: `.agents/skills/graphify/.graphify_version` = `0.9.9`
- Current raw/imported graph built at commit: `d329d93c115e63bf27f652457eeae077e0bd41a9`
- Current HEAD: `a94f21d`
- Imported graph: 4813 nodes, 8609 edges, 280 communities
- Imported graph kinds: `code`, `document`, `rationale`
- Imported graph relations include `calls`, `contains`, `imports`, `references`, `uses`, `implements`, `inherits`, `method`, `rationale_for`, `re_exports`, `imports_from`, `indirect_call`

Conclusion: System Map works as a local static MVP, but the artifact is stale relative to HEAD and is not committed. Vercel cannot rely on the local artifact unless a separate private storage or CI delivery path is implemented.

## Current Live Operations

Live Operations is a snapshot API, not realtime:
- Client fetches `/api/intelligence/graph/operations?hours=...&project=...`.
- The graph client does not subscribe to Supabase Realtime.
- No graph-specific polling interval exists. Updates happen on mode/filter/time changes or manual reload.

Graph-visible runtime entities:
- `project` from `projects`
- `agent` from `agents`
- `workflow` from `workflows`
- `run` from `runs`
- `approval` from `approvals`
- `output` from `outputs`
- `task` from `manager_tasks`

Graph-visible runtime relations:
- `CONTAINS`: project -> agent/workflow
- `DELEGATED_TO`: workflow -> agent, derived from `workflows.steps[].agent_id`
- `STARTED`: workflow -> run, from `runs.workflow_id`
- `PRODUCED`: run -> output, from `outputs.run_id`
- `REQUESTED_APPROVAL`: run -> approval, from `approvals.run_id`
- `TRACKS`: manager task -> run/workflow, but current query only fetches tasks with `run_id` in visible runs

Known omissions are explicit in `graph-contract.ts` and `docs/intelligence-graph.md`: no `USED_TOOL`, no `READ_MEMORY`, no `RETRIED_AS`, no separate operator node, and no Execution Replay.

## Execution Replay Status

Execution Replay is disabled in `IntelligenceGraphClient.tsx` through a disabled tab with a title explaining that per-step eventdata is insufficient.

The repository has adjacent execution data:
- `runs` and `run_logs`
- `outputs`
- `approvals`
- `runs.steps_snapshot`
- `runs.error_history`
- `claim_id`/fencing and drain lifecycle

But there is no verified graph contract for:
- persisted event envelope
- event ordering
- event identity/deduplication
- correlation id
- causation id
- tool call nodes
- per-step event stream suitable for replay
- incident lifecycle separate from failure facts

Conclusion: Execution Replay is `NOT IMPLEMENTED` and correctly withheld.

## Principal Conclusions

1. The current engine is a scoped SVG MVP, not the canonical graph product.
2. Project isolation for Live Operations is backend-enforced in application code through `lib/atlas/isolation`, even though the API uses service role after authentication.
3. System Map access is any logged-in user, not project-scoped, because it describes Omnira code architecture rather than runtime project rows.
4. Graphify generation is local/manual today. No CI workflow exists in this worktree and artifacts are gitignored.
5. The Graphify importer has strong fail-closed checks for size, JSON shape, secret-like content and unsafe source paths.
6. Runtime truth is limited to snapshot rows and derived FK/JSON references. Realtime, freeze, stale and unknown state are not implemented.
7. Accessibility exists only as partial SVG focus/ARIA support. The canonical synchronized list view, screen-reader model and reduced-motion behavior are missing.
8. The current SVG layout can support incremental Phase 1/2 work, but Phase 3+ depends on new runtime contracts and performance evidence.

## Evidence References

- Canonical book: `docs/architecture/intelligence-graph/book/OMNIRA_INTELLIGENCE_GRAPH_BOOK_v1.0.pdf`
- Editorial status: `docs/architecture/intelligence-graph/book/OMNIRA_INTELLIGENCE_GRAPH_EDITORIAL_REPORT.md`
- Prior implementation doc: `docs/intelligence-graph.md`
- PR #44 merge: `bf51782 Merge pull request #44 from Bumbi190/feat/omnira-intelligence-graph`
- Graph page: `apps/web/app/(platform)/intelligence/graph/page.tsx`
- Client: `apps/web/components/platform/intelligence/IntelligenceGraphClient.tsx`
- Renderer: `apps/web/components/platform/intelligence/GraphCanvas.tsx`
- Layout: `apps/web/components/platform/intelligence/force-layout.ts`
- Inspector: `apps/web/components/platform/intelligence/NodeInspector.tsx`
- Contract: `apps/web/lib/intelligence/graph-contract.ts`
- Graphify importer: `apps/web/lib/intelligence/graphify-import.ts`
- System loader: `apps/web/lib/intelligence/system-graph.ts`
- Operations graph: `apps/web/lib/intelligence/operations-graph.ts`
- System API: `apps/web/app/api/intelligence/graph/system/route.ts`
- Operations API: `apps/web/app/api/intelligence/graph/operations/route.ts`
- Project isolation: `apps/web/lib/atlas/isolation.ts`
- Approval API authority checks: `apps/web/app/api/approvals/[id]/route.ts`
- Run drain lifecycle: `apps/web/app/api/runs/drain/route.ts`
- Generated DB types: `apps/web/lib/supabase/database.types.ts`
- Graph tests: `apps/web/lib/intelligence/*.test.ts`
