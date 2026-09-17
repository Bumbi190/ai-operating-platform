/**
 * Phase 18 T2c — the spatial view's visual language, where it is logic:
 * how lines find their way, how a count shows its statuses, and how a project's
 * own colour is lit without inventing one.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { GRAPH_VISUAL_TOKENS } from './graph-visuals'
import type { SpatialLayout, SpatialRunCluster } from './spatial-layout'
import type { SpatialLabelPlacement } from './spatial-labels'
import {
  CLEAR_BEND_FACTORS,
  CLUSTER_STATUS_COLORS,
  SpatialLabelLayer,
  clearSpatialEdgePath,
  clusterSegments,
  hubRingColour,
  identityColour,
  mixColour,
  projectColours,
  spatialEdgePath,
} from './spatial-scene'

/** Points along a path "M x y Q cx cy x y". */
function sample(path: string, steps = 64) {
  const [x1, y1, cx, cy, x2, y2] = path.replace(/[MQ]/g, ' ').trim().split(/\s+/).map(Number)
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps
    const u = 1 - t
    return { x: u * u * x1 + 2 * u * t * cx + t * t * x2, y: u * u * y1 + 2 * u * t * cy + t * t * y2 }
  })
}
const clearOf = (path: string, circle: { x: number; y: number; r: number }) => sample(path).every((point) => Math.hypot(point.x - circle.x, point.y - circle.y) >= circle.r)

describe('phase 18 T2c · lines', () => {
  const source = { x: 0, y: 0, r: 20 }
  const target = { x: 400, y: 0, r: 20 }
  const centre = { x: 200, y: 200 }

  it('draws the plain curve when nothing is in the way, bowed away from the level’s centre and trimmed at both circles', () => {
    const plain = spatialEdgePath(source, target, centre, 0.1)!
    expect(clearSpatialEdgePath(source, target, centre, 0.1, [])).toBe(plain)
    expect(clearSpatialEdgePath(source, target, centre, 0.1, [{ x: 200, y: 300, r: 10 }])).toBe(plain)
    const points = sample(plain)
    // The centre lies below the line, so the curve bows up — by half its control offset (400 × 0.1 / 2).
    expect(Math.min(...points.map((point) => point.y))).toBeLessThan(-15)
    expect(Math.max(...points.map((point) => point.y))).toBeLessThanOrEqual(0)
    expect(Math.hypot(points[0].x - source.x, points[0].y - source.y)).toBeCloseTo(source.r + 3, 1)
    expect(Math.hypot(points.at(-1)!.x - target.x, points.at(-1)!.y - target.y)).toBeCloseTo(target.r + 4, 1)
    // Ends too close to bend draw nothing rather than a line inside the circles.
    expect(spatialEdgePath(source, { x: 30, y: 0, r: 20 }, centre, 0.1)).toBeNull()
  })

  it('bends further, or the other way, around a circle it does not touch — deterministically', () => {
    const plain = spatialEdgePath(source, target, centre, 0.1)!
    const onTheCurve = sample(plain)[32]
    const obstacle = { x: onTheCurve.x, y: onTheCurve.y, r: 12 }
    expect(clearOf(plain, obstacle)).toBe(false)
    const routed = clearSpatialEdgePath(source, target, centre, 0.1, [obstacle])!
    expect(routed).not.toBe(plain)
    expect(clearOf(routed, obstacle)).toBe(true)
    expect(clearSpatialEdgePath(source, target, centre, 0.1, [obstacle])).toBe(routed)
    // It is one of the listed bends, tried in order.
    const bends = CLEAR_BEND_FACTORS.map((factor) => spatialEdgePath(source, target, centre, 0.1 * factor))
    expect(bends).toContain(routed)
    expect(bends.findIndex((path) => clearOf(path!, obstacle))).toBe(bends.indexOf(routed))
  })

  it('keeps the first bend when no bend clears, so a line never disappears', () => {
    const wall = Array.from({ length: 9 }, (_, index) => ({ x: 200, y: -400 + index * 100, r: 60 }))
    expect(clearSpatialEdgePath(source, target, centre, 0.1, wall)).toBe(spatialEdgePath(source, target, centre, 0.1))
  })
})

describe('phase 18 T2c · run counts', () => {
  const cluster = (distribution: SpatialRunCluster['distribution']): SpatialRunCluster => ({
    id: 'cluster:w', parentId: 'workflow:w', kind: 'workflow', x: 0, y: 0, r: 10,
    count: distribution.reduce((sum, entry) => sum + entry.count, 0), memberIds: [], distribution, attentionCount: 0,
  })

  it('divides the ring by stored status, most frequent first, and covers it exactly', () => {
    const segments = clusterSegments(cluster([{ status: 'done', count: 26 }, { status: 'failed', count: 2 }, { status: 'running', count: 1 }]))
    expect(segments.map((segment) => segment.status)).toEqual(['done', 'failed', 'running'])
    expect(segments[0].start).toBe(0)
    expect(segments.at(-1)!.end).toBeCloseTo(1, 9)
    for (let index = 1; index < segments.length; index++) expect(segments[index].start).toBeCloseTo(segments[index - 1].end, 9)
    expect(segments.map((segment) => segment.colour)).toEqual([GRAPH_VISUAL_TOKENS.status.completed, GRAPH_VISUAL_TOKENS.status.failed, GRAPH_VISUAL_TOKENS.status.running])
  })

  it('draws a status it has no colour for as cancelled grey, never as success', () => {
    const [segment] = clusterSegments(cluster([{ status: 'mystery', count: 3 }]))
    expect(segment.colour).toBe(GRAPH_VISUAL_TOKENS.status.cancelled)
    expect(CLUSTER_STATUS_COLORS.mystery).toBeUndefined()
  })
})

describe('phase 18 T2c · a project’s own colour', () => {
  it('mixes toward a colour exactly, and leaves what it cannot read alone', () => {
    expect(mixColour('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mixColour('#34d399', '#ffffff', 0)).toBe('#34d399')
    expect(mixColour('#34d399', '#ffffff', 1)).toBe('#ffffff')
    expect(mixColour('teal', '#ffffff', 0.5)).toBe('teal')
  })

  it('lifts a grey project’s ring so a quiet project never looks switched off, and keeps a coloured one as stored', () => {
    expect(hubRingColour('#34d399')).toBe('#34d399')
    expect(hubRingColour('#8b5cf6')).toBe('#8b5cf6')
    expect(hubRingColour('#d4a574')).toBe('#d4a574')
    const audit = hubRingColour('#6b7280')
    expect(audit).not.toBe('#6b7280')
    const brightness = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16)
    expect(brightness(audit)).toBeGreaterThan(brightness('#6b7280'))
  })

  it('colours a node by its own project, and a node without one neutrally', () => {
    const layout = { hubs: [{ projectId: 'p1', color: '#34d399' }, { projectId: 'p2', color: '#8b5cf6' }] } as unknown as SpatialLayout
    const colours = projectColours(layout)
    expect(identityColour({ id: 'agent:a', kind: 'agent', label: 'A', source: 'runtime', projectId: 'p2', metadata: {} }, colours)).toBe('#8b5cf6')
    const neutral = identityColour({ id: 'output:o', kind: 'output', label: 'O', source: 'runtime', metadata: {} }, colours)
    expect([...colours.values()]).not.toContain(neutral)
  })
})

describe('phase 18 T2c · a label’s detail line', () => {
  it('draws a previewed workflow’s run count as a muted line under its name, where the plan measured it', () => {
    const placement: SpatialLabelPlacement = {
      key: 'node:workflow:tp-1', kind: 'node', ownerId: 'workflow:tp-1', tier: 5, lines: ['Daglig short'],
      x: 10, y: 20, anchor: 'middle', fontSize: 12.5, lineHeight: 15.5, weight: 600, tone: 'normal',
      detail: { text: '5 körningar', fontSize: 11, dy: 14.03 },
      box: { minX: -30, minY: 10, maxX: 50, maxY: 36.89 }, widthPx: 80,
    }
    const markup = renderToStaticMarkup(createElement(SpatialLabelLayer, { placements: [placement], dimmedOwners: () => false }))
    const name = markup.indexOf('>Daglig short</tspan>')
    expect(name).toBeGreaterThan(0)
    const detail = markup.slice(markup.lastIndexOf('<tspan', markup.indexOf('>5 körningar</tspan>')))
    expect(markup.indexOf('>5 körningar</tspan>')).toBeGreaterThan(name)
    expect(detail).toMatch(/^<tspan x="10" dy="14.03" font-size="11" font-weight="500" class="[^"]*labelMuted[^"]*" data-label-detail="">5 körningar<\/tspan>/)
    // Without a detail, a label is drawn exactly as before.
    const plain = renderToStaticMarkup(createElement(SpatialLabelLayer, { placements: [{ ...placement, detail: undefined }], dimmedOwners: () => false }))
    expect(plain).not.toContain('data-label-detail')
    expect(plain).not.toContain('körningar')
  })
})
