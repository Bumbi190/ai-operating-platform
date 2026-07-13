import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { IntelligenceGraphEdge, IntelligenceGraphNode } from '@/lib/intelligence/graph-contract'
import type { PositionedNode } from './force-layout'
import {
  calculateGraphBounds,
  fitGraphBounds,
  formatGraphLabel,
  getEdgeReadability,
  getGraphZoomLevel,
  getLabelBudget,
  getLabelPriority,
  getNodeSemanticVisibility,
  getScreenStableLabelScale,
  getSemanticZoomPolicy,
  getTerritoryLabelTypography,
  keepNodesVisible,
  selectVisibleNodeLabels,
} from './graph-readability'
import { getEdgeVisual, getStaticLabelPriority, type ProjectTerritory } from './graph-visuals'

function node(kind: IntelligenceGraphNode['kind'], id: string, overrides: Partial<IntelligenceGraphNode> = {}): IntelligenceGraphNode {
  return {
    id, kind, label: id, source: ['project', 'agent', 'workflow', 'run', 'approval', 'output', 'task'].includes(kind) ? 'runtime' : 'graphify',
    metadata: {}, ...overrides,
  }
}

function position(id: string, x: number, y: number, r = 14): PositionedNode { return { id, x, y, r } }
function edge(relation: IntelligenceGraphEdge['relation']): IntelligenceGraphEdge {
  return { id: `edge:${relation}`, source: 'a', target: 'b', relation, metadata: {} }
}
const view = (w: number) => ({ x: 0, y: 0, w, h: w * 2 / 3 })

describe('Phase 2 canonical semantic zoom and readability', () => {
  it('maps the retained SVG camera deterministically to the five canonical levels', () => {
    expect(getGraphZoomLevel(1200)).toBe('portfolio')
    expect(getGraphZoomLevel(900)).toBe('project')
    expect(getGraphZoomLevel(600)).toBe('operational')
    expect(getGraphZoomLevel(300)).toBe('detail')
    expect(getGraphZoomLevel(900, true)).toBe('execution')
    expect(getSemanticZoomPolicy('portfolio').structuralDetail).toBe('landmarks')
    expect(getSemanticZoomPolicy('execution').interactionDetail).toBe('path')
    expect(getSemanticZoomPolicy('detail').inspectorDetail).toBe('full')
  })

  it('separates structural visibility while preserving selected and critical truth', () => {
    const quietRun = node('run', 'quiet', { status: 'done' })
    const failedRun = node('run', 'failed', { status: 'failed' })
    const project = node('project', 'project')
    const options = { level: 'portfolio' as const, mode: 'operations' as const }
    expect(getNodeSemanticVisibility(project, options)).toBe('visible')
    expect(getNodeSemanticVisibility(quietRun, options)).toBe('hidden')
    expect(getNodeSemanticVisibility(failedRun, options)).toBe('visible')
    expect(getNodeSemanticVisibility(quietRun, { ...options, selectedId: quietRun.id })).toBe('visible')
  })

  it('uses the canonical interaction and attention priority before the one static role source', () => {
    const project = node('project', 'project')
    const workflow = node('workflow', 'workflow')
    const failed = node('run', 'failed', { status: 'failed' })
    const approval = node('approval', 'approval', { status: 'pending' })
    expect(getLabelPriority(project, { selectedId: project.id })).toBe(1500)
    expect(getLabelPriority(project, { focusId: project.id })).toBe(1450)
    expect(getLabelPriority(project, { hoverId: project.id })).toBe(1400)
    expect(getLabelPriority(failed)).toBe(1350)
    expect(getLabelPriority(approval)).toBe(1300)
    expect(getLabelPriority(project)).toBe(getStaticLabelPriority(project))
    expect(getLabelPriority(project)).toBeGreaterThan(getLabelPriority(workflow))
  })

  it('wraps long names to at most two lines and removes technical hash suffixes', () => {
    expect(formatGraphLabel('Generate Voiceover · b5fcaa', 'ordinary')).toEqual(['Generate Voiceover'])
    const lines = formatGraphLabel('A very long workflow name that needs deterministic compact wrapping for graph display', 'workflow')
    expect(lines).toHaveLength(2)
    expect(lines.every(line => line.length <= 28)).toBe(true)
    expect(lines[1].endsWith('…')).toBe(true)
  })

  it('keeps selected labels visible and rejects colliding ordinary labels deterministically', () => {
    const nodes = [node('run', 'selected'), node('run', 'ordinary-a'), node('run', 'ordinary-b')]
    const layout = new Map(nodes.map(value => [value.id, position(value.id, 300, 240)]))
    const labels = selectVisibleNodeLabels({
      nodes, layout, view: view(600), viewportWidth: 900, viewportHeight: 600,
      mode: 'operations', level: 'detail', selectedId: 'selected',
    })
    expect(labels.map(label => label.id)).toContain('selected')
    expect(labels.filter(label => label.id !== 'selected').length).toBeLessThan(2)
    expect(selectVisibleNodeLabels({
      nodes, layout, view: view(600), viewportWidth: 900, viewportHeight: 600,
      mode: 'operations', level: 'detail', selectedId: 'selected',
    })).toEqual(labels)
  })

  it('preserves a routed attention label when all primary anchors are occupied', () => {
    const failed = node('run', 'failed', { status: 'failed' })
    const blockers = Array.from({ length: 8 }, (_, index) => node('project', `project-${index}`))
    const nodes = [failed, ...blockers]
    const layout = new Map(nodes.map((value, index) => [
      value.id,
      index === 0 ? position(value.id, 300, 260) : position(value.id, 300 + Math.cos(index) * 38, 260 + Math.sin(index) * 38, 18),
    ]))
    const labels = selectVisibleNodeLabels({
      nodes, layout, view: view(600), viewportWidth: 900, viewportHeight: 600,
      mode: 'operations', level: 'detail',
    })
    expect(labels.map(label => label.id)).toContain(failed.id)
  })

  it('uses additional diagonal offsets and short leader lines for important routed labels', () => {
    const selected = node('run', 'selected')
    const blockers = Array.from({ length: 4 }, (_, index) => node('project', `blocker-${index}`))
    const nodes = [selected, ...blockers]
    const layout = new Map<string, PositionedNode>([
      [selected.id, position(selected.id, 300, 260, 14)],
      [blockers[0].id, position(blockers[0].id, 300, 292, 18)],
      [blockers[1].id, position(blockers[1].id, 300, 222, 18)],
      [blockers[2].id, position(blockers[2].id, 342, 260, 18)],
      [blockers[3].id, position(blockers[3].id, 258, 260, 18)],
    ])
    const label = selectVisibleNodeLabels({
      nodes, layout, view: view(600), viewportWidth: 900, viewportHeight: 600,
      mode: 'operations', level: 'detail', selectedId: selected.id,
    }).find(value => value.id === selected.id)!
    expect(label.leaderLine).toBeDefined()
    expect(Math.hypot(label.leaderLine!.x2 - label.leaderLine!.x1, label.leaderLine!.y2 - label.leaderLine!.y1)).toBeLessThan(80)
  })

  it('keeps typography screen-stable and role-scaled at every camera level', () => {
    const hovered = node('run', 'hovered')
    const layout = new Map([[hovered.id, position(hovered.id, 100, 100)]])
    for (const width of [1200, 900, 600, 300, 80]) {
      const [label] = selectVisibleNodeLabels({
        nodes: [hovered], layout, view: view(width), viewportWidth: 960, viewportHeight: 640,
        hoverId: hovered.id, level: width === 80 ? 'execution' : getGraphZoomLevel(width),
      })
      expect(label.fontSize * 960 / width).toBeCloseTo(15, 6)
    }
    expect(getScreenStableLabelScale(1200, 960)).toBeCloseTo(1.25, 6)
    expect(getTerritoryLabelTypography(600, 960).fontSize * 960 / 600).toBeCloseTo(13.5, 6)
  })

  it('uses responsive dynamic budgets within canonical upper guidance', () => {
    expect(getLabelBudget('portfolio', 80, 0, { width: 1200, height: 800 })).toBeGreaterThanOrEqual(8)
    expect(getLabelBudget('portfolio', 80, 0, { width: 1200, height: 800 })).toBeLessThanOrEqual(25)
    expect(getLabelBudget('operational', 80, 0, { width: 1200, height: 800 })).toBeGreaterThan(25)
    expect(getLabelBudget('detail', 80, 0, { width: 1200, height: 800 })).toBeLessThanOrEqual(120)
    expect(getLabelBudget('operational', 300, 0, { width: 390, height: 844 }))
      .toBeLessThan(getLabelBudget('operational', 80, 0, { width: 1200, height: 800 }))
    expect(getLabelBudget('portfolio', 80, 30, { width: 390, height: 844 })).toBe(30)
  })

  it('progressively reveals edges while selected and attention paths survive every level', () => {
    const association = edge('TRACKS')
    const visual = getEdgeVisual(association)
    expect(getEdgeReadability({ edge: association, visual, zoomLevel: 'portfolio', highlighted: false, attentionPath: false, hasInteraction: false }).visible).toBe(false)
    expect(getEdgeReadability({ edge: association, visual, zoomLevel: 'detail', highlighted: false, attentionPath: false, hasInteraction: false }).visible).toBe(true)
    expect(getEdgeReadability({ edge: association, visual, zoomLevel: 'portfolio', highlighted: true, attentionPath: false, hasInteraction: true }).opacity).toBeGreaterThan(0.9)
    expect(getEdgeReadability({ edge: association, visual, zoomLevel: 'portfolio', highlighted: false, attentionPath: true, hasInteraction: false }).visible).toBe(true)
  })

  it('fits territory labels and preserves selected camera scale during inspector resize', () => {
    const layout = new Map([
      ['top', position('top', 80, 70, 30)],
      ['bottom', position('bottom', 1080, 760, 20)],
    ])
    const territories: ProjectTerritory[] = [{ id: 'gainpilot', label: 'GainPilot', color: '#112233', cx: 1010, cy: 700, rx: 145, ry: 105 }]
    const bounds = calculateGraphBounds(layout, territories)
    const fitted = fitGraphBounds(bounds, { width: 960, height: 540 }, 64)
    expect(fitted.w / fitted.h).toBeCloseTo(16 / 9, 6)
    const adjusted = keepNodesVisible({ x: 0, y: 0, w: 900, h: 600 }, layout, new Set(['bottom']))
    expect(adjusted.w).toBe(900)
    expect(adjusted.h).toBe(600)
    expect(adjusted.x).toBeGreaterThan(0)
    const mobileAdjusted = keepNodesVisible({ x: 0, y: 0, w: 900, h: 600 }, layout, new Set(['bottom']), { bottom: 280 })
    expect(mobileAdjusted.y).toBeGreaterThan(adjusted.y)
  })

  it('keeps Replay disabled and reduced-motion styling present', () => {
    const client = readFileSync(new URL('./IntelligenceGraphClient.tsx', import.meta.url), 'utf8')
    const css = readFileSync(new URL('./GraphCanvas.module.css', import.meta.url), 'utf8')
    expect(client).toContain('<TabButton active={false} disabled')
    expect(client).toContain('Execution Replay')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })
})
