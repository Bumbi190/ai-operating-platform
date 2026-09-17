/**
 * Deterministic spatial layout for vNext Live Operations (Phase 18 T2b).
 *
 * The force layout stays what legacy and System Map use. This module is the
 * vNext Live Operations arrangement, and it is a pure function of its input:
 * the same snapshot, the same aspect class and the same anchor always give the
 * same positions — whatever order the rows arrived in.
 *
 * WHAT IT PLACES, BY LEVEL
 *
 *  - Portfolio. The Atlas identity orb at the centre; every project hub on an
 *    orbit around it. A project with current operational activity — runs in
 *    the window or an active workflow — sits on the inner orbit; one without
 *    sits on a calmer outer orbit. Nothing is hidden for being quiet. Each
 *    hub's children are laid out in compact rings around it — leaving open the
 *    sector under the hub, where its name and counts are written — so that
 *    zooming reveals them in place; at the overview they stay folded into the
 *    hub's counts.
 *  - Project. The drilled project is the new centre. Its workflows form the
 *    inner ring; its agents the outer ring, each placed beside the workflow
 *    whose CURRENT definition names it (`DELEGATED_TO`). An agent no workflow
 *    names gets a band of its own — no relation is implied by placement.
 *    Other projects and Atlas recede to a context ring, in the directions they
 *    lay from this project on the portfolio.
 *  - Workflow. The workflow is the centre; its runs lie in a time-ordered arc
 *    (newest first, older ones counted), the agents its definition names on
 *    the opposite arc; the project hub and Atlas recede behind.
 *
 * RUNS ARE COUNTED, NOT SCATTERED (book ¶396, ¶400, ¶401). Outside a workflow
 * or run drill-down, the runs a workflow started (`STARTED`, same project) are
 * one cluster carrying the true count and status distribution. A run is placed
 * on its own only when its stored status is running, or needs attention
 * (waiting, failed — `getStatusVisual`), when something it holds needs
 * attention (a pending approval), when a run drill-down opens it, or inside the
 * workflow view. A counted run that is selected or found by search appears at a
 * stable slot beside its cluster, with what it produced, so selecting it moves
 * nothing. Runs with no workflow are counted in a slot of their own on the
 * ring — never attached to a workflow they have no reference to.
 *
 * NOTHING SHOWN OVERLAPS. Each ring is placed from the reach of the ring inside
 * it — workflows, run counts, runs shown on their own with what they produced,
 * named agents, unnamed agents — and a ring out of room grows a row outward.
 * Only what appears for a moment beside the row someone asks for (a counted run
 * and its satellites) is exempt.
 *
 * ATLAS IS IDENTITY. The orb is not a node in the snapshot and carries no
 * status. It links only to project hubs, and only because the operations
 * payload contains exclusively projects the caller owns
 * (`getAllowedProjectIds`: `projects.owner_id = auth.uid()`) — a derived
 * relation, drawn and worded as derived.
 *
 * The layout never depends on the camera, the inspector, a selection or a
 * filter: those change what is shown, not where it is (book ¶547). Only the
 * anchor (an explicit drill-down) and the aspect class of the stage move things.
 */

import type { IntelligenceGraphEdge, IntelligenceGraphNode } from '@/lib/intelligence/graph-contract'
import type { PositionedNode } from './force-layout'
import type { GraphBounds, GraphStructuralVisibility, GraphZoomLevel } from './graph-readability'
import { getStatusVisual, projectAccent } from './graph-visuals'

// ─── Contract ────────────────────────────────────────────────────────────────

export type SpatialAspect = 'wide' | 'balanced' | 'tall'
export type SpatialLevel = 'portfolio' | 'project' | 'workflow'

export type SpatialAnchor =
  | { level: 'portfolio' }
  | { level: 'project'; projectId: string }
  | { level: 'workflow'; workflowId: string }
  | { level: 'run'; runId: string }

/**
 * How a placed node relates to the level on screen.
 *   anchor     the level's centre (a focused hub or workflow)
 *   hub        a project hub on a portfolio orbit
 *   structure  workflows — and, inside a project or workflow view, agents
 *   detail     agents in a portfolio hub's compact ring
 *   run        an individually placed run
 *   satellite  approvals, outputs and tasks beside their parent
 *   context    receded: other projects around a drilled project or workflow
 */
export type SpatialRole = 'anchor' | 'hub' | 'structure' | 'detail' | 'run' | 'satellite' | 'context'

export interface SpatialHub {
  nodeId: string
  projectId: string
  label: string
  x: number
  y: number
  r: number
  color: string
  monogram: string
  /** Counts of this snapshot only; see `hubSubtext`. */
  subtext: string
  orbit: 'active' | 'calm' | 'focus' | 'receded'
}

export interface SpatialAtlasOrb {
  x: number
  y: number
  r: number
  receded: boolean
  /** Hubs Atlas links to: every project in the payload, which holds only projects the caller owns. */
  linkedHubIds: readonly string[]
}

export interface SpatialRunCluster {
  id: string
  /** The workflow whose runs these are, or the project for runs without a workflow. */
  parentId: string
  kind: 'workflow' | 'no-workflow' | 'older'
  x: number
  y: number
  r: number
  count: number
  memberIds: readonly string[]
  /** Stored statuses, most frequent first. */
  distribution: ReadonlyArray<{ status: string; count: number }>
  attentionCount: number
}

/** Agents no current workflow definition names: their own outer band, captioned as such. */
export interface SpatialUnlinkedBand {
  id: string
  projectId: string
  count: number
  /** Where the caption goes: just outside the band's centre. */
  x: number
  y: number
  /** The band's direction from its project, for anchoring the caption away from it. */
  angle: number
  memberIds: readonly string[]
}

export interface SpatialLayout {
  level: SpatialLevel
  aspect: SpatialAspect
  /** The node the level is centred on; null on the portfolio. */
  anchorId: string | null
  positions: ReadonlyMap<string, PositionedNode>
  roles: ReadonlyMap<string, SpatialRole>
  hubs: readonly SpatialHub[]
  atlas: SpatialAtlasOrb
  clusters: readonly SpatialRunCluster[]
  unlinkedBands: readonly SpatialUnlinkedBand[]
  /** Runs shown only through a cluster count at this level. */
  aggregatedRunIds: ReadonlySet<string>
  /** Satellites shown only while the row they belong to is asked for — a counted run's, or a workflow's — by satellite id. */
  shownWithParent: ReadonlyMap<string, string>
  /** What a fit frames: the level's own structure, not its receded context. */
  fitBounds: GraphBounds
}

export interface SpatialLayoutInput {
  nodes: readonly IntelligenceGraphNode[]
  edges: readonly IntelligenceGraphEdge[]
  anchor: SpatialAnchor
  aspect: SpatialAspect
}

// ─── Geometry constants (world units) ────────────────────────────────────────

/** How each aspect class stretches the rings: wide canvases get wide ellipses. */
export const SPATIAL_STRETCH: Record<SpatialAspect, { x: number; y: number; start: number; calmY: number }> = {
  wide: { x: 1.45, y: 0.8, start: 200, calmY: 0.6 },
  balanced: { x: 1.15, y: 0.95, start: 225, calmY: 0.9 },
  tall: { x: 0.86, y: 1.24, start: 240, calmY: 1.12 },
}

export const SPATIAL_METRICS = {
  atlas: { core: 84, receded: 32 },
  hub: { active: 54, calm: 42, focus: 62, receded: 24 },
  portfolio: {
    orbitGap: 40,
    /** The children's arc. The rest, centred under the hub where its name and counts are written, stays open. */
    arcSpanDegrees: 230,
    workflowGap: 30,
    workflowRadius: 11,
    workflowSpacing: 28,
    clusterMax: 9,
    attentionSpacing: 14,
    agentGap: 26,
    agentRadius: 7,
    agentSpacing: 17,
    rowGap: 20,
    runRadius: 6,
    satelliteRadius: 5,
  },
  project: {
    workflowRing: 215,
    workflowRadius: 22,
    workflowSpacing: 92,
    clusterOffset: 44,
    clusterMax: 20,
    attentionOffset: 84,
    attentionSpacing: 26,
    agentRingGap: 165,
    agentRadius: 15,
    agentSpacing: 46,
    rowGap: 46,
    runRadius: 10,
    satelliteRadius: 9,
    contextGap: 120,
  },
  workflow: {
    focusRadius: 36,
    arcRadius: 200,
    arcSpanDegrees: 150,
    runRadius: 11,
    runSpacing: 30,
    runRowGap: 62,
    agentRadius: 16,
    agentSpacing: 58,
    agentRowGap: 46,
    satelliteRadius: 13,
    satelliteDistance: 8,
    hubDistance: 380,
    atlasDistance: 520,
  },
  /** Screen-independent room left for the hub name and counts under a hub. */
  hubTextAllowance: 64,
  fitPadding: 36,
} as const

/** Zoom depth (fitted width ÷ current width) at which folded portfolio detail unfolds. */
export const PORTFOLIO_REVEAL = { workflows: 1.8, agents: 2.8, satellites: 4 } as const
/** Zoom depth at which a project view names its agents, then shows satellites and every label. */
export const PROJECT_REVEAL = { agentLabels: 1.35, satellites: 1.9 } as const

const TAU = Math.PI * 2
const DEG = Math.PI / 180
const SATELLITE_KINDS: ReadonlySet<string> = new Set(['approval', 'output', 'task'])
/** Satellites stacked beside a shown run on their own; the rest appear with the run. Attention is never held back. */
const SATELLITE_STACK = 3
/** Half the sector left open straight below a drilled hub, where its name and counts are written. */
const OPEN_BELOW = 50 * DEG

// ─── Public helpers ──────────────────────────────────────────────────────────

/** Wide ≥ 1.3, tall ≤ 0.8 — from the stage, which the inspector does not resize. */
export function classifySpatialAspect(width: number, height: number): SpatialAspect {
  if (!(width > 0) || !(height > 0)) return 'balanced'
  const ratio = width / height
  if (ratio >= 1.3) return 'wide'
  if (ratio <= 0.8) return 'tall'
  return 'balanced'
}

/** "Familje-Stunden" → FS, "The Prompt" → TP, "GainPilot" → GP, "AUDIT 0b" → A0. */
export function projectMonogram(name: string): string {
  const parts = name
    .replace(/([a-zåäö])([A-ZÅÄÖ])/g, '$1 $2')
    .split(/[\s\-_·./]+/)
    .map(part => part.trim())
    .filter(part => /^[\p{L}\p{N}]/u.test(part))
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  const letters = (parts[0] ?? name).replace(/[^\p{L}\p{N}]/gu, '')
  return letters.slice(0, 2).toUpperCase() || '·'
}

export interface ProjectSnapshotSummary {
  agents: number
  workflows: number
  activeWorkflows: number
  runs: number
  attentionRuns: number
}

/** Counts of one project in this payload. Nothing is inferred beyond the rows present. */
export function summarizeProject(nodes: readonly IntelligenceGraphNode[], projectId: string): ProjectSnapshotSummary {
  let agents = 0
  let workflows = 0
  let activeWorkflows = 0
  let runs = 0
  let attentionRuns = 0
  for (const node of nodes) {
    if (node.projectId !== projectId) continue
    if (node.kind === 'agent') agents += 1
    else if (node.kind === 'workflow') {
      workflows += 1
      if (node.status === 'active') activeWorkflows += 1
    } else if (node.kind === 'run') {
      runs += 1
      if (getStatusVisual(node)?.attention) attentionRuns += 1
    }
  }
  return { agents, workflows, activeWorkflows, runs, attentionRuns }
}

/** Current operational activity, as the snapshot shows it: runs in the window or an active workflow. */
export function isOperationallyActive(summary: ProjectSnapshotSummary): boolean {
  return summary.runs > 0 || summary.activeWorkflows > 0
}

/** "33 agenter · 5 workflows" — only what the snapshot holds; an empty project says so. */
export function hubSubtext(summary: ProjectSnapshotSummary): string {
  const parts: string[] = []
  if (summary.agents > 0) parts.push(`${summary.agents} ${summary.agents === 1 ? 'agent' : 'agenter'}`)
  if (summary.workflows > 0) {
    const noun = summary.workflows === 1 ? 'workflow' : 'workflows'
    parts.push(summary.activeWorkflows === 0 ? `${summary.workflows} inaktiva ${noun}` : `${summary.workflows} ${noun}`)
  }
  if (parts.length === 0) parts.push('Inga agenter eller workflows')
  if (summary.runs > 0) parts.push(`${summary.runs} ${summary.runs === 1 ? 'körning' : 'körningar'}`)
  return parts.join(' · ')
}

/** Runs each workflow started in this snapshot — `STARTED` edges within one project, sorted by id. */
export function runsByWorkflow(
  nodes: readonly IntelligenceGraphNode[],
  edges: readonly IntelligenceGraphEdge[],
): Map<string, IntelligenceGraphNode[]> {
  const byId = new Map(nodes.map(node => [node.id, node]))
  const groups = new Map<string, IntelligenceGraphNode[]>()
  for (const edge of edges) {
    if (edge.relation !== 'STARTED') continue
    const workflow = byId.get(edge.source)
    const run = byId.get(edge.target)
    if (!workflow || !run || workflow.kind !== 'workflow' || run.kind !== 'run') continue
    if (!workflow.projectId || workflow.projectId !== run.projectId) continue
    const list = groups.get(workflow.id) ?? []
    if (!list.some(existing => existing.id === run.id)) list.push(run)
    groups.set(workflow.id, list)
  }
  for (const list of groups.values()) list.sort((a, b) => a.id.localeCompare(b.id))
  return groups
}

/**
 * A run shown on its own rather than counted: its stored status is running,
 * waiting or failed, or it is in `pinned` — a run drill-down's run, or a run
 * holding something that needs attention (book ¶400). Everything else is a count.
 */
export function runNeedsOwnPlace(run: IntelligenceGraphNode, pinned?: ReadonlySet<string>): boolean {
  return run.status === 'running' || Boolean(getStatusVisual(run)?.attention) || Boolean(pinned?.has(run.id))
}

/** Visibility of a node under the spatial layout, before filters and isolation. */
export function spatialNodeVisibility(
  node: IntelligenceGraphNode,
  layout: SpatialLayout,
  state: {
    depth: number
    selectedId?: string | null
    focusId?: string | null
    searchResultId?: string | null
    neighborIds?: ReadonlySet<string>
    executionContext?: boolean
  },
): GraphStructuralVisibility {
  const role = layout.roles.get(node.id)
  if (!role || !layout.positions.has(node.id)) return 'hidden'
  const asked = (id: string) => id === state.selectedId || id === state.focusId || id === state.searchResultId
  const interacting = asked(node.id)
  // A counted run is its cluster's number until someone asks for that run itself.
  if (layout.aggregatedRunIds.has(node.id)) return interacting ? 'visible' : 'hidden'
  // …and what it holds appears with it.
  const parentId = layout.shownWithParent.get(node.id)
  if (parentId !== undefined) return interacting || asked(parentId) ? 'visible' : 'hidden'
  if (interacting || getStatusVisual(node)?.attention) return 'visible'
  // On the portfolio a selected hub keeps its children folded — the inspector has them; a
  // selected child still shows what it touches.
  const selectedRole = state.selectedId ? layout.roles.get(state.selectedId) : undefined
  const revealsNeighbours = !(layout.level === 'portfolio' && selectedRole === 'hub')
  if (state.selectedId && revealsNeighbours && state.neighborIds?.has(node.id)) return 'visible'
  if (state.executionContext) return state.neighborIds?.has(node.id) ? 'visible' : 'hidden'
  if (role === 'context') return 'dimmed'
  if (layout.level === 'portfolio') {
    if (role === 'hub' || role === 'run') return 'visible'
    if (role === 'structure') return state.depth >= PORTFOLIO_REVEAL.workflows ? 'visible' : 'hidden'
    if (role === 'detail') return state.depth >= PORTFOLIO_REVEAL.agents ? 'visible' : 'hidden'
    return state.depth >= PORTFOLIO_REVEAL.satellites ? 'visible' : 'hidden'
  }
  if (layout.level === 'project' && role === 'satellite') {
    return state.depth >= PROJECT_REVEAL.satellites ? 'visible' : 'hidden'
  }
  return 'visible'
}

/**
 * The label density the engine applies at this level and zoom depth. A project
 * view opens with its hub and workflows named; agent names arrive as the
 * operator zooms in (or points at one). A workflow view names its agents; run
 * labels arrive with zoom.
 */
export function spatialDensityLevel(level: SpatialLevel, depth: number, executionContext = false): GraphZoomLevel {
  if (executionContext) return 'execution'
  if (level === 'portfolio') {
    if (depth < PORTFOLIO_REVEAL.workflows) return 'portfolio'
    if (depth < PORTFOLIO_REVEAL.agents) return 'project'
    if (depth < PORTFOLIO_REVEAL.satellites) return 'operational'
    return 'detail'
  }
  if (level === 'project') return depth < PROJECT_REVEAL.agentLabels ? 'project' : depth < PROJECT_REVEAL.satellites ? 'operational' : 'detail'
  return depth < PROJECT_REVEAL.agentLabels ? 'operational' : 'detail'
}

/** The edge density: a drilled level shows its own structure from the start. */
export function spatialEdgeLevel(level: SpatialLevel, depth: number, executionContext = false): GraphZoomLevel {
  if (executionContext) return 'execution'
  if (level === 'portfolio') return spatialDensityLevel(level, depth)
  return depth < PROJECT_REVEAL.satellites ? 'operational' : 'detail'
}

/** The level named to the operator ("Nivå"): a project view is a project, whatever its density. */
export function spatialReportedLevel(level: SpatialLevel, depth: number, executionContext = false): GraphZoomLevel {
  if (executionContext) return 'execution'
  if (level === 'project') return depth < PROJECT_REVEAL.satellites ? 'project' : 'detail'
  if (level === 'workflow') return 'detail'
  return spatialDensityLevel(level, depth)
}

// ─── Layout ──────────────────────────────────────────────────────────────────

interface Placement {
  positions: Map<string, PositionedNode>
  roles: Map<string, SpatialRole>
  hubs: SpatialHub[]
  clusters: SpatialRunCluster[]
  bands: SpatialUnlinkedBand[]
  aggregated: Set<string>
  /** Direction a counted run's slot lies from its cluster; its satellites continue that way. */
  slotDirections: Map<string, number>
  shownWithParent: Map<string, string>
}

interface Graph {
  nodes: IntelligenceGraphNode[]
  byId: Map<string, IntelligenceGraphNode>
  projects: IntelligenceGraphNode[]
  runsOf: Map<string, IntelligenceGraphNode[]>
  /** The workflow that started each run, by run id. */
  workflowOfRun: Map<string, string>
  /** Workflow ids whose current definition names the agent, by agent id. */
  workflowsNaming: Map<string, string[]>
  /** Agent ids a workflow's current definition names, in step order. */
  agentsNamedBy: Map<string, string[]>
  /** Parent (run, else workflow) of approvals, outputs and tasks. */
  satelliteParent: Map<string, string>
  /** Satellite ids by parent id. */
  satellitesOf: Map<string, string[]>
  /** Runs placed on their own whatever their status: a run drill-down's run, and runs holding something that needs attention. */
  ownPlace: ReadonlySet<string>
}

export function computeSpatialLayout(input: SpatialLayoutInput): SpatialLayout {
  const graph = indexGraph(input)
  const stretch = SPATIAL_STRETCH[input.aspect]
  const portfolio = arrangePortfolio(graph, stretch)
  const overview = () => finish('portfolio', input.aspect, null, portfolio.placement, portfolio.atlas, portfolioFitBounds(graph, portfolio.placement, portfolio.atlas))
  const anchor = input.anchor

  switch (anchor.level) {
    case 'portfolio':
      return overview()
    case 'project': {
      const hub = graph.projects.find(project => project.projectId === anchor.projectId)
      return hub ? arrangeProject(graph, stretch, input.aspect, hub, portfolio) : overview()
    }
    case 'workflow': {
      const workflow = graph.byId.get(anchor.workflowId)
      return workflow?.kind === 'workflow' ? arrangeWorkflow(graph, stretch, input.aspect, workflow, portfolio) : overview()
    }
    case 'run': {
      // A run drill-down opens its workflow with the run in place; a run with no workflow opens its project.
      const run = graph.byId.get(anchor.runId)
      if (!run || run.kind !== 'run') return overview()
      const pinned: Graph = { ...graph, ownPlace: new Set([...graph.ownPlace, run.id]) }
      const workflowId = graph.workflowOfRun.get(run.id)
      const workflow = workflowId ? graph.byId.get(workflowId) : undefined
      if (workflow) return arrangeWorkflow(pinned, stretch, input.aspect, workflow, portfolio)
      const hub = run.projectId ? graph.projects.find(project => project.projectId === run.projectId) : undefined
      return hub ? arrangeProject(pinned, stretch, input.aspect, hub, portfolio) : overview()
    }
  }
}

function indexGraph(input: SpatialLayoutInput): Graph {
  // Row order from the database is not part of the snapshot's meaning.
  const nodes = [...input.nodes].sort((a, b) => a.id.localeCompare(b.id))
  const edges = [...input.edges].sort((a, b) => a.id.localeCompare(b.id))
  const byId = new Map(nodes.map(node => [node.id, node]))
  const projects = nodes.filter(node => node.kind === 'project' && node.projectId).sort(byLabel)
  const workflowsNaming = new Map<string, string[]>()
  const namedBy = new Map<string, Array<{ id: string; order: number }>>()
  const satelliteParent = new Map<string, string>()
  for (const edge of edges) {
    const source = byId.get(edge.source)
    const target = byId.get(edge.target)
    if (!source || !target) continue
    if (edge.relation === 'DELEGATED_TO' && source.kind === 'workflow' && target.kind === 'agent') {
      const list = workflowsNaming.get(target.id) ?? []
      if (!list.includes(source.id)) list.push(source.id)
      workflowsNaming.set(target.id, list)
      const order = typeof edge.metadata?.order === 'number' ? edge.metadata.order : Number.MAX_SAFE_INTEGER
      const named = namedBy.get(source.id) ?? []
      if (!named.some(entry => entry.id === target.id)) named.push({ id: target.id, order })
      namedBy.set(source.id, named)
    } else if ((edge.relation === 'REQUESTED_APPROVAL' || edge.relation === 'PRODUCED') && source.kind === 'run' && SATELLITE_KINDS.has(target.kind)) {
      if (!satelliteParent.has(target.id)) satelliteParent.set(target.id, source.id)
    } else if (edge.relation === 'TRACKS' && source.kind === 'task' && (target.kind === 'run' || target.kind === 'workflow')) {
      if (!satelliteParent.has(source.id)) satelliteParent.set(source.id, target.id)
    }
  }
  const agentsNamedBy = new Map<string, string[]>()
  for (const [workflowId, named] of namedBy) {
    agentsNamedBy.set(workflowId, named
      .sort((a, b) => a.order - b.order || labelOf(byId, a.id).localeCompare(labelOf(byId, b.id), 'sv') || a.id.localeCompare(b.id))
      .map(entry => entry.id))
  }
  for (const list of workflowsNaming.values()) list.sort((a, b) => labelOf(byId, a).localeCompare(labelOf(byId, b), 'sv') || a.localeCompare(b))
  const runsOf = runsByWorkflow(nodes, edges)
  const workflowOfRun = new Map<string, string>()
  for (const [workflowId, runs] of runsOf) for (const run of runs) if (!workflowOfRun.has(run.id)) workflowOfRun.set(run.id, workflowId)
  const satellitesOf = new Map<string, string[]>()
  const ownPlace = new Set<string>()
  for (const [satelliteId, parentId] of satelliteParent) {
    satellitesOf.set(parentId, [...(satellitesOf.get(parentId) ?? []), satelliteId])
    // A pending approval is seen beside its run, so that run is never only a count.
    const satellite = byId.get(satelliteId)
    if (satellite && getStatusVisual(satellite)?.attention && byId.get(parentId)?.kind === 'run') ownPlace.add(parentId)
  }
  return { nodes, byId, projects, runsOf, workflowOfRun, workflowsNaming, agentsNamedBy, satelliteParent, satellitesOf, ownPlace }
}

// ─── Portfolio ───────────────────────────────────────────────────────────────

interface PortfolioArrangement {
  placement: Placement
  atlas: SpatialAtlasOrb
  /** Hub centres on the portfolio, for directions from a drilled project. */
  hubCentres: Map<string, { x: number; y: number }>
}

function portfolioInterior(hubRadius: number): InteriorOptions {
  const metrics = SPATIAL_METRICS.portfolio
  const span = metrics.arcSpanDegrees * DEG
  return {
    stretch: { x: 1, y: 1 },
    // The open sector is centred straight below the hub (SVG y grows downward).
    arcStart: Math.PI / 2 + (TAU - span) / 2,
    arcSpan: span,
    workflowRing: hubRadius + metrics.workflowGap,
    workflowRadius: metrics.workflowRadius,
    workflowSpacing: metrics.workflowSpacing,
    clusterOffset: metrics.workflowRadius + 9,
    clusterMax: metrics.clusterMax,
    attentionOffset: metrics.workflowRadius + 22,
    attentionSpacing: metrics.attentionSpacing,
    agentGap: metrics.agentGap,
    agentRadius: metrics.agentRadius,
    agentSpacing: metrics.agentSpacing,
    rowGap: metrics.rowGap,
    runRadius: metrics.runRadius,
    satelliteRadius: metrics.satelliteRadius,
    satelliteDistance: metrics.satelliteRadius + 4,
    workflowRole: 'structure',
    agentRole: 'detail',
  }
}

function arrangePortfolio(graph: Graph, stretch: { x: number; y: number; start: number; calmY: number }): PortfolioArrangement {
  const placement = emptyPlacement()
  const metrics = SPATIAL_METRICS.portfolio
  const summaries = new Map(graph.projects.map(project => [project.id, summarizeProject(graph.nodes, project.projectId!)]))
  const active = graph.projects.filter(project => isOperationallyActive(summaries.get(project.id)!))
  const calm = graph.projects.filter(project => !isOperationallyActive(summaries.get(project.id)!))

  const extentOf = (project: IntelligenceGraphNode, hubRadius: number) => Math.max(
    hubRadius + SPATIAL_METRICS.hubTextAllowance * 0.5,
    planInterior(graph, project.projectId!, hubRadius, portfolioInterior(hubRadius)).extent,
  )

  const atlasRadius = SPATIAL_METRICS.atlas.core
  const activeExtents = active.map(project => extentOf(project, SPATIAL_METRICS.hub.active))
  const calmExtents = calm.map(project => extentOf(project, SPATIAL_METRICS.hub.calm))
  const activeExtent = Math.max(0, ...activeExtents)
  const calmExtent = Math.max(0, ...calmExtents)
  const nActive = active.length
  const nCalm = calm.length
  const start = stretch.start * DEG
  const activeStep = nActive > 0 ? TAU / nActive : 0
  const activeAngles = active.map((_, index) => start + index * activeStep)
  const calmStart = start + (nActive > 0 ? activeStep / 2 : 0)
  const calmAngles = calm.map((_, index) => calmStart + index * (TAU / Math.max(1, nCalm)))
  // The calm orbit is flatter on a wide stage, so quiet projects widen the map rather than heighten it.
  const calmStretch = { x: stretch.x, y: stretch.calmY }

  const inner = nActive === 0
    ? 0
    : orbitRadius(
      Math.max(
        atlasRadius + metrics.orbitGap + activeExtent,
        nActive > 1 ? (activeExtent * 2 + metrics.orbitGap) / (2 * Math.sin(Math.PI / nActive)) : 0,
      ),
      activeAngles, stretch, activeExtents, [], atlasRadius + metrics.orbitGap, metrics.orbitGap,
    )
  const activeCircles = activeAngles.map((angle, index) => ({ ...polar(0, 0, inner, angle, stretch), extent: activeExtents[index] }))
  const outerBase = nActive === 0 ? atlasRadius + metrics.orbitGap + calmExtent : Math.max(inner * 1.38, inner + calmExtent + metrics.orbitGap)
  const outer = nCalm === 0
    ? 0
    : orbitRadius(
      nCalm > 1 ? Math.max(outerBase, (calmExtent * 2 + metrics.orbitGap) / (2 * Math.sin(Math.PI / nCalm))) : outerBase,
      calmAngles, calmStretch, calmExtents, activeCircles, atlasRadius + metrics.orbitGap, metrics.orbitGap,
    )

  const hubCentres = new Map<string, { x: number; y: number }>()
  active.forEach((project, index) => {
    placeHub(graph, placement, project, polar(0, 0, inner, activeAngles[index], stretch), SPATIAL_METRICS.hub.active, 'active', summaries.get(project.id)!)
    hubCentres.set(project.id, placement.positions.get(project.id)!)
  })
  calm.forEach((project, index) => {
    placeHub(graph, placement, project, polar(0, 0, outer, calmAngles[index], calmStretch), SPATIAL_METRICS.hub.calm, 'calm', summaries.get(project.id)!)
    hubCentres.set(project.id, placement.positions.get(project.id)!)
  })

  // Children fold into compact rings around each hub, revealed by zoom.
  for (const project of graph.projects) {
    const hubRadius = placement.positions.get(project.id)!.r
    placeInterior(graph, placement, project, hubCentres.get(project.id)!, hubRadius, portfolioInterior(hubRadius))
  }

  const atlas: SpatialAtlasOrb = {
    x: 0,
    y: 0,
    r: atlasRadius,
    receded: false,
    linkedHubIds: graph.projects.map(project => project.id),
  }
  return { placement, atlas, hubCentres }
}

/**
 * The smallest orbit radius, at least `base`, at which every hub on the orbit —
 * at its own angle on the stretched ring, with its own extent — keeps `atlasClearance`
 * plus its extent from Atlas, and `gap` from each other hub and each hub already placed.
 */
function orbitRadius(
  base: number,
  angles: readonly number[],
  stretch: { x: number; y: number },
  extents: readonly number[],
  placed: ReadonlyArray<{ x: number; y: number; extent: number }>,
  atlasClearance: number,
  gap: number,
): number {
  let radius = base
  const units = angles.map(angle => ({ x: Math.cos(angle) * stretch.x, y: Math.sin(angle) * stretch.y }))
  units.forEach((unit, index) => {
    radius = Math.max(radius, (atlasClearance + extents[index]) / Math.hypot(unit.x, unit.y))
    for (let other = index + 1; other < units.length; other++) {
      const apart = Math.hypot(unit.x - units[other].x, unit.y - units[other].y)
      if (apart > 1e-9) radius = Math.max(radius, (extents[index] + extents[other] + gap) / apart)
    }
    // Clear of a hub already placed: the larger root of |radius·unit − centre|² = need².
    for (const hub of placed) {
      const need = extents[index] + hub.extent + gap
      const a = unit.x * unit.x + unit.y * unit.y
      const b = unit.x * hub.x + unit.y * hub.y
      const discriminant = b * b - a * (hub.x * hub.x + hub.y * hub.y - need * need)
      if (discriminant >= 0) radius = Math.max(radius, (b + Math.sqrt(discriminant)) / a)
    }
  })
  return radius
}

function portfolioFitBounds(graph: Graph, placement: Placement, atlas: SpatialAtlasOrb): GraphBounds {
  const bounds = circleBounds(atlas.x, atlas.y, atlas.r + SPATIAL_METRICS.hubTextAllowance * 0.5)
  for (const hub of placement.hubs) {
    include(bounds, circleBounds(hub.x, hub.y, hub.r))
    include(bounds, { minX: hub.x - 130, minY: hub.y, maxX: hub.x + 130, maxY: hub.y + hub.r + SPATIAL_METRICS.hubTextAllowance })
  }
  // What the overview shows beyond its hubs: runs on their own, and anything that needs attention.
  for (const [id, role] of placement.roles) {
    if (placement.aggregated.has(id) || placement.shownWithParent.has(id)) continue
    const node = graph.byId.get(id)
    if (role !== 'run' && !(role === 'satellite' && node && getStatusVisual(node)?.attention)) continue
    const position = placement.positions.get(id)!
    include(bounds, circleBounds(position.x, position.y, position.r + 12))
  }
  return pad(bounds, SPATIAL_METRICS.fitPadding)
}

// ─── Project ─────────────────────────────────────────────────────────────────

function arrangeProject(
  graph: Graph,
  stretch: { x: number; y: number; start: number; calmY: number },
  aspect: SpatialAspect,
  hub: IntelligenceGraphNode,
  portfolio: PortfolioArrangement,
): SpatialLayout {
  const placement = emptyPlacement()
  const metrics = SPATIAL_METRICS.project
  const summary = summarizeProject(graph.nodes, hub.projectId!)
  placeHub(graph, placement, hub, { x: 0, y: 0 }, SPATIAL_METRICS.hub.focus, 'focus', summary)
  placement.roles.set(hub.id, 'anchor')

  const plan = placeInterior(graph, placement, hub, { x: 0, y: 0 }, SPATIAL_METRICS.hub.focus, {
    stretch,
    arcStart: -90 * DEG,
    arcSpan: TAU,
    openBelow: true,
    workflowRing: metrics.workflowRing,
    workflowRadius: metrics.workflowRadius,
    workflowSpacing: metrics.workflowSpacing,
    clusterOffset: metrics.clusterOffset,
    clusterMax: metrics.clusterMax,
    attentionOffset: metrics.attentionOffset,
    attentionSpacing: metrics.attentionSpacing,
    agentGap: metrics.agentRingGap,
    agentRadius: metrics.agentRadius,
    agentSpacing: metrics.agentSpacing,
    rowGap: metrics.rowGap,
    runRadius: metrics.runRadius,
    satelliteRadius: metrics.satelliteRadius,
    satelliteDistance: metrics.satelliteRadius + 4,
    workflowRole: 'structure',
    agentRole: 'structure',
  })

  const structureBounds = boundsOfRoles(placement, ['anchor', 'structure', 'run', 'satellite'], SPATIAL_METRICS.hubTextAllowance)
  // Room for a band's two-line caption, which is sized on screen rather than in the world.
  for (const band of placement.bands) include(structureBounds, { minX: band.x - 170, minY: band.y - 40, maxX: band.x + 170, maxY: band.y + 40 })
  // A sparse project stays sparse: the frame never closes in tighter than a project's inner rings.
  const minimum = metrics.workflowRing + metrics.agentRingGap * 0.5
  include(structureBounds, { minX: -minimum * stretch.x, minY: -minimum * stretch.y, maxX: minimum * stretch.x, maxY: minimum * stretch.y })
  const fitBounds = pad(structureBounds, SPATIAL_METRICS.fitPadding)
  const origin = portfolio.hubCentres.get(hub.id) ?? { x: 0, y: 0 }
  const contextRing = Math.max(plan.extent, plan.workflowRing + metrics.agentRingGap * 0.5) + metrics.contextGap
  const atlas = recedeContext(graph, placement, stretch, origin, contextRing, hub.id, portfolio)
  return finish('project', aspect, hub.id, placement, atlas, fitBounds)
}

// ─── Workflow ────────────────────────────────────────────────────────────────

function arrangeWorkflow(
  graph: Graph,
  stretch: { x: number; y: number; start: number; calmY: number },
  aspect: SpatialAspect,
  workflow: IntelligenceGraphNode,
  portfolio: PortfolioArrangement,
): SpatialLayout {
  const placement = emptyPlacement()
  const metrics = SPATIAL_METRICS.workflow
  const span = metrics.arcSpanDegrees * DEG
  const minStretch = Math.min(stretch.x, stretch.y)
  setPosition(placement, workflow.id, 0, 0, metrics.focusRadius, 'anchor')

  // Runs: newest first along the arc; the older ones counted in one cluster at its end. Runs that must
  // be seen are never counted: when the arc cannot hold them, they take further rows outward.
  const olderRadius = 20
  const runs = [...(graph.runsOf.get(workflow.id) ?? [])].sort(byNewest)
  const mustPlace = new Set(runs.filter(run => runNeedsOwnPlace(run, graph.ownPlace)).map(run => run.id))
  const runReachOnScreen = Math.max(metrics.runRadius, ...runs.map(run => satelliteReach(shownSatelliteCount(graph, run.id), metrics.runRadius, metrics.satelliteRadius, metrics.satelliteDistance)))
  // The cluster keeps its own room at the arc's end, clear of the last run and anything stacked beside it.
  const olderGap = olderRadius + Math.max(metrics.runRadius, metrics.satelliteRadius) + 8
  const runsThatFit = (radius: number, withOlder: boolean) =>
    Math.max(1, Math.floor((span * radius * minStretch - (withOlder ? olderGap : 0)) / metrics.runSpacing) + 1)
  let individual = runs
  let older: IntelligenceGraphNode[] = []
  if (runs.length > runsThatFit(metrics.arcRadius, false)) {
    const room = Math.max(runsThatFit(metrics.arcRadius, true), mustPlace.size)
    const chosen = new Set(mustPlace)
    for (const run of runs) {
      if (chosen.size >= room) break
      chosen.add(run.id)
    }
    individual = runs.filter(run => chosen.has(run.id))
    older = runs.filter(run => !chosen.has(run.id))
  }
  const runRowGap = Math.max(metrics.runRowGap, (runReachOnScreen + metrics.runRadius + 4) / minStretch)
  let outerRunRing: number = metrics.arcRadius
  for (let row = 0, offset = 0, olderPlaced = older.length === 0; offset < individual.length || !olderPlaced; row++) {
    const radius = metrics.arcRadius + row * runRowGap
    const left = individual.length - offset
    const olderHere = !olderPlaced && left <= runsThatFit(radius, true)
    const count = olderHere ? left : Math.min(left, runsThatFit(radius, false))
    const runSpan = olderHere ? span - olderGap / (radius * minStretch) : span
    for (let index = 0; index < count; index++) {
      const angle = -span / 2 + (count === 1 ? (olderHere ? 0 : span / 2) : (index * runSpan) / (count - 1))
      const point = polar(0, 0, radius, angle, stretch)
      setPosition(placement, individual[offset + index].id, point.x, point.y, metrics.runRadius, 'run')
    }
    if (olderHere) {
      const cluster = clusterOf(`cluster:older:${workflow.id}`, workflow.id, 'older', polar(0, 0, radius, span / 2, stretch), older, olderRadius)
      placement.clusters.push(cluster)
      assignClusterSlot(placement, older, cluster, metrics.runRadius, tangentAngle(span / 2, stretch))
      olderPlaced = true
    }
    outerRunRing = radius
    offset += count
  }

  // The agents this definition names, in step order, opposite the runs — first step at the top.
  const agents = (graph.agentsNamedBy.get(workflow.id) ?? []).map(id => graph.byId.get(id)).filter(isNode)
  const agentRowGap = Math.max(metrics.agentRowGap, (metrics.agentRadius * 2 + 4) / minStretch)
  let outerAgentRing: number = metrics.arcRadius
  for (let row = 0, offset = 0; offset < agents.length; row++) {
    const radius = metrics.arcRadius + row * agentRowGap
    const size = Math.min(agents.length - offset, Math.max(1, Math.floor((span * radius * minStretch) / metrics.agentSpacing) + 1))
    const agentSpan = size === 1 ? 0 : Math.min(span, ((size - 1) * metrics.agentSpacing) / (radius * minStretch))
    for (let index = 0; index < size; index++) {
      const angle = Math.PI + agentSpan / 2 - (size === 1 ? 0 : (index * agentSpan) / (size - 1))
      const point = polar(0, 0, radius, angle, stretch)
      setPosition(placement, agents[offset + index].id, point.x, point.y, metrics.agentRadius, 'structure')
    }
    outerAgentRing = radius
    offset += size
  }

  placeSatellites(graph, placement, metrics.satelliteRadius, metrics.satelliteDistance, { x: 0, y: 0 })
  const workflowBounds = boundsOfRoles(placement, ['anchor', 'structure', 'run', 'satellite'], 48)
  const minimum = metrics.arcRadius * 0.9
  include(workflowBounds, { minX: -minimum * stretch.x, minY: -minimum * stretch.y, maxX: minimum * stretch.x, maxY: minimum * stretch.y })
  const fitBounds = pad(workflowBounds, SPATIAL_METRICS.fitPadding)

  // The project hub and Atlas recede behind, in the direction the project lay from this workflow.
  const receded = SPATIAL_METRICS.hub.receded + 60
  const hubDistance = Math.max(
    metrics.hubDistance,
    outerRunRing + (Math.max(runReachOnScreen, olderRadius) + receded) / minStretch,
    outerAgentRing + (metrics.agentRadius + receded) / minStretch,
  )
  const atlasDistance = Math.max(metrics.atlasDistance, hubDistance + 140)
  const hub = workflow.projectId ? graph.projects.find(project => project.projectId === workflow.projectId) : undefined
  let atlas: SpatialAtlasOrb = { x: 0, y: -atlasDistance, r: SPATIAL_METRICS.atlas.receded, receded: true, linkedHubIds: [] }
  if (hub) {
    const hubCentre = portfolio.hubCentres.get(hub.id) ?? { x: 0, y: 0 }
    const workflowCentre = portfolio.placement.positions.get(workflow.id) ?? hubCentre
    const toHub = Math.atan2(hubCentre.y - workflowCentre.y, hubCentre.x - workflowCentre.x)
    const angle = Number.isFinite(toHub) && (hubCentre.x !== workflowCentre.x || hubCentre.y !== workflowCentre.y) ? toHub : -Math.PI / 2
    const hubPoint = polar(0, 0, hubDistance, angle, stretch)
    placeHub(graph, placement, hub, hubPoint, SPATIAL_METRICS.hub.receded, 'receded', summarizeProject(graph.nodes, hub.projectId!))
    placement.roles.set(hub.id, 'context')
    const atlasPoint = polar(0, 0, atlasDistance, angle + 14 * DEG, stretch)
    atlas = { x: atlasPoint.x, y: atlasPoint.y, r: SPATIAL_METRICS.atlas.receded, receded: true, linkedHubIds: [] }
  }
  return finish('workflow', aspect, workflow.id, placement, atlas, fitBounds)
}

// ─── Project interior (shared by the portfolio's compact rings and the project view) ──

interface InteriorOptions {
  stretch: { x: number; y: number }
  /** Where the arc starts and how far it runs; a full turn is a full circle. */
  arcStart: number
  arcSpan: number
  /** A full circle turned so that no slot lies straight below the centre, where the hub's name and counts are. */
  openBelow?: boolean
  /** The workflow ring's smallest radius; it grows so each slot keeps `workflowSpacing`. */
  workflowRing: number
  workflowRadius: number
  workflowSpacing: number
  clusterOffset: number
  clusterMax: number
  attentionOffset: number
  attentionSpacing: number
  /** The smallest distance from the workflow ring to the agent ring. */
  agentGap: number
  agentRadius: number
  agentSpacing: number
  rowGap: number
  runRadius: number
  satelliteRadius: number
  satelliteDistance: number
  workflowRole: SpatialRole
  agentRole: SpatialRole
}

/**
 * The rings of one project's interior, each from the reach of the ring inside it.
 * Radii are ring units: a ring is stretched by the aspect, so a distance that must
 * hold on screen is divided by the smallest stretch before it becomes a radius.
 */
interface InteriorPlan {
  fullCircle: boolean
  /** Where the first slot's arc starts, after any turn. */
  arcStart: number
  minStretch: number
  workflows: IntelligenceGraphNode[]
  orphanRuns: IntelligenceGraphNode[]
  slotAngle: number
  workflowRing: number
  clusterRing: number
  attentionRing: number
  attentionRowGap: number
  agentRing: number
  agentRowGap: number
  groups: AgentGroup[]
  linkedRows: number
  unlinked: IntelligenceGraphNode[]
  unlinkedRing: number
  unlinkedRows: number[]
  extent: number
}

interface RunSlot {
  id: string
  parentId: string
  kind: 'workflow' | 'no-workflow'
  angle: number
  runs: readonly IntelligenceGraphNode[]
}

function planInterior(graph: Graph, projectId: string, hubRadius: number, options: InteriorOptions): InteriorPlan {
  const fullCircle = options.arcSpan >= TAU - 1e-9
  const span = fullCircle ? TAU : options.arcSpan
  const minStretch = Math.min(options.stretch.x, options.stretch.y)
  const workflows = graph.nodes.filter(node => node.kind === 'workflow' && node.projectId === projectId).sort(byLabel)
  const orphanRuns = graph.nodes.filter(node => node.kind === 'run' && node.projectId === projectId && !graph.workflowOfRun.has(node.id))
  // One slot per workflow, and one more for runs without a workflow: a count of their own, never a workflow's.
  const slots = workflows.length + (orphanRuns.length > 0 ? 1 : 0)
  let slotAngle = span / Math.max(1, slots)
  let arcStart = options.arcStart
  if (fullCircle && options.openBelow) {
    if (slots >= 4) {
      // The slots spread over the circle less the open sector, the first and last at its edges.
      slotAngle = (TAU - 2 * OPEN_BELOW) / (slots - 1)
      arcStart = Math.PI / 2 + OPEN_BELOW
    } else {
      // Few slots leave the sector open by turning half a slot.
      arcStart = Math.PI / 2 + slotAngle / 2
    }
  }
  const workflowRing = Math.max(
    options.workflowRing,
    options.workflowSpacing / (slotAngle * minStretch),
    (hubRadius + options.workflowRadius + 8) / minStretch,
  )
  const clusterRing = workflowRing + Math.max(options.clusterOffset, (options.workflowRadius + options.clusterMax + 4) / minStretch)
  const attentionRing = Math.max(workflowRing + options.attentionOffset, clusterRing + (options.clusterMax + options.runRadius + 4) / minStretch)

  // How far a shown run reaches with the satellites stacked beside it, on screen.
  let anyRuns = false
  let ownReach = options.runRadius
  const ownCounts: number[] = []
  for (const runs of [...workflows.map(workflow => graph.runsOf.get(workflow.id) ?? []), orphanRuns]) {
    if (runs.length === 0) continue
    anyRuns = true
    const own = runs.filter(run => runNeedsOwnPlace(run, graph.ownPlace))
    if (own.length === 0) continue
    ownCounts.push(own.length)
    for (const run of own) {
      ownReach = Math.max(ownReach, satelliteReach(shownSatelliteCount(graph, run.id, projectId), options.runRadius, options.satelliteRadius, options.satelliteDistance))
    }
  }
  const attentionRowGap = (ownReach + options.runRadius + 4) / minStretch
  const ownRows = Math.max(0, ...ownCounts.map(count => packRows(count, attentionRing, attentionRowGap, slotAngle, options.attentionSpacing, minStretch).length))
  const innerReach = ownRows > 0
    ? attentionRing + (ownRows - 1) * attentionRowGap + ownReach / minStretch
    : anyRuns ? clusterRing + options.clusterMax / minStretch
      : workflows.length > 0 ? workflowRing + options.workflowRadius / minStretch : hubRadius / minStretch
  const agentRing = Math.max(workflowRing + options.agentGap, innerReach + (options.agentRadius + 6) / minStretch)
  const agentRowGap = Math.max(options.rowGap, (options.agentRadius * 2 + 4) / minStretch)

  // Named agents beside their workflow; the rest in a band beyond them.
  const agents = graph.nodes.filter(node => node.kind === 'agent' && node.projectId === projectId).sort(byLabel)
  const slotOf = new Map(workflows.map((workflow, index) => [workflow.id, index]))
  const primary = (agent: IntelligenceGraphNode) => (graph.workflowsNaming.get(agent.id) ?? []).find(id => slotOf.has(id))
  const groups: AgentGroup[] = workflows
    .map((workflow, index) => ({
      key: workflow.id,
      centre: arcStart + (fullCircle ? index : index + 0.5) * slotAngle,
      members: agents.filter(agent => primary(agent) === workflow.id),
    }))
    .filter(group => group.members.length > 0)
  const unlinked = agents.filter(agent => primary(agent) === undefined)
  const linkedRows = agentRowCount(groups, agentRing, options.agentSpacing, agentRowGap, span, minStretch, fullCircle)
  let extent = Math.max(hubRadius, innerReach)
  if (linkedRows > 0) extent = Math.max(extent, agentRing + (linkedRows - 1) * agentRowGap + options.agentRadius / minStretch)
  const unlinkedRing = linkedRows > 0 ? agentRing + linkedRows * agentRowGap + agentRowGap * 0.35 : agentRing
  const unlinkedRows = unlinked.length > 0 ? packRows(unlinked.length, unlinkedRing, agentRowGap, span, options.agentSpacing, minStretch) : []
  if (unlinkedRows.length > 0) {
    // The last row, then the caption beyond it.
    extent = Math.max(extent, unlinkedRing + (unlinkedRows.length - 1) * agentRowGap + options.agentRadius * 2 + agentRowGap * 1.75)
  }
  return {
    fullCircle, arcStart, minStretch, workflows, orphanRuns, slotAngle, workflowRing, clusterRing, attentionRing, attentionRowGap,
    agentRing, agentRowGap, groups, linkedRows, unlinked, unlinkedRing, unlinkedRows, extent,
  }
}

/** Satellites stacked beside a run on their own: every one that needs attention, and up to the stack's depth in all. */
function shownSatelliteCount(graph: Graph, parentId: string, projectId?: string): number {
  const parentProject = graph.byId.get(parentId)?.projectId
  const satellites = (graph.satellitesOf.get(parentId) ?? [])
    .map(id => graph.byId.get(id))
    .filter(isNode)
    .filter(node => !projectId || (node.projectId ?? parentProject) === projectId)
  const attention = satellites.filter(node => getStatusVisual(node)?.attention).length
  return Math.max(attention, Math.min(satellites.length, SATELLITE_STACK))
}

/** Distance from a run's centre to the far edge of its satellite stack, on screen. */
function satelliteReach(count: number, runRadius: number, radius: number, distance: number): number {
  return count === 0 ? runRadius : runRadius + distance + (count - 1) * (radius * 2 + 3) + radius * 2
}

/** Places a project's workflows, run counts, runs shown on their own, agents and satellites. */
function placeInterior(
  graph: Graph,
  placement: Placement,
  hub: IntelligenceGraphNode,
  centre: { x: number; y: number },
  hubRadius: number,
  options: InteriorOptions,
): InteriorPlan {
  const projectId = hub.projectId!
  const plan = planInterior(graph, projectId, hubRadius, options)
  const { fullCircle, arcStart, minStretch, slotAngle } = plan
  const angleOf = (slot: number) => arcStart + (fullCircle ? slot : slot + 0.5) * slotAngle
  const at = (radius: number, angle: number) => polar(centre.x, centre.y, radius, angle, options.stretch)

  plan.workflows.forEach((workflow, index) => {
    const point = at(plan.workflowRing, angleOf(index))
    setPosition(placement, workflow.id, point.x, point.y, options.workflowRadius, options.workflowRole)
  })

  // Runs per slot: one cluster with the true count; runs that must be seen in rows beyond it.
  const slots: RunSlot[] = plan.workflows.map((workflow, index) => ({
    id: `cluster:${workflow.id}`, parentId: workflow.id, kind: 'workflow', angle: angleOf(index), runs: graph.runsOf.get(workflow.id) ?? [],
  }))
  if (plan.orphanRuns.length > 0) {
    slots.push({ id: `cluster:no-workflow:${projectId}`, parentId: hub.id, kind: 'no-workflow', angle: angleOf(plan.workflows.length), runs: plan.orphanRuns })
  }
  for (const slot of slots) {
    if (slot.runs.length === 0) continue
    const cluster = clusterOf(slot.id, slot.parentId, slot.kind, at(plan.clusterRing, slot.angle), slot.runs, options.clusterMax)
    placement.clusters.push(cluster)
    const own = slot.runs.filter(run => runNeedsOwnPlace(run, graph.ownPlace)).sort(byNewest)
    assignClusterSlot(placement, slot.runs.filter(run => !own.includes(run)), cluster, options.runRadius, tangentAngle(slot.angle, options.stretch))
    let index = 0
    packRows(own.length, plan.attentionRing, plan.attentionRowGap, slotAngle, options.attentionSpacing, minStretch).forEach((size, row) => {
      const radius = plan.attentionRing + row * plan.attentionRowGap
      const step = options.attentionSpacing / (radius * minStretch)
      for (let k = 0; k < size; k++, index++) {
        const point = at(radius, slot.angle + (k - (size - 1) / 2) * step)
        setPosition(placement, own[index].id, point.x, point.y, options.runRadius, 'run')
      }
    })
  }

  // Named agents: each workflow's in one sector, as near that workflow as its neighbours allow.
  for (let row = 0; row < plan.linkedRows; row++) {
    const ring = plan.agentRing + row * plan.agentRowGap
    const step = options.agentSpacing / (ring * minStretch)
    const rowGroups = plan.groups
      .map(group => ({ ...group, members: group.members.filter((_, index) => index % plan.linkedRows === row) }))
      .filter(group => group.members.length > 0)
    for (const { agent, angle } of packAgentGroups(rowGroups, step, arcStart, options.arcSpan, fullCircle)) {
      const point = at(ring, angle)
      setPosition(placement, agent.id, point.x, point.y, options.agentRadius, options.agentRole)
    }
  }

  // Agents no workflow names: a band of their own beyond the named ones, centred on the widest gap
  // between workflow groups — never inside a group, never on a workflow's line.
  if (plan.unlinked.length > 0) {
    const groupStep = options.agentSpacing / (plan.agentRing * minStretch)
    const bandCentre = plan.groups.length > 0
      ? widestGroupGap(plan.groups, groupStep, arcStart, options.arcSpan, fullCircle)
      : arcStart + (fullCircle ? Math.PI : options.arcSpan / 2)
    let index = 0
    let captionAngle = bandCentre
    let outerRing = plan.unlinkedRing
    plan.unlinkedRows.forEach((size, row) => {
      const ring = plan.unlinkedRing + row * plan.agentRowGap
      const step = options.agentSpacing / (ring * minStretch)
      const width = size * step
      const rowCentre = fullCircle
        ? bandCentre
        : Math.min(arcStart + options.arcSpan - width / 2, Math.max(arcStart + width / 2, bandCentre))
      if (row === 0) captionAngle = rowCentre
      for (let k = 0; k < size; k++, index++) {
        const point = at(ring, rowCentre - width / 2 + step * (k + 0.5))
        setPosition(placement, plan.unlinked[index].id, point.x, point.y, options.agentRadius, options.agentRole)
      }
      outerRing = ring
    })
    const caption = at(outerRing + options.agentRadius * 2 + plan.agentRowGap * 1.15, captionAngle)
    placement.bands.push({
      id: `band:unlinked:${projectId}:${options.agentRole}`,
      projectId,
      count: plan.unlinked.length,
      x: round(caption.x),
      y: round(caption.y),
      angle: round(Math.atan2(Math.sin(captionAngle) * options.stretch.y, Math.cos(captionAngle) * options.stretch.x)),
      memberIds: plan.unlinked.map(agent => agent.id),
    })
  }

  placeSatellites(graph, placement, options.satelliteRadius, options.satelliteDistance, centre, projectId)
  return plan
}

/**
 * A counted run still has a place: one shared slot beside its cluster, along
 * the ring, where it appears only while it is selected, focused or a search
 * result. The layout — and so the camera — does not change when a counted run
 * is selected.
 */
function assignClusterSlot(placement: Placement, runs: readonly IntelligenceGraphNode[], cluster: SpatialRunCluster, runRadius: number, direction: number): void {
  const distance = cluster.r + runRadius + 6
  for (const run of runs) {
    setPosition(placement, run.id, cluster.x + Math.cos(direction) * distance, cluster.y + Math.sin(direction) * distance, runRadius, 'run')
    placement.aggregated.add(run.id)
    placement.slotDirections.set(run.id, direction)
  }
}

/**
 * Approvals, outputs and tasks beside their placed parent, stacked in one line
 * away from it — what needs attention first. A shown run's stack points outward
 * and shows `SATELLITE_STACK` of them (every one that needs attention); the rest
 * appear with the run. A counted run's continue from its slot and appear with
 * it; a workflow's (a task that tracks only a workflow) point inward and appear
 * with it.
 */
function placeSatellites(
  graph: Graph,
  placement: Placement,
  radius: number,
  distance: number,
  centre: { x: number; y: number },
  projectId?: string,
): void {
  const byParent = new Map<string, IntelligenceGraphNode[]>()
  for (const node of graph.nodes) {
    if (!SATELLITE_KINDS.has(node.kind) || placement.positions.has(node.id)) continue
    const parentId = graph.satelliteParent.get(node.id)
    if (!parentId || !placement.positions.has(parentId)) continue
    // An output row may carry no project of its own; it belongs where the run that produced it does.
    const owner = node.projectId ?? graph.byId.get(parentId)?.projectId
    if (projectId && owner !== projectId) continue
    byParent.set(parentId, [...(byParent.get(parentId) ?? []), node])
  }
  const needsAttention = (node: IntelligenceGraphNode) => (getStatusVisual(node)?.attention ? 1 : 0)
  for (const [parentId, satellites] of [...byParent].sort(([a], [b]) => a.localeCompare(b))) {
    const parent = placement.positions.get(parentId)!
    const isWorkflow = graph.byId.get(parentId)?.kind === 'workflow'
    const outward = parent.x !== centre.x || parent.y !== centre.y ? Math.atan2(parent.y - centre.y, parent.x - centre.x) : Math.PI / 2
    const direction = placement.slotDirections.get(parentId) ?? (isWorkflow ? outward + Math.PI : outward)
    const followsParent = placement.aggregated.has(parentId) || isWorkflow
    const shown = followsParent ? 0 : shownSatelliteCount(graph, parentId, projectId)
    satellites
      .sort((a, b) => needsAttention(b) - needsAttention(a) || byLabel(a, b))
      .forEach((node, index) => {
        const along = parent.r + distance + radius + index * (radius * 2 + 3)
        setPosition(placement, node.id, parent.x + Math.cos(direction) * along, parent.y + Math.sin(direction) * along, radius, 'satellite')
        if (index >= shown) placement.shownWithParent.set(node.id, parentId)
      })
  }
}

function recedeContext(
  graph: Graph,
  placement: Placement,
  stretch: { x: number; y: number },
  origin: { x: number; y: number },
  ring: number,
  anchorHubId: string,
  portfolio: PortfolioArrangement,
): SpatialAtlasOrb {
  const entries: Array<{ id: string; angle: number }> = []
  for (const project of graph.projects) {
    if (project.id === anchorHubId) continue
    const centre = portfolio.hubCentres.get(project.id) ?? { x: 0, y: 0 }
    entries.push({ id: project.id, angle: Math.atan2(centre.y - origin.y, centre.x - origin.x) })
  }
  const atlasAngle = origin.x === 0 && origin.y === 0 ? -Math.PI / 2 : Math.atan2(-origin.y, -origin.x)
  entries.push({ id: '__atlas__', angle: atlasAngle })
  entries.sort((a, b) => a.angle - b.angle || a.id.localeCompare(b.id))
  const angles = packOnArc(entries.map(entry => entry.angle), -Math.PI, TAU, 16 * DEG, true)
  let atlas: SpatialAtlasOrb = { x: 0, y: -ring, r: SPATIAL_METRICS.atlas.receded, receded: true, linkedHubIds: [anchorHubId] }
  entries.forEach((entry, index) => {
    const point = polar(0, 0, ring, angles[index], stretch)
    if (entry.id === '__atlas__') {
      atlas = { x: point.x, y: point.y, r: SPATIAL_METRICS.atlas.receded, receded: true, linkedHubIds: [anchorHubId] }
      return
    }
    const project = graph.byId.get(entry.id)!
    placeHub(graph, placement, project, point, SPATIAL_METRICS.hub.receded, 'receded', summarizeProject(graph.nodes, project.projectId!))
    placement.roles.set(project.id, 'context')
  })
  return atlas
}

// ─── Primitives ──────────────────────────────────────────────────────────────

function emptyPlacement(): Placement {
  return { positions: new Map(), roles: new Map(), hubs: [], clusters: [], bands: [], aggregated: new Set(), slotDirections: new Map(), shownWithParent: new Map() }
}

function placeHub(
  graph: Graph,
  placement: Placement,
  project: IntelligenceGraphNode,
  point: { x: number; y: number },
  radius: number,
  orbit: SpatialHub['orbit'],
  summary: ProjectSnapshotSummary,
): void {
  setPosition(placement, project.id, point.x, point.y, radius, 'hub')
  placement.hubs.push({
    nodeId: project.id,
    projectId: project.projectId!,
    label: project.label,
    x: round(point.x),
    y: round(point.y),
    r: radius,
    color: projectAccent(project),
    monogram: projectMonogram(project.label),
    subtext: hubSubtext(summary),
    orbit,
  })
}

function clusterOf(
  id: string,
  parentId: string,
  kind: SpatialRunCluster['kind'],
  point: { x: number; y: number },
  runs: readonly IntelligenceGraphNode[],
  maxRadius: number,
): SpatialRunCluster {
  const counts = new Map<string, number>()
  for (const run of runs) {
    const status = run.status ?? 'okänd'
    counts.set(status, (counts.get(status) ?? 0) + 1)
  }
  const distribution = [...counts].map(([status, value]) => ({ status, count: value }))
    .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status))
  // Base plus a logarithm of the count, capped below the parent (book ¶373).
  const radius = Math.min(maxRadius, 7 + 2.4 * Math.log2(1 + runs.length))
  return {
    id,
    parentId,
    kind,
    x: round(point.x),
    y: round(point.y),
    r: round(radius),
    count: runs.length,
    memberIds: runs.map(run => run.id).sort(),
    distribution,
    attentionCount: runs.filter(run => getStatusVisual(run)?.attention).length,
  }
}

function setPosition(placement: Placement, id: string, x: number, y: number, r: number, role: SpatialRole): void {
  placement.positions.set(id, { id, x: round(x), y: round(y), r })
  placement.roles.set(id, role)
}

function finish(
  level: SpatialLevel,
  aspect: SpatialAspect,
  anchorId: string | null,
  placement: Placement,
  atlas: SpatialAtlasOrb,
  fitBounds: GraphBounds,
): SpatialLayout {
  return {
    level,
    aspect,
    anchorId,
    positions: placement.positions,
    roles: placement.roles,
    hubs: placement.hubs,
    atlas: { ...atlas, x: round(atlas.x), y: round(atlas.y) },
    clusters: placement.clusters,
    unlinkedBands: placement.bands,
    aggregatedRunIds: placement.aggregated,
    shownWithParent: placement.shownWithParent,
    fitBounds: roundBounds(fitBounds),
  }
}

function polar(cx: number, cy: number, radius: number, angle: number, stretch: { x: number; y: number }) {
  return { x: cx + Math.cos(angle) * radius * stretch.x, y: cy + Math.sin(angle) * radius * stretch.y }
}

/** The direction along a stretched ring at `angle`, turning the way the angle grows. */
function tangentAngle(angle: number, stretch: { x: number; y: number }): number {
  return Math.atan2(Math.cos(angle) * stretch.y, -Math.sin(angle) * stretch.x)
}

interface AgentGroup {
  key: string
  centre: number
  members: IntelligenceGraphNode[]
}

/**
 * Sectors for agent groups. Each workflow's agents form one contiguous sector,
 * centred on its workflow unless a neighbour's sector is in the way; then the
 * sectors are pushed apart just enough. Deterministic: a forward and a
 * backward sweep, then even spacing inside each sector.
 */
function packAgentGroups(
  groups: readonly AgentGroup[],
  step: number,
  arcStart: number,
  arcSpan: number,
  fullCircle: boolean,
): Array<{ agent: IntelligenceGraphNode; angle: number }> {
  const packed = packSectors(
    groups.map(group => group.centre),
    groups.map(group => group.members.length * step),
    arcStart,
    fullCircle ? TAU : arcSpan,
    step * 1.4,
    fullCircle,
  )
  const result: Array<{ agent: IntelligenceGraphNode; angle: number }> = []
  groups.forEach((group, index) => {
    const width = packed.widths[index]
    const memberStep = width / group.members.length
    group.members.forEach((agent, memberIndex) => {
      result.push({ agent, angle: packed.centres[index] - width / 2 + memberStep * (memberIndex + 0.5) })
    })
  })
  return result
}

/**
 * Centres for sectors of the given widths that each prefer an angle: kept in
 * angular order, `gap` apart, inside the arc (a full circle is cut open in the
 * middle of its widest gap). Squeezed evenly only if they cannot fit at all.
 */
function packSectors(
  preferred: readonly number[],
  widths: readonly number[],
  arcStart: number,
  arcSpan: number,
  gap: number,
  fullCircle: boolean,
): { centres: number[]; widths: number[] } {
  const n = preferred.length
  if (n === 0) return { centres: [], widths: [] }
  const start = fullCircle ? widestGapMiddle(preferred, arcStart) : arcStart
  const order = preferred
    .map((angle, index) => ({ index, local: normalizeInArc(angle, start) }))
    .sort((a, b) => a.local - b.local || a.index - b.index)
  const total = widths.reduce((sum, width) => sum + width, 0) + gap * (fullCircle ? n : n - 1)
  const squeeze = total > arcSpan ? arcSpan / total : 1
  const width = (rank: number) => widths[order[rank].index] * squeeze
  const separation = gap * squeeze
  const low = fullCircle ? separation / 2 : 0
  const high = fullCircle ? arcSpan - separation / 2 : arcSpan
  const placed = new Array<number>(n)
  for (let rank = 0; rank < n; rank++) {
    const wanted = Math.min(Math.max(order[rank].local, low + width(rank) / 2), high - width(rank) / 2)
    placed[rank] = rank === 0 ? wanted : Math.max(wanted, placed[rank - 1] + width(rank - 1) / 2 + separation + width(rank) / 2)
  }
  placed[n - 1] = Math.min(placed[n - 1], high - width(n - 1) / 2)
  for (let rank = n - 2; rank >= 0; rank--) {
    placed[rank] = Math.min(placed[rank], placed[rank + 1] - width(rank + 1) / 2 - separation - width(rank) / 2)
  }
  const centres = new Array<number>(n)
  const finalWidths = new Array<number>(n)
  order.forEach((entry, rank) => {
    centres[entry.index] = start + placed[rank]
    finalWidths[entry.index] = width(rank)
  })
  return { centres, widths: finalWidths }
}

/** The angle in the middle of the widest free gap between agent groups (ties: the first in arc order). */
function widestGroupGap(groups: readonly AgentGroup[], step: number, arcStart: number, arcSpan: number, fullCircle: boolean): number {
  const sectors = groups
    .map(group => ({ key: group.key, centre: normalizeInArc(group.centre, arcStart), half: (group.members.length * step) / 2 }))
    .sort((a, b) => a.centre - b.centre || a.key.localeCompare(b.key))
  let best = -Infinity
  let middle = arcSpan / 2
  const consider = (left: number, right: number) => {
    if (right - left > best + 1e-9) { best = right - left; middle = (left + right) / 2 }
  }
  if (fullCircle) {
    sectors.forEach((sector, index) => {
      const next = sectors[(index + 1) % sectors.length]
      const nextCentre = index + 1 < sectors.length ? next.centre : next.centre + TAU
      consider(sector.centre + sector.half, nextCentre - next.half)
    })
  } else {
    consider(0, sectors[0].centre - sectors[0].half)
    sectors.forEach((sector, index) => {
      const next = sectors[index + 1]
      consider(sector.centre + sector.half, next ? next.centre - next.half : arcSpan)
    })
  }
  return arcStart + middle
}

/**
 * Rows the named agents need so that no row holds more than its ring can,
 * the gaps between sectors included. Members go to rows by their place in
 * their group, so each sector stays one sector on every row.
 */
function agentRowCount(
  groups: readonly AgentGroup[],
  ring: number,
  spacing: number,
  rowGap: number,
  span: number,
  minStretch: number,
  fullCircle: boolean,
): number {
  if (groups.length === 0) return 0
  for (let rows = 1; rows < 64; rows++) {
    let fits = true
    for (let row = 0; row < rows && fits; row++) {
      const counts = groups.map(group => group.members.filter((_, index) => index % rows === row).length).filter(count => count > 0)
      const members = counts.reduce((sum, count) => sum + count, 0)
      const gaps = fullCircle ? counts.length : Math.max(0, counts.length - 1)
      fits = (members + 1.4 * gaps) * spacing <= span * (ring + row * rowGap) * minStretch + 1e-9
    }
    if (fits) return rows
  }
  return 64
}

/** Row sizes for `count` items along `angle` radians, starting at `radius`, each row `rowGap` further out. */
function packRows(count: number, radius: number, rowGap: number, angle: number, spacing: number, minStretch: number): number[] {
  const rows: number[] = []
  for (let left = count, row = 0; left > 0; row++) {
    const size = Math.min(left, Math.max(1, Math.floor((angle * (radius + row * rowGap) * minStretch) / spacing)))
    rows.push(size)
    left -= size
  }
  return rows
}

/**
 * Angles for items that each prefer an angle, kept in the given order, at least
 * `separation` apart, inside the arc. Deterministic: a forward sweep, a backward
 * sweep against the arc end, then an even spread if the arc is too short.
 */
function packOnArc(preferred: readonly number[], arcStart: number, arcSpan: number, separation: number, fullCircle: boolean): number[] {
  const n = preferred.length
  if (n === 0) return []
  // A full circle has no ends; it is cut open in the middle of its widest gap,
  // so items either side of 0° are not squeezed against each other.
  const start = fullCircle ? widestGapMiddle(preferred, arcStart) : arcStart
  const usable = fullCircle ? TAU - separation : arcSpan
  const order = preferred
    .map((angle, index) => ({ index, local: normalizeInArc(angle, start) }))
    .sort((a, b) => a.local - b.local || a.index - b.index)
  const result = new Array<number>(n)
  if (separation * (n - 1) > usable) {
    order.forEach((entry, rank) => {
      result[entry.index] = start + (fullCircle ? (rank * TAU) / n : (usable * (rank + 0.5)) / n)
    })
    return result
  }
  const placed = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    const wanted = Math.min(Math.max(order[i].local, 0), usable)
    placed[i] = i === 0 ? wanted : Math.max(wanted, placed[i - 1] + separation)
  }
  placed[n - 1] = Math.min(placed[n - 1], usable)
  for (let i = n - 2; i >= 0; i--) placed[i] = Math.min(placed[i], placed[i + 1] - separation)
  const shift = placed[0] < 0 ? -placed[0] : 0
  order.forEach((entry, rank) => { result[entry.index] = start + placed[rank] + shift })
  return result
}

function widestGapMiddle(angles: readonly number[], fallback: number): number {
  const sorted = [...angles].map(angle => normalizeInArc(angle, 0)).sort((a, b) => a - b)
  if (sorted.length < 2) return sorted.length === 1 ? sorted[0] + Math.PI : fallback
  let bestFrom = sorted[sorted.length - 1]
  let bestSize = sorted[0] + TAU - sorted[sorted.length - 1]
  for (let i = 0; i + 1 < sorted.length; i++) {
    const size = sorted[i + 1] - sorted[i]
    if (size > bestSize + 1e-9) { bestSize = size; bestFrom = sorted[i] }
  }
  return bestFrom + bestSize / 2
}

function normalizeInArc(angle: number, arcStart: number): number {
  let value = (angle - arcStart) % TAU
  if (value < 0) value += TAU
  return value
}

function boundsOfRoles(placement: Placement, roles: readonly SpatialRole[], labelAllowance: number): GraphBounds {
  const bounds: GraphBounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  for (const [id, role] of placement.roles) {
    if (!roles.includes(role) || placement.aggregated.has(id) || placement.shownWithParent.has(id)) continue
    const position = placement.positions.get(id)!
    include(bounds, circleBounds(position.x, position.y, position.r))
    include(bounds, { minX: position.x - 40, minY: position.y, maxX: position.x + 40, maxY: position.y + position.r + labelAllowance * 0.5 })
  }
  for (const cluster of placement.clusters) include(bounds, circleBounds(cluster.x, cluster.y, cluster.r + 10))
  if (!Number.isFinite(bounds.minX)) return { minX: -200, minY: -150, maxX: 200, maxY: 150 }
  return bounds
}

function circleBounds(x: number, y: number, r: number): GraphBounds {
  return { minX: x - r, minY: y - r, maxX: x + r, maxY: y + r }
}

function include(target: GraphBounds, box: GraphBounds): void {
  target.minX = Math.min(target.minX, box.minX)
  target.minY = Math.min(target.minY, box.minY)
  target.maxX = Math.max(target.maxX, box.maxX)
  target.maxY = Math.max(target.maxY, box.maxY)
}

function pad(bounds: GraphBounds, amount: number): GraphBounds {
  return { minX: bounds.minX - amount, minY: bounds.minY - amount, maxX: bounds.maxX + amount, maxY: bounds.maxY + amount }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function roundBounds(bounds: GraphBounds): GraphBounds {
  return { minX: round(bounds.minX), minY: round(bounds.minY), maxX: round(bounds.maxX), maxY: round(bounds.maxY) }
}

function byLabel(a: IntelligenceGraphNode, b: IntelligenceGraphNode): number {
  return a.label.localeCompare(b.label, 'sv') || a.id.localeCompare(b.id)
}

function byNewest(a: IntelligenceGraphNode, b: IntelligenceGraphNode): number {
  const at = typeof a.metadata?.createdAt === 'string' ? Date.parse(a.metadata.createdAt) : Number.NaN
  const bt = typeof b.metadata?.createdAt === 'string' ? Date.parse(b.metadata.createdAt) : Number.NaN
  const av = Number.isNaN(at) ? -Infinity : at
  const bv = Number.isNaN(bt) ? -Infinity : bt
  return bv - av || a.id.localeCompare(b.id)
}

function labelOf(byId: ReadonlyMap<string, IntelligenceGraphNode>, id: string): string {
  return byId.get(id)?.label ?? id
}

function isNode(value: IntelligenceGraphNode | undefined): value is IntelligenceGraphNode {
  return Boolean(value)
}
