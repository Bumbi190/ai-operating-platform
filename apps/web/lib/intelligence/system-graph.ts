/**
 * System Map server loader — reads the sanitized local artifact
 * (data/intelligence/system-graph.json, produced by scripts/import-system-graph.ts),
 * validates it and serves progressive levels of detail:
 *
 *   overview  — one supernode per community (plus inter-community edge bundles)
 *   community — the full subgraph of ONE community + its boundary edges
 *   search    — compact node index for client-side search
 *
 * Never returns more than LIMITS.MAX_RESPONSE_* items. Fails closed on missing,
 * malformed or oversized artifacts (caller maps that to an honest empty state).
 */

import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  LIMITS,
  validateIntelligenceGraph,
  type IntelligenceGraph,
  type IntelligenceGraphEdge,
  type IntelligenceGraphNode,
} from './graph-contract'

const ARTIFACT_PATH = join(process.cwd(), 'data/intelligence/system-graph.json')

// Module-level cache keyed by mtime — the artifact only changes on re-import.
let cache: { mtimeMs: number; graph: IntelligenceGraph } | null = null

export type SystemGraphStatus =
  | { ok: true; graph: IntelligenceGraph }
  | { ok: false; reason: 'missing' | 'invalid' | 'oversized' }

export function loadSystemGraph(): SystemGraphStatus {
  let mtimeMs: number
  let size: number
  try {
    const st = statSync(ARTIFACT_PATH)
    mtimeMs = st.mtimeMs
    size = st.size
  } catch {
    return { ok: false, reason: 'missing' }
  }
  if (size > LIMITS.MAX_ARTIFACT_BYTES) return { ok: false, reason: 'oversized' }
  if (cache && cache.mtimeMs === mtimeMs) return { ok: true, graph: cache.graph }

  try {
    const raw = readFileSync(ARTIFACT_PATH, 'utf8')
    const graph = validateIntelligenceGraph(JSON.parse(raw))
    cache = { mtimeMs, graph }
    return { ok: true, graph }
  } catch {
    return { ok: false, reason: 'invalid' }
  }
}

/**
 * M1 — the full community catalogue (~280 summaries) belongs ONLY in the
 * overview response. Drilldown/neighborhood responses reuse meta (commit,
 * counts, timestamps) but must not re-ship the catalogue on every request.
 */
function metaWithoutCommunities(meta: IntelligenceGraph['meta']): IntelligenceGraph['meta'] {
  const { communities: _communities, ...rest } = meta
  return rest
}

// ─── Level: overview ──────────────────────────────────────────────────────────

export interface OverviewResponse {
  level: 'overview'
  meta: IntelligenceGraph['meta']
  nodes: IntelligenceGraphNode[]
  edges: IntelligenceGraphEdge[]
}

/** Communities smaller than this fold into a single "smått & spritt" supernode. */
const MIN_COMMUNITY_SIZE = 12
const MAX_OVERVIEW_COMMUNITIES = 48

export function buildOverview(graph: IntelligenceGraph): OverviewResponse {
  const communities = (graph.meta.communities ?? [])
    .filter(c => c.size >= MIN_COMMUNITY_SIZE)
    .slice(0, MAX_OVERVIEW_COMMUNITIES)
  const communityIds = new Set(communities.map(c => c.id))

  const nodeCommunity = new Map<string, number>()
  for (const n of graph.nodes) {
    if (typeof n.community === 'number') nodeCommunity.set(n.id, n.community)
  }

  // Supernodes
  const nodes: IntelligenceGraphNode[] = communities.map(c => ({
    id: `community:${c.id}`,
    kind: 'community',
    label: c.label,
    source: 'graphify',
    community: c.id,
    degree: c.size,
    metadata: {
      size: c.size,
      topNodes: c.topNodes,
      dominantPath: c.dominantPath,
    },
  }))

  // Bundle inter-community edges: (a,b) → weight = count
  const bundles = new Map<string, { a: number; b: number; count: number }>()
  for (const e of graph.edges) {
    const ca = nodeCommunity.get(e.source)
    const cb = nodeCommunity.get(e.target)
    if (ca === undefined || cb === undefined || ca === cb) continue
    if (!communityIds.has(ca) || !communityIds.has(cb)) continue
    const [a, b] = ca < cb ? [ca, cb] : [cb, ca]
    const key = `${a}|${b}`
    const existing = bundles.get(key)
    if (existing) existing.count += 1
    else bundles.set(key, { a, b, count: 1 })
  }

  const edges: IntelligenceGraphEdge[] = [...bundles.values()]
    .sort((x, y) => y.count - x.count)
    .slice(0, LIMITS.MAX_RESPONSE_EDGES)
    .map(({ a, b, count }) => ({
      id: `community:${a}→community:${b}`,
      source: `community:${a}`,
      target: `community:${b}`,
      relation: 'references' as const,
      confidence: 'DERIVED' as const,
      metadata: { bundledEdges: count },
    }))

  return { level: 'overview', meta: graph.meta, nodes, edges }
}

// ─── Level: community drilldown ───────────────────────────────────────────────

export interface CommunityResponse {
  level: 'community'
  communityId: number
  meta: IntelligenceGraph['meta']
  nodes: IntelligenceGraphNode[]
  edges: IntelligenceGraphEdge[]
  truncated: boolean
}

export function buildCommunityView(graph: IntelligenceGraph, communityId: number): CommunityResponse {
  const memberIds = new Set<string>()
  let members = graph.nodes.filter(n => n.community === communityId)

  let truncated = false
  if (members.length > LIMITS.MAX_RESPONSE_NODES) {
    truncated = true
    members = [...members]
      .sort((a, b) => (b.degree ?? 0) - (a.degree ?? 0))
      .slice(0, LIMITS.MAX_RESPONSE_NODES)
  }
  for (const m of members) memberIds.add(m.id)

  const edges = graph.edges
    .filter(e => memberIds.has(e.source) && memberIds.has(e.target))
    .slice(0, LIMITS.MAX_RESPONSE_EDGES)

  return {
    level: 'community',
    communityId,
    meta: metaWithoutCommunities(graph.meta),
    nodes: members,
    edges,
    truncated,
  }
}

// ─── Node neighborhood (inspector) ────────────────────────────────────────────

export interface NeighborhoodResponse {
  level: 'neighborhood'
  center: IntelligenceGraphNode
  nodes: IntelligenceGraphNode[]
  edges: IntelligenceGraphEdge[]
  meta: IntelligenceGraph['meta']
}

export function buildNeighborhood(graph: IntelligenceGraph, nodeId: string): NeighborhoodResponse | null {
  const center = graph.nodes.find(n => n.id === nodeId)
  if (!center) return null

  const edges = graph.edges
    .filter(e => e.source === nodeId || e.target === nodeId)
    .slice(0, LIMITS.MAX_RESPONSE_EDGES)

  const neighborIds = new Set<string>([nodeId])
  for (const e of edges) {
    neighborIds.add(e.source)
    neighborIds.add(e.target)
  }
  const nodes = graph.nodes
    .filter(n => neighborIds.has(n.id))
    .slice(0, LIMITS.MAX_RESPONSE_NODES)

  return { level: 'neighborhood', center, nodes, edges, meta: metaWithoutCommunities(graph.meta) }
}

// ─── Search index ─────────────────────────────────────────────────────────────

export interface SearchHit {
  id: string
  label: string
  kind: string
  community?: number
  sourceFile?: string
  degree?: number
}

export function searchNodes(graph: IntelligenceGraph, query: string, limit = 30): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []

  const hits: Array<SearchHit & { score: number }> = []
  for (const n of graph.nodes) {
    const label = n.label.toLowerCase()
    const file = n.sourceFile?.toLowerCase() ?? ''
    let score = -1
    if (label === q) score = 100
    else if (label.startsWith(q)) score = 60
    else if (label.includes(q)) score = 30
    else if (file.includes(q)) score = 15
    if (score < 0) continue
    hits.push({
      id: n.id, label: n.label, kind: n.kind, community: n.community,
      sourceFile: n.sourceFile, degree: n.degree, score: score + Math.min(n.degree ?? 0, 20) / 20,
    })
  }
  return hits
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score: _score, ...hit }) => hit)
}
