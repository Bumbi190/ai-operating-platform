# Omnira vNext Phase 18 T2 — Remaining Canonical Gap

Status: **living document**. It is updated at every T2 sub-step.
Last updated: 2026-09-17, at T2c (Visual Language, Labels & Spatial Polish). T2a was approved by the owner at local commit `c068e7b` and T2b at `eedfc03`. T2c is built on top of T2b locally, is not pushed, and is waiting for owner QA.
Branch: `feat/omnira-vnext-phase18-t2-live-operations`, from `origin/main` `faf34f7` (Phase 18 T1, PR #254).

## No canonical-complete claim

Phase 18 T2 converges the vNext Live Operations surface toward the approved visual target. The target is `omnira-intelligence-graph-vnext-v1.png`, supported by the Organisation, Atlas and Project Spiral references.

T2 makes **no claim** that the Intelligence Graph is canonical-complete against the Omnira Intelligence Graph Book v1.0. Owner decision 7 (2026-09-16) moves the synchronized list view to T3. It also requires the remaining gap to be stated explicitly, and this document does that.

Where the visual target shows information without a data source, T1's truth and provenance rules win over the mockup. Examples are the operator node, the Knowledge/Memory hubs, insight labels, "Senaste aktivitet" and "i realtid". Those parts are not built.

## Owner decisions that bound T2 (2026-09-16)

1. **Atlas as a centre identity orb.** The Phase 1–2 prohibition is lifted only for the orb as visual identity. Atlas is not a data node. Connections from Atlas are drawn only where they derive truthfully, for example from project ownership. The orb's animation never represents operational activity.
2. **Motion for identity and spatial focus.** Slow idle energy on the Atlas orb, and subtle drill-down, focus and depth transitions, are allowed. No animation may signal running, waiting or failure without fresh verified data. `prefers-reduced-motion` is respected.
3. **Volume signal.** The real run count inside the selected window may drive a bounded, normalized intensity. It signals volume, not status.
4. **Runs are aggregated per workflow in Project view.** Individual runs appear only on workflow or run drill-down, or when real status needs attention.
5. **Inspector.** Docked and resizable per the book. A fullscreen overlay is allowed where it fits the existing architecture.
6. **AUDIT 0b (Option A).** There is no hard-coded project classification. Projects with no current operational activity sit on a calmer outer orbit and are never hidden. `project-classification.ts` is not created.
7. **List view moves to T3** (this document).
8. **Order.** T2a runs first, then an owner QA stop. T2b–T2e start only after new approval.

## What T2a changed (composition only)

T2a does not move a node and does not implement the spatial layout.

**Page frame**
- The page has a fixed height (`100dvh` minus the shell chrome), so the graph's chrome no longer scrolls the shell. The shell chrome is the breadcrumbs, the hint bar and the mobile header.

**Header and controls**
- The header is a single row: the title plus a snapshot box that carries the stamp, the figures, the run window and Uppdatera. When the cap is reached, the run-cap warning is shown inside the box.
- There is one control row. It holds the three modes, search, a Filter menu and a view menu. The Filter menu covers project, time window, run status, node kinds and relations. The view menu holds Återställ vy, Återställ allt and Helskärm.

**On the canvas**
- The top-left corner shows place and narrowing. Place is Tillbaka and the crumbs. Narrowing covers project scope, isolation, filter state, critical objects preserved outside the filter, a truncated code map, and "no match". This row renders only when it has something to say.
- Zoom sits bottom-left.
- The legend sits bottom-right. It shows the truth-class key, and a folded Förklaring panel carries T1's lede, the class descriptions and the snapshot coverage note.

**Inspector**
- The inspector is a docked right panel. Its width runs from 18rem to 36rem, while the canvas always keeps 24rem.
- The width can be changed by pointer or keyboard (splitter pattern) and is remembered per viewer.
- The inspector can be put away without dropping the selection.
- Actions sit at the top, above the tabs Översikt, Kopplingar and Källa.

**Shell and fullscreen**
- The shell's floating activity peek and Atlas launcher own the viewport's bottom-right corner. The inspector ends above them, and the legend and menus stay clear of them. The geometry is derived from `MobileRailToggle` and `AtlasMiniOrb` and pinned by tests.
- Fullscreen covers the whole page body, header included, so the snapshot stamp stays visible.

**Canvas and legacy**
- `GraphCanvas` gained one optional prop, `overlayInsets`. Fitting keeps nodes out of the bands the page covers with controls, and labels avoid those bands (book ¶579, ¶633).
- Legacy passes no insets and renders byte-identically, pinned by hash tests and a pixel diff.

## What T2b changed (spatial layout)

T2b gives vNext Live Operations a deterministic spatial layout, `components/platform/intelligence/spatial-layout.ts`. Legacy and System Map keep the force layout: the spatial layout is used only when the vNext page passes `spatial` to `GraphCanvas`, which it does in Live Operations alone.

**Determinism**
- The layout is a pure function of the snapshot, the drill-down and the stage's aspect class. Rows are sorted before use, so arrival order does not matter.
- Selection, camera, inspector and filters never move a node (book ¶547). The aspect class comes from the stage minus the constant HUD rows, so opening or resizing the inspector does not re-lay the graph.

**Levels**
- *Portfolio.* Atlas is an identity orb at the centre. Project hubs have their project colour, a monogram and counts from the snapshot ("33 agenter · 5 workflows"). A project with runs in the window or an active workflow sits on the inner orbit. A project with neither sits on a calmer outer orbit and is never hidden (decision 6). Children fold into each hub's counts and unfold with zoom, leaving the sector under the hub open for its name.
- *Project* (drill-down). The project becomes the centre, and the other projects and Atlas recede in the directions they lay on the portfolio. Workflows form the inner ring, with the sector below the hub left open. Each agent sits beside the workflow whose current definition names it (`DELEGATED_TO`). Agents that no workflow names get a band of their own, captioned "N agenter / som inget workflow nämner", so placement never implies a relation.
- *Workflow* (drill-down). Its runs lie on a time arc, newest first, and older runs are counted in one cluster. The agents its definition names sit opposite, in step order. A run drill-down opens its workflow with that run in place.

**Runs are counted (decision 4; book ¶396, ¶400, ¶401)**
- Outside a workflow drill-down, a workflow's runs (`STARTED`, same project) are one cluster. The cluster carries the true count and the stored-status distribution.
- A run is placed on its own only when its stored status is running, waiting or failed, when it holds a pending approval, or when a run drill-down opens it.
- Runs with no workflow reference are counted in a slot of their own, captioned "utan workflow". They are never attached to a workflow.
- A counted run that is selected or found by search appears at a stable slot beside its cluster, together with what it produced, so nothing moves.

**Nothing shown overlaps**
- Every ring is placed from the reach of the ring inside it, in screen terms on stretched rings. Rings out of room grow rows. Tests prove this for every level and aspect, including a crowded synthetic snapshot.
- Hub names, counts and captions are drawn at screen size. A fit keeps them on the canvas (`boundsWithScreenText`).
- A deterministic pass (`spatial-text.ts`) keeps them off each other and off circles that are not theirs. Hub names and Atlas always show. A band caption, a hub's counts and a run-count caption give way, and what gives way is still said in the node's accessible name, the cluster's title or the inspector.

**Atlas (decision 1)**
- Atlas is not a node and carries no status. Its lines go only to project hubs, because the operations payload holds only projects the caller owns (`getAllowedProjectIds`). The lines are drawn in the derived style, and the legend names them "Atlas → projekt du äger (ägarskap)".
- Its slow breathing is identity motion only and stands down with reduced motion (decision 2).

**Inspector**
- A workflow shows "Körningar i ögonblicksbilden", counted by the same rule as its cluster.

## What T2c changed (visual language, labels and spatial polish)

T2c changes presentation only. T2b's layout model, run aggregation, relation truth and determinism are unchanged: no node moves, no relation is added, and no data source is added.

**Visual language** (`spatial-scene.tsx`)
- *Atlas* is drawn in the language of the canonical orb (`AtlasOrbVisual` / `AtlasHomeVNext.module.css`): glass layers, halo, axes, orbits, and the existing `OmniraMark` with the canonical cyan glow. It is reproduced in SVG rather than embedding `AtlasOrbVisual`, because that component is a stateful voice control. No new asset. It carries no status colour, breathes slowly, and is static under reduced motion.
- *Project hubs* are a ring lit in the project's own colour around a dark core, with the monogram tinted from that colour. A quiet project is dimmer. A project stored grey (AUDIT 0b) has its ring lifted toward white, so it never reads as switched off.
- *Workflow → agent → run count* read by size, light and shape. A workflow is a cube in a ring of its project's colour (an inactive workflow's ring is dashed grey, as stored). An agent is a smaller ring with one point of light. A run count is its number inside a ring segmented by stored status.
- *Lines* keep T1's truth classes by dash (direct solid, definition dashed, derived dotted). Colour says only which project a line belongs to. A line bends around circles it does not touch, so it never looks like a relation it is not. A selection brightens the lines and texts it touches and dims the rest; nothing disappears.
- *Depth* is a still starfield and a violet depth under the level. Only Atlas's breath repeats. Otherwise, nodes glide to a new level's places (T2b), and selection and focus change softly. All of it stands down with reduced motion.
- *Inspector*: its header shows the selection's glyph as the canvas draws it (project colour, monogram), in Live Operations only.

**Labels** (`spatial-labels.ts`)
- One deterministic plan places every text the spatial view draws: selection and search first, then Atlas and hub names, attention (with the stored status in words), hover/running/what a selection touches, workflows, captions and counts, agents and runs, and run-count captions last.
- A text is placed only inside the canvas, clear of the page's measured chrome (the controls on the canvas, the phone sheet and the shell's floating corner), clear of every circle that is not its own and clear of every text placed before it. Otherwise it is left out. What is left out is still in the node's accessible name and title, the cluster's title, and the inspector.
- A project names its agents from its first view when it has eight or fewer (The Prompt's two). A larger project (Familje-Stunden's 33) names them as the operator zooms in.
- Widths are measured from Inter's real advance widths (the app's font), so a text that fits by the plan fits on screen.

**Phone and sheet**
- On a narrow canvas, a project with many agents opens framed on its core (hub, workflows, run counts), and its agents come with zoom. A drilled level opens with its own inspector put away. An open sheet ends the scene: nothing is drawn through or behind it, and receded context (Atlas, the other projects) gives way to the sheet and the controls instead of showing around their edges.
- A search or focus frames the node among what it touches and never dives past the depth at which its level already shows everything.

**Verification**
- Label invariants are tested over the production-shaped snapshot and a synthetic stress snapshot (`labelStressOperations`), at six canvas sizes and five zoom depths. The browser harness (Inter loaded) checks label/label, label/node, label/chrome and node/chrome collisions geometrically in 99 cases at 1920, 1440, 1280, 1024, 768 and 375 px.

## Remaining canonical gap

| # | Canonical requirement | Book / risk reference | State after T2c | Planned |
|---|---|---|---|---|
| G-01 | A synchronized list view sharing selection, filters, search, project scope, live/frozen state and inspector | ¶593, ¶656, ¶839; R-005 (canonical release blocker) | Absent | T3 |
| G-02 | Realtime truth: graph event envelope, live/frozen state, freeze buffer, reconnect and reconciliation | ¶759, ¶772; R-002 | Absent. Live Operations is a manually refreshed snapshot (`generatedAt` plus Uppdatera) | After T2; requires a runtime contract |
| G-03 | Freshness and stale state: stale badges, a last-confirmed time per status, unknown after prolonged uncertainty | ¶748; R-015 | Only the snapshot stamp and "Uppdateras inte automatiskt." | After G-02 |
| G-04 | Operational motion (running pulse, edge flow, failure pulse), which needs verified fresh data | ¶699–701, ¶749, ¶800 | None, by design. T2 motion is identity and spatial focus only (decision 2) | After G-02/G-03 |
| G-05 | Atlas and Manager as sourced graph entities with sourced relations | ¶119, ¶373, ¶604 | Atlas is an identity orb (T2b, decision 1), never a data node. Its only lines are the derived ownership links to project hubs. Manager is not drawn | Needs a source contract |
| G-06 | An activity rail integrated with the graph (event → focus → inspector), respecting project scope | ¶289 | Absent. The shell's activity peek is a separate surface | Not scheduled |
| G-07 | A tablet overlay inspector | ¶508, ¶866, ¶873 | Docked panel from 768px | Not scheduled |
| G-08 | Mobile: list/attention-first default, full-screen detail, swipe on the sheet, sticky critical actions | ¶508, ¶597, ¶652, ¶868, ¶870 | Bottom sheet that ends the scene; a crowded project opens on its core (T2c). No swipe, no list | T3 (list) / not scheduled |
| G-09 | Approval and incident actions in the inspector, with server confirmation | ¶884; R-006, R-007 | Absent. The inspector links to the existing product routes | Not scheduled |
| G-10 | Inspector "senaste event" and tool, retry and incident detail | ¶598; R-019 | Absent. No per-step event, tool-call or incident source exists | Needs runtime sources |
| G-11 | Execution Replay | R-003 | Disabled. Per-step event data is not recorded | Replay epic |
| G-12 | Always-reachable fullscreen controls: pause motion, freeze live view, list toggle, motion/quality indicator | ¶630 | Exit, search, filter, fit, reset and inspector toggle are reachable. Pause/freeze/list/quality are absent | T3 (list); others with G-02/G-04 |
| G-13 | Quality levels, Worker/spatial index and scale telemetry | ¶662, ¶965, ¶992, ¶1154; R-004, R-018 | Main-thread SVG. Not profiled at scale | Not scheduled |
| G-14 | Accessibility programme: screen-reader flows, 200% text zoom, high contrast, colour-blind simulation, physical device checks | ¶887, ¶893 | Keyboard, reduced motion, display scale and focus management are covered. The rest is not verified | T3 |
| G-15 | Builder truth: FK edges labelled `DERIVED`, definition references named `DELEGATED_TO`, `runs.workflow_id` named `STARTED`, no `truncated`/`no-store`/envelope on operations | T1 findings | Worded truthfully in the UI. API keys are unchanged under the owner rule | Backend change, separately approved |
| G-16 | Run status `pending` has no shared label, so the graph shows it as unknown | T1 finding (`RUN_STATE_LABELS`) | Unchanged | T2 cleanup candidate, if approved |
| G-17 | A secure, reproducible System Map (Graphify) artifact in production | R-001, R-016 | The honest empty state is kept. Generation and delivery are out of scope | Separate workstream |
| G-18 | Label placement under pressure | ¶579, ¶633 | **Closed in T2c** for overlap: no text is drawn over another text, a foreign circle, the page's chrome or the canvas edge. Under pressure a text is left out instead, so a crowded phone view (for example a seven-project stress portfolio) names only some hubs; the rest keep their monograms, accessible names and the inspector | — |
| G-19 | Volume signal: a bounded intensity from the real run count (decision 3) | Decision 3 | Counts are shown as numbers only. Not built in T2c (owner rule) | Not scheduled |
| G-20 | A run-level layout (execution chain) distinct from its workflow's time arc | ¶401, ¶545 | A run drill-down opens its workflow with the run placed. Not built in T2c (owner rule) | With G-11 (Replay) |
| G-21 | The reference's insight chips on relations ("Insikter", "Strategi", "Kreativitet", "Effektivitet", "Minneskopplingar") | Visual target | Absent. No insight source is attached to graph relations | Needs a source contract |
| G-22 | Knowledge/Memory hubs with document, insight, decision and lesson counts | Visual target; ¶373 | Absent. The operations payload has no memory entities | Needs a source contract |
| G-23 | An operator node linked to Atlas | Visual target | Absent. The graph has no sourced operator entity | Needs a source contract |
| G-24 | Role subtitles under workflows and agents ("Familjecoach", "Analys") | Visual target | Absent. Nodes carry only their stored name; no role field distinct from the name exists | Needs a source field |
| G-25 | "Live"/"Atlas · Online" states and the recent-activity strip under the graph | Visual target; ¶289, ¶748 | Absent. The snapshot is refreshed by hand; see G-02, G-03 and G-06 | After G-02 |
| G-26 | Luminous flowing lines and particles along relations | Visual target; ¶699–701 | Not built: on a relation they read as activity, which needs fresh data (G-04) | With G-04 |
| G-27 | Nodes under the floating controls after the operator zooms or pans | ¶579, ¶633 | Fits and automatic camera moves keep the level's structure clear; an operator's own zoom or pan can move nodes under the controls. Texts never go under them | Not scheduled |

## Not in T2 by owner rule

T2 does not touch any of the following:
- System Map / Graphify generation or delivery
- Execution Replay
- Phase 17 Trading
- YouTube Y1/Y2a/Y2b and OAuth
- backend, API, schema, authority and isolation
- the legacy UI
- fake graph data
