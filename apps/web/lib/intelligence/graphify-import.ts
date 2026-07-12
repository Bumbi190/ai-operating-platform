/**
 * Graphify import — turns Graphify's raw graph.json into a sanitized
 * IntelligenceGraph artifact.
 *
 * Graphify's output is an IMPORT SOURCE, not Omnira's domain model. This module
 * is the only place that understands Graphify's shape, and it fails closed:
 * oversized input, unknown structure, absolute paths or secret-looking strings
 * abort the import rather than passing through.
 *
 * Runs server-side / in scripts only. Never ship raw graphify-out/ to a client,
 * and never render Graphify's generated graph.html.
 */

import {
  LIMITS,
  hasControlChars,
  isSafeRelativePath,
  sanitizeLabel,
  type CommunitySummary,
  type IntelligenceGraph,
  type IntelligenceGraphEdge,
  type IntelligenceGraphNode,
  type StaticNodeKind,
  STATIC_RELATIONS,
} from './graph-contract'

// ─── Raw Graphify shapes (observed from graphify 0.9.x output) ───────────────

interface RawGraphifyNode {
  id?: unknown
  label?: unknown
  file_type?: unknown       // 'code' | 'document' | 'rationale'
  source_file?: unknown
  source_location?: unknown
  community?: unknown
}

interface RawGraphifyLink {
  source?: unknown
  target?: unknown
  relation?: unknown
  confidence?: unknown       // 'EXTRACTED' | 'INFERRED'
  source_file?: unknown
  source_location?: unknown
  weight?: unknown
}

const STATIC_RELATION_SET = new Set<string>(STATIC_RELATIONS)
const FILE_TYPE_TO_KIND: Record<string, StaticNodeKind> = {
  code: 'code',
  document: 'document',
  rationale: 'rationale',
}

/** Patterns that must never appear in an artifact we serve. */
const SECRET_PATTERNS: RegExp[] = [
  /sk-ant-[a-zA-Z0-9-_]{10,}/,
  /sk-[a-zA-Z0-9]{20,}/,
  /eyJhbGciOi[A-Za-z0-9_-]{20,}/,                  // JWTs (supabase keys)
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /AKIA[0-9A-Z]{16}/,                              // AWS access key id
  /(password|secret|api[_-]?key)\s*[=:]\s*['"][^'"]{8,}['"]/i,
]

export interface ImportIssue {
  severity: 'fatal' | 'dropped'
  reason: string
  count: number
}

export interface ImportResult {
  graph: IntelligenceGraph
  issues: ImportIssue[]
  droppedNodes: number
  droppedEdges: number
}

/**
 * Parse + sanitize a raw Graphify graph.json string.
 * Throws on fatal problems (oversized, malformed, secret material found).
 */
export function importGraphifyGraph(rawJson: string): ImportResult {
  if (Buffer.byteLength(rawJson, 'utf8') > LIMITS.MAX_ARTIFACT_BYTES) {
    throw new Error(`graphify import: artifact exceeds ${LIMITS.MAX_ARTIFACT_BYTES} bytes`)
  }

  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(rawJson)) {
      throw new Error(`graphify import: secret-like content matched ${pattern} — refusing to import`)
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawJson)
  } catch {
    throw new Error('graphify import: not valid JSON')
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('graphify import: root is not an object')
  }
  const root = parsed as Record<string, unknown>

  const rawNodes = root.nodes
  const rawLinks = root.links ?? root.edges
  if (!Array.isArray(rawNodes)) throw new Error('graphify import: nodes missing')
  if (!Array.isArray(rawLinks)) throw new Error('graphify import: links missing')
  if (rawNodes.length > LIMITS.MAX_NODES) throw new Error(`graphify import: ${rawNodes.length} nodes exceeds cap`)
  if (rawLinks.length > LIMITS.MAX_EDGES) throw new Error(`graphify import: ${rawLinks.length} links exceeds cap`)

  const issues = new Map<string, ImportIssue>()
  const drop = (reason: string) => {
    const existing = issues.get(reason)
    if (existing) existing.count += 1
    else issues.set(reason, { severity: 'dropped', reason, count: 1 })
  }

  // ── Nodes ──
  const nodes: IntelligenceGraphNode[] = []
  const ids = new Set<string>()
  for (const raw of rawNodes as RawGraphifyNode[]) {
    const id = typeof raw.id === 'string' ? raw.id.trim() : ''
    if (!id || id.length > LIMITS.MAX_ID_LENGTH) { drop('invalid node id'); continue }
    // Ids must be stable references — never sanitized, only rejected (H1).
    if (hasControlChars(id)) { drop('node id contains control characters'); continue }
    if (ids.has(id)) { drop('duplicate node id'); continue }

    // Same label contract as the loader (graph-contract.sanitizeLabel): control
    // characters become spaces so ONE odd symbol can never invalidate the whole
    // artifact at load time; unsalvageable labels drop just that node (H1).
    const label = sanitizeLabel(raw.label)
    if (!label) { drop('unsanitizable node label'); continue }

    const kind = typeof raw.file_type === 'string' ? FILE_TYPE_TO_KIND[raw.file_type] : undefined
    if (!kind) { drop(`unknown file_type: ${String(raw.file_type)}`); continue }

    const node: IntelligenceGraphNode = {
      id,
      kind,
      label,
      source: 'graphify',
      metadata: {},
    }

    if (typeof raw.source_file === 'string' && raw.source_file.length > 0) {
      if (!isSafeRelativePath(raw.source_file)) {
        // An absolute/private path here means the scan leaked machine paths —
        // that is a fatal condition, not a droppable row.
        throw new Error(`graphify import: unsafe source path on node ${id} — refusing to import`)
      }
      node.sourceFile = raw.source_file
    }
    if (typeof raw.source_location === 'string' && /^L\d+(-L?\d+)?$/.test(raw.source_location)) {
      node.sourceLocation = raw.source_location
    }
    if (typeof raw.community === 'number' && Number.isInteger(raw.community) && raw.community >= 0) {
      node.community = raw.community
    }

    ids.add(id)
    nodes.push(node)
  }

  // ── Edges ──
  const edges: IntelligenceGraphEdge[] = []
  const seenEdgeIds = new Set<string>()
  for (const raw of rawLinks as RawGraphifyLink[]) {
    const source = typeof raw.source === 'string' ? raw.source : ''
    const target = typeof raw.target === 'string' ? raw.target : ''
    if (!source || !target || !ids.has(source) || !ids.has(target)) { drop('edge endpoint unknown'); continue }

    const relation = typeof raw.relation === 'string' && STATIC_RELATION_SET.has(raw.relation)
      ? raw.relation
      : null
    if (!relation) { drop(`unknown relation: ${String(raw.relation)}`); continue }

    const id = `${source}→${target}:${relation}`
    if (seenEdgeIds.has(id)) { drop('duplicate edge'); continue }
    seenEdgeIds.add(id)

    edges.push({
      id,
      source,
      target,
      relation: relation as IntelligenceGraphEdge['relation'],
      // M4 — never inflate confidence: only a literal 'EXTRACTED' keeps the
      // highest tier; 'INFERRED' stays; unknown/missing falls to the LOWEST
      // safe supported value (the contract has no 'AMBIGUOUS' tier).
      confidence: raw.confidence === 'EXTRACTED' ? 'EXTRACTED' : 'INFERRED',
      metadata: typeof raw.weight === 'number' ? { weight: raw.weight } : {},
    })
  }

  // ── Degree ──
  const degree = new Map<string, number>()
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1)
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1)
  }
  for (const n of nodes) n.degree = degree.get(n.id) ?? 0

  // ── Community summaries (Overview level) ──
  const communities = summarizeCommunities(nodes)

  const builtAtCommit =
    typeof root.built_at_commit === 'string' && /^[0-9a-f]{7,40}$/.test(root.built_at_commit)
      ? root.built_at_commit
      : undefined

  const graph: IntelligenceGraph = {
    meta: {
      source: 'graphify',
      generatedAt: new Date().toISOString(),
      builtAtCommit,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      communities,
    },
    nodes,
    edges,
  }

  const droppedNodes = [...issues.values()].filter(i => i.reason.includes('node')).reduce((a, i) => a + i.count, 0)
  const droppedEdges = [...issues.values()].filter(i => i.reason.includes('edge') || i.reason.includes('relation')).reduce((a, i) => a + i.count, 0)

  return { graph, issues: [...issues.values()], droppedNodes, droppedEdges }
}

/**
 * Build human-readable community summaries without an LLM:
 * label = dominant repo directory + highest-degree member.
 */
export function summarizeCommunities(nodes: IntelligenceGraphNode[]): CommunitySummary[] {
  const byCommunity = new Map<number, IntelligenceGraphNode[]>()
  for (const n of nodes) {
    if (typeof n.community !== 'number') continue
    const list = byCommunity.get(n.community)
    if (list) list.push(n)
    else byCommunity.set(n.community, [n])
  }

  const summaries: CommunitySummary[] = []
  for (const [id, members] of byCommunity) {
    const dirCounts = new Map<string, number>()
    for (const m of members) {
      if (!m.sourceFile) continue
      const dir = m.sourceFile.split('/').slice(0, 4).join('/')
      dirCounts.set(dir, (dirCounts.get(dir) ?? 0) + 1)
    }
    const dominantPath = [...dirCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]

    const topNodes = [...members]
      .sort((a, b) => (b.degree ?? 0) - (a.degree ?? 0))
      .slice(0, 5)
      .map(n => ({ id: n.id, label: n.label, degree: n.degree ?? 0 }))

    const anchor = topNodes[0]?.label
    const label = dominantPath && anchor
      ? `${dominantPath} · ${anchor}`
      : anchor ?? `Community ${id}`

    summaries.push({
      id,
      label: label.slice(0, LIMITS.MAX_LABEL_LENGTH),
      size: members.length,
      topNodes,
      dominantPath,
    })
  }

  return summaries.sort((a, b) => b.size - a.size)
}
