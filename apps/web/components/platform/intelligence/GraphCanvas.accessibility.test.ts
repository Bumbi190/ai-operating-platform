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

  it('keeps System Map and Live Operations graph names distinct', () => {
    const system = openingTagsByRole(renderGraph('system'), 'group')[0]
    const operations = openingTagsByRole(renderGraph('operations'), 'group')[0]

    expect(system).toContain('aria-label="System Map intelligence graph"')
    expect(operations).toContain('aria-label="Live Operations snapshot graph"')
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
