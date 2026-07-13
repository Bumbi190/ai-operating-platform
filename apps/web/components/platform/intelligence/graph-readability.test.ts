import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { IntelligenceGraphEdge, IntelligenceGraphNode } from '@/lib/intelligence/graph-contract'
import type { PositionedNode } from './force-layout'
import {
  calculateGraphBounds,
  fitGraphBounds,
  getEdgeReadability,
  getGraphZoomLevel,
  getLabelPriority,
  getScreenStableLabelScale,
  keepNodesVisible,
  selectVisibleNodeLabels,
} from './graph-readability'
import { getEdgeVisual, type ProjectTerritory } from './graph-visuals'

function node(kind: IntelligenceGraphNode['kind'], id: string, overrides: Partial<IntelligenceGraphNode> = {}): IntelligenceGraphNode {
  return {
    id,
    kind,
    label: `${kind} ${id}`,
    source: ['project', 'agent', 'workflow', 'run', 'approval', 'output', 'task'].includes(kind) ? 'runtime' : 'graphify',
    metadata: {},
    ...overrides,
  }
}

function position(id: string, x: number, y: number, r = 14): PositionedNode {
  return { id, x, y, r }
}

function edge(relation: IntelligenceGraphEdge['relation']): IntelligenceGraphEdge {
  return { id: `edge:${relation}`, source: 'a', target: 'b', relation, metadata: {} }
}

describe('Phase 1.1 graph readability policy', () => {
  it('uses deterministic verified-role label priority', () => {
    const selected = node('run', 'selected')
    expect(getLabelPriority(selected, { selectedId: selected.id })).toBeGreaterThan(getLabelPriority(node('project', 'project')))
    expect(getLabelPriority(node('project', 'project'))).toBeGreaterThan(getLabelPriority(node('workflow', 'workflow')))
    expect(getLabelPriority(node('workflow', 'workflow'))).toBeGreaterThan(getLabelPriority(node('approval', 'approval', { status: 'pending' })))
    expect(getLabelPriority(node('approval', 'approval', { status: 'pending' }))).toBeGreaterThan(getLabelPriority(node('agent', 'agent')))
    expect(getLabelPriority(node('agent', 'agent'))).toBeGreaterThan(getLabelPriority(node('run', 'run')))
  })

  it('suppresses ordinary overview labels and caps structural workflow detail', () => {
    const nodes = [
      node('project', 'project'),
      ...Array.from({ length: 5 }, (_, index) => node('workflow', `workflow:${index}`, { degree: 10 - index })),
      node('agent', 'agent'),
      node('run', 'run'),
      node('task', 'task'),
      node('output', 'output'),
    ]
    const layout = new Map(nodes.map((value, index) => [value.id, position(value.id, 80 + index * 100, 120 + (index % 2) * 100)]))
    const visible = selectVisibleNodeLabels({ nodes, layout, viewWidth: 1200 })
    const ids = new Set(visible.map(label => label.id))

    expect(getGraphZoomLevel(1200)).toBe('overview')
    expect(ids.has('project')).toBe(true)
    expect([...ids].filter(id => id.startsWith('workflow:'))).toHaveLength(2)
    expect(ids.has('agent')).toBe(false)
    expect(ids.has('run')).toBe(false)
    expect(ids.has('task')).toBe(false)
    expect(ids.has('output')).toBe(false)
  })

  it('keeps selected and hovered labels visible at overview without fabricating nodes', () => {
    const nodes = [node('run', 'selected'), node('agent', 'hovered'), node('output', 'quiet')]
    const layout = new Map([
      ['selected', position('selected', 100, 100)],
      ['hovered', position('hovered', 105, 105)],
      ['quiet', position('quiet', 110, 110)],
    ])
    const visible = selectVisibleNodeLabels({
      nodes,
      layout,
      viewWidth: 1200,
      selectedId: 'selected',
      hoverId: 'hovered',
    })
    const ids = visible.map(label => label.id)

    expect(ids).toContain('selected')
    expect(ids).toContain('hovered')
    expect(ids).not.toContain('quiet')
    expect(ids.every(id => nodes.some(value => value.id === id))).toBe(true)
  })

  it('limits inspector mode labels to landmarks, attention, and the selected neighborhood', () => {
    const nodes = [
      node('run', 'selected'),
      node('agent', 'neighbor'),
      node('workflow', 'unrelated-workflow'),
      node('output', 'unrelated-output'),
    ]
    const layout = new Map(nodes.map((value, index) => [value.id, position(value.id, 100 + index * 180, 200)]))
    const visible = selectVisibleNodeLabels({
      nodes,
      layout,
      viewWidth: 600,
      selectedId: 'selected',
      neighborIds: new Set(['selected', 'neighbor']),
    })
    const ids = visible.map(label => label.id)

    expect(ids).toContain('selected')
    expect(ids).toContain('neighbor')
    expect(ids).not.toContain('unrelated-workflow')
    expect(ids).not.toContain('unrelated-output')
  })

  it('keeps label size approximately stable in screen space', () => {
    const overviewScale = getScreenStableLabelScale(1200)
    const closeScale = getScreenStableLabelScale(600)
    expect(overviewScale / 1200).toBeCloseTo(closeScale / 600, 6)
    expect(getScreenStableLabelScale(30)).toBe(0.1)
    expect(getScreenStableLabelScale(5000)).toBe(3)
  })

  it('strongly fades unrelated edges and suppresses low-value overview detail', () => {
    const association = edge('TRACKS')
    const associationVisual = getEdgeVisual(association)
    const overview = getEdgeReadability({
      edge: association,
      visual: associationVisual,
      zoomLevel: 'overview',
      highlighted: false,
      attentionPath: false,
      hasInteraction: false,
    })
    const focusedElsewhere = getEdgeReadability({
      edge: edge('STARTED'),
      visual: getEdgeVisual(edge('STARTED')),
      zoomLevel: 'medium',
      highlighted: false,
      attentionPath: false,
      hasInteraction: true,
    })
    const selectedPath = getEdgeReadability({
      edge: association,
      visual: associationVisual,
      zoomLevel: 'overview',
      highlighted: true,
      attentionPath: false,
      hasInteraction: true,
    })

    expect(overview.visible).toBe(false)
    expect(focusedElsewhere.opacity).toBeLessThan(0.02)
    expect(selectedPath.visible).toBe(true)
    expect(selectedPath.opacity).toBeGreaterThan(0.9)
  })

  it('fits territory labels and padding inside the usable viewport', () => {
    const layout = new Map([
      ['top', position('top', 80, 70, 30)],
      ['bottom', position('bottom', 1080, 760, 20)],
    ])
    const territories: ProjectTerritory[] = [{
      id: 'gainpilot',
      label: 'GainPilot',
      color: '#112233',
      cx: 1010,
      cy: 700,
      rx: 145,
      ry: 105,
    }]
    const bounds = calculateGraphBounds(layout, territories)
    const view = fitGraphBounds(bounds, { width: 960, height: 540 }, 64)

    expect(view.w / view.h).toBeCloseTo(16 / 9, 6)
    expect(view.x).toBeLessThan(bounds.minX)
    expect(view.y).toBeLessThan(bounds.minY)
    expect(view.x + view.w).toBeGreaterThan(bounds.maxX)
    expect(view.y + view.h).toBeGreaterThan(bounds.maxY)
  })

  it('pans minimally to keep the selected neighborhood visible after inspector resize', () => {
    const layout = new Map([
      ['selected', position('selected', 960, 400, 20)],
      ['neighbor', position('neighbor', 1010, 430, 14)],
    ])
    const original = { x: 0, y: 0, w: 900, h: 600 }
    const adjusted = keepNodesVisible(original, layout, new Set(['selected', 'neighbor']))

    expect(adjusted.w).toBe(original.w)
    expect(adjusted.h).toBe(original.h)
    expect(adjusted.x).toBeGreaterThan(original.x)
    expect(adjusted.y).toBe(original.y)
  })

  it('keeps Execution Replay explicitly disabled', () => {
    const clientSource = readFileSync(new URL('./IntelligenceGraphClient.tsx', import.meta.url), 'utf8')
    expect(clientSource).toContain('<TabButton active={false} disabled')
    expect(clientSource).toContain('Execution Replay')
  })
})
