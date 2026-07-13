# Phase 0 Implementation Recommendation

## Graph Engine Decision

Decision: `RETAIN AND INCREMENTALLY EXTEND`.

Rationale:
- The current SVG/DOM renderer is simple, testable and already integrated with the normalized graph contract.
- Server-side response caps and System Map aggregation keep current views within an MVP range.
- The deterministic layout provides stable initial positions and avoids introducing a heavy dependency before profiling.
- The current stack is insufficient for the full canonical product, but the evidence does not prove that a rewrite is required before Phase 1.

Do not recommend a full rewrite now. The canonical book explicitly preserves the MVP unless audit shows objective need. This audit found missing contracts and features, not a proven impossibility in the current renderer.

## Engine Evaluation

| Area | Current evidence | Recommendation |
|---|---|---|
| Rendering capability | `GraphCanvas.tsx` SVG elements and SVG text. | Retain for Phase 1/2; evaluate Canvas/WebGL only if profiling shows SVG cannot meet budgets. |
| Performance ceiling | Main-thread O(n^2) layout capped at 600 nodes; no profiling evidence. | Profile before increasing scope; consider Worker for layout/collision after measurement. |
| Deterministic layout | `force-layout.ts` seeds from node id. | Keep and strengthen with stable filtered positions. |
| Semantic zoom | API has overview/community/neighborhood; UI zoom is geometric. | Incrementally add semantic zoom state. |
| Labels | Fixed SVG labels, no collision. | Build label priority/collision engine before richer visuals. |
| Realtime patching | Snapshot fetch only. | Requires runtime event contract before implementation. |
| Accessibility | Basic focus/ARIA on nodes. | Add synchronized list view and keyboard model. |
| Responsive/mobile | Basic responsive container only. | Add attention-first mobile mode. |
| Testability | Contract/builder tests exist. | Add rendered/browser/a11y/perf tests. |
| Maintainability | Small local modules and clear graph contract. | Keep boundaries; avoid mixing Graphify raw shape into UI. |
| Graphify compatibility | Importer sanitizes raw graph into normalized contract. | Keep Graphify as import source only. |

## Graphify Artifact Recommendation

Current behavior:
- Graphify indexes the repository into local `graphify-out/` artifacts.
- `.graphifyignore` excludes secrets, `.agents`, dependency/build folders, media, generated outputs and local state.
- `graphify-out/` is gitignored.
- The import script sanitizes raw `graphify-out/graph.json` into `apps/web/data/intelligence/system-graph.json`.
- The app artifact path is gitignored.
- No CI workflow exists in the worktree.
- Current artifact is stale relative to HEAD.

Recommendation:
1. Keep Graphify raw output local and never serve `graph.html`.
2. Continue using `graphify-import.ts` as the only Graphify boundary.
3. Implement the already documented production design later: CI-generated sanitized artifact in private Supabase Storage keyed by commit SHA.
4. Loader should validate artifact key, size, schema, commit, source paths and secret patterns before serving.
5. UI must display artifact freshness and stale status until current commit is verified.

Do not commit raw or sanitized artifacts unless a future delivery decision explicitly changes this.

## Runtime Prerequisites

Before canonical Live Operations:
- Persist or expose a verified event envelope with event id, type, timestamp, project scope, entity id, schema version, correlation id and causation id.
- Define event deduplication and ordering rules.
- Define source authority for run, approval, output, failure and incident state.
- Add or designate a real tool call source before `USED_TOOL`.
- Add or designate a per-run memory/reference source before `READ_MEMORY`.
- Add incident source of truth if incident UI is in scope.
- Define stale/unknown/freshness thresholds.
- Define freeze live view buffer size, age, resume and "jump to latest" behavior.

## Security Prerequisites

Before adding new graph data:
- Keep all user-facing graph APIs authenticated.
- Keep Live Operations server-side scoped through `getAllowedProjectIds` or an equivalent backend-enforced boundary.
- Add route-level isolation tests for `/api/intelligence/graph/operations`, not only builder tests.
- Re-evaluate System Map access before any non-owner/multi-user rollout.
- Never use the service-role client in graph APIs without explicit allow-list filters on every project-native query.
- Re-check RLS for any table exposed to anon/authenticated roles.
- Verify approval/incident actions server-side; no canvas-only critical actions.
- Minimize payloads: no prompts, full content, stack traces, secrets, cross-project rows or raw Graphify HTML.

## Performance Prerequisites

Before Phase 5 or scale claims:
- Create canonical datasets: small, medium, large, extreme source, event spike and long session.
- Profile current SVG renderer on MacBook Air M4 and Pixel-like mobile viewport.
- Measure frame time, input latency, layout duration, label count, memory trend and long tasks.
- Add quality levels and reduced-motion/static mode.
- Add a central animation/render scheduler before introducing richer motion.
- Consider Web Worker for layout, collision and aggregation only after profiling shows need.

## Phase Recommendations

### Phase 1 - Visual Foundation

Proceed with prerequisites:
- Do not change runtime semantics.
- Add tokenized graph visual system.
- Implement canonical node shapes and status rings for existing supported kinds only.
- Preserve current no-sample-data behavior.
- Keep Graphify raw data outside UI.

Stop if visual requirements require unsupported runtime claims.

### Phase 2 - Zoom, Labels and Interaction

Proceed after Phase 1:
- Add semantic zoom state.
- Build label anchors, priorities and collision avoidance.
- Add isolate/focus/fullscreen/URL state carefully.
- Avoid relayout on simple filter toggles where possible.

Stop if layout performance regresses without a mitigation.

### Phase 3 - Live Operations Truth Layer

Do not start as full canonical realtime until runtime prerequisites are defined.
- Snapshot improvements can proceed.
- Realtime, freeze, stale, unknown, correlation and causation require a reviewed runtime contract.
- Incident UI requires a source of truth.

Stop if project isolation or event truth cannot be verified.

### Phase 4 - Accessibility, Responsive and List View

Required before any canonical release:
- Build synchronized list/table view.
- Add keyboard navigation model and focus restoration.
- Add reduced motion and high contrast behavior.
- Add mobile attention-first flow and bottom-sheet inspector.

Stop if graph and list can diverge in status/action state.

### Phase 5 - Scale and Quality Adaptation

Only after performance evidence:
- Add quality levels.
- Add automatic degradation.
- Add aggregation beyond current caps.
- Add render scheduler and maybe worker.

Stop if optimization removes critical status information.

### Phase 6 - Hardening and Release

Required:
- Build/typecheck/tests.
- Browser visual verification.
- Accessibility verification.
- Security isolation review.
- Performance report.
- Graphify artifact delivery/fallback.
- Codex review.
- Risk and rollback plan.

## Phase Boundaries

- Phase 1 must not add realtime claims.
- Phase 2 must not invent runtime statuses.
- Phase 3 must not use fake operational motion.
- Phase 4 must not treat list view as optional fallback only.
- Phase 5 must not raise caps without profiling.
- Phase 6 must not release if artifact freshness, project isolation or accessibility is unverified.

## Stop Conditions

Stop implementation and produce a report if:
- Branch or worktree becomes dirty with unrelated changes.
- Graph APIs can return another project's private runtime rows.
- A Graphify artifact contains secrets, local absolute paths or raw HTML exposure.
- Runtime sources contradict planned status/edge semantics.
- Performance requires a renderer rewrite beyond scoped phase work.
- Tests show false live status, stale data shown as live, or broken approval authority.
- Canonical book package would need modification.

## Explicit Non-Goals

- No full Execution Replay until event history exists.
- No generic visualization platform.
- No rendering of all historical runs at once.
- No fake demo signals or synthetic live edges.
- No client-side-only authorization.
- No raw Graphify HTML rendering.
- No permanent manual layout editing.
- No change to project isolation security model.
- No migration or dependency work as part of Phase 0.

## Phase 1 Readiness Decision

Decision: `READY WITH PREREQUISITES`.

Phase 1 is ready only as visual foundation work over the existing snapshot/contract boundaries. The project is not ready for canonical Live Operations, Execution Replay, realtime motion, incident handling or scale claims until the runtime/security/performance prerequisites above are satisfied.
