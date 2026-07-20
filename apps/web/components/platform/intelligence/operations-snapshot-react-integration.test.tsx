// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

;(globalThis as typeof globalThis & { React: typeof React }).React = React
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
import type { IntelligenceGraphNode } from '@/lib/intelligence/graph-contract'
import { GraphCanvas, type GraphCameraCommand } from './GraphCanvas'
import type { GraphViewBox } from './graph-readability'
import { IntelligenceGraphClient } from './IntelligenceGraphClient'

// ─── Shared rendering harness ────────────────────────────────────────────────
// A real DOM container + a real react-dom root, so effects, cleanup, and
// event listeners are the production ones — nothing here re-implements them.

let container: HTMLDivElement | null = null
let root: Root | null = null

function mount<P>(element: React.ReactElement<P>): void {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => { root!.render(element) })
}

function rerender<P>(element: React.ReactElement<P>): void {
  act(() => { root!.render(element) })
}

function unmount(): void {
  if (root) act(() => { root!.unmount() })
  if (container) container.remove()
  root = null
  container = null
}

afterEach(() => {
  unmount()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

// ─── GraphCanvas fixtures ─────────────────────────────────────────────────────

function graphNode(id: string): IntelligenceGraphNode {
  return { id, kind: 'run', label: id, source: 'runtime', projectId: 'project-a', metadata: {} }
}

const nodesV1: IntelligenceGraphNode[] = [graphNode('n1'), graphNode('n2')]
const edgesV1 = [{ id: 'e1', source: 'n1', target: 'n2', relation: 'STARTED' as const, metadata: {} }]
// Adding n3 changes topology (a real layout/topology-changing rerender).
const nodesV2: IntelligenceGraphNode[] = [...nodesV1, graphNode('n3')]
const edgesV2 = [...edgesV1, { id: 'e2', source: 'n2', target: 'n3', relation: 'STARTED' as const, metadata: {} }]

describe('GraphCanvas — rendered camera command behavior', () => {
  it('applies nonce A once, ignores a topology rerender, then applies nonce B exactly once and stays put after', async () => {
    const views: GraphViewBox[] = []
    const onCameraChange = (view: GraphViewBox) => { views.push(view) }
    const onSelect = () => {}

    const commandA: GraphCameraCommand = { nonce: 1, type: 'fit-node', nodeIds: ['n2'] }
    const commandB: GraphCameraCommand = { nonce: 2, type: 'fit-node', nodeIds: ['n1'] }

    mount(
      <GraphCanvas
        nodes={nodesV1}
        edges={edgesV1}
        selectedId={null}
        onSelect={onSelect}
        topologyKey="v1"
        cameraCommand={null}
        onCameraChange={onCameraChange}
      />,
    )
    await flush()
    expect(views.length).toBeGreaterThan(0)
    const initialFitView = views.at(-1)!

    // 1. camera command nonce A is applied
    rerender(
      <GraphCanvas
        nodes={nodesV1}
        edges={edgesV1}
        selectedId={null}
        onSelect={onSelect}
        topologyKey="v1"
        cameraCommand={commandA}
        onCameraChange={onCameraChange}
      />,
    )
    await flush()
    const viewAfterNonceA = views.at(-1)!
    expect(viewAfterNonceA).not.toEqual(initialFitView)
    const viewCountAfterNonceA = views.length

    // 2 & 3. a topology-changing rerender does not replay nonce A and causes
    // no implicit fit/restore back toward the pre-command full-graph view.
    rerender(
      <GraphCanvas
        nodes={nodesV2}
        edges={edgesV2}
        selectedId={null}
        onSelect={onSelect}
        topologyKey="v2"
        cameraCommand={commandA}
        onCameraChange={onCameraChange}
      />,
    )
    await flush()
    expect(views.length).toBe(viewCountAfterNonceA)
    expect(views.at(-1)).toEqual(viewAfterNonceA)
    expect(views.at(-1)).not.toEqual(initialFitView)

    // 4. nonce B is applied exactly once
    rerender(
      <GraphCanvas
        nodes={nodesV2}
        edges={edgesV2}
        selectedId={null}
        onSelect={onSelect}
        topologyKey="v2"
        cameraCommand={commandB}
        onCameraChange={onCameraChange}
      />,
    )
    await flush()
    const viewAfterNonceB = views.at(-1)!
    expect(viewAfterNonceB).not.toEqual(viewAfterNonceA)
    const viewCountAfterNonceB = views.length

    // 5. further rerenders (unrelated prop change) do not replay nonce B
    rerender(
      <GraphCanvas
        nodes={nodesV2}
        edges={edgesV2}
        selectedId={null}
        onSelect={onSelect}
        topologyKey="v2"
        cameraCommand={commandB}
        onCameraChange={onCameraChange}
        dimmedIds={new Set(['n3'])}
      />,
    )
    await flush()
    expect(views.length).toBe(viewCountAfterNonceB)
    expect(views.at(-1)).toEqual(viewAfterNonceB)
  })
})

// ─── IntelligenceGraphClient fixtures ─────────────────────────────────────────

function operationsSnapshotPayload(runId: string) {
  return {
    available: true,
    meta: { source: 'runtime', generatedAt: '2026-07-14T10:00:00.000Z', nodeCount: 1, edgeCount: 0 },
    nodes: [graphNode(runId)],
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
  }
}

function deferredFetch() {
  let resolve!: (value: unknown) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise((nextResolve, nextReject) => { resolve = nextResolve; reject = nextReject })
  return { promise, resolve, reject }
}

/** A queue of deferred fetch responses, one per call, so requests can be settled
 * individually and out of order — matching how the real lifecycle supersedes stale ones. */
function mockFetchQueue() {
  const calls: Array<{ url: string; signal: AbortSignal; deferred: ReturnType<typeof deferredFetch> }> = []
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const deferred = deferredFetch()
    calls.push({ url, signal: init!.signal as AbortSignal, deferred })
    return deferred.promise.then(value => {
      if (value instanceof Error) throw value
      return { ok: true, status: 200, json: async () => value }
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return calls
}

/** The client fires an unrelated one-shot System Map fetch on mount before any
 * tab switch; Operations Snapshot lifecycle assertions must ignore it. */
function operationsCalls(calls: Array<{ url: string; signal: AbortSignal; deferred: ReturnType<typeof deferredFetch> }>) {
  return calls.filter(call => call.url.includes('/api/intelligence/graph/operations'))
}

async function switchToOperationsTab() {
  const button = [...document.querySelectorAll('button')].find(b => b.textContent === 'Operations Snapshot')
  if (!button) throw new Error('Operations Snapshot tab not found')
  act(() => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  await flush()
}

describe('IntelligenceGraphClient — rendered Operations Snapshot lifecycle', () => {
  it('registers a visibilitychange listener while mounted in operations mode and removes it on unmount', async () => {
    const addSpy = vi.spyOn(document, 'addEventListener')
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    mockFetchQueue()

    mount(<IntelligenceGraphClient />)
    await switchToOperationsTab()

    const registered = addSpy.mock.calls.some(([type]) => type === 'visibilitychange')
    expect(registered).toBe(true)

    unmount()

    const removed = removeSpy.mock.calls.some(([type]) => type === 'visibilitychange')
    expect(removed).toBe(true)
  })

  it('performs real lifecycle cleanup on unmount: no further fetches fire afterward', async () => {
    const calls = mockFetchQueue()
    mount(<IntelligenceGraphClient />)
    await switchToOperationsTab()
    expect(operationsCalls(calls).length).toBe(1)

    unmount()
    const countAtUnmount = operationsCalls(calls).length
    operationsCalls(calls)[0].deferred.resolve(operationsSnapshotPayload('run:late'))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(operationsCalls(calls).length).toBe(countAtUnmount)
  })

  it('does not let a superseded request replace already-rendered state', async () => {
    const calls = mockFetchQueue()
    mount(<IntelligenceGraphClient />)
    await switchToOperationsTab()
    expect(operationsCalls(calls).length).toBe(1)
    const staleRequest = operationsCalls(calls)[0]

    // Manual refresh supersedes the in-flight request before it settles.
    const refreshButton = [...document.querySelectorAll('button')].find(b => b.textContent === 'Hämta ny snapshot')!
    act(() => { refreshButton.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    await flush()
    expect(operationsCalls(calls).length).toBe(2)
    expect(staleRequest.signal.aborted).toBe(true)
    const freshRequest = operationsCalls(calls)[1]

    freshRequest.deferred.resolve(operationsSnapshotPayload('run:fresh'))
    await flush()
    expect(container!.textContent).not.toMatch(/run:stale/)

    // The stale request settling after the fresh one must not overwrite it.
    staleRequest.deferred.resolve(operationsSnapshotPayload('run:stale'))
    await flush()
    expect(document.querySelector('[aria-label="run: run:stale"]')).toBeNull()
  })

  it('does not show failure UI for an aborted request', async () => {
    const calls = mockFetchQueue()
    mount(<IntelligenceGraphClient />)
    await switchToOperationsTab()
    expect(operationsCalls(calls).length).toBe(1)
    const firstRequest = operationsCalls(calls)[0]

    const refreshButton = [...document.querySelectorAll('button')].find(b => b.textContent === 'Hämta ny snapshot')!
    act(() => { refreshButton.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    await flush()
    expect(firstRequest.signal.aborted).toBe(true)

    // The aborted request rejecting (as a real AbortController-driven fetch would)
    // must not surface as a user-visible failure.
    firstRequest.deferred.reject(new DOMException('The user aborted a request.', 'AbortError'))
    await flush()
    expect(container!.textContent).not.toContain('Kunde inte hämta ny snapshot')
    expect(container!.textContent).not.toContain('Operationssnapshot är inte tillgänglig.')
  })

  it('keeps the confirmed snapshot visible during a manual refresh', async () => {
    const calls = mockFetchQueue()
    mount(<IntelligenceGraphClient />)
    await switchToOperationsTab()
    operationsCalls(calls)[0].deferred.resolve(operationsSnapshotPayload('run:confirmed'))
    await flush()
    expect(document.querySelector('[aria-label="run: run:confirmed"]')).not.toBeNull()

    const refreshButton = [...document.querySelectorAll('button')].find(b => b.textContent === 'Hämta ny snapshot')!
    act(() => { refreshButton.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    await flush()

    expect(container!.textContent).toContain('Hämtar ny snapshot…')
    expect(document.querySelector('[aria-label="run: run:confirmed"]')).not.toBeNull()
  })

  it('keeps the confirmed snapshot visible after a refresh failure and shows the truthful retained-snapshot message', async () => {
    const calls = mockFetchQueue()
    mount(<IntelligenceGraphClient />)
    await switchToOperationsTab()
    operationsCalls(calls)[0].deferred.resolve(operationsSnapshotPayload('run:confirmed'))
    await flush()

    const refreshButton = [...document.querySelectorAll('button')].find(b => b.textContent === 'Hämta ny snapshot')!
    act(() => { refreshButton.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    await flush()
    operationsCalls(calls)[1].deferred.reject(new Error('network down'))
    await flush()

    expect(document.querySelector('[aria-label="run: run:confirmed"]')).not.toBeNull()
    expect(container!.textContent).toContain('Kunde inte hämta ny snapshot. Visar senast bekräftade snapshot.')
  })

  it('shows the unavailable message on failure with no prior confirmed snapshot', async () => {
    const calls = mockFetchQueue()
    mount(<IntelligenceGraphClient />)
    await switchToOperationsTab()
    operationsCalls(calls)[0].deferred.reject(new Error('network down'))
    await flush()

    expect(container!.textContent).toContain('Operationssnapshot är inte tillgänglig.')
  })
})
