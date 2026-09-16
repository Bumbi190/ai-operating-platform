/**
 * Intelligence Graph (vNext) — the client-safe vocabulary.
 *
 * Words, counts and classifications only. Nothing here fetches, and nothing
 * here widens what the graph routes return: every function reads the payload
 * `/api/intelligence/graph/*` already sends and decides how much of it can be
 * SAID truthfully.
 *
 * THE RULE THIS FILE EXISTS FOR. A relation is never shown with more certainty
 * than its source supports. Today's builder (`lib/intelligence/operations-graph.ts`)
 * labels every runtime edge `DERIVED`, including the ones that are a stored
 * foreign key, and names a definition-time reference `DELEGATED_TO` and a
 * `runs.workflow_id` column `STARTED`. The API keys stay as they are — changing
 * them is a builder change and belongs to T2. The vNext surface classifies each
 * relation by what the builder actually reads, and words it accordingly:
 *
 *   direct      a stored reference: a foreign-key column the builder joins on
 *               (`agents.project_id`, `runs.workflow_id`, `outputs.run_id`,
 *               `approvals.run_id`, `manager_tasks.run_id/workflow_id`), or an
 *               edge Graphify extracted from the code itself (`EXTRACTED`).
 *   definition  named in a CURRENT definition — `workflows.steps[].agent_id`.
 *               No foreign key, no as-of date, and no evidence the agent ran.
 *   derived     computed rather than stored: Graphify's `INFERRED` edges, the
 *               overview's bundled community counts, and anything unknown.
 *
 * A class is only ever LOWERED by the payload, never raised: `INFERRED` wins
 * over any relation name, and a relation this file does not know is derived.
 * `lib/qa/vnext-intelligence-graph.test.ts` pins the builder lines each class
 * is based on, so a builder change fails the suite instead of silently making
 * these words wrong.
 */

import type {
  IntelligenceGraphEdge,
  IntelligenceGraphMeta,
  IntelligenceGraphNode,
  NodeKind,
} from '@/lib/intelligence/graph-contract'
import { RUN_STATE_LABELS, UNKNOWN_RUN_STATE_LABEL } from '@/lib/os/activity-shared'
import { STATUS_LABELS as APPROVAL_STATUS_LABELS, UNKNOWN_STATUS_LABEL } from '@/lib/os/review-queue-shared'

// ── Relation truth ──────────────────────────────────────────────────────────

export type RelationTruth = 'direct' | 'definition' | 'derived'

/** Display order: most certain first. */
export const RELATION_TRUTHS: readonly RelationTruth[] = ['direct', 'definition', 'derived']

/** Runtime relations the builder derives from a foreign-key column. */
const STORED_REFERENCE_RELATIONS: ReadonlySet<string> = new Set([
  'CONTAINS',            // agents.project_id, workflows.project_id
  'STARTED',             // runs.workflow_id
  'PRODUCED',            // outputs.run_id
  'REQUESTED_APPROVAL',  // approvals.run_id
  'TRACKS',              // manager_tasks.run_id / manager_tasks.workflow_id
])

/** Runtime relations read from a current definition, not from a stored link. */
const DEFINITION_RELATIONS: ReadonlySet<string> = new Set([
  'DELEGATED_TO',        // workflows.steps[].agent_id
])

export function relationTruth(
  edge: Pick<IntelligenceGraphEdge, 'relation' | 'confidence' | 'metadata'>,
): RelationTruth {
  // Never raised: an inferred edge is derived whatever its relation is called.
  if (edge.confidence === 'INFERRED') return 'derived'
  // A bundle is a count across many edges — no single stored link backs it.
  if (typeof edge.metadata?.bundledEdges === 'number') return 'derived'
  if (DEFINITION_RELATIONS.has(edge.relation)) return 'definition'
  if (STORED_REFERENCE_RELATIONS.has(edge.relation)) return 'direct'
  if (edge.confidence === 'EXTRACTED') return 'direct'
  return 'derived'
}

export const RELATION_TRUTH_COPY: Record<RelationTruth, { label: string; description: string }> = {
  direct: {
    label: 'Direkt',
    description: 'lagrad referens i databasen eller i koden',
  },
  definition: {
    label: 'Definition',
    description: 'namngiven i en nuvarande definition — inte vad som faktiskt kördes',
  },
  derived: {
    label: 'Härledd',
    description: 'beräknad eller sammanräknad — kan vara ofullständig',
  },
}

/**
 * How each class is drawn, on top of the relation's own colour and width.
 * Line style carries the class and nothing else, so the legend can promise it.
 * The dashes are deliberately unlike every status-ring dash in graph-visuals
 * ('5 3', '7 4', '3 3'), so a line never reads as a status.
 */
export const RELATION_TRUTH_STROKE: Record<RelationTruth, { dash?: string; opacityScale: number }> = {
  direct: { opacityScale: 1 },
  definition: { dash: '8 4', opacityScale: 0.9 },
  derived: { dash: '1.5 4.5', opacityScale: 0.72 },
}

// ── Relation wording ────────────────────────────────────────────────────────

export interface RelationWording {
  /** What the relation is, as a noun phrase. */
  name: string
  /** Read from the edge's source: "<source> <forward> <target>". */
  forward: string
  /** Read from the edge's target: "<target> <backward> <source>". */
  backward: string
}

const RELATION_WORDING: Record<string, RelationWording> = {
  // Runtime — worded after the column, not after the API key.
  CONTAINS: { name: 'Hör till projekt', forward: 'innehåller', backward: 'hör till' },
  DELEGATED_TO: { name: 'Namngiven i definition', forward: 'nämner i nuvarande steg', backward: 'nämns i nuvarande steg av' },
  STARTED: { name: 'Körning av workflow', forward: 'har körningen', backward: 'körning av' },
  PRODUCED: { name: 'Utdata från körning', forward: 'har utdata', backward: 'utdata från' },
  REQUESTED_APPROVAL: { name: 'Granskning för körning', forward: 'har granskningen', backward: 'granskning för' },
  TRACKS: { name: 'Kopplad uppgift', forward: 'är kopplad till', backward: 'har uppgiften' },
  // Static — what Graphify's extractor emits.
  contains: { name: 'Innehåller', forward: 'innehåller', backward: 'ingår i' },
  member_of: { name: 'Medlem i', forward: 'ingår i', backward: 'har medlemmen' },
  imports: { name: 'Importerar', forward: 'importerar', backward: 'importeras av' },
  imports_from: { name: 'Importerar från', forward: 'importerar från', backward: 'importeras av' },
  calls: { name: 'Anropar', forward: 'anropar', backward: 'anropas av' },
  indirect_call: { name: 'Anropar indirekt', forward: 'anropar indirekt', backward: 'anropas indirekt av' },
  references: { name: 'Refererar', forward: 'refererar till', backward: 'refereras av' },
  re_exports: { name: 'Återexporterar', forward: 'återexporterar', backward: 'återexporteras av' },
  method: { name: 'Metodrelation', forward: 'metodrelation med', backward: 'metodrelation med' },
  rationale_for: { name: 'Motivering', forward: 'motiverar', backward: 'motiveras av' },
  inherits: { name: 'Ärver', forward: 'ärver från', backward: 'ärvs av' },
  uses: { name: 'Använder', forward: 'använder', backward: 'används av' },
  implements: { name: 'Implementerar', forward: 'implementerar', backward: 'implementeras av' },
}

/** The overview's community edges are counts, not references. */
const BUNDLE_WORDING: RelationWording = {
  name: 'Kodkopplingar mellan grupper',
  forward: 'har kodkopplingar till',
  backward: 'har kodkopplingar från',
}

export function relationWording(
  edge: Pick<IntelligenceGraphEdge, 'relation' | 'metadata'>,
): RelationWording {
  if (typeof edge.metadata?.bundledEdges === 'number') return BUNDLE_WORDING
  // Unknown relations are named by their key — never guessed into a known one.
  return RELATION_WORDING[edge.relation] ?? { name: edge.relation, forward: edge.relation, backward: edge.relation }
}

export interface LegendEntry {
  truth: RelationTruth
  label: string
  description: string
  /** The relation names in this class that are present in the payload. */
  relations: string[]
}

/** The legend describes what is on screen: only classes the payload contains. */
export function relationLegend(edges: readonly IntelligenceGraphEdge[]): LegendEntry[] {
  const names = new Map<RelationTruth, Set<string>>()
  for (const edge of edges) {
    const truth = relationTruth(edge)
    const set = names.get(truth) ?? new Set<string>()
    set.add(relationWording(edge).name)
    names.set(truth, set)
  }
  return RELATION_TRUTHS.flatMap((truth) => {
    const set = names.get(truth)
    if (!set) return []
    return [{ truth, ...RELATION_TRUTH_COPY[truth], relations: [...set].sort((a, b) => a.localeCompare(b, 'sv')) }]
  })
}

// ── Node vocabulary ─────────────────────────────────────────────────────────

const KIND_WORDS: Record<NodeKind, { one: string; many: string; label: string }> = {
  project: { one: 'projekt', many: 'projekt', label: 'Projekt' },
  agent: { one: 'agent', many: 'agenter', label: 'Agent' },
  workflow: { one: 'workflow', many: 'workflows', label: 'Workflow' },
  run: { one: 'körning', many: 'körningar', label: 'Körning' },
  approval: { one: 'granskning', many: 'granskningar', label: 'Granskning' },
  output: { one: 'utdata', many: 'utdata', label: 'Utdata' },
  task: { one: 'uppgift', many: 'uppgifter', label: 'Manager-uppgift' },
  community: { one: 'subsystem', many: 'subsystem', label: 'Subsystem' },
  code: { one: 'kodnod', many: 'kodnoder', label: 'Kod' },
  document: { one: 'dokument', many: 'dokument', label: 'Dokument' },
  rationale: { one: 'motivering', many: 'motiveringar', label: 'Motivering' },
}

/** Canonical display order — the containment order, then the static kinds. */
export const KIND_ORDER: readonly NodeKind[] = [
  'project', 'agent', 'workflow', 'run', 'approval', 'output', 'task',
  'community', 'code', 'document', 'rationale',
]

export function kindLabel(kind: string): string {
  return KIND_WORDS[kind as NodeKind]?.label ?? kind
}

/** A filter chip names the set it shows: "Körningar", not "Körning". */
export function kindFilterLabel(kind: string): string {
  const many = KIND_WORDS[kind as NodeKind]?.many
  return many ? many.charAt(0).toUpperCase() + many.slice(1) : kind
}

export function kindCountLabel(kind: string, count: number): string {
  const words = KIND_WORDS[kind as NodeKind]
  if (!words) return `${count} ${kind}`
  return `${count} ${count === 1 ? words.one : words.many}`
}

/** Tones mirror the canvas status layer (`GRAPH_VISUAL_TOKENS.status`); every tone is also a word. */
export type StatusTone = 'running' | 'failed' | 'waiting' | 'approval' | 'settled' | 'neutral'

export interface NodeStatus {
  /** The stored value, verbatim. */
  raw: string
  label: string
  /** True when the stored value has no known meaning; render `raw` beside it. */
  unknown: boolean
  tone: StatusTone
}

const WORKFLOW_STATE_LABELS: Record<string, string> = {
  // The builder derives these two from the boolean `workflows.active`.
  active: 'Aktiv',
  inactive: 'Inaktiv',
}

/** A node's stored status in the words Aktivitet and Granskningar already use. */
export function nodeStatus(node: Pick<IntelligenceGraphNode, 'kind' | 'status'>): NodeStatus | null {
  const raw = node.status?.trim()
  if (!raw) return null
  if (node.kind === 'run') {
    const label = RUN_STATE_LABELS[raw]
    return {
      raw,
      label: label ?? UNKNOWN_RUN_STATE_LABEL,
      unknown: !label,
      tone: raw === 'running' ? 'running'
        : raw === 'failed' || raw === 'stalled' ? 'failed'
          : raw === 'awaiting_approval' ? 'waiting'
            : raw === 'done' ? 'settled' : 'neutral',
    }
  }
  if (node.kind === 'approval') {
    const label = APPROVAL_STATUS_LABELS[raw]
    return {
      raw,
      label: label ?? UNKNOWN_STATUS_LABEL,
      unknown: !label,
      tone: raw === 'pending' || raw === 'needs_input' || raw === 'revised' ? 'approval'
        : raw === 'approved' ? 'settled' : 'neutral',
    }
  }
  if (node.kind === 'workflow' && WORKFLOW_STATE_LABELS[raw]) {
    return { raw, label: WORKFLOW_STATE_LABELS[raw], unknown: false, tone: 'neutral' }
  }
  // Manager-task statuses have no shared vocabulary yet: shown as stored.
  return { raw, label: raw, unknown: false, tone: 'neutral' }
}

// ── Snapshot ────────────────────────────────────────────────────────────────

/**
 * `DEFAULT_WINDOW.maxRuns` in the operations builder. The route passes it
 * unchanged, and the response does not say when the cap was hit — so the
 * surface says it may have been. Pinned to the builder by test.
 */
export const OPERATIONS_RUN_CAP = 120

export interface SnapshotStamp {
  /** The visible line. */
  label: string
  /** A full timestamp for the title attribute, when one is known. */
  detail: string | null
}

function validDate(iso: string | undefined): Date | null {
  if (!iso) return null
  const time = Date.parse(iso)
  // The importer writes the epoch when an artifact carries no time of its own.
  if (Number.isNaN(time) || time <= 0) return null
  return new Date(time)
}

export function formatClock(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone }).format(date)
}

export function formatFullTime(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('sv-SE', { dateStyle: 'medium', timeStyle: 'medium', timeZone }).format(date)
}

/**
 * The honest name for what is on screen.
 *
 * Live Operations: the server stamps `meta.generatedAt` when it builds the
 * response, so it is the moment the snapshot was read — and nothing refreshes
 * it except the operator. System Map: a static artifact; its time, when it has
 * one, is when the artifact was generated, never when it was fetched.
 */
export function snapshotStamp(
  mode: 'system' | 'operations',
  meta: IntelligenceGraphMeta | undefined,
  timeZone?: string,
): SnapshotStamp {
  const date = validDate(meta?.generatedAt)
  if (mode === 'operations') {
    return date
      ? { label: `Ögonblicksbild · hämtad ${formatClock(date, timeZone)}`, detail: formatFullTime(date, timeZone) }
      : { label: 'Ögonblicksbild · hämtningstid okänd', detail: null }
  }
  const parts = ['Statisk kodkarta']
  if (meta?.builtAtCommit) parts.push(`commit ${meta.builtAtCommit.slice(0, 10)}`)
  if (date) parts.push(`genererad ${new Intl.DateTimeFormat('sv-SE', { dateStyle: 'medium', timeZone }).format(date)}`)
  return { label: parts.join(' · '), detail: date ? formatFullTime(date, timeZone) : null }
}

export interface SnapshotCountBreakdown {
  status: string
  value: number
  label: string
  tone: StatusTone
}

export interface SnapshotCount {
  kind: NodeKind
  value: number
  /** The noun, already agreeing with `value`. */
  noun: string
  breakdown: SnapshotCountBreakdown[]
}

export interface SnapshotCounts {
  items: SnapshotCount[]
  /** Runs reached the builder's cap, so older runs in the window may be missing. */
  runCapReached: boolean
}

/** Statuses worth naming inside a count. Everything else stays in the total. */
const COUNT_BREAKDOWN: Partial<Record<NodeKind, Array<{ status: string; label: string; tone: StatusTone }>>> = {
  run: [
    { status: 'running', label: 'kör', tone: 'running' },
    { status: 'failed', label: 'misslyckades', tone: 'failed' },
    { status: 'awaiting_approval', label: 'inväntar granskning', tone: 'waiting' },
  ],
  approval: [
    { status: 'pending', label: 'väntar på granskning', tone: 'approval' },
  ],
}

/** Counts of THIS payload — what the snapshot contains, not what Omnira holds. */
export function snapshotCounts(nodes: readonly IntelligenceGraphNode[]): SnapshotCounts {
  const byKind = new Map<NodeKind, IntelligenceGraphNode[]>()
  for (const node of nodes) {
    const list = byKind.get(node.kind) ?? []
    list.push(node)
    byKind.set(node.kind, list)
  }
  const items = KIND_ORDER.flatMap((kind): SnapshotCount[] => {
    const list = byKind.get(kind)
    if (!list || list.length === 0) return []
    const breakdown = (COUNT_BREAKDOWN[kind] ?? []).flatMap((entry) => {
      const value = list.filter((node) => node.status === entry.status).length
      return value > 0 ? [{ ...entry, value }] : []
    })
    const words = KIND_WORDS[kind]
    return [{ kind, value: list.length, noun: list.length === 1 ? words.one : words.many, breakdown }]
  })
  return { items, runCapReached: (byKind.get('run')?.length ?? 0) >= OPERATIONS_RUN_CAP }
}

// ── Location and zoom ───────────────────────────────────────────────────────

/** Where the operator is in the graph — the same steps `buildGraphBreadcrumbs` tracks. */
export function graphLocation(
  mode: 'system' | 'operations',
  communityId: number | null,
  drillLabel: string | null,
  isolateLabel: string | null,
): string[] {
  const values = ['Översikt']
  if (mode === 'system' && communityId !== null) values.push(`Subsystem ${communityId}`)
  if (drillLabel && !values.includes(drillLabel)) values.push(drillLabel)
  if (isolateLabel) values.push(`Isolerad: ${isolateLabel}`)
  return values
}

/** The canvas's semantic zoom levels (`graph-readability.ts`), in the product's words. */
export const ZOOM_LEVEL_LABELS: Record<string, string> = {
  portfolio: 'Portfölj',
  project: 'Projekt',
  operational: 'Drift',
  detail: 'Detalj',
  execution: 'Körningskedja',
}

// ── Provenance ──────────────────────────────────────────────────────────────

/** The table each runtime node is read from — the builder's `db.from(...)`. */
export const RUNTIME_SOURCE_TABLE: Partial<Record<NodeKind, string>> = {
  project: 'projects',
  agent: 'agents',
  workflow: 'workflows',
  run: 'runs',
  approval: 'approvals',
  output: 'outputs',
  task: 'manager_tasks',
}

export interface NodeProvenance {
  source: string
  detail: string | null
}

export function nodeProvenance(
  node: IntelligenceGraphNode,
  meta: IntelligenceGraphMeta | undefined,
): NodeProvenance {
  if (node.source === 'runtime') {
    const table = RUNTIME_SOURCE_TABLE[node.kind]
    return { source: 'Omnira-databasen', detail: table ? `tabellen ${table}` : null }
  }
  if (node.kind === 'community') {
    return { source: 'Graphify-gruppering', detail: 'sammanräknad ur kodkartan' }
  }
  const location = node.sourceFile
    ? `${node.sourceFile}${node.sourceLocation ? `:${node.sourceLocation}` : ''}`
    : null
  const commit = meta?.builtAtCommit ? `commit ${meta.builtAtCommit.slice(0, 10)}` : null
  return { source: 'Graphify-artefakt', detail: [location, commit].filter(Boolean).join(' · ') || null }
}

/**
 * The label for `approvals.operator`. The column is written for every decision
 * (the marketing route stores it on approve, reject and return alike), so
 * "Godkänd av" is only true when the stored status says approved. Any other
 * status gets the column's own neutral name.
 */
export function operatorLabel(node: Pick<IntelligenceGraphNode, 'kind' | 'status'>): string {
  if (node.kind === 'approval' && node.status === 'approved') return 'Godkänd av'
  return 'Operatör'
}

/** Existing Omnira routes for runtime nodes — the same set the legacy inspector links to. */
export function runtimeDestination(node: IntelligenceGraphNode): { href: string; label: string } | null {
  if (node.source !== 'runtime') return null
  const slug = typeof node.metadata?.slug === 'string' ? node.metadata.slug : null
  switch (node.kind) {
    case 'project':
      return slug ? { href: `/projects/${slug}`, label: 'Öppna projektet' } : null
    case 'run':
      return { href: '/agent-activity', label: 'Öppna Aktivitet' }
    case 'approval':
      return { href: '/approvals', label: 'Öppna Granskningar' }
    case 'task':
      return { href: '/manager', label: 'Öppna Manager' }
    default:
      return null
  }
}

/** Kinds the navigation layer can scope — the legacy inspector's own list. */
export const SCOPEABLE_KINDS: ReadonlySet<string> = new Set(['community', 'project', 'workflow', 'agent', 'run'])
