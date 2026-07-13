# Omnira Intelligence Graph Phase 1 — Visual Foundation Report

Date: 2026-07-13
Branch: `feat/omnira-intelligence-graph`
Starting commit: `fe3c14b`
Decision: **COMPLETE WITH DOCUMENTED LIMITATIONS**

## Scope and sources

Phase 1 incrementally extends the existing SVG/DOM Intelligence Graph. It does not introduce a second renderer or change the graph data contracts.

The implementation was checked against Chapters 1, 2, 3, 6, 7, 8, 9, and 10 of the founder-approved `OMNIRA_INTELLIGENCE_GRAPH_BOOK_v1.0.pdf`. The supporting canonical DOCX, editorial report, and source manifest were also inspected. All six Phase 0 documents were read:

- `PHASE_0_AFFECTED_FILE_MAP.md`
- `PHASE_0_CANONICAL_GAP_ANALYSIS.md`
- `PHASE_0_IMPLEMENTATION_RECOMMENDATION.md`
- `PHASE_0_REPOSITORY_RUNTIME_AUDIT.md`
- `PHASE_0_RISK_REGISTER.md`
- `PHASE_0_SOURCE_OF_TRUTH_REGISTER.md`

The Phase 0 source-of-truth findings take precedence where the canonical future visual model lacks a verified runtime source. In particular, Phase 1 does not fabricate Atlas or Manager nodes.

## Canonical requirements implemented

- Consolidated graph-specific visual tokens and semantic visual helpers.
- Preserved the existing SVG/DOM renderer, deterministic main-thread layout, controls, selection, drill-in behavior, inspector integration, System Map, Live Operations, and disabled Replay state.
- Separated stable node identity from transient status treatment.
- Added distinct sourced shapes and scale roles for community, project, agent, workflow, run, approval, output, task, code, document, and rationale nodes.
- Made sourced project nodes visible hubs and added quiet project territories derived only from verified `projectId` membership.
- Added a controlled edge language using width, opacity, dash treatment, and restrained approval emphasis.
- Improved deterministic grouping, semantic radii, project anchoring, collision spacing, bounds, and repeatability without replacing the force-layout engine.
- Added restrained hover, focus, and selection transitions only. No continuous operational or decorative animation was added.
- Added visible double-ring keyboard focus, non-color status badges and line treatments, accessible graph names by mode, SVG titles, and enlarged pointer hit targets.
- Added a reduced-motion CSS contract that removes all nonessential graph transitions and animations.
- Added dark and light graph appearance tokens. The live application remains dark because the current root layout explicitly locks the application to dark mode.

## Affected files

Application code:

- `apps/web/components/platform/intelligence/GraphCanvas.tsx`
- `apps/web/components/platform/intelligence/GraphCanvas.module.css`
- `apps/web/components/platform/intelligence/IntelligenceGraphClient.tsx`
- `apps/web/components/platform/intelligence/force-layout.ts`
- `apps/web/components/platform/intelligence/graph-visuals.ts`
- `apps/web/vitest.config.ts`

Focused tests:

- `apps/web/components/platform/intelligence/graph-visuals.test.ts`
- `apps/web/components/platform/intelligence/force-layout.test.ts`

Documentation:

- `docs/architecture/intelligence-graph/implementation/phase-1/PHASE_1_VISUAL_FOUNDATION_REPORT.md`

No page, API, database, authentication, authorization, RLS, dependency, migration, Graphify, or canonical-book file was changed.

## Visual-token approach

`graph-visuals.ts` is the single graph visual contract. It owns:

- canonical relative size tokens, including reserved Atlas and Manager sizes;
- mappings for every currently supported `NodeKind`;
- node shape, fill, stroke, radius, and label priority;
- status color, dash, badge, and attention treatment;
- verified relation styling and directionality;
- project accent selection and deterministic grouping;
- dark and light canvas/label appearances.

The renderer consumes those helpers rather than scattering node, status, and edge values across JSX. Existing Omnira background integration remains in the graph shell through `--omnira-bg`.

## Node hierarchy

Verified node kinds now have distinct visual identities:

- project: largest currently sourced hub, segmented outer ring and polygon body;
- community: large structural polygon;
- workflow: hexagonal orchestration node;
- agent: circular actor node;
- task: shield-shaped work node;
- approval: diamond decision node;
- run: compact orbit-ring execution node;
- output: capsule artifact node;
- code: rounded square;
- document: folded-page shape;
- rationale: diamond knowledge node.

Degree may add only a small radius lift, so graph importance cannot collapse the structural hierarchy. Atlas remains the largest reserved canonical size and Manager remains subordinate in the token/layout contract, but neither role is assigned to an existing node because no verified source exists for either runtime entity.

Status is rendered independently from identity. Approval waiting, failure, running, completed, and cancelled/rejected states use a combination of ring color, dash pattern, badge glyph, and accessible status text. Failure and approval therefore remain distinguishable without color.

## Project territories

Territories are deterministic, low-opacity ellipses computed only from nodes carrying the same verified `projectId`. Their label and color come from a sourced project hub when one exists; otherwise a deterministic neutral project label/accent is used. They are visual grouping aids, not opaque containers or authorization boundaries.

Project membership and project filtering still come from the existing scoped API responses. The implementation neither broadens data access nor attempts to infer membership from proximity or edges.

## Edge language

Each existing `Relation` maps to a restrained structural, operational, or approval style. Width and opacity carry hierarchy; dash treatment communicates inference/association; approval requests use the existing amber/gold attention color. Edge highlighting is local to selection, hover, or focus.

`CONTAINS` and other relations that should not add a runtime claim remain non-directional. Direction markers are used only where the existing relation contract already has directional meaning. `TRACKS` remains a dashed association and does not claim causation. No edge animation or invented runtime directionality was added.

## Layout changes

The existing deterministic solver is retained. It now accepts semantic radius and optional structural roles, uses stable project group anchors, gives sourced project hubs stronger group anchoring, accounts for node radii in spring and collision spacing, and clamps nodes inside the world bounds.

Layout remains a bounded, synchronous calculation; the rendered graph does not continuously drift after it settles. Atlas-center and Manager-near-center anchors are supported for a future verified source, but the renderer passes only `project` and `detail` roles today. The layout creates no entities.

## Motion behavior

Motion is limited to short hover/focus/selection transitions driven by actual UI state. Status emphasis is static. There is no fake live activity, status pulse, edge flow, realtime animation, or synthetic settling loop. `prefers-reduced-motion: reduce` disables the graph's transitions and any future CSS animation attached to the current classes.

The canonical request to keep Atlas visually alive cannot be rendered until Atlas has a real node source. Phase 1 therefore reserves its visual hierarchy but adds no fake Atlas activity.

## Accessibility baseline

- Existing keyboard focusability and Enter/Space selection are preserved.
- Focus is indicated by two high-contrast rings separate from selection.
- Status is communicated through text, badge glyph, and line pattern as well as color.
- Each node retains button semantics, an accessible name, pressed state, and SVG title.
- The SVG graph name distinguishes System Map from Live Operations.
- Pointer hit areas are enlarged without changing visual size.
- Reduced motion is respected.
- Existing graph controls and inspector semantics were not removed.

The canonical parallel list view is not claimed as complete and was not added in this phase.

## Tests run and results

Focused Vitest command:

```text
npm run test --workspace=apps/web -- components/platform/intelligence/graph-visuals.test.ts components/platform/intelligence/force-layout.test.ts lib/intelligence/graph-contract.test.ts lib/intelligence/graphify-import.test.ts lib/intelligence/system-graph.test.ts lib/intelligence/operations-graph.test.ts
```

Result: **PASS — 6 files, 48 tests**.

The new tests cover:

- Atlas remains the largest reserved structural size;
- every verified node kind has a stable visual mapping;
- approval and failure are distinguishable without color alone;
- edge hierarchy and direction treatment are deterministic;
- project territories use only `projectId` and are repeatable;
- force layout output is repeatable;
- semantic radii and project grouping improve separation;
- future Atlas anchoring is supported without fabricating an Atlas node.

Additional validation:

- `npm run typecheck --workspace=apps/web`: **BLOCKED by a pre-existing unrelated error** at `apps/web/lib/media/lambda-render.ts:54` (`VideoInputProps` is not assignable to `Record<string, unknown>`). No Phase 1 file produced a type error.
- `npm run lint --workspace=apps/web`: **BLOCKED by repository configuration**. `next lint` opens the first-time ESLint configuration prompt because the workspace has no ESLint configuration; no configuration was generated.
- `npm run build --workspace=apps/web`: the production bundle **compiled successfully**, then static export failed on `/forgot-password` and `/update-password` because Supabase URL/API-key configuration was not available to the build process.
- A second build with the main checkout's existing local environment loaded stopped fail-closed in `scripts/check-migrations.mjs` because the service-role credential did not satisfy the guard. No guard or credential behavior was changed.
- `git diff --check`: pass before report creation and included again in final validation.

## Visual-validation status

A local Next.js development server was started from the required worktree. With the main checkout's existing local environment loaded, `/intelligence/graph` compiled and the existing authentication middleware redirected the unauthenticated Playwright session to `/login` with HTTP 200.

No test account or authenticated browser state was available. The protected graph canvas therefore could not be visually inspected without weakening or bypassing authentication, which is explicitly outside Phase 1 authority. No screenshot is presented as graph validation. Generated Playwright files were removed from the worktree.

## Deferred requirements and missing runtime dependencies

- **Atlas rendering and motion:** Phase 0 verified that Atlas is not a graph node in the current runtime contract. A sourced Atlas identity/node contract is required.
- **Manager hierarchy and proximity:** Phase 0 found Manager only as task rows/context, not as a graph entity. A sourced Manager identity/node contract is required; Manager tasks must not be relabeled as Manager nodes.
- **System Map project territories:** current manual/stale Graphify nodes do not carry verified `projectId` membership. Territory rendering activates only when the source supplies verified membership.
- **Runtime light mode:** graph light tokens exist, but the root application layout currently hard-locks `<html className="dark">`. App-wide theme activation is outside this phase.
- **Semantic zoom, advanced label collision, virtualization/worker layout, and complete responsive/list alternatives:** later canonical phases.
- **Realtime execution animation and Execution Replay:** later phases requiring real event/history contracts. Replay remains disabled.
- **Automatic Graphify updates:** no freshness contract exists and automation remains out of scope.
- **Authenticated visual regression coverage:** requires an approved test identity/session and suitable fixture data.

## Known limitations and risks

- Quiet ellipse territories can overlap when verified project clusters are densely connected; advanced territory/collision behavior belongs to Phase 2.
- Label visibility remains intentionally conservative and may collide in dense views; semantic zoom and advanced label collision are deferred.
- The deterministic solver remains main-thread and quadratic in node-pair repulsion. Phase 1 makes no claim that later performance budgets are complete.
- System Map may show no project territories until its source gains verified membership.
- Atlas and Manager canonical hierarchy is reserved, tested, and documented but not visible in current runtime data.
- Light appearance is not reachable through the current app-wide dark-only theme.
- Browser rendering of the protected graph remains unverified in this environment because no authenticated test session was available.

## Recommendation for the next phase

Accept Phase 1 as **COMPLETE WITH DOCUMENTED LIMITATIONS** for the verified runtime graph. Before claiming canonical Atlas/Manager completion, define and approve their real source contracts rather than mapping existing tasks or agents to those roles. Phase 2 may proceed for supported nodes with semantic zoom and denser-view behavior, provided it keeps project membership sourced, does not infer authorization, and treats the Atlas/Manager contracts as explicit prerequisites.

No commit, push, pull request, merge, or deployment was performed.
