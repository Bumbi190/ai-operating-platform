import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IntelligenceGraphEdge, IntelligenceGraphNode } from '@/lib/intelligence/graph-contract'
import {
  buildOperationsSnapshotUrl,
  canAcceptOperationsSnapshot,
  getOperationsSnapshotPollingDelay,
  getOperationsSnapshotTopologyKey,
  parseOperationsSnapshotResponse,
  reconcileOperationsSnapshot,
  sameOperationsSnapshotScope,
  scheduleOperationsSnapshotPoll,
} from './operations-snapshot-state'
import { resolveGraphNavigationIntent } from './graph-navigation'

const scope = { projectId: 'project-a', hours: 24 }
const node = (id: string, overrides: Partial<IntelligenceGraphNode> = {}): IntelligenceGraphNode => ({
  id,
  kind: 'run',
  label: id,
  source: 'runtime',
  projectId: 'project-a',
  metadata: {},
  ...overrides,
})
const edge = (id: string, source: string, target: string, overrides: Partial<IntelligenceGraphEdge> = {}): IntelligenceGraphEdge => ({
  id,
  source,
  target,
  relation: 'STARTED',
  metadata: {},
  ...overrides,
})

function rawSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    available: true,
    meta: { source: 'runtime', generatedAt: '2026-07-14T10:00:00.000Z', nodeCount: 1, edgeCount: 0 },
    nodes: [node('run:1')],
    edges: [],
    projects: [{ id: 'project-a', name: 'Project A', slug: 'project-a', color: '#123456' }],
    snapshot: {
      generatedAt: '2026-07-14T10:00:00.000Z',
      requestedHours: 24,
      authorizedProjectIds: ['project-a'],
      appliedProjectId: null,
      returnedProjectIds: ['project-a'],
      queriedSources: ['projects', 'runs'],
      delivery: 'snapshot_only',
      sourceFreshness: 'unknown',
      capabilities: {
        realtime: false, polling: true, incidents: false, toolCalls: false,
        atlasRuntime: false, managerRuntime: false, correlation: false, causation: false, replay: false,
      },
    },
    ...overrides,
  }
}

afterEach(() => vi.useRealTimers())

describe('Phase 3A Slice C operations snapshot state', () => {
  it('builds only the scoped full-snapshot URL', () => {
    expect(buildOperationsSnapshotUrl(scope)).toBe('/api/intelligence/graph/operations?hours=24&project=project-a')
    expect(buildOperationsSnapshotUrl({ projectId: null, hours: 168 })).toBe('/api/intelligence/graph/operations?hours=168')
  })

  it('accepts only the latest request for the current operations scope', () => {
    expect(canAcceptOperationsSnapshot({ sequence: 2, latestSequence: 2, requestScope: scope, currentScope: scope })).toBe(true)
    expect(canAcceptOperationsSnapshot({ sequence: 1, latestSequence: 2, requestScope: scope, currentScope: scope })).toBe(false)
    expect(canAcceptOperationsSnapshot({ sequence: 2, latestSequence: 2, requestScope: scope, currentScope: { projectId: null, hours: 24 } })).toBe(false)
    expect(sameOperationsSnapshotScope(scope, { projectId: 'project-a', hours: 24 })).toBe(true)
  })

  it('uses the remaining normal interval and the bounded failure sequence', () => {
    expect(getOperationsSnapshotPollingDelay({ now: 110_000, lastConfirmedAt: 100_000, failureCount: 0 })).toBe(20_000)
    expect(getOperationsSnapshotPollingDelay({ now: 130_000, lastConfirmedAt: 100_000, failureCount: 0 })).toBe(0)
    expect([1, 2, 3, 4, 5, 6].map(failureCount => getOperationsSnapshotPollingDelay({
      now: 0, lastConfirmedAt: 0, failureCount,
    }))).toEqual([30_000, 60_000, 120_000, 240_000, 300_000, 300_000])
  })

  it('schedules one chained timeout without an early or repeated callback', () => {
    vi.useFakeTimers()
    const callback = vi.fn()
    scheduleOperationsSnapshotPoll(callback, 30_000)
    vi.advanceTimersByTime(29_999)
    expect(callback).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(callback).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(30_000)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('fails closed for malformed or non-snapshot responses', () => {
    expect(parseOperationsSnapshotResponse(rawSnapshot())?.available).toBe(true)
    expect(parseOperationsSnapshotResponse(rawSnapshot({ available: false }))).toBeNull()
    expect(parseOperationsSnapshotResponse(rawSnapshot({ snapshot: { ...rawSnapshot().snapshot, delivery: 'events' } }))).toBeNull()
    expect(parseOperationsSnapshotResponse(rawSnapshot({ nodes: [{ id: 'run:1', kind: 'not-real' }] }))).toBeNull()
  })

  it('preserves only navigation IDs present in the complete replacement graph', () => {
    expect(reconcileOperationsSnapshot({
      nodes: [node('run:kept'), node('run:search')],
      selectedId: 'run:kept',
      searchResultId: 'run:search',
      drillId: 'run:missing',
      isolateId: 'run:kept',
    })).toEqual({
      selectedId: 'run:kept', searchResultId: 'run:search', drillId: null, isolateId: 'run:kept',
    })
  })

  it('resolves a preserved selection from the replacement snapshot and drops invalid roots independently', () => {
    const replacement = node('run:kept', { label: 'New label', status: 'done' })
    const reconciliation = reconcileOperationsSnapshot({
      nodes: [replacement],
      selectedId: 'run:kept',
      searchResultId: 'run:missing',
      drillId: 'run:missing',
      isolateId: 'run:kept',
    })
    const resolved = resolveGraphNavigationIntent([replacement], [], reconciliation)

    expect(resolved.selected).toBe(replacement)
    expect(resolved.selected?.label).toBe('New label')
    expect(reconciliation.searchResultId).toBeNull()
    expect(resolved.drillScope).toBeNull()
    expect(resolved.isolateScope?.rootId).toBe('run:kept')
  })

  it('keeps topology stable across visual refreshes and changes it only for structure', () => {
    const baselineNodes = [node('run:1', { label: 'Old', status: 'running', metadata: { at: 'old' } })]
    const baselineEdges = [edge('edge:1', 'run:1', 'run:1', { timestamp: '2026-07-14T10:00:00.000Z' })]
    const baseline = getOperationsSnapshotTopologyKey(baselineNodes, baselineEdges)

    expect(getOperationsSnapshotTopologyKey([
      node('run:1', { label: 'New', status: 'done', metadata: { at: 'new' } }),
    ], [edge('edge:1', 'run:1', 'run:1', { timestamp: '2026-07-14T10:01:00.000Z' })])).toBe(baseline)
    expect(getOperationsSnapshotTopologyKey([node('run:1', { kind: 'workflow' })], baselineEdges)).not.toBe(baseline)
    expect(getOperationsSnapshotTopologyKey(baselineNodes, [edge('edge:2', 'run:1', 'run:1')])).not.toBe(baseline)
  })

  it('prevents topology-key collisions from separator and control characters in identifiers', () => {
    // Edges with no explicit id must use JSON tuple identity to prevent collisions.
    // e.g. source="a→b", target="c" must differ from source="a", target="b→c"
    // because string concatenation ("a→b→c:R" vs "a→b→c:R") would be identical.
    const withArrowInSource = edge('', 'node:a→b', 'node:c')
    const withArrowInTarget = edge('', 'node:a', 'node:b→c')
    expect(
      getOperationsSnapshotTopologyKey([], [withArrowInSource]),
    ).not.toBe(
      getOperationsSnapshotTopologyKey([], [withArrowInTarget]),
    )

    // Colon separator collision: "a:b" source + "c:d" target vs "a" source + "b:c:d" target
    const colonA = edge('', 'node:a:b', 'node:c:d')
    const colonB = edge('', 'node:a', 'node:b:c:d')
    expect(
      getOperationsSnapshotTopologyKey([], [colonA]),
    ).not.toBe(
      getOperationsSnapshotTopologyKey([], [colonB]),
    )

    // Control characters in node IDs must produce distinct keys from plain IDs.
    const ctrlNode = node('prefix\x00suffix')
    const plainNode = node('prefixsuffix')
    expect(
      getOperationsSnapshotTopologyKey([ctrlNode], []),
    ).not.toBe(
      getOperationsSnapshotTopologyKey([plainNode], []),
    )
  })
})
