# Omnira Intelligence Graph Phase 2 — Zoom, Labels and Interaction Report

Date: 2026-07-13
Branch: `feat/omnira-intelligence-graph-phase-2`
Worktree: `/Volumes/2T_SSD_AI/Projects/Omnira/.worktrees/omnira-intelligence-graph-phase-2`
Starting commit: `0c50ee7c51de7f1080732b234cabeb868dcd0edf`
Decision: **COMPLETE WITH DOCUMENTED LIMITATIONS**

## Scope and authority

Phase 2 incrementally extends the retained SVG/DOM graph and deterministic main-thread layout. It does not add another renderer, change the graph/API/database contracts, fabricate runtime entities, generate Graphify data, enable Replay, or start Phase 3.

The implementation was checked against the founder-approved canonical book chapters covering Product Vision, Motion Design, Node & Edge Visual Language, Zoom/Labels/Interaction, Accessibility & Responsive Strategy, Performance Budget, Implementation Phases, Test Plan, and Git & Delivery Plan. The canonical DOCX, editorial report, source manifest, every Phase 0 document, and the complete founder-approved Phase 1 report were also read.

Authority was applied in the required order: canonical book, verified Phase 0 findings, merged Phase 1 implementation/report, Phase 2 task, existing implementation detail.

## Canonical requirements implemented

- Replaced the temporary three-band Phase 1 approximation with the canonical five-level semantic model.
- Kept structural visibility, label visibility, edge visibility, interaction meaning, and inspector detail as separate policies.
- Preserved selected nodes, keyboard-focused nodes, search results, and verified attention states across semantic thresholds.
- Added deterministic dynamic label budgets based on semantic level, viewport, node count, and persistent truth count.
- Added priority-aware collision routing with twelve local candidates, two-line long-name handling, technical suffix removal, viewport/node/inspector avoidance, and short leader lines.
- Added truthful workflow run-summary annotations derived only from verified `STARTED` edges and same-project membership.
- Added local project/workflow/agent/run drilldown over already scoped payloads, System Map community drilldown, breadcrumbs, internal Back history, isolate/exit, camera restoration, fit scope, focus node, reset view, and reset all.
- Changed client-side kind/status/relation filtering from relayout-causing removal to dim-first presentation.
- Added scoped Live Operations search, deterministic result ordering, keyboard search focus, explicit no-result state, result selection, and camera focus.
- Added safe URL state for view, authorized project hint, community, selection, drilldown, and isolate; URL identifiers resolve only against the authenticated scoped payload.
- Added real browser Fullscreen API entry/exit while preserving React selection, scope, filters, and camera state.
- Added semantic arrow-key node navigation, Enter/Space behavior, Escape, `+`/`-`, `0`, `/`, `F`, and `I` controls.
- Replaced the narrow mobile side overlay with a bottom-sheet inspector and reserved its canvas region for camera/label placement.
- Preserved the non-flattening labeled SVG group, node buttons, selected state, visible focus, non-color status, screen-stable labels, and reduced-motion CSS contract.

## Semantic zoom model

Numeric thresholds are engine-specific, as permitted by the canonical book. They are deterministic for the retained 1200-unit SVG camera. Execution detail is entered by explicit run/path context rather than accidental extreme zoom.

| Level | Engine trigger | Meaning | Structural visibility | Labels | Edges | Interaction / inspector |
|---|---|---|---|---|---|---|
| Portfolio | view width `>= 1100` | Global overview | Runtime project hubs, System Map community summaries, selected/focused/search/attention truth | Landmarks and critical truth | Primary/attention only | Select; summary inspector |
| Project | `760–1099` | Project/community overview | Projects, communities, workflows, active/problem context | Landmark + context | Structural | Community focus; context inspector |
| Operational | `440–759` | Normal Live Operations level | Workflows, agents, active/critical runs, approvals and verified context | Selected/nearby, active workflow/agent, attention | Operational detail | Operational selection; operational inspector |
| Detail | `< 440` or explicit non-run drilldown | Detailed inspection | Local detail; unrelated nodes may remain dimmed | Detail labels under collision budget | Relation detail | Local inspection; full inspector |
| Execution | Explicit run/path drilldown | Static execution detail | Only verified path members | Execution/path labels | Selected path detail | Path navigation; execution inspector |

Node positions never change merely because the semantic level changes. Filters, selection, inspector opening, and isolate state do not re-run the deterministic force layout.

System Map overview already consists of truthful server-built community summaries. When no distributed System Map artifact exists, the existing honest unavailable state remains unchanged.

## Label routing and collision strategy

The static role-priority source remains authoritative in `graph-visuals.ts`. `graph-readability.ts` adds canonical transient overlays in this order: selected, keyboard focused, hovered, critical failure, waiting approval, active search result, running, project/community/workflow/agent/run/detail roles.

Labels route through below, above, right, left, four diagonal, and four extended local candidates. Each candidate is rejected deterministically against:

- already placed higher-priority labels;
- other important node geometry;
- current viewport edges;
- reserved mobile inspector bounds;
- any supplied control/overlay bounds.

Controls live outside the SVG canvas and therefore outside its labelable viewport. Desktop inspector opening shrinks the actual canvas and is handled by `ResizeObserver`; the mobile bottom sheet supplies an explicit reserved bound.

Long names remove a terminal technical/hash suffix where it is only an identifier, then use one or two bounded lines with deterministic truncation. Full names remain in SVG title and inspector. Project/territory, workflow, ordinary, and interaction typography remains screen-stable in CSS pixels. Important labels moved to diagonal/extended candidates receive a short, low-contrast leader line.

The dynamic budget follows the canonical desktop guidance: portfolio remains within the normal 8–25 range, operational detail grows conservatively, and detailed/execution views remain capped at 120 ordinary conflict-free labels. Persistent selected/project/attention truth may reserve capacity above the ordinary budget.

## Dense-view aggregation

One aggregation rule is implemented because it is fully supported by current contracts:

**Workflow run summary**

- Source: real `workflow -> run` edges with relation `STARTED`.
- Membership: both endpoints must exist in the current scoped payload, have the correct node kinds, and carry the same non-empty `projectId`.
- Representation: a clearly labeled read-only summary badge on the real workflow node, for example `4 runs · 1 attention`.
- Detail: real run members remain the source; selected, running, failed, approval-blocked, and otherwise attention-relevant runs can remain individually visible.
- Drilldown: opening the real workflow reveals its real scoped members; run drilldown opens a verified relation path.
- Persistence: no aggregate is written to the graph contract, API, database, or storage.

Cross-project `STARTED` relations are rejected from summary membership even if malformed data were present. No proximity- or community-algorithm membership is used.

System Map community summary nodes remain the existing verified server-derived aggregation. Output, incident, approval, and large historical run clustering are not added because Phase 0 found missing runtime contracts or assigned broader adaptive aggregation to later phases.

## Drilldown, isolate, search, filters, and URL state

Project drilldown uses verified `projectId`. Workflow and agent drilldown use at most two real relation hops inside the same project. Run drilldown includes the run, its workflow, assigned agents, project anchor, approvals, outputs, and task links that exist in the payload; sibling runs and cross-project nodes are explicitly excluded.

Internal Back stores community, drill/isolate scope, selected node, and camera. Returning across a System Map API-level change restores the previous camera after the earlier payload returns. Isolate is explicit, persistent, labeled, fit-able, and has a dedicated Exit control that restores the pre-isolate camera.

Live Operations search is local to the current authenticated API payload (and isolate scope when active). System Map keeps the existing authenticated search API so it can find nodes outside the current community response. Equal search scores use the single semantic role priority, degree, and ID as deterministic tie-breakers. No-result copy explicitly says the current authorized scope has no match.

Kind, run-status, and relation filters dim non-matches without removing nodes or restarting layout. Active filters are visible and removable. Critical non-matches remain visible and are counted. A truthful empty filtered state is shown while the structural context stays dimmed.

URL state contains navigation identifiers only. It contains no payloads, secrets, prompts, content, or credentials. Project hints still pass through the unchanged backend allow-list. Selected/drill/isolate identifiers have no authority and resolve only if present in the already authorized payload. Refresh can restore supported context. Full browser `popstate`/Forward integration is not implemented; the explicit internal Back path is authoritative in this phase.

## Fullscreen and viewport behavior

Fullscreen uses `requestFullscreen` and `exitFullscreen` on the complete graph experience, so mode tabs, search, filters, fit/reset, isolate controls, inspector, and exit remain reachable. Fullscreen state changes do not clear selection, filters, navigation scope, or camera. Browser denial is handled without changing context.

Fit graph includes nodes, project territories, and territory-label extents. Fit node and fit scope use deterministic layout positions. Desktop inspector resize preserves the selected neighborhood at the same zoom where possible. The mobile bottom-sheet inspector reserves 48 percent of the canvas height; label placement and camera panning avoid that region. Resize does not restart layout.

## Accessibility

- Root SVG remains a labeled `role="group"`, not a flattening image.
- Every rendered node remains a keyboard-focusable button with accessible name and `aria-pressed` selected state.
- Focus rings coexist with status and selection rings.
- Status remains expressed through shape, ring, dash, badge, text, and color.
- Arrow navigation selects the nearest node in the requested direction with semantic tie-breaking.
- Enter selects or drills an already selected node; Space selects without drilldown; Escape exits isolate/drilldown/selection; keyboard zoom/search/focus/isolate controls are supported.
- Search, filters, drilldown, isolate, fit/reset, fullscreen, inspector, and Back remain native keyboard-reachable controls.
- Semantic zoom keeps selected, focused, search, and critical truth discoverable.
- `prefers-reduced-motion` still removes graph transitions/animation without removing information.

The canonical parallel list view remains deferred to Phase 4 and is not claimed complete.

## Performance considerations

- Filter, selection, search, drilldown, isolate, semantic zoom, and inspector changes reuse the stable layout.
- Structural semantic visibility reduces rendered node/edge counts at low zoom.
- Label candidates, budgets, summaries, search indexes, filter sets, scopes, territories, and edge policies are memoized deterministic computations.
- Run summaries are linear in edge count.
- Scoped search is `O(n log n)` only after a two-character query.
- Collision routing is bounded by visible candidates, twelve positions, the graph response cap of 600 nodes, and the maximum ordinary label budget; it does not use a permanent animation loop.
- No dependency, Worker, renderer rewrite, timer-per-node, or animation loop was introduced.

No Phase 5 scale claim is made. Real frame-time, collision-time, long-session, MacBook Air M4, and Pixel 10 Pro profiling remain required before later release/scale gates.

## Affected files

Application code:

- `apps/web/components/platform/intelligence/GraphCanvas.tsx`
- `apps/web/components/platform/intelligence/GraphCanvas.module.css`
- `apps/web/components/platform/intelligence/IntelligenceGraphClient.tsx`
- `apps/web/components/platform/intelligence/NodeInspector.tsx`
- `apps/web/components/platform/intelligence/graph-readability.ts`
- `apps/web/components/platform/intelligence/graph-navigation.ts` (new)
- `apps/web/components/platform/intelligence/graph-url-state.ts` (new)
- `apps/web/components/platform/intelligence/graph-visuals.ts`

Focused tests:

- `apps/web/components/platform/intelligence/GraphCanvas.accessibility.test.ts`
- `apps/web/components/platform/intelligence/graph-readability.test.ts`
- `apps/web/components/platform/intelligence/graph-navigation.test.ts` (new)
- `apps/web/components/platform/intelligence/graph-url-state.test.ts` (new)
- `apps/web/components/platform/intelligence/graph-interaction-contract.test.ts` (new)

Documentation:

- `docs/architecture/intelligence-graph/implementation/phase-2/PHASE_2_ZOOM_LABELS_INTERACTION_REPORT.md` (new; the only Phase 2 report)

## Tests and results

Final focused command:

```text
npm run test -- components/platform/intelligence/graph-readability.test.ts components/platform/intelligence/graph-navigation.test.ts components/platform/intelligence/graph-url-state.test.ts components/platform/intelligence/graph-interaction-contract.test.ts components/platform/intelligence/GraphCanvas.accessibility.test.ts components/platform/intelligence/graph-visuals.test.ts components/platform/intelligence/force-layout.test.ts lib/intelligence/graph-contract.test.ts lib/intelligence/graphify-import.test.ts lib/intelligence/system-graph.test.ts lib/intelligence/operations-graph.test.ts
```

Result: **PASS — 11 files, 77 tests**.

Coverage includes five semantic levels and policies, deterministic thresholds, selected/critical truth, long names, twelve-position routing, leader lines, collision rejection, attention preservation, responsive budgets, screen-stable labels, edge levels, viewport/inspector avoidance, aggregation membership and attention counts, no cross-project aggregation, project/workflow/agent/run scopes, sibling-run exclusion, scoped deterministic search, truthful empty filters, safe URL state, unauthorized URL-node rejection, fullscreen preservation contract, keyboard controls, rendered SVG semantics, Replay disabled, graph contract/import, System Map, Operations graph isolation, deterministic layout, and reduced motion.

Typecheck:

```text
npx tsc --noEmit --incremental false --pretty false
```

Phase 2 files produced no TypeScript errors. The command remains blocked by unrelated pre-existing media errors in `apps/web/lib/media/lambda-render.ts`: missing `@remotion/lambda/client` and two `region` property errors.

Build:

```text
npm run build
```

The migration guard passed/skipped correctly for local build. Next.js then stopped on the same unrelated missing `@remotion/lambda/client` import in `apps/web/lib/media/lambda-render.ts`. No Phase 2 compile failure was reported before that blocker.

`git diff --check` passes.

## Authenticated visual-validation status

**NOT COMPLETED IN THIS SESSION.** The available in-app browser-control runtime was not callable, so an authenticated local interaction pass could not be performed without changing browser surfaces or weakening authentication. No authentication bypass, fake account, synthetic production event, deployment, or unsupported screenshot is claimed.

Rendered server-side component tests verify the non-flattening graph group, semantic policy attributes, node buttons, selected state, critical run preservation at portfolio level, and distinct mode names. A real authenticated browser pass remains required before founder visual approval or release.

## Deferred requirements and runtime dependencies

- Atlas and Manager remain unsourced graph entities; no nodes, labels, hierarchy, or motion were fabricated.
- Tool calls, incidents, retry attempts, per-step execution detail, correlation, and causation remain unavailable under current verified runtime contracts.
- Full Execution Replay remains disabled.
- Realtime events, freeze buffer, stale/unknown state, connection health, and activity rail integration belong to Phase 3 and were not started.
- Full synchronized list/table view, high-contrast mode, complete mobile attention-first home, and exhaustive screen-reader/live-region model remain Phase 4.
- Broader adaptive aggregation, quality levels, Worker/spatial index, render scheduler, and scale telemetry remain Phase 5.
- Secure reproducible Graphify artifact delivery remains absent; no artifact was generated or changed.
- Authenticated visual regression and device profiling require an approved authenticated browser/test environment and representative data.

## Known limitations and risks

- The retained layout and label pass remain main-thread computations. No claim is made beyond the current response caps without profiling.
- Mandatory selected/project/attention labels try twelve collision-free local positions; in an exceptionally saturated viewport the final truth-preserving fallback can overlap rather than disappear.
- Workflow run summaries are annotations on real workflow nodes, not independently focusable cluster entities. Drilldown occurs through the real workflow.
- System Map semantic levels are constrained by the current Graphify responses: overview communities and community-detail nodes; verified project membership is unavailable.
- Operations drilldown is limited to entities and relations already present in the scoped snapshot; it does not call a new detail API.
- URL refresh restoration is implemented, but native browser Forward/Back `popstate` synchronization is not.
- Mobile bottom-sheet behavior and real Fullscreen API behavior are covered by code/tests but not authenticated visual/device validation in this session.
- The build/typecheck blockers outside Intelligence Graph remain unresolved because dependencies and unrelated epic changes were prohibited.

## Phase 3 readiness recommendation

Phase 2 is **COMPLETE WITH DOCUMENTED LIMITATIONS** for the verified retained graph contracts. Phase 3 may begin only as a separate approved phase after this implementation receives authenticated visual validation and the Phase 3 runtime truth prerequisites are explicitly approved. Phase 3 must not infer realtime, stale state, correlation, causation, incidents, tools, Atlas, or Manager from this presentation layer.

No Phase 3 code was started.

## Phase 2.1 mobile label and viewport correction

The supplied authenticated Chrome DevTools mobile-emulation review approved Phase 2 mobile functionality: responsive layout, reachable controls, Live Operations, node selection, bottom-sheet inspector scrolling and close behavior, drilldown/isolate access, absence of obvious horizontal page scrolling, and the disabled Execution Replay state. The same review identified two narrow-viewport visual defects: portfolio project/territory labels could overlap, and long selected-node labels could clip at the left or right graph edge.

This correction keeps the retained Phase 2 SVG renderer, semantic levels, eligibility policy, priority source, finite budgets, camera behavior, bottom sheet, interaction contracts, and data contracts unchanged.

### Corrections

- Territory captions now use the existing screen-stable typography with deterministic top/bottom and left/center/right candidates. Visible territories are processed in stable ID order, reject node and earlier territory collisions, reserve their final boxes for the existing node-label pass, and remain associated with their sourced `projectId` territory.
- Narrow territory captions use restrained deterministic ellipsis and omit the redundant visual `territory` suffix to preserve identity without increasing density. The complete sourced territory name remains available through the SVG accessible label and title.
- Selected, focused, hovered, attention, and project labels retain the existing twelve candidates and priority order. Narrow canvases use conservative per-line limits and a more conservative text-width estimate; the truth-preserving fallback now clamps or flips the final anchor inside the usable SVG viewport instead of accepting a clipped default anchor.
- The usable label viewport is reduced by edge-aligned reserved overlays. The existing 48 percent mobile bottom-sheet reservation therefore constrains both territory and node-label placement, while territory collision boxes affect occupancy without incorrectly shrinking the viewport.
- Lower-priority labels continue to be rejected before overlap. No new node label becomes eligible, no label budget changes, no aggregation/layout rule changes, and no additional graph entity is introduced.

### Focused coverage and results

Focused coverage now verifies deterministic non-overlapping territory captions at a representative 390-pixel width, compact territory truncation with complete accessible names, left- and right-edge containment for long selected labels at 360 pixels, mobile bottom-sheet reserved-area avoidance, stable screen-space typography, unchanged priority behavior, unchanged finite budgets, Replay remaining disabled, and rendered territory accessibility.

Complete Intelligence Graph suite: **PASS - 11 files, 80 tests**.

Typecheck (`npx tsc --noEmit --incremental false --pretty false`) remains blocked only by the pre-existing unrelated `apps/web/lib/media/lambda-render.ts` errors: missing `@remotion/lambda/client` and two `region` accesses on `unknown`. No Intelligence Graph file produced a TypeScript error.

Production build (`npm run build`) passed the local migration guard and reached Next.js compilation, then stopped on the same unrelated missing `@remotion/lambda/client` import. No Intelligence Graph compile error was reported before that blocker.

### Validation status and remaining limitation

The approved mobile bottom-sheet implementation was preserved and is covered by the existing interaction/component contracts plus the new reserved-region label test. A new authenticated Vercel Preview review is still required to confirm the corrected territory and long-name rendering at 390 x 844, 360 x 800, 768 x 1024, and 844 x 390. Real-device validation, including Pixel-class font rendering and browser chrome, also remains outstanding. Final mobile visual validation is therefore **PENDING NEW PREVIEW REVIEW**.
