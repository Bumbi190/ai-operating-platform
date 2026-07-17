import {
  LIMITS,
  OPERATIONS_SNAPSHOT_SOURCES,
  validateIntelligenceGraph,
  type IntelligenceGraphEdge,
  type IntelligenceGraphNode,
  type OperationsGraphResponse,
  type OperationsSnapshotCapabilities,
  type OperationsSnapshotMeta,
} from '@/lib/intelligence/graph-contract'

export const OPERATIONS_SNAPSHOT_INTERVAL_MS = 30_000
const OPERATIONS_SNAPSHOT_BACKOFF_MS = [30_000, 60_000, 120_000, 240_000, 300_000] as const

export interface OperationsSnapshotScope {
  projectId: string | null
  hours: number
}

export interface OperationsSnapshotReconciliation {
  selectedId: string | null
  searchResultId: string | null
  drillId: string | null
  isolateId: string | null
}

export function getOperationsSnapshotScopeKey(scope: OperationsSnapshotScope): string {
  return JSON.stringify([scope.projectId, scope.hours])
}

export function sameOperationsSnapshotScope(
  left: OperationsSnapshotScope,
  right: OperationsSnapshotScope,
): boolean {
  return getOperationsSnapshotScopeKey(left) === getOperationsSnapshotScopeKey(right)
}

export function buildOperationsSnapshotUrl(scope: OperationsSnapshotScope): string {
  const params = new URLSearchParams({ hours: String(scope.hours) })
  if (scope.projectId) params.set('project', scope.projectId)
  return `/api/intelligence/graph/operations?${params}`
}

export function canAcceptOperationsSnapshot({
  sequence,
  latestSequence,
  requestScope,
  currentScope,
}: {
  sequence: number
  latestSequence: number
  requestScope: OperationsSnapshotScope
  currentScope: OperationsSnapshotScope
}): boolean {
  return sequence === latestSequence && sameOperationsSnapshotScope(requestScope, currentScope)
}

export function getOperationsSnapshotPollingDelay({
  now,
  lastConfirmedAt,
  failureCount,
}: {
  now: number
  lastConfirmedAt: number | null
  failureCount: number
}): number {
  if (failureCount > 0) return OPERATIONS_SNAPSHOT_BACKOFF_MS[Math.min(failureCount - 1, OPERATIONS_SNAPSHOT_BACKOFF_MS.length - 1)]
  if (lastConfirmedAt === null) return 0
  return Math.max(0, OPERATIONS_SNAPSHOT_INTERVAL_MS - Math.max(0, now - lastConfirmedAt))
}

/** A single chained timeout; callers schedule again only after the request settles. */
export function scheduleOperationsSnapshotPoll(callback: () => void, delay: number): ReturnType<typeof setTimeout> {
  return setTimeout(callback, delay)
}

export type OperationsSnapshotRequestTrigger = 'initial' | 'poll' | 'manual' | 'visibility'

export interface OperationsSnapshotLifecycleOptions {
  getCurrentScope: () => OperationsSnapshotScope
  canRun: () => boolean
  isVisible: () => boolean
  fetchSnapshot: (scope: OperationsSnapshotScope, signal: AbortSignal) => Promise<unknown>
  onStart: (input: { hasConfirmedSnapshot: boolean }) => void
  onAccepted: (input: { payload: OperationsGraphResponse; scope: OperationsSnapshotScope }) => void
  onFailure: (input: { error: unknown; hasConfirmedSnapshot: boolean }) => void
  now?: () => number
}

/**
 * Stateful, Operations-only request coordinator used by the client effect.
 * It owns the one active request and one chained timer so integration tests can
 * exercise the same lifecycle as the rendered client without mocking it away.
 */
export class OperationsSnapshotLifecycle {
  private readonly now: () => number
  private timer: ReturnType<typeof setTimeout> | null = null
  private controller: AbortController | null = null
  private sequence = 0
  private latestSequence = 0
  private generation = 0
  private failureCount = 0
  private confirmed: { scope: OperationsSnapshotScope; receivedAt: number; payload: OperationsGraphResponse } | null = null

  constructor(private readonly options: OperationsSnapshotLifecycleOptions) {
    this.now = options.now ?? Date.now
  }

  activate(scope: OperationsSnapshotScope): OperationsGraphResponse | null {
    if (!this.confirmed || !sameOperationsSnapshotScope(this.confirmed.scope, scope)) {
      this.confirmed = null
      this.failureCount = 0
      return null
    }
    return this.confirmed.payload
  }

  resume(scope: OperationsSnapshotScope): void {
    this.clearTimer()
    if (!this.isRunnable(scope) || this.controller) return
    const delay = getOperationsSnapshotPollingDelay({
      now: this.now(),
      lastConfirmedAt: this.confirmed && sameOperationsSnapshotScope(this.confirmed.scope, scope)
        ? this.confirmed.receivedAt
        : null,
      failureCount: this.failureCount,
    })
    if (delay === 0) this.request(scope, this.confirmed ? 'visibility' : 'initial')
    else this.schedule(scope, delay)
  }

  request(scope: OperationsSnapshotScope, trigger: OperationsSnapshotRequestTrigger): void {
    if (!this.options.canRun() || !sameOperationsSnapshotScope(scope, this.options.getCurrentScope())) return
    if (trigger !== 'manual' && !this.options.isVisible()) return

    this.clearTimer()
    this.controller?.abort()
    const controller = new AbortController()
    this.controller = controller
    const sequence = ++this.sequence
    this.latestSequence = sequence
    const generation = this.generation
    const hasConfirmedSnapshot = Boolean(this.confirmed && sameOperationsSnapshotScope(this.confirmed.scope, scope))
    this.options.onStart({ hasConfirmedSnapshot })

    let outcome: 'success' | 'failure' | 'ignored' = 'ignored'
    void this.options.fetchSnapshot(scope, controller.signal)
      .then(raw => {
        const payload = parseOperationsSnapshotResponse(raw)
        if (!payload) throw new Error('Operationssnapshoten kunde inte verifieras.')
        if (!this.isCurrent(sequence, generation, scope)) return
        this.confirmed = { scope, receivedAt: this.now(), payload }
        this.failureCount = 0
        this.options.onAccepted({ payload, scope })
        outcome = 'success'
      })
      .catch(error => {
        if (controller.signal.aborted || !this.isCurrent(sequence, generation, scope)) return
        this.failureCount += 1
        this.options.onFailure({
          error,
          hasConfirmedSnapshot: Boolean(this.confirmed && sameOperationsSnapshotScope(this.confirmed.scope, scope)),
        })
        outcome = 'failure'
      })
      .finally(() => {
        if (this.controller === controller) this.controller = null
        if (controller.signal.aborted || !this.isCurrent(sequence, generation, scope) || outcome === 'ignored') return
        const delay = getOperationsSnapshotPollingDelay({
          now: this.now(),
          lastConfirmedAt: this.confirmed && sameOperationsSnapshotScope(this.confirmed.scope, scope)
            ? this.confirmed.receivedAt
            : null,
          failureCount: this.failureCount,
        })
        this.schedule(scope, delay)
      })
  }

  dispose(): void {
    this.generation += 1
    this.clearTimer()
    this.controller?.abort()
    this.controller = null
  }

  getFailureCount(): number {
    return this.failureCount
  }

  hasPendingTimer(): boolean {
    return this.timer !== null
  }

  hasActiveRequest(): boolean {
    return this.controller !== null
  }

  private schedule(scope: OperationsSnapshotScope, delay: number): void {
    this.clearTimer()
    if (!this.isRunnable(scope)) return
    this.timer = scheduleOperationsSnapshotPoll(() => {
      this.timer = null
      this.request(scope, 'poll')
    }, delay)
  }

  private clearTimer(): void {
    if (!this.timer) return
    clearTimeout(this.timer)
    this.timer = null
  }

  private isRunnable(scope: OperationsSnapshotScope): boolean {
    return this.options.canRun()
      && this.options.isVisible()
      && sameOperationsSnapshotScope(scope, this.options.getCurrentScope())
  }

  private isCurrent(sequence: number, generation: number, scope: OperationsSnapshotScope): boolean {
    return sequence === this.latestSequence
      && generation === this.generation
      && this.options.canRun()
      && sameOperationsSnapshotScope(scope, this.options.getCurrentScope())
  }
}

/**
 * Accepts only the Slice A operations response shape and normalizes the graph
 * before it reaches reconciliation. Unknown or oversized values fail closed.
 */
export function parseOperationsSnapshotResponse(raw: unknown): OperationsGraphResponse | null {
  if (!isRecord(raw) || raw.available !== true || !isRecord(raw.snapshot) || !Array.isArray(raw.projects)) return null

  const snapshot = parseSnapshotMeta(raw.snapshot)
  const projects = raw.projects.map(parseProject)
  if (!snapshot || projects.some((project): project is null => project === null)) return null

  try {
    const graph = validateIntelligenceGraph(raw)
    if (graph.meta.source !== 'runtime' || graph.nodes.length > LIMITS.MAX_RESPONSE_NODES || graph.edges.length > LIMITS.MAX_RESPONSE_EDGES) return null
    return { available: true, ...graph, projects: projects as OperationsGraphResponse['projects'], snapshot }
  } catch {
    return null
  }
}

export function reconcileOperationsSnapshot({
  nodes,
  selectedId,
  searchResultId,
  drillId,
  isolateId,
}: {
  nodes: readonly IntelligenceGraphNode[]
  selectedId: string | null
  searchResultId: string | null
  drillId: string | null
  isolateId: string | null
}): OperationsSnapshotReconciliation {
  const ids = new Set(nodes.map(node => node.id))
  return {
    selectedId: selectedId && ids.has(selectedId) ? selectedId : null,
    searchResultId: searchResultId && ids.has(searchResultId) ? searchResultId : null,
    drillId: drillId && ids.has(drillId) ? drillId : null,
    isolateId: isolateId && ids.has(isolateId) ? isolateId : null,
  }
}

/** Stable graph topology: visual values never affect this key. */
export function getOperationsSnapshotTopologyKey(
  nodes: readonly IntelligenceGraphNode[],
  edges: readonly IntelligenceGraphEdge[],
): string {
  const nodeTuples = nodes
    .map(node => [node.id, node.projectId ?? '', node.kind] as const)
    .sort(compareTopologyTuple)
  const edgeTuples = edges
    .map(edge => [edge.id || JSON.stringify([edge.source, edge.target, edge.relation]), edge.source, edge.target, edge.relation] as const)
    .sort(compareTopologyTuple)
  return JSON.stringify({ nodes: nodeTuples, edges: edgeTuples })
}

function compareTopologyTuple(left: readonly string[], right: readonly string[]): number {
  return JSON.stringify(left).localeCompare(JSON.stringify(right))
}

function parseSnapshotMeta(raw: Record<string, unknown>): OperationsSnapshotMeta | null {
  const requestedHours = raw.requestedHours
  if (
    typeof raw.generatedAt !== 'string' || Number.isNaN(Date.parse(raw.generatedAt))
    || typeof requestedHours !== 'number' || !Number.isSafeInteger(requestedHours) || requestedHours <= 0
    || !(raw.appliedProjectId === null || isSafeId(raw.appliedProjectId))
    || raw.delivery !== 'snapshot_only' || raw.sourceFreshness !== 'unknown'
    || !isStringArray(raw.authorizedProjectIds) || !isStringArray(raw.returnedProjectIds)
    || !isOperationsSnapshotSources(raw.queriedSources) || !isCapabilities(raw.capabilities)
  ) return null

  return {
    generatedAt: raw.generatedAt,
    requestedHours,
    authorizedProjectIds: [...raw.authorizedProjectIds],
    appliedProjectId: raw.appliedProjectId,
    returnedProjectIds: [...raw.returnedProjectIds],
    queriedSources: [...raw.queriedSources],
    delivery: 'snapshot_only',
    sourceFreshness: 'unknown',
    capabilities: raw.capabilities,
  }
}

function parseProject(raw: unknown): OperationsGraphResponse['projects'][number] | null {
  if (!isRecord(raw) || !isSafeId(raw.id) || !isNonEmptyString(raw.name) || !isNonEmptyString(raw.slug) || !isNonEmptyString(raw.color)) return null
  return { id: raw.id, name: raw.name, slug: raw.slug, color: raw.color }
}

function isCapabilities(raw: unknown): raw is OperationsSnapshotCapabilities {
  return isRecord(raw)
    && raw.realtime === false && raw.polling === true
    && raw.incidents === false && raw.toolCalls === false
    && raw.atlasRuntime === false && raw.managerRuntime === false
    && raw.correlation === false && raw.causation === false && raw.replay === false
}

function isOperationsSnapshotSources(raw: unknown): raw is OperationsSnapshotMeta['queriedSources'] {
  return Array.isArray(raw) && raw.every(value => typeof value === 'string' && (OPERATIONS_SNAPSHOT_SOURCES as readonly string[]).includes(value))
}

function isStringArray(raw: unknown): raw is string[] {
  return Array.isArray(raw) && raw.every(isSafeId)
}

function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 300 && !/[\u0000-\u001f\u007f]/.test(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
