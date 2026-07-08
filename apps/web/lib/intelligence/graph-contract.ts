/**
 * Omnira Intelligence Graph — the shared, normalized graph contract.
 *
 * Two worlds meet here and stay clearly separated:
 *   - STATIC nodes/edges  — imported from Graphify's codebase scan (source: 'graphify')
 *   - RUNTIME nodes/edges — derived from Omnira's own tables (source: 'runtime')
 *
 * Graphify's raw graph.json is an IMPORT SOURCE, never the domain model. It is
 * sanitized + validated by `graphify-import.ts` before anything reaches this shape.
 *
 * SECURITY INVARIANTS:
 *  - No absolute filesystem paths may survive normalization (repo-relative only).
 *  - metadata is data, never rendered as HTML.
 *  - Every validator here fails closed: unknown/invalid input → rejection, not passthrough.
 */

// ─── Node/edge taxonomy ───────────────────────────────────────────────────────

export type GraphSource = 'graphify' | 'runtime'

/** Static (Graphify) node kinds we accept. */
export const STATIC_NODE_KINDS = ['code', 'document', 'rationale', 'community'] as const
/** Runtime node kinds we accept — mirrors real tables only. */
export const RUNTIME_NODE_KINDS = [
  'project', 'agent', 'workflow', 'run', 'approval', 'output', 'task',
] as const

export type StaticNodeKind = (typeof STATIC_NODE_KINDS)[number]
export type RuntimeNodeKind = (typeof RUNTIME_NODE_KINDS)[number]
export type NodeKind = StaticNodeKind | RuntimeNodeKind

/** Static relations — exactly what Graphify's AST extractor emits (plus community rollup). */
export const STATIC_RELATIONS = [
  'contains', 'imports', 'imports_from', 'calls', 'indirect_call', 'references',
  're_exports', 'method', 'rationale_for', 'inherits', 'uses', 'implements',
  'member_of',
] as const

/**
 * Runtime relations — ONLY relations that can actually be derived from current
 * tables. (USED_TOOL / READ_MEMORY / RETRIED_AS intentionally absent: there is
 * no tool_calls table, no memory-per-run link and no run→run retry link yet.)
 */
export const RUNTIME_RELATIONS = [
  'CONTAINS',            // project → workflow / agent          (FK project_id)
  'DELEGATED_TO',        // workflow → agent                    (workflows.steps[].agent_id)
  'STARTED',             // workflow → run                      (runs.workflow_id)
  'PRODUCED',            // run → output                        (outputs.run_id)
  'REQUESTED_APPROVAL',  // run → approval                      (approvals.run_id)
  'TRACKS',              // manager task → run / workflow       (manager_tasks.run_id/workflow_id)
] as const

export type StaticRelation = (typeof STATIC_RELATIONS)[number]
export type RuntimeRelation = (typeof RUNTIME_RELATIONS)[number]
export type Relation = StaticRelation | RuntimeRelation

export type EdgeConfidence = 'EXTRACTED' | 'INFERRED' | 'DERIVED'

// ─── The contract ─────────────────────────────────────────────────────────────

export interface IntelligenceGraphNode {
  id: string
  kind: NodeKind
  label: string
  source: GraphSource
  /** Runtime nodes only — which Omnira project owns this node. */
  projectId?: string
  /** Runtime nodes only — status straight from the owning table. */
  status?: string
  /** Static nodes only — Graphify community id. */
  community?: number
  /** Static nodes only — repo-RELATIVE source path (absolute paths are rejected). */
  sourceFile?: string
  /** Static nodes only — e.g. "L42". */
  sourceLocation?: string
  /** Number of edges touching this node (precomputed server-side). */
  degree?: number
  metadata: Record<string, unknown>
}

export interface IntelligenceGraphEdge {
  id: string
  source: string
  target: string
  relation: Relation
  /** Runtime edges — event time where derivable (e.g. runs.created_at). */
  timestamp?: string
  confidence?: EdgeConfidence
  metadata: Record<string, unknown>
}

export interface IntelligenceGraphMeta {
  source: GraphSource
  generatedAt: string
  /** Git commit the static graph was built from (Graphify's built_at_commit). */
  builtAtCommit?: string
  nodeCount: number
  edgeCount: number
  /** Static graphs — community summaries for the Overview level. */
  communities?: CommunitySummary[]
  truncated?: boolean
}

export interface CommunitySummary {
  id: number
  label: string
  size: number
  /** Top-degree member node ids (for drill-in preview). */
  topNodes: Array<{ id: string; label: string; degree: number }>
  /** Dominant repo directory of the community's members. */
  dominantPath?: string
}

export interface IntelligenceGraph {
  meta: IntelligenceGraphMeta
  nodes: IntelligenceGraphNode[]
  edges: IntelligenceGraphEdge[]
}

// ─── Limits (fail closed on oversized/malformed input) ───────────────────────

export const LIMITS = {
  /** Hard cap on raw artifact bytes accepted by the importer/loader. */
  MAX_ARTIFACT_BYTES: 32 * 1024 * 1024,
  /** Hard cap on nodes/edges accepted from an artifact. */
  MAX_NODES: 50_000,
  MAX_EDGES: 200_000,
  /** Max nodes ever returned to the client in one response. */
  MAX_RESPONSE_NODES: 600,
  MAX_RESPONSE_EDGES: 1_500,
  MAX_LABEL_LENGTH: 200,
  MAX_ID_LENGTH: 300,
} as const

// ─── Validation & sanitization ────────────────────────────────────────────────

const NODE_KIND_SET = new Set<string>([...STATIC_NODE_KINDS, ...RUNTIME_NODE_KINDS])
const RELATION_SET = new Set<string>([...STATIC_RELATIONS, ...RUNTIME_RELATIONS])

/** Absolute or traversal-y paths must never reach the client. */
export function isSafeRelativePath(p: string): boolean {
  if (p.length === 0 || p.length > 500) return false
  if (p.startsWith('/') || p.startsWith('\\')) return false
  if (/^[a-zA-Z]:[\\/]/.test(p)) return false      // windows drive
  if (p.includes('..')) return false                // traversal
  if (p.includes('\0')) return false
  // Well-known private-path prefixes, defense in depth:
  if (/^(users|home|volumes|sessions|private|tmp)\//i.test(p)) return false
  return true
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g

/** True if the string contains C0/DEL control characters (tabs, newlines, ...). */
export function hasControlChars(s: string): boolean {
  CONTROL_CHARS.lastIndex = 0
  return CONTROL_CHARS.test(s)
}

/**
 * THE label contract - shared by importer and loader so they can never diverge.
 * Control characters are replaced with spaces (whitespace collapsed), the result
 * trimmed and length-capped. Valid Unicode passes through untouched.
 * Returns null only when nothing displayable remains.
 */
export function sanitizeLabel(v: unknown, max: number = LIMITS.MAX_LABEL_LENGTH): string | null {
  if (typeof v !== 'string') return null
  const s = v.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim()
  if (s.length === 0) return null
  return s.length > max ? s.slice(0, max) : s
}

function cleanString(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (s.length === 0 || s.length > max) return null
  if (hasControlChars(s)) return null
  return s
}

export interface NormalizeResult {
  node: IntelligenceGraphNode | null
  reason?: string
}

/** Validate + normalize one node. Fail closed: anything off → null. */
export function normalizeNode(raw: unknown): NormalizeResult {
  if (typeof raw !== 'object' || raw === null) return { node: null, reason: 'not an object' }
  const r = raw as Record<string, unknown>

  const id = cleanString(r.id, LIMITS.MAX_ID_LENGTH)
  if (!id) return { node: null, reason: 'invalid id' }

  const kind = typeof r.kind === 'string' && NODE_KIND_SET.has(r.kind) ? (r.kind as NodeKind) : null
  if (!kind) return { node: null, reason: `invalid kind: ${String(r.kind)}` }

  const label = cleanString(r.label, LIMITS.MAX_LABEL_LENGTH)
  if (!label) return { node: null, reason: 'invalid label' }

  const source = r.source === 'graphify' || r.source === 'runtime' ? r.source : null
  if (!source) return { node: null, reason: 'invalid source' }

  const node: IntelligenceGraphNode = { id, kind, label, source, metadata: {} }

  if (typeof r.projectId === 'string' && r.projectId.length <= 64) node.projectId = r.projectId
  if (typeof r.status === 'string' && r.status.length <= 40) node.status = r.status
  if (typeof r.community === 'number' && Number.isInteger(r.community) && r.community >= 0) {
    node.community = r.community
  }
  if (typeof r.degree === 'number' && Number.isFinite(r.degree) && r.degree >= 0) {
    node.degree = Math.floor(r.degree)
  }
  if (typeof r.sourceFile === 'string') {
    if (!isSafeRelativePath(r.sourceFile)) return { node: null, reason: `unsafe sourceFile: node ${id}` }
    node.sourceFile = r.sourceFile
  }
  if (typeof r.sourceLocation === 'string' && /^L\d+(-L?\d+)?$/.test(r.sourceLocation)) {
    node.sourceLocation = r.sourceLocation
  }
  if (typeof r.metadata === 'object' && r.metadata !== null && !Array.isArray(r.metadata)) {
    node.metadata = r.metadata as Record<string, unknown>
  }
  return { node }
}

/** Validate + normalize one edge against a known node-id set. Fail closed. */
export function normalizeEdge(raw: unknown, nodeIds: ReadonlySet<string>): IntelligenceGraphEdge | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>

  const source = cleanString(r.source, LIMITS.MAX_ID_LENGTH)
  const target = cleanString(r.target, LIMITS.MAX_ID_LENGTH)
  if (!source || !target) return null
  if (!nodeIds.has(source) || !nodeIds.has(target)) return null

  const relation = typeof r.relation === 'string' && RELATION_SET.has(r.relation)
    ? (r.relation as Relation)
    : null
  if (!relation) return null

  const id = cleanString(r.id, LIMITS.MAX_ID_LENGTH) ?? `${source}→${target}:${relation}`

  const edge: IntelligenceGraphEdge = { id, source, target, relation, metadata: {} }
  if (r.confidence === 'EXTRACTED' || r.confidence === 'INFERRED' || r.confidence === 'DERIVED') {
    edge.confidence = r.confidence
  }
  if (typeof r.timestamp === 'string' && !Number.isNaN(Date.parse(r.timestamp))) {
    edge.timestamp = r.timestamp
  }
  if (typeof r.metadata === 'object' && r.metadata !== null && !Array.isArray(r.metadata)) {
    edge.metadata = r.metadata as Record<string, unknown>
  }
  return edge
}

/**
 * Validate a full IntelligenceGraph payload (e.g. a stored artifact).
 * Returns the cleaned graph or throws with a precise reason — never a partial pass.
 */
export function validateIntelligenceGraph(raw: unknown): IntelligenceGraph {
  if (typeof raw !== 'object' || raw === null) throw new Error('graph: not an object')
  const g = raw as Record<string, unknown>

  if (!Array.isArray(g.nodes)) throw new Error('graph: nodes is not an array')
  if (!Array.isArray(g.edges)) throw new Error('graph: edges is not an array')
  if (g.nodes.length > LIMITS.MAX_NODES) throw new Error(`graph: too many nodes (${g.nodes.length})`)
  if (g.edges.length > LIMITS.MAX_EDGES) throw new Error(`graph: too many edges (${g.edges.length})`)

  const nodes: IntelligenceGraphNode[] = []
  const ids = new Set<string>()
  for (const rawNode of g.nodes) {
    const { node, reason } = normalizeNode(rawNode)
    if (!node) throw new Error(`graph: invalid node (${reason})`)
    if (ids.has(node.id)) continue // duplicate ids: keep first
    ids.add(node.id)
    nodes.push(node)
  }

  const edges: IntelligenceGraphEdge[] = []
  for (const rawEdge of g.edges) {
    const edge = normalizeEdge(rawEdge, ids)
    if (edge) edges.push(edge) // edges referencing unknown nodes are dropped, not fatal
  }

  const metaRaw = (typeof g.meta === 'object' && g.meta !== null ? g.meta : {}) as Record<string, unknown>
  const meta: IntelligenceGraphMeta = {
    source: metaRaw.source === 'runtime' ? 'runtime' : 'graphify',
    generatedAt:
      typeof metaRaw.generatedAt === 'string' && !Number.isNaN(Date.parse(metaRaw.generatedAt))
        ? metaRaw.generatedAt
        : new Date(0).toISOString(),
    nodeCount: nodes.length,
    edgeCount: edges.length,
  }
  if (typeof metaRaw.builtAtCommit === 'string' && /^[0-9a-f]{7,40}$/.test(metaRaw.builtAtCommit)) {
    meta.builtAtCommit = metaRaw.builtAtCommit
  }
  if (Array.isArray(metaRaw.communities)) {
    meta.communities = metaRaw.communities.filter(isValidCommunitySummary)
  }

  return { meta, nodes, edges }
}

function isValidCommunitySummary(raw: unknown): raw is CommunitySummary {
  if (typeof raw !== 'object' || raw === null) return false
  const c = raw as Record<string, unknown>
  return (
    typeof c.id === 'number' &&
    typeof c.label === 'string' && c.label.length > 0 && c.label.length <= LIMITS.MAX_LABEL_LENGTH &&
    typeof c.size === 'number' &&
    Array.isArray(c.topNodes)
  )
}
