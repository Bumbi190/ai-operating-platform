import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { IntelligenceGraphNode } from '@/lib/intelligence/graph-contract'
import { GraphCanvas } from './GraphCanvas'

const nodes: IntelligenceGraphNode[] = [{
  id: 'project:alpha',
  kind: 'project',
  label: 'Alpha project',
  source: 'runtime',
  projectId: 'alpha',
  metadata: {},
}]

function renderGraph(mode: 'system' | 'operations', selectedId: string | null = null, inspectorOpen = false): string {
  return renderToStaticMarkup(createElement(GraphCanvas, {
    nodes,
    edges: [],
    selectedId,
    onSelect: () => {},
    mode,
    inspectorOpen,
  }))
}

function renderNode(node: IntelligenceGraphNode): string {
  return renderToStaticMarkup(createElement(GraphCanvas, {
    nodes: [node],
    edges: [],
    selectedId: node.id,
    onSelect: () => {},
    mode: 'operations',
  }))
}

function openingTagsByRole(markup: string, role: string): string[] {
  return markup.match(new RegExp(`<[^>]+role="${role}"[^>]*>`, 'g')) ?? []
}

describe('GraphCanvas rendered accessibility semantics', () => {
  it('exposes the labeled graph group and selected node button semantics', () => {
    const markup = renderGraph('system', nodes[0].id)
    const [container] = openingTagsByRole(markup, 'group')
    const [nodeButton] = openingTagsByRole(markup, 'button')

    expect(container).toContain('aria-label="System Map intelligence graph"')
    expect(container).toContain('data-semantic-zoom="portfolio"')
    expect(container).toContain('data-structural-detail="landmarks"')
    expect(container).toContain('data-label-detail="landmarks"')
    expect(container).toContain('data-edge-detail="primary"')
    expect(container).toContain('data-interaction-detail="select"')
    expect(container).toContain('data-inspector-detail="summary"')
    expect(nodeButton).toContain('aria-label="project: Alpha project"')
    expect(nodeButton).toContain('aria-pressed="true"')
    expect(markup).toContain('<title>Alpha project · project</title>')
    expect(markup).toContain('aria-label="Alpha project territory"')
    expect(markup).toContain('<title>Alpha project · territory</title>')
  })

  it('keeps critical operational truth discoverable at portfolio level without exposing every run', () => {
    const operationalNodes: IntelligenceGraphNode[] = [
      { id: 'project:alpha', kind: 'project', label: 'Alpha', source: 'runtime', projectId: 'alpha', metadata: {} },
      { id: 'run:quiet', kind: 'run', label: 'Quiet run', source: 'runtime', projectId: 'alpha', status: 'done', metadata: {} },
      { id: 'run:failed', kind: 'run', label: 'Failed run', source: 'runtime', projectId: 'alpha', status: 'failed', metadata: {} },
    ]
    const markup = renderToStaticMarkup(createElement(GraphCanvas, {
      nodes: operationalNodes,
      edges: [],
      selectedId: null,
      onSelect: () => {},
      mode: 'operations',
    }))

    expect(markup).toContain('aria-label="run: Failed run (failed)"')
    expect(markup).not.toContain('aria-label="run: Quiet run (done)"')
  })

  it('describes workflow status as configuration truth in rendered tooltips', () => {
    const active = renderNode({
      id: 'workflow:active', kind: 'workflow', label: 'Active workflow', source: 'runtime', status: 'active', metadata: {},
    })
    const inactive = renderNode({
      id: 'workflow:inactive', kind: 'workflow', label: 'Inactive workflow', source: 'runtime', status: 'inactive', metadata: {},
    })
    const unknown = renderNode({
      id: 'workflow:unknown', kind: 'workflow', label: 'Unknown workflow', source: 'runtime', status: 'paused', metadata: {},
    })

    expect(active).toContain('<title>Active workflow · workflow · konfiguration aktiverad</title>')
    expect(inactive).toContain('<title>Inactive workflow · workflow · konfiguration inaktiverad</title>')
    expect(unknown).toContain('<title>Unknown workflow · workflow · konfiguration okänd</title>')
    expect(active).not.toContain('workflow · active')
    expect(inactive).not.toContain('workflow · inactive')
    expect(unknown).not.toContain('workflow · paused')
  })

  it('describes a workflow with missing status as unknown configuration truth', () => {
    const missingStatus = renderNode({
      id: 'workflow:missing-status', kind: 'workflow', label: 'Missing-status workflow', source: 'runtime', metadata: {},
    })

    expect(missingStatus).toContain('<title>Missing-status workflow · workflow · konfiguration okänd</title>')
    expect(missingStatus).not.toContain('workflow · active')
    expect(missingStatus).not.toContain('workflow · inactive')
    expect(missingStatus).not.toContain('workflow · running')
  })

  it('keeps non-workflow rendered tooltip wording unchanged', () => {
    const run = renderNode({
      id: 'run:current', kind: 'run', label: 'Current run', source: 'runtime', status: 'running', metadata: {},
    })
    const agent = renderNode({
      id: 'agent:configured', kind: 'agent', label: 'Configured agent', source: 'runtime', status: 'active', metadata: {},
    })
    const project = renderNode({
      id: 'project:alpha', kind: 'project', label: 'Project Alpha', source: 'runtime', metadata: {},
    })
    const approval = renderNode({
      id: 'approval:pending', kind: 'approval', label: 'Pending approval', source: 'runtime', status: 'pending', metadata: {},
    })

    expect(run).toContain('<title>Current run · run · running</title>')
    expect(agent).toContain('<title>Configured agent · agent · active</title>')
    expect(project).toContain('<title>Project Alpha · project</title>')
    expect(approval).toContain('<title>Pending approval · approval · pending</title>')
  })

  it('keeps System Map and Operations Snapshot graph names distinct', () => {
    const system = openingTagsByRole(renderGraph('system'), 'group')[0]
    const operations = openingTagsByRole(renderGraph('operations'), 'group')[0]

    expect(system).toContain('aria-label="System Map intelligence graph"')
    expect(operations).toContain('aria-label="Operations Snapshot graph"')
    expect(system).not.toBe(operations)
  })

  it('keeps the deterministic rendered layout stable when the inspector opens and closes', () => {
    const closed = renderGraph('operations', nodes[0].id, false)
    const opened = renderGraph('operations', nodes[0].id, true)
    const nodeTransform = /transform="translate\(([^)]+)\)"/

    expect(closed.match(nodeTransform)?.[1]).toBe(opened.match(nodeTransform)?.[1])
    expect(opened).toContain('aria-pressed="true"')
  })
})
