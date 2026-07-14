import React, { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

;(globalThis as typeof globalThis & { React: typeof React }).React = React
import { describe, expect, it } from 'vitest'
import type { IntelligenceGraphNode, OperationsSnapshotMeta } from '@/lib/intelligence/graph-contract'
import {
  getOperationsSnapshotStateCopy,
  getOperationsSnapshotUiState,
  IntelligenceGraphClient,
  OperationsSnapshotStateMessage,
  OperationsSnapshotStatus,
  shouldRenderOperationsSnapshotGraph,
} from './IntelligenceGraphClient'

const snapshot: OperationsSnapshotMeta = {
  generatedAt: '2026-07-14T10:00:00.000Z',
  requestedHours: 24,
  authorizedProjectIds: ['project-1'],
  appliedProjectId: null,
  returnedProjectIds: ['project-1'],
  queriedSources: ['projects', 'agents', 'workflows', 'runs'],
  delivery: 'snapshot_only',
  sourceFreshness: 'unknown',
  capabilities: {
    realtime: false, polling: true, incidents: false, toolCalls: false,
    atlasRuntime: false, managerRuntime: false, correlation: false, causation: false, replay: false,
  },
}

const runNode: IntelligenceGraphNode = {
  id: 'run:1', kind: 'run', label: 'Run 1', source: 'runtime', projectId: 'project-1', metadata: {},
}

const configurationNodes: IntelligenceGraphNode[] = [
  { id: 'project:1', kind: 'project', label: 'Project 1', source: 'runtime', projectId: 'project-1', metadata: {} },
  { id: 'workflow:1', kind: 'workflow', label: 'Workflow 1', source: 'runtime', projectId: 'project-1', metadata: {} },
]

describe('Operations Snapshot UI states', () => {
  it('renders the snapshot mode label and keeps Replay disabled', () => {
    const markup = renderToStaticMarkup(createElement(IntelligenceGraphClient))

    expect(markup).toContain('Operations Snapshot')
    expect(markup).not.toContain('Live Operations')
    expect(markup).toContain('Execution Replay')
    expect(markup).toContain('disabled=""')
  })

  it('renders truthful snapshot status without live operational claims', () => {
    const markup = renderToStaticMarkup(createElement(OperationsSnapshotStatus, { snapshot }))

    expect(markup).toContain('Snapshot')
    expect(markup).toContain('Källfärskhet: okänd')
    expect(markup).toContain('Senast bekräftade snapshot:')
    for (const claim of ['Live', 'Realtime', 'Fresh', 'Stale', 'Reconnecting']) expect(markup).not.toContain(claim)
  })

  it('uses exact truthful copy for loading, unavailable, and successful empty snapshots', () => {
    expect(getOperationsSnapshotStateCopy('loading')).toEqual({ title: 'Hämtar operationssnapshot…' })
    expect(getOperationsSnapshotStateCopy('unavailable')).toEqual({
      title: 'Operationssnapshot är inte tillgänglig.',
      body: 'Ingen bekräftad operationssnapshot finns att visa.',
    })
    expect(getOperationsSnapshotStateCopy('empty-authorized-scope')).toEqual({
      title: 'Tom operationssnapshot',
      body: 'Ingen operationsdata i behörig scope.',
    })
    expect(getOperationsSnapshotStateCopy('empty-runs')).toEqual({
      title: 'Tom operationssnapshot',
      body: 'Inga körningar i vald scope och tidsperiod.',
    })
  })

  it('fails safely when the server generation time is malformed', () => {
    const markup = renderToStaticMarkup(createElement(OperationsSnapshotStatus, {
      snapshot: { ...snapshot, generatedAt: 'not-a-timestamp' },
    }))

    expect(markup).toContain('Senast bekräftade snapshot: okänd')
  })

  it('distinguishes loading, unavailable, authorized-scope empty, and no-run snapshots', () => {
    expect(getOperationsSnapshotUiState({ loading: true, payload: null, nodes: [] })).toBe('loading')
    expect(getOperationsSnapshotUiState({ loading: false, payload: null, nodes: [] })).toBe('unavailable')
    expect(getOperationsSnapshotUiState({
      loading: false,
      payload: { available: true, snapshot: { ...snapshot, authorizedProjectIds: [], returnedProjectIds: [] } },
      nodes: [],
    })).toBe('empty-authorized-scope')
    expect(getOperationsSnapshotUiState({
      loading: false,
      payload: { available: true, snapshot },
      nodes: [],
    })).toBe('empty-runs')
    expect(getOperationsSnapshotUiState({
      loading: false,
      payload: { available: true, snapshot },
      nodes: [runNode],
    })).toBe('available')
  })

  it('shows no-runs state and suppresses the confirmed graph for configuration-only snapshots', () => {
    const state = getOperationsSnapshotUiState({
      loading: false,
      payload: { available: true, snapshot },
      nodes: configurationNodes,
    })
    const markup = renderToStaticMarkup(createElement(OperationsSnapshotStateMessage, { state }))

    expect(state).toBe('empty-runs')
    expect(markup).toContain('Inga körningar i vald scope och tidsperiod.')
    expect(shouldRenderOperationsSnapshotGraph({ state, snapshot, nodes: configurationNodes })).toBe(false)
  })

  it('treats a snapshot with a verified run as available for graph presentation', () => {
    const nodes = [...configurationNodes, runNode]
    const state = getOperationsSnapshotUiState({
      loading: false,
      payload: { available: true, snapshot },
      nodes,
    })

    expect(state).toBe('available')
    expect(shouldRenderOperationsSnapshotGraph({ state, snapshot, nodes })).toBe(true)
  })
})
