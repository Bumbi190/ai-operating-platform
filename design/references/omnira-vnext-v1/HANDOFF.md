# Omnira Design vNext v1 — Implementation Handoff

Frozen: 2026-09-07. Prototype: `Omnira OS.dc.html` (single Design Component). Design system: `Omnira Design System v1.dc.html`.
Functional source of truth = repository (`Code/ai-operating-platform`). Prototype = presentation/UX only. All "demo"/"FIXTUR"/"PROTOTYP" labels must survive implementation until the runtime concept exists.

## Status
READY FOR IMPLEMENTATION: **YES** (UX freeze). No blocking defects. See warnings below before touching runtime.

## Area → repo owner map
| Prototype area | Repo owner / module | Classification |
|---|---|---|
| App shell, grouped sidebar, header, key hints | `apps/web/app/layout.tsx`, `app/(platform)/*`, `components/platform/vnext/*` (AtlasHomeVNext) | PARTIAL — shell exists; grouped nav + display-scale prefs are new UX |
| Display scale (compact/default/large) + reduced motion prefs | none — localStorage keys `omnira.displayScale`, `omnira.reducedMotion` | PROTOTYPE ONLY → REPO AUDIT REQUIRED BEFORE IMPLEMENTATION (user prefs storage) |
| Atlas page + living motion states | `components/platform/vnext/AtlasOrbVisual.tsx`, `lib/atlas/orb-state.ts` (AtlasToolOutcome), `lib/atlas/status-intent.ts` | PARTIAL — orb + state vocab exist; face layer + 7-state motion profile are design. State MUST be driven by runtime; `atlasSignal(kind,start|end|amplitude)` is the intended input surface. State chips = demo controls, remove or gate behind dev flag. |
| Organisation (Andre → Atlas → projects → agents) | `lib/os/data.ts` (projects, agents), `lib/os/agents-activity.ts` (RunningAgent) | REAL data; pulse = derived from running runs |
| Project Spiral | none | PROTOTYPE ONLY (navigation surface over `projects`) |
| Generic Project Command Center + workflow renderer | `workflows` table (steps[].agent_id), `runs` (RunStatus), `approvals` | REAL — render dynamically; no hard-coded steps |
| Trading · Atlas Market View | `components/platform/trading/*`, `lib/trading/market-view/snapshot.ts`, planned-trade / observed-position models | REAL functional impl in separate worktree — prototype is presentation only. Chart renderer in prototype is a fixture stand-in for Lightweight Charts. **No approval/execution controls** (by design). Performance section = unavailable Stage 1. |
| Agent Detail v2 | `agents` (id, project_id, name, description, model, skill_ids, config), `workflows.steps[].agent_id`, `runs`, `approvals` | PARTIAL — Verktyg tab (per-agent) and Behörigheter tab have **no runtime model**; rendered as explicit unavailable/rule states |
| Färdigheter | `agents.skill_ids` only | PARTIAL — assign/remove real; version, deps, enable/disable, update, catalogue = PROTOTYP (labelled) |
| Verktyg | `lib/atlas/capability/desktop-commander.ts`, `media-generation.ts` | REAL registry (2 capabilities, L0/draft). Agent→tool assignment: MISSING (do not invent). |
| Behörigheter | Ch18 licence/autonomy, `lib/atlas/delegation/types.ts` (DelegationEnvelope), `lib/atlas/mission/types.ts` (MissionToolBound/DataScope/ApprovalGate), `lib/governance/execution-stop.ts`, `run-authority.ts` | REAL vocabulary. No per-agent permission table — four-layer view is a projection, not a model. |
| Granskningar | `approvals` (pending/approved/rejected/revised), `app/(platform)/approvals/*` | REAL |
| Aktivitet | `runs`, `app/(platform)/agent-activity/*` (LiveRefresh 15 s) | REAL |
| Planering | WorkflowTrigger cron, `/releases`, `app/(platform)/planning/PlanningBoard.tsx` | PARTIAL — unified lane calendar is new UX over three sources |
| Minne | `lib/ai/memory/memory-store.ts` (MemoryItem, seedBrandMemory), `app/(platform)/memory/page.tsx` | REAL for The Prompt; other-project rows are illustrative fixtures (labelled by provenance) |
| Intelligence Graph vNext | `lib/intelligence/graph-contract.ts`, `components/platform/intelligence/graph-visuals.ts`, `app/(platform)/intelligence/graph` | PARTIAL — node/edge kinds real; READ_MEMORY / USES_SKILL edges are INFERRED until run→memory links exist; layout is design |

## Prototype-only / demo content (must stay labelled or be removed)
- Atlas state chips ("Tillståndsdemo"); Organisation "Systemstatus · demodata"; footer "Systemstatus: Optimal".
- Trading: all candles/levels/planned/observed = FIXTURE; Prestanda = "inte tillgänglig i Stage 1".
- Skills: version/deps/enable/update/catalogue (PROTOTYP chips); `agents.model` default label.
- Verktyg: "Tilldela agent", "Höj licens" disabled; "Nyliga fel: ingen loggkälla".
- Memory rows outside The Prompt; approvals/events/plan items are design fixtures mirroring table shapes.
- Stubs remaining: Systemhälsa, Nytt workflow, Färdighetskatalog (explicit "ingår inte i denna fas").

## Repo-first implementation warnings
1. Do NOT create: skills table/registry, agent→tool assignment, per-agent permission table, parallel workflow model, Atlas visual state machine.
2. Atlas visual state must mirror runtime (`orb-state` / run status); never self-advance.
3. Trading approvals live only in Granskningar (global `approvals`); no execution provider exists.
4. Reduced motion: every state must remain distinguishable statically (implemented: colour/glow/wash).
5. Display scale is CSS `zoom` on the shell root; verify with browser zoom independently.

## Required assets (export with prototype)
- `assets/atlas-face.png` (derived from `refs/atlas-home.png`), `assets/omnira-mark.svg`
- `refs/atlas-orb.png`, `refs/avatar-andre.png`
- Fonts: Inter, JetBrains Mono (Google Fonts)
- Reference-only (not loaded by UI): `refs/*.png` other files, `Design/references/*.mp4`

## Files to export
`Omnira OS.dc.html`, `Omnira Design System v1.dc.html`, `support.js`, `assets/`, `refs/atlas-orb.png`, `refs/avatar-andre.png`, `HANDOFF.md`.

## Non-blocking notes
- Planning month view shows recurring items on Mondays only (by design, avoids clutter).
- Chart price-tag de-overlap is heuristic; real impl uses Lightweight Charts price lines.
- Graph layout is deterministic quadrant placement, not force-directed.
