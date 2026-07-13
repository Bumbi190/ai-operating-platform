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

function renderGraph(mode: 'system' | 'operations', selectedId: string | null = null): string {
  return renderToStaticMarkup(createElement(GraphCanvas, {
    nodes,
    edges: [],
    selectedId,
    onSelect: () => {},
    mode,
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
    expect(nodeButton).toContain('aria-label="project: Alpha project"')
    expect(nodeButton).toContain('aria-pressed="true"')
    expect(markup).toContain('<title>Alpha project · project</title>')
  })

  it('keeps System Map and Live Operations graph names distinct', () => {
    const system = openingTagsByRole(renderGraph('system'), 'group')[0]
    const operations = openingTagsByRole(renderGraph('operations'), 'group')[0]

    expect(system).toContain('aria-label="System Map intelligence graph"')
    expect(operations).toContain('aria-label="Live Operations snapshot graph"')
    expect(system).not.toBe(operations)
  })
})
