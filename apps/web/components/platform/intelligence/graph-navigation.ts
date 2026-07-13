import type { IntelligenceGraphEdge, IntelligenceGraphNode } from '@/lib/intelligence/graph-contract'
import { getStaticLabelPriority, getStatusVisual } from './graph-visuals'
import type { GraphZoomLevel } from './graph-readability'

export type GraphDrilldownKind = 'project' | 'workflow' | 'agent' | 'run' | 'community'

export interface GraphScope {
  kind: GraphDrilldownKind
  rootId: string
  label: string
  nodeIds: ReadonlySet<string>
  projectId?: string
}

export interface DenseViewSummary {
  id: string
  category: 'runs'
  parentId: string
  projectId: string
  memberIds: readonly string[]
  count: number
  attentionCount: number
  label: string
}

export interface GraphFilterState {
  matchingIds: ReadonlySet<string>
  dimmedIds: ReadonlySet<string>
  matchCount: number
  criticalOutsideFilters: number
}

export interface GraphFilterInput {
  kinds: ReadonlySet<string>
  statuses: ReadonlySet<string>
}

/**
 * Builds a local, read-only drilldown scope from nodes already present in the
 * authenticated payload. It never fetches or manufactures an entity.
 */
export function buildDrilldownScope(
  root: IntelligenceGraphNode,
  nodes: readonly IntelligenceGraphNode[],
  edges: readonly IntelligenceGraphEdge[],
): GraphScope | null {
  if (!['project', 'workflow', 'agent', 'run', 'community'].includes(root.kind)) return null

  if (root.kind === 'project') {
    if (!root.projectId) return null
    return {
      kind: 'project', rootId: root.id, label: root.label, projectId: root.projectId,
      nodeIds: new Set(nodes.filter(node => node.projectId === root.projectId).map(node => node.id)),
    }
  }

  if (root.kind === 'community') {
    if (typeof root.community !== 'number') return null
    return {
      kind: 'community', rootId: root.id, label: root.label,
      nodeIds: new Set(nodes.filter(node => node.community === root.community).map(node => node.id)),
    }
  }

  const nodeById = new Map(nodes.map(node => [node.id, node]))
  const projectId = root.projectId
  const inProject = (id: string) => {
    const node = nodeById.get(id)
    return Boolean(node && (!projectId || node.projectId === projectId))
  }
  const direct = adjacentIds(root.id, edges, inProject)
  const ids = new Set<string>([root.id, ...direct])

  if (root.kind === 'run') {
    // A run path may expand through its workflow to real assigned agents, but
    // must never absorb sibling runs merely because they share that workflow.
    for (const id of direct) {
      if (nodeById.get(id)?.kind !== 'workflow') continue
      for (const neighbor of adjacentIds(id, edges, inProject)) {
        const kind = nodeById.get(neighbor)?.kind
        if (kind !== 'run' || neighbor === root.id) ids.add(neighbor)
      }
    }
  } else {
    // Workflow and agent drilldown uses two truthful relation hops.
    for (const id of direct) {
      for (const neighbor of adjacentIds(id, edges, inProject)) ids.add(neighbor)
    }
  }

  return {
    kind: root.kind as 'workflow' | 'agent' | 'run',
    rootId: root.id,
    label: root.label,
    projectId,
    nodeIds: ids,
  }
}

/**
 * Run summaries are visual annotations on their real workflow parent. The
 * membership source is exclusively STARTED edges plus same-project nodes.
 */
export function buildDenseViewSummaries(
  nodes: readonly IntelligenceGraphNode[],
  edges: readonly IntelligenceGraphEdge[],
  zoomLevel: GraphZoomLevel,
): DenseViewSummary[] {
  if (zoomLevel === 'detail' || zoomLevel === 'execution') return []

  const nodeById = new Map(nodes.map(node => [node.id, node]))
  const groups = new Map<string, { workflow: IntelligenceGraphNode; runs: IntelligenceGraphNode[] }>()
  for (const edge of edges) {
    if (edge.relation !== 'STARTED') continue
    const workflow = nodeById.get(edge.source)
    const run = nodeById.get(edge.target)
    if (!workflow || !run || workflow.kind !== 'workflow' || run.kind !== 'run') continue
    if (!workflow.projectId || workflow.projectId !== run.projectId) continue
    const group = groups.get(workflow.id) ?? { workflow, runs: [] }
    group.runs.push(run)
    groups.set(workflow.id, group)
  }

  return [...groups.values()]
    .filter(group => group.runs.length > 1)
    .sort((a, b) => a.workflow.id.localeCompare(b.workflow.id))
    .map(({ workflow, runs }) => {
      const memberIds = runs.map(run => run.id).sort()
      const attentionCount = runs.filter(run => getStatusVisual(run)?.attention).length
      return {
        id: `summary:runs:${workflow.id}`,
        category: 'runs' as const,
        parentId: workflow.id,
        projectId: workflow.projectId!,
        memberIds,
        count: memberIds.length,
        attentionCount,
        label: `${memberIds.length} runs${attentionCount ? ` · ${attentionCount} attention` : ''}`,
      }
    })
}

/** Deterministic search over the caller-provided, already scoped payload. */
export function searchScopedNodes(
  nodes: readonly IntelligenceGraphNode[],
  query: string,
  limit = 30,
): IntelligenceGraphNode[] {
  const normalized = query.trim().toLocaleLowerCase()
  if (normalized.length < 2) return []
  return nodes
    .flatMap(node => {
      const label = node.label.toLocaleLowerCase()
      const id = node.id.toLocaleLowerCase()
      const score = label === normalized ? 100
        : label.startsWith(normalized) ? 70
          : label.includes(normalized) ? 40
            : id.includes(normalized) ? 10
              : -1
      return score < 0 ? [] : [{ node, score }]
    })
    .sort((a, b) => b.score - a.score
      || getStaticLabelPriority(b.node) - getStaticLabelPriority(a.node)
      || (b.node.degree ?? 0) - (a.node.degree ?? 0)
      || a.node.id.localeCompare(b.node.id))
    .slice(0, limit)
    .map(result => result.node)
}

/**
 * Filters dim non-matches so the deterministic layout and mental map remain
 * intact. Critical truth remains fully visible and is counted when outside the
 * active filter result.
 */
export function computeGraphFilterState(
  nodes: readonly IntelligenceGraphNode[],
  input: GraphFilterInput,
): GraphFilterState {
  const active = input.kinds.size > 0 || input.statuses.size > 0
  if (!active) {
    const all = new Set(nodes.map(node => node.id))
    return { matchingIds: all, dimmedIds: new Set(), matchCount: nodes.length, criticalOutsideFilters: 0 }
  }

  const matchingIds = new Set<string>()
  const dimmedIds = new Set<string>()
  let matchCount = 0
  let criticalOutsideFilters = 0
  for (const node of nodes) {
    const kindMatch = input.kinds.size === 0 || input.kinds.has(node.kind)
    const statusMatch = input.statuses.size === 0
      || node.kind !== 'run'
      || Boolean(node.status && input.statuses.has(node.status))
    if (kindMatch && statusMatch) {
      matchingIds.add(node.id)
      const countedMatch = input.kinds.size > 0
        ? kindMatch
        : input.statuses.size > 0
          ? node.kind === 'run' && statusMatch
          : true
      if (countedMatch) matchCount += 1
    }
    else if (getStatusVisual(node)?.attention) criticalOutsideFilters += 1
    else dimmedIds.add(node.id)
  }
  return { matchingIds, dimmedIds, matchCount, criticalOutsideFilters }
}

function adjacentIds(
  nodeId: string,
  edges: readonly IntelligenceGraphEdge[],
  include: (id: string) => boolean,
): string[] {
  const ids = new Set<string>()
  for (const edge of edges) {
    if (edge.source === nodeId && include(edge.target)) ids.add(edge.target)
    if (edge.target === nodeId && include(edge.source)) ids.add(edge.source)
  }
  return [...ids].sort()
}
