import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IntelligenceGraphNode } from '@/lib/intelligence/graph-contract'
import { OperationsSnapshotLifecycle, type OperationsSnapshotScope } from './operations-snapshot-state'

const scopeA: OperationsSnapshotScope = { projectId: 'project-a', hours: 24 }
const scopeB: OperationsSnapshotScope = { projectId: 'project-b', hours: 24 }
const scopeHours: OperationsSnapshotScope = { projectId: 'project-a', hours: 168 }

function snapshot(projectId = 'project-a', runId = 'run:1') {
  const node: IntelligenceGraphNode = {
    id: runId, kind: 'run', label: runId, source: 'runtime', projectId, metadata: {},
  }
  return {
    available: true,
    meta: { source: 'runtime', generatedAt: '2026-07-14T10:00:00.000Z', nodeCount: 1, edgeCount: 0 },
    nodes: [node],
    edges: [],
    projects: [{ id: projectId, name: projectId, slug: projectId, color: '#123456' }],
    snapshot: {
      generatedAt: '2026-07-14T10:00:00.000Z', requestedHours: 24,
      authorizedProjectIds: [projectId], appliedProjectId: projectId,
      returnedProjectIds: [projectId], queriedSources: ['projects', 'runs'],
      delivery: 'snapshot_only', sourceFreshness: 'unknown',
      capabilities: {
        realtime: false, polling: true, incidents: false, toolCalls: false,
        atlasRuntime: false, managerRuntime: false, correlation: false, causation: false, replay: false,
      },
    },
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => { resolve = nextResolve; reject = nextReject })
  return { promise, resolve, reject }
}

async function flush() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function harness() {
  let currentScope = scopeA
  let visible = true
  let runnable = true
  let now = 0
  const requests: Array<{ scope: OperationsSnapshotScope; signal: AbortSignal; deferred: ReturnType<typeof deferred<unknown>> }> = []
  const starts: boolean[] = []
  const accepted: string[] = []
  const failures: boolean[] = []
  const lifecycle = new OperationsSnapshotLifecycle({
    getCurrentScope: () => currentScope,
    canRun: () => runnable,
    isVisible: () => visible,
    fetchSnapshot: (scope, signal) => {
      const next = deferred<unknown>()
      requests.push({ scope, signal, deferred: next })
      return next.promise
    },
    onStart: ({ hasConfirmedSnapshot }) => starts.push(hasConfirmedSnapshot),
    onAccepted: ({ payload }) => accepted.push(payload.nodes[0]?.id ?? 'missing'),
    onFailure: ({ hasConfirmedSnapshot }) => failures.push(hasConfirmedSnapshot),
    now: () => now,
  })
  return {
    lifecycle, requests, starts, accepted, failures,
    setScope: (scope: OperationsSnapshotScope) => { currentScope = scope },
    setVisible: (next: boolean) => { visible = next },
    setRunnable: (next: boolean) => { runnable = next },
    setNow: (next: number) => { now = next },
  }
}

afterEach(() => vi.useRealTimers())

describe('OperationsSnapshotLifecycle production request lifecycle', () => {
  it('owns one chained timer, and manual refresh replaces its pending poll', async () => {
    vi.useFakeTimers()
    const h = harness()
    h.lifecycle.resume(scopeA)
    expect(h.requests).toHaveLength(1)
    h.requests[0].deferred.resolve(snapshot())
    await flush()
    expect(h.lifecycle.hasPendingTimer()).toBe(true)

    h.lifecycle.resume(scopeA)
    h.lifecycle.resume(scopeA)
    vi.advanceTimersByTime(30_000)
    expect(h.requests).toHaveLength(2)
    h.requests[1].deferred.resolve(snapshot())
    await flush()

    h.lifecycle.request(scopeA, 'manual')
    expect(h.requests).toHaveLength(3)
    vi.advanceTimersByTime(30_000)
    expect(h.requests).toHaveLength(3)
  })

  it('cleans timers on dispose and never schedules while hidden', async () => {
    vi.useFakeTimers()
    const h = harness()
    h.lifecycle.resume(scopeA)
    h.requests[0].deferred.resolve(snapshot())
    await flush()
    h.setVisible(false)
    h.lifecycle.resume(scopeA)
    expect(h.lifecycle.hasPendingTimer()).toBe(false)
    vi.advanceTimersByTime(300_000)
    expect(h.requests).toHaveLength(1)

    h.setVisible(true)
    h.setNow(10_000)
    h.lifecycle.resume(scopeA)
    vi.advanceTimersByTime(19_999)
    expect(h.requests).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(h.requests).toHaveLength(2)
    h.lifecycle.dispose()
    expect(h.requests[1].signal.aborted).toBe(true)
  })

  it('keeps the newer controller authoritative when an aborted request settles late', async () => {
    const h = harness()
    h.lifecycle.request(scopeA, 'manual')
    const requestA = h.requests[0]
    h.lifecycle.request(scopeA, 'manual')
    const requestB = h.requests[1]
    expect(requestA.signal.aborted).toBe(true)
    expect(h.lifecycle.hasActiveRequest()).toBe(true)

    requestA.deferred.resolve(snapshot('project-a', 'run:old'))
    await flush()
    expect(h.accepted).toEqual([])
    expect(h.lifecycle.hasActiveRequest()).toBe(true)

    requestB.deferred.resolve(snapshot('project-a', 'run:new'))
    await flush()
    expect(h.accepted).toEqual(['run:new'])
    expect(h.failures).toEqual([])
    expect(h.lifecycle.hasActiveRequest()).toBe(false)
  })

  it('rejects project and hour stale responses before callbacks or backoff changes', async () => {
    const h = harness()
    h.lifecycle.request(scopeA, 'manual')
    const projectRequest = h.requests[0]
    h.setScope(scopeB)
    h.lifecycle.request(scopeB, 'manual')
    projectRequest.deferred.resolve(snapshot('project-a', 'run:old-project'))
    await flush()
    expect(h.accepted).toEqual([])
    expect(h.lifecycle.getFailureCount()).toBe(0)

    const hourRequest = h.requests[1]
    h.setScope(scopeHours)
    h.lifecycle.request(scopeHours, 'manual')
    hourRequest.deferred.reject(new Error('old hours'))
    await flush()
    expect(h.failures).toEqual([])
    expect(h.lifecycle.getFailureCount()).toBe(0)
  })

  it('uses one retry, cancels it on manual refresh, and resets failure count after success', async () => {
    vi.useFakeTimers()
    const h = harness()
    h.lifecycle.request(scopeA, 'manual')
    h.requests[0].deferred.reject(new Error('network'))
    await flush()
    expect(h.failures).toEqual([false])
    expect(h.lifecycle.getFailureCount()).toBe(1)
    expect(h.lifecycle.hasPendingTimer()).toBe(true)

    h.lifecycle.request(scopeA, 'manual')
    vi.advanceTimersByTime(30_000)
    expect(h.requests).toHaveLength(2)
    h.requests[1].deferred.resolve(snapshot())
    await flush()
    expect(h.lifecycle.getFailureCount()).toBe(0)
  })

  it('reports retained-snapshot failure without discarding the confirmed snapshot', async () => {
    vi.useFakeTimers()
    const h = harness()
    h.lifecycle.request(scopeA, 'manual')
    h.requests[0].deferred.resolve(snapshot('project-a', 'run:confirmed'))
    await flush()
    expect(h.lifecycle.activate(scopeA)?.nodes[0]?.id).toBe('run:confirmed')

    h.lifecycle.request(scopeA, 'manual')
    h.requests[1].deferred.reject(new Error('network'))
    await flush()
    expect(h.failures).toEqual([true])
    expect(h.lifecycle.activate(scopeA)?.nodes[0]?.id).toBe('run:confirmed')
  })

  it('does not count an aborted request as a failure', async () => {
    const h = harness()
    h.lifecycle.request(scopeA, 'manual')
    const aborted = h.requests[0]
    h.lifecycle.request(scopeA, 'manual') // supersedes; aborts the first
    expect(aborted.signal.aborted).toBe(true)

    aborted.deferred.reject(new Error('aborted by controller'))
    await flush()
    expect(h.failures).toEqual([])
    expect(h.lifecycle.getFailureCount()).toBe(0)
  })

  it('cancels polling on mode change (dispose clears timer and active request)', async () => {
    vi.useFakeTimers()
    const h = harness()
    h.lifecycle.resume(scopeA)
    h.requests[0].deferred.resolve(snapshot())
    await flush()
    expect(h.lifecycle.hasPendingTimer()).toBe(true)

    h.lifecycle.dispose() // React effect cleanup on mode change
    expect(h.lifecycle.hasPendingTimer()).toBe(false)
    vi.advanceTimersByTime(60_000)
    expect(h.requests).toHaveLength(1) // no request fired after dispose
  })

  it('cancels a pending retry timer when the tab is hidden', async () => {
    vi.useFakeTimers()
    const h = harness()
    h.lifecycle.request(scopeA, 'manual')
    h.requests[0].deferred.reject(new Error('network'))
    await flush()
    expect(h.lifecycle.hasPendingTimer()).toBe(true) // retry scheduled

    h.setVisible(false)
    h.lifecycle.resume(scopeA) // simulates visibilitychange listener
    expect(h.lifecycle.hasPendingTimer()).toBe(false)
    vi.advanceTimersByTime(300_000)
    expect(h.requests).toHaveLength(1) // no retry fired while hidden
  })

  it('repeated resume calls do not accumulate timers or extra requests', async () => {
    vi.useFakeTimers()
    const h = harness()
    h.lifecycle.resume(scopeA) // initial — fires immediately (no prior confirmed)
    h.requests[0].deferred.resolve(snapshot())
    await flush()
    expect(h.lifecycle.hasPendingTimer()).toBe(true)

    // Simulate multiple rapid visibilitychange events
    h.lifecycle.resume(scopeA)
    h.lifecycle.resume(scopeA)
    h.lifecycle.resume(scopeA)
    expect(h.lifecycle.hasPendingTimer()).toBe(true) // still exactly one timer

    vi.advanceTimersByTime(30_000)
    expect(h.requests).toHaveLength(2) // exactly one additional request
  })

  it('returning visible after the full interval fires one immediate request', async () => {
    vi.useFakeTimers()
    const h = harness()
    h.lifecycle.resume(scopeA)
    h.requests[0].deferred.resolve(snapshot())
    await flush()

    // Tab hidden
    h.setVisible(false)
    h.lifecycle.resume(scopeA)
    vi.advanceTimersByTime(60_000) // well past normal interval

    // Tab becomes visible; enough time has elapsed so delay should be 0
    h.setVisible(true)
    h.setNow(60_000)
    h.lifecycle.resume(scopeA) // simulates visibilitychange
    expect(h.requests).toHaveLength(2) // immediate request, no extra timer wait
  })
})
