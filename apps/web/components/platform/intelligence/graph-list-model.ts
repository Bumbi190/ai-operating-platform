import type { IntelligenceGraphEdge, IntelligenceGraphNode } from '@/lib/intelligence/graph-contract'
import { canonicalKindOrder } from './graph-readability'

export interface GraphListProject {
  id: string
  name: string
}

export interface GraphListRelation {
  edge: IntelligenceGraphEdge
  other: IntelligenceGraphNode | null
  dimmed: boolean
}

export interface GraphListRow {
  node: IntelligenceGraphNode
  relations: GraphListRelation[]
  dimmed: boolean
  outsideScope: boolean
  searchHit: boolean
}

export interface GraphListGroup {
  id: string
  label: string
  rows: GraphListRow[]
}

export interface GraphListModel {
  groups: GraphListGroup[]
  nodeIds: string[]
  edgeIds: string[]
}

export interface BuildGraphListModelInput {
  nodes: readonly IntelligenceGraphNode[]
  edges: readonly IntelligenceGraphEdge[]
  projects?: readonly GraphListProject[]
  dimmedIds?: ReadonlySet<string>
  dimmedEdgeIds?: ReadonlySet<string>
  searchHitIds?: ReadonlySet<string>
  scopeNodeIds?: ReadonlySet<string> | null
}

const UNGROUPED = '__ungrouped__'

function createdAt(node: IntelligenceGraphNode): number | null {
  const value = node.metadata?.createdAt
  if (typeof value !== 'string') return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

function compareNodes(a: IntelligenceGraphNode, b: IntelligenceGraphNode): number {
  const kind = canonicalKindOrder(a.kind) - canonicalKindOrder(b.kind)
  if (kind !== 0) return kind

  const aCreated = createdAt(a)
  const bCreated = createdAt(b)
  if (aCreated !== null || bCreated !== null) {
    if (aCreated === null) return 1
    if (bCreated === null) return -1
    if (aCreated !== bCreated) return bCreated - aCreated
  }

  return a.label.localeCompare(b.label, 'sv', { sensitivity: 'base' }) || a.id.localeCompare(b.id)
}

function compareRelations(a: GraphListRelation, b: GraphListRelation): number {
  return a.edge.relation.localeCompare(b.edge.relation)
    || (a.other?.label ?? '').localeCompare(b.other?.label ?? '', 'sv', { sensitivity: 'base' })
    || a.edge.id.localeCompare(b.edge.id)
}

/**
 * A deterministic, non-mutating projection of one already-authorized graph
 * snapshot. Nothing is fetched or inferred: rows retain the exact node and
 * edge objects supplied by `useIntelligenceGraph`.
 */
export function buildGraphListModel({
  nodes,
  edges,
  projects = [],
  dimmedIds = new Set<string>(),
  dimmedEdgeIds = new Set<string>(),
  searchHitIds = new Set<string>(),
  scopeNodeIds = null,
}: BuildGraphListModelInput): GraphListModel {
  const nodeById = new Map(nodes.map(node => [node.id, node]))
  const relationsByNode = new Map<string, GraphListRelation[]>()

  for (const edge of edges) {
    for (const [nodeId, otherId] of [[edge.source, edge.target], [edge.target, edge.source]] as const) {
      if (!nodeById.has(nodeId)) continue
      const relation: GraphListRelation = {
        edge,
        other: nodeById.get(otherId) ?? null,
        dimmed: dimmedEdgeIds.has(edge.id),
      }
      const current = relationsByNode.get(nodeId)
      if (current) current.push(relation)
      else relationsByNode.set(nodeId, [relation])
    }
  }

  const projectById = new Map(projects.map(project => [project.id, project]))
  const grouped = new Map<string, GraphListRow[]>()
  for (const node of nodes) {
    const projectId = node.projectId && projectById.has(node.projectId) ? node.projectId : UNGROUPED
    const rows = grouped.get(projectId) ?? []
    rows.push({
      node,
      relations: [...(relationsByNode.get(node.id) ?? [])].sort(compareRelations),
      dimmed: dimmedIds.has(node.id),
      outsideScope: scopeNodeIds !== null && !scopeNodeIds.has(node.id),
      searchHit: searchHitIds.has(node.id),
    })
    grouped.set(projectId, rows)
  }

  const groups: GraphListGroup[] = [...grouped.entries()].map(([id, rows]) => ({
    id,
    label: id === UNGROUPED ? 'Utan verifierat projekt' : projectById.get(id)!.name,
    rows: [...rows].sort((a, b) => compareNodes(a.node, b.node)),
  }))
  groups.sort((a, b) => {
    if (a.id === UNGROUPED) return 1
    if (b.id === UNGROUPED) return -1
    return a.label.localeCompare(b.label, 'sv', { sensitivity: 'base' }) || a.id.localeCompare(b.id)
  })

  return {
    groups,
    nodeIds: groups.flatMap(group => group.rows.map(row => row.node.id)),
    edgeIds: edges.map(edge => edge.id).sort((a, b) => a.localeCompare(b)),
  }
}
