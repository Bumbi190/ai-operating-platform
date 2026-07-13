import type {
  IntelligenceGraphEdge,
  IntelligenceGraphNode,
  NodeKind,
  Relation,
} from '@/lib/intelligence/graph-contract'
import type { PositionedNode } from './force-layout'

export type GraphAppearance = 'dark' | 'light'
export type GraphNodeShape =
  | 'circle'
  | 'community'
  | 'project'
  | 'workflow'
  | 'run'
  | 'approval'
  | 'output'
  | 'task'
  | 'code'
  | 'document'
  | 'rationale'

export interface GraphNodeVisual {
  shape: GraphNodeShape
  radius: number
  fill: string
  stroke: string
  labelPriority: number
}

export interface GraphStatusVisual {
  stroke: string
  dash?: string
  badge: string
  attention: boolean
}

export interface GraphEdgeVisual {
  stroke: string
  width: number
  opacity: number
  dash?: string
  directional: boolean
  attention: 'normal' | 'approval'
}

const KIND_VISUAL: Record<NodeKind, Omit<GraphNodeVisual, 'radius'>> = {
  community: { shape: 'community', fill: '#6366f1', stroke: '#a5b4fc', labelPriority: 900 },
  code: { shape: 'code', fill: '#818cf8', stroke: '#c7d2fe', labelPriority: 560 },
  document: { shape: 'document', fill: '#22d3ee', stroke: '#a5f3fc', labelPriority: 540 },
  rationale: { shape: 'rationale', fill: '#d4a574', stroke: '#f1d6b3', labelPriority: 520 },
  project: { shape: 'project', fill: '#8b5cf6', stroke: '#e9d5ff', labelPriority: 1000 },
  agent: { shape: 'circle', fill: '#8b5cf6', stroke: '#c4b5fd', labelPriority: 700 },
  workflow: { shape: 'workflow', fill: '#4f7fff', stroke: '#a5b4fc', labelPriority: 800 },
  run: { shape: 'run', fill: '#60a5fa', stroke: '#bfdbfe', labelPriority: 600 },
  approval: { shape: 'approval', fill: '#d4a574', stroke: '#fde68a', labelPriority: 590 },
  output: { shape: 'output', fill: '#34d399', stroke: '#a7f3d0', labelPriority: 500 },
  task: { shape: 'task', fill: '#64748b', stroke: '#cbd5e1', labelPriority: 550 },
}

const BASE_RADIUS: Record<NodeKind, number> = {
  community: 31,
  code: 12,
  document: 13,
  rationale: 12,
  project: 33,
  agent: 16,
  workflow: 20,
  run: 10,
  approval: 15,
  output: 12,
  task: 14,
}

const PROJECT_ACCENTS = ['#8b5cf6', '#22d3ee', '#d4a574', '#4f7fff', '#34d399', '#f472b6'] as const

export const GRAPH_VISUAL_TOKENS = {
  /** Canonical relative hierarchy, including roles not yet sourced by the graph contract. */
  canonicalRadius: {
    atlas: 52,
    project: BASE_RADIUS.project,
    manager: 26,
    workflow: BASE_RADIUS.workflow,
    agent: BASE_RADIUS.agent,
    approval: BASE_RADIUS.approval,
    run: BASE_RADIUS.run,
    output: BASE_RADIUS.output,
  },
  status: {
    running: '#22d3ee',
    waiting: '#fbbf24',
    approval: '#d4a574',
    completed: '#34d399',
    failed: '#f87171',
    cancelled: '#94a3b8',
    selected: '#f8fafc',
  },
  edge: {
    structural: '#64748b',
    operational: '#818cf8',
    approval: '#d4a574',
    selected: '#c7d2fe',
  },
  appearance: {
    dark: {
      canvas: '#070916',
      canvasDepth: 'rgba(49, 46, 129, 0.18)',
      label: '#cbd5e1',
      labelStrong: '#f8fafc',
      labelMuted: '#94a3b8',
      territoryLabel: '#cbd5e1',
    },
    light: {
      canvas: '#eef3f9',
      canvasDepth: 'rgba(99, 102, 241, 0.09)',
      label: '#334155',
      labelStrong: '#0f172a',
      labelMuted: '#64748b',
      territoryLabel: '#334155',
    },
  },
} as const

export function getNodeVisual(node: IntelligenceGraphNode): GraphNodeVisual {
  const base = KIND_VISUAL[node.kind]
  const degreeLift = Math.min(4, Math.log2(1 + Math.max(0, node.degree ?? 0)) * 0.55)
  return { ...base, radius: BASE_RADIUS[node.kind] + degreeLift }
}

/** Static node-role priority. Interaction and attention overlays belong to readability policy. */
export function getStaticLabelPriority(node: IntelligenceGraphNode): number {
  return KIND_VISUAL[node.kind].labelPriority
}

/** Identity color only. Runtime status is rendered as a separate visual layer. */
export function nodeColor(node: IntelligenceGraphNode): string {
  if (node.kind === 'project') return projectAccent(node)
  return KIND_VISUAL[node.kind].fill
}

export function getStatusVisual(node: IntelligenceGraphNode): GraphStatusVisual | null {
  const status = node.status?.toLowerCase()
  if (!status) return null

  if (node.kind === 'approval') {
    if (status === 'pending' || status === 'awaiting_approval' || status === 'needs_input') {
      return { stroke: GRAPH_VISUAL_TOKENS.status.approval, dash: '5 3', badge: 'A', attention: true }
    }
    if (status === 'approved') {
      return { stroke: GRAPH_VISUAL_TOKENS.status.completed, badge: '✓', attention: false }
    }
    if (status === 'rejected' || status === 'returned' || status === 'revised') {
      return { stroke: GRAPH_VISUAL_TOKENS.status.cancelled, dash: '3 3', badge: '×', attention: false }
    }
  }

  if (status === 'failed') {
    return { stroke: GRAPH_VISUAL_TOKENS.status.failed, dash: '7 4', badge: '!', attention: true }
  }
  if (status === 'awaiting_approval' || status === 'pending') {
    return { stroke: GRAPH_VISUAL_TOKENS.status.waiting, dash: '5 3', badge: '…', attention: true }
  }
  if (status === 'running') {
    return { stroke: GRAPH_VISUAL_TOKENS.status.running, badge: '▶', attention: false }
  }
  if (status === 'done' || status === 'completed') {
    return { stroke: GRAPH_VISUAL_TOKENS.status.completed, badge: '✓', attention: false }
  }
  if (status === 'cancelled' || status === 'inactive' || status === 'rejected') {
    return { stroke: GRAPH_VISUAL_TOKENS.status.cancelled, dash: '3 3', badge: '×', attention: false }
  }
  if (status === 'active') {
    return { stroke: GRAPH_VISUAL_TOKENS.status.completed, badge: '•', attention: false }
  }
  return null
}

const EDGE_VISUALS: Partial<Record<Relation, GraphEdgeVisual>> = {
  contains: edge('structural', 0.9, 0.28, false),
  member_of: edge('structural', 0.9, 0.28, false),
  imports: edge('structural', 1, 0.34, true),
  imports_from: edge('structural', 1, 0.34, true),
  calls: edge('operational', 1.15, 0.4, true),
  indirect_call: edge('operational', 1, 0.32, true, '4 4'),
  references: edge('structural', 0.9, 0.28, true, '3 4'),
  re_exports: edge('structural', 0.9, 0.3, true),
  method: edge('structural', 0.85, 0.24, false),
  rationale_for: edge('structural', 1, 0.32, true, '2 4'),
  inherits: edge('operational', 1.15, 0.38, true),
  uses: edge('structural', 1, 0.32, true, '3 3'),
  implements: edge('operational', 1.1, 0.36, true),
  CONTAINS: edge('structural', 1.15, 0.42, false),
  DELEGATED_TO: edge('operational', 1.35, 0.55, true),
  STARTED: edge('operational', 1.5, 0.62, true),
  PRODUCED: edge('operational', 1.2, 0.48, true),
  REQUESTED_APPROVAL: edge('approval', 1.7, 0.78, true, '5 3'),
  TRACKS: edge('structural', 1, 0.36, true, '2 4'),
}

export function getEdgeVisual(edgeValue: IntelligenceGraphEdge): GraphEdgeVisual {
  const visual = EDGE_VISUALS[edgeValue.relation] ?? edge('structural', 0.9, 0.28, false)
  if (edgeValue.confidence !== 'INFERRED') return visual
  return { ...visual, dash: visual.dash ?? '4 4', opacity: visual.opacity * 0.82 }
}

export function stableGroupId(value: string): number {
  return stableHash(value) % 10_000
}

export function projectAccent(node: IntelligenceGraphNode): string {
  const explicit = node.metadata?.color
  if (typeof explicit === 'string' && /^#[\da-f]{6}$/i.test(explicit)) return explicit
  return PROJECT_ACCENTS[stableHash(node.projectId ?? node.id) % PROJECT_ACCENTS.length]
}

export interface ProjectTerritory {
  id: string
  label: string
  color: string
  cx: number
  cy: number
  rx: number
  ry: number
}

/** Quiet, deterministic visual grouping from verified projectId membership only. */
export function buildProjectTerritories(
  nodes: IntelligenceGraphNode[],
  layout: ReadonlyMap<string, PositionedNode>,
): ProjectTerritory[] {
  const groups = new Map<string, IntelligenceGraphNode[]>()
  for (const node of nodes) {
    if (!node.projectId) continue
    const members = groups.get(node.projectId) ?? []
    members.push(node)
    groups.set(node.projectId, members)
  }

  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).flatMap(([projectId, members]) => {
    const positioned = members.map(node => ({ node, position: layout.get(node.id) })).filter(
      (entry): entry is { node: IntelligenceGraphNode; position: PositionedNode } => Boolean(entry.position),
    )
    if (positioned.length === 0) return []

    const hub = members.find(node => node.kind === 'project')
    const color = hub ? projectAccent(hub) : PROJECT_ACCENTS[stableHash(projectId) % PROJECT_ACCENTS.length]
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const { position } of positioned) {
      minX = Math.min(minX, position.x - position.r)
      minY = Math.min(minY, position.y - position.r)
      maxX = Math.max(maxX, position.x + position.r)
      maxY = Math.max(maxY, position.y + position.r)
    }

    const padX = 44
    const padY = 38
    const width = Math.max(140, maxX - minX + padX * 2)
    const height = Math.max(110, maxY - minY + padY * 2)
    return [{
      id: projectId,
      label: hub?.label ?? `Project ${projectId.slice(0, 8)}`,
      color,
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      rx: width / 2,
      ry: height / 2,
    }]
  })
}

function edge(
  family: 'structural' | 'operational' | 'approval',
  width: number,
  opacity: number,
  directional: boolean,
  dash?: string,
): GraphEdgeVisual {
  return {
    stroke: GRAPH_VISUAL_TOKENS.edge[family],
    width,
    opacity,
    directional,
    dash,
    attention: family === 'approval' ? 'approval' : 'normal',
  }
}

function stableHash(value: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}
