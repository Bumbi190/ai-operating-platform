# Phase 0 Canonical Gap Analysis

Canonical source: `docs/architecture/intelligence-graph/book/OMNIRA_INTELLIGENCE_GRAPH_BOOK_v1.0.pdf` and companion DOCX/PDF package. Status: CANONICAL - FOUNDER APPROVED, 11 July 2026.

Allowed classifications:
- IMPLEMENTED
- PARTIALLY IMPLEMENTED
- NOT IMPLEMENTED
- BLOCKED BY MISSING RUNTIME CONTRACT
- BLOCKED BY SECURITY REQUIREMENT
- BLOCKED BY PERFORMANCE EVIDENCE
- DEFERRED BY CANONICAL SCOPE
- REQUIRES PRODUCT DECISION

## Requirement Inventory and Gap Matrix

| ID | Canonical requirement | Repository evidence | Classification | Notes |
|---|---|---|---|---|
| IG-PV-001 | Intelligence Graph is an operational interface, not decorative visualization. | `docs/intelligence-graph.md`; `/intelligence/graph` page and APIs use real artifact/runtime data. | PARTIALLY IMPLEMENTED | MVP avoids sample data, but many canonical operations are missing. |
| IG-PV-002 | Three modes: System Map, Live Operations, future Execution Replay. | `IntelligenceGraphClient.tsx` has System Map, Live Operations and disabled Replay tab. | PARTIALLY IMPLEMENTED | Replay intentionally disabled. |
| IG-PV-003 | Operational truth before spectacle. | No sample data in client; unavailable states for missing artifact; runtime edges are derivable only. | PARTIALLY IMPLEMENTED | No realtime truth layer yet. |
| IG-PV-004 | Projects remain separate operational domains. | `operations-graph.ts`; `lib/atlas/isolation.ts`; `operations-graph.test.ts`. | PARTIALLY IMPLEMENTED | Backend scoping exists for Live Operations; canonical territories/isolate not built. |
| IG-PV-005 | History remains history; historical executions must not look live. | Time filter on operations API; no replay/live animation for history. | PARTIALLY IMPLEMENTED | No freshness/completed retention contract. |
| IG-VIS-001 | Canonical node shapes for Atlas, Project, Manager, Agent, Workflow, Run, Tool, Approval, Incident, Output. | `GraphCanvas.tsx` renders all nodes as circles; no Atlas/Manager/tool/incident graph node. | NOT IMPLEMENTED | Visual language not canonical. |
| IG-VIS-002 | Status must use ring, icon, label, badge and edge pattern, not only color. | `GraphCanvas.tsx` uses color, failed dot and running pulse; labels are basic. | PARTIALLY IMPLEMENTED | No icon/badge/pattern system. |
| IG-VIS-003 | Failure and approval must break through attention hierarchy. | Failed run gets red status and dot; approval node inherits status color. | PARTIALLY IMPLEMENTED | No diamond approval, permanent critical labels or incident path priority. |
| IG-VIS-004 | Labels use anchors and collision avoidance. | `GraphCanvas.tsx` renders SVG text below nodes based on simple conditions. | NOT IMPLEMENTED | No collision engine. |
| IG-VIS-005 | Design tokens separate semantics from rendering. | Colors are local constants in `GraphCanvas.tsx`. | NOT IMPLEMENTED | No token architecture for graph visuals. |
| IG-VIS-006 | System Map must not become a generic force graph or Graphify clone. | Custom SVG renderer and import contract exist. | PARTIALLY IMPLEMENTED | Current visual is still a generic simple force graph. |
| IG-INT-001 | Semantic zoom with five information levels. | `GraphCanvas.tsx` viewBox zoom only; System API has overview/community/neighborhood levels. | PARTIALLY IMPLEMENTED | API levels exist; zoom does not drive semantic levels. |
| IG-INT-002 | Search over System Map. | `IntelligenceGraphClient.tsx`; `system-graph.ts::searchNodes`. | IMPLEMENTED | Search is System Map only. |
| IG-INT-003 | Filter by kind/relation/status/project/time. | Client-side kind/relation/status filters; project/time API filters. | PARTIALLY IMPLEMENTED | No isolate/focus semantics; filtering can relayout. |
| IG-INT-004 | Selection opens inspector and highlights nearest relations. | `GraphCanvas.tsx`; `NodeInspector.tsx`. | PARTIALLY IMPLEMENTED | Basic relation highlight and inspector exist. |
| IG-INT-005 | Drilldown into communities and execution paths. | Community double-click drilldown exists for System Map. | PARTIALLY IMPLEMENTED | No execution path drilldown. |
| IG-INT-006 | Focus community and isolate with explicit exit. | Community view and Overview back button. | PARTIALLY IMPLEMENTED | Isolate command not implemented. |
| IG-INT-007 | Fullscreen, fit, focus and reset controls. | Fit/reset buttons exist. | PARTIALLY IMPLEMENTED | No browser fullscreen. |
| IG-INT-008 | URL-state and interaction history. | Not found in graph client. | NOT IMPLEMENTED | No URL state for mode/filter/selection. |
| IG-RT-001 | Snapshot plus hybrid realtime model. | Snapshot APIs exist; no graph realtime. | PARTIALLY IMPLEMENTED | Realtime absent. |
| IG-RT-002 | Event envelope with id, type, time, scope, correlation, causation, schema version. | No graph event envelope found. | BLOCKED BY MISSING RUNTIME CONTRACT | Required before canonical Live Operations. |
| IG-RT-003 | Event deduplication and ordering. | No graph event stream; no ordering contract. | BLOCKED BY MISSING RUNTIME CONTRACT | Runtime has run timestamps but not event ordering. |
| IG-RT-004 | Correlation and causation. | No graph event IDs; run/workflow FKs only. | BLOCKED BY MISSING RUNTIME CONTRACT | Replay blocked. |
| IG-RT-005 | Runtime statuses and state machine. | Run statuses exist; approval statuses exist; graph passes raw status. | PARTIALLY IMPLEMENTED | Canonical stale/unknown/retrying/blocked etc. absent or not verified. |
| IG-RT-006 | Approval lifecycle is explicit and server-confirmed. | `approvals/[id]/route.ts` server checks project access and updates rows. | PARTIALLY IMPLEMENTED | Graph has no approval action UI; lifecycle statuses differ from canonical. |
| IG-RT-007 | Failure and incident are distinct. | Failed runs exist; incident lifecycle absent. | BLOCKED BY MISSING RUNTIME CONTRACT | No graph incident source. |
| IG-RT-008 | Freshness, stale and connection state. | System artifact has `generatedAt` and `builtAtCommit`; operations API has generatedAt. | PARTIALLY IMPLEMENTED | No stale/connection state UI or policy. |
| IG-RT-009 | Freeze live view and freeze buffer. | Not found in graph client. | NOT IMPLEMENTED | Requires realtime/event buffer. |
| IG-RT-010 | Backend-enforced project isolation and payload minimization. | Live Operations uses `getAllowedProjectIds` and scoped queries; payload selects limited columns. | PARTIALLY IMPLEMENTED | System Map access remains any logged-in user by design; realtime scope absent. |
| IG-RT-011 | Activity rail truth from verified events. | Global platform layout has ActivityRail from recent runs/approvals; graph does not own it. | PARTIALLY IMPLEMENTED | Not synchronized with graph view. |
| IG-ACC-001 | Accessibility is a parallel interface with synchronized list view. | No graph list/table view found. | NOT IMPLEMENTED | Major Phase 4 prerequisite. |
| IG-ACC-002 | Keyboard navigation across toolbar, canvas, list and inspector. | SVG nodes are focusable and Enter/Space selects. | PARTIALLY IMPLEMENTED | No arrow navigation, shortcuts, list sync or focus restoration model. |
| IG-ACC-003 | Screen reader can understand node, status, project, relation and actions. | Node `aria-label` includes kind/label/status. | PARTIALLY IMPLEMENTED | No semantic graph/list representation or live region strategy. |
| IG-ACC-004 | Reduced motion removes animation but preserves information. | No graph reduced-motion handling found. | NOT IMPLEMENTED | SVG running animation has no media-query fallback. |
| IG-ACC-005 | Responsive/mobile attention-first view. | Page has responsive padding/inspector width; no mobile graph strategy. | PARTIALLY IMPLEMENTED | Canonical Pixel/touch/list behavior absent. |
| IG-ACC-006 | Critical actions are not canvas gestures. | Graph has no critical actions; approval actions are separate API/UI. | IMPLEMENTED | By omission in graph, but future graph actions must preserve this. |
| IG-PERF-001 | Frame and input latency budgets must be measured. | No graph performance telemetry found. | BLOCKED BY PERFORMANCE EVIDENCE | Current claims are unprofiled. |
| IG-PERF-002 | Node/edge budgets and aggregation. | `LIMITS.MAX_RESPONSE_NODES=600`; overview community aggregation. | PARTIALLY IMPLEMENTED | No adaptive quality levels or runtime aggregation by criticality. |
| IG-PERF-003 | Main thread vs Worker based on profiling. | Layout is main-thread only. | PARTIALLY IMPLEMENTED | Acceptable for MVP; needs profiling before scaling. |
| IG-PERF-004 | Render scheduler, background pause, central animation control. | Not found. | NOT IMPLEMENTED | SVG animate per running node exists. |
| IG-PERF-005 | Quality levels High/Medium/Low/Static. | Not found. | NOT IMPLEMENTED | Needed before Phase 5. |
| IG-PERF-006 | Large/extreme datasets use summary/drilldown, not full render. | System overview/community caps; operations maxRuns=120. | PARTIALLY IMPLEMENTED | No measured extreme dataset proof. |
| IG-IMP-001 | Phase 0 audit before major implementation. | This package. | IMPLEMENTED | Audit-only. |
| IG-IMP-002 | Phase 1 visual foundation without full realtime. | Current MVP predates canonical visual foundation. | NOT IMPLEMENTED | Next phase target. |
| IG-IMP-003 | Phase 2 zoom, labels and interaction. | Basic zoom/search/filter/inspector. | PARTIALLY IMPLEMENTED | Needs semantic zoom and collision labels. |
| IG-IMP-004 | Phase 3 Live Operations truth layer. | Snapshot operations graph exists. | PARTIALLY IMPLEMENTED | Realtime/freeze/stale/event model missing. |
| IG-IMP-005 | Phase 4 accessibility, responsive and list view. | Partial ARIA/focus only. | NOT IMPLEMENTED | List view missing. |
| IG-IMP-006 | Phase 5 scale and quality adaptation. | Response caps exist. | PARTIALLY IMPLEMENTED | No telemetry/quality levels. |
| IG-IMP-007 | Phase 6 hardening and release. | Tests exist for current MVP. | PARTIALLY IMPLEMENTED | Canonical release gates not met. |
| IG-IMP-008 | Execution Replay out of current scope until event history exists. | Disabled tab and docs. | IMPLEMENTED | Correctly deferred. |
| IG-TEST-001 | Contract/unit tests for graph contract and import. | `graph-contract.test.ts`, `graphify-import.test.ts`. | IMPLEMENTED | Current MVP scope covered. |
| IG-TEST-002 | Project isolation tests. | `operations-graph.test.ts`, `apps/web/tests/isolation/*`. | PARTIALLY IMPLEMENTED | Graph route tested via builder, not full e2e. |
| IG-TEST-003 | Accessibility tests: keyboard, screen reader, reduced motion, high contrast. | No graph accessibility test found. | NOT IMPLEMENTED | Required before Phase 4 release. |
| IG-TEST-004 | Mobile and Pixel-like tests. | Not found for graph. | NOT IMPLEMENTED | Required later. |
| IG-TEST-005 | Performance datasets and profiling. | Not found for graph. | BLOCKED BY PERFORMANCE EVIDENCE | Required before scale claims. |
| IG-TEST-006 | Visual evidence across modes. | Not found in repo for current graph. | NOT IMPLEMENTED | Required for canonical release. |
| IG-GIT-001 | Dedicated feature branch/worktree and clean start. | Verified branch/worktree/head/status. | IMPLEMENTED | Phase 0 met. |
| IG-GIT-002 | No implementation before Phase 0 audit. | This phase made docs only. | IMPLEMENTED | Current repository already has MVP from PR #44. |
| IG-GIT-003 | Migrations only at verified need. | No migrations created in Phase 0. | IMPLEMENTED | Future runtime contracts likely require migrations. |
| IG-GIT-004 | Graphify artifact reproducible delivery. | Docs describe future CI/private bucket; no `.github` workflows; artifacts gitignored. | PLANNED | Not implemented. |
| IG-GIT-005 | PR must include tests, visual evidence, security, rollback. | PR #44 had tests and docs; no current PR opened. | PARTIALLY IMPLEMENTED | Future canonical PR must satisfy full gate. |

## Minimum Covered Canonical Topics

- System Map: PARTIALLY IMPLEMENTED.
- Live Operations: PARTIALLY IMPLEMENTED.
- Execution Replay foundations: BLOCKED BY MISSING RUNTIME CONTRACT.
- Atlas: PARTIALLY IMPLEMENTED outside graph, NOT IMPLEMENTED as canonical graph node.
- Manager: PARTIALLY IMPLEMENTED as tasks/context, NOT IMPLEMENTED as canonical graph node.
- Projects and territories: PARTIALLY IMPLEMENTED for data/scope, NOT IMPLEMENTED visually.
- Agents: PERSISTED and graph-visible, no runtime execution state.
- Workflows: PERSISTED and graph-visible, no canonical workflow visual/status model.
- Runs: PERSISTED and graph-visible, no per-step event model.
- Tools: UNSUPPORTED in graph.
- Outputs: PERSISTED and graph-visible.
- Approvals: PERSISTED and graph-visible; server action authority exists outside graph.
- Failures: DERIVED from failed runs; no incident object.
- Incidents: NOT IMPLEMENTED.
- Node types: PARTIALLY IMPLEMENTED contract, NOT canonical visual language.
- Edge types: PARTIALLY IMPLEMENTED contract, not canonical realtime semantics.
- Graphify artifacts: PARTIALLY IMPLEMENTED local/manual, production delivery PLANNED.
- Semantic zoom: PARTIALLY IMPLEMENTED at API level only.
- Labels/collision avoidance: NOT IMPLEMENTED.
- Inspector: PARTIALLY IMPLEMENTED.
- Search/filter/drilldown: PARTIALLY IMPLEMENTED.
- Isolate/fullscreen: NOT IMPLEMENTED except basic community back and fit.
- List view: NOT IMPLEMENTED.
- Keyboard/screen reader/reduced motion: PARTIALLY IMPLEMENTED keyboard/ARIA only; reduced motion NOT IMPLEMENTED.
- Responsive/mobile: PARTIALLY IMPLEMENTED layout only.
- Snapshots: PARTIALLY IMPLEMENTED.
- Realtime/polling/dedup/order/correlation/causation: mostly NOT IMPLEMENTED or BLOCKED BY MISSING RUNTIME CONTRACT.
- Freshness/stale/unknown/freeze: NOT IMPLEMENTED.
- Aggregation/quality levels/performance budgets: PARTIALLY IMPLEMENTED caps, otherwise NOT IMPLEMENTED or BLOCKED BY PERFORMANCE EVIDENCE.
- Automated/manual tests: automated unit tests exist for MVP; canonical manual/device/perf/a11y tests missing.

## Phase 1 Readiness Classification

READY WITH PREREQUISITES.

Prerequisites:
- Keep Phase 1 scoped to visual foundation over existing snapshot contracts.
- Do not claim canonical Live Operations until Phase 3 runtime contracts exist.
- Preserve backend project scoping and no-sample-data behavior.
- Do not regenerate Graphify artifacts unless the artifact delivery task explicitly allows writes.
- Define visual token/nodes/edges without adding runtime behaviors.
