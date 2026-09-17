/**
 * Phase 18 T2b, refined in T2c — the spatial view's typography, and the texts a
 * fit keeps on the canvas. Where texts are drawn is spatial-labels.test.ts.
 */
import { describe, expect, it } from 'vitest'
import { PROD_SHAPED_PROJECTS as P, productionShapedOperations } from '@/lib/qa/intelligence-graph-fixture'
import { boundsWithScreenText, fitGraphBounds, type GraphBounds, type GraphScreenText } from './graph-readability'
import { computeSpatialLayout, type SpatialAnchor, type SpatialUnlinkedBand } from './spatial-layout'
import {
  SPATIAL_NARROW_CANVAS,
  SPATIAL_NARROW_TYPE_SCALE,
  SPATIAL_TYPE,
  bandAnchor,
  clusterDrawRadius,
  selectionRingOffset,
  spatialScreenTexts,
  spatialTypeScale,
  textBlockHeightPx,
  textWidthPx,
  wrapName,
  type SpatialCopy,
} from './spatial-text'

const SPATIAL_TEST_COPY: SpatialCopy = {
  atlasLabel: 'Atlas',
  atlasSubtitle: 'Omniras identitet',
  atlasDescription: 'Omniras identitet, inte en datanod.',
  clusterCount: (cluster) => (cluster.kind === 'older' ? `+${cluster.count}` : String(cluster.count)),
  clusterCaption: (cluster) => (cluster.kind === 'older' ? 'äldre' : cluster.kind === 'no-workflow' ? 'utan workflow' : 'körningar'),
  unlinkedAgents: (count) => [`${count} agenter`, 'som inget workflow nämner'] as const,
  hubDescription: (hub) => hub.subtext,
  previewCaption: (shown, total) => `Visar ${shown} av ${total} workflows`,
  clusterDescription: (cluster, parent) => `${parent}: ${cluster.count}`,
  statusWord: (node) => (node.status === 'failed' ? 'misslyckades' : node.status === 'running' ? 'kör' : node.status ? 'väntar' : null),
}
const COPY = SPATIAL_TEST_COPY

function layoutAt(anchor: SpatialAnchor) {
  const payload = productionShapedOperations(24)
  return computeSpatialLayout({ nodes: payload.nodes, edges: payload.edges, anchor, aspect: 'wide' })
}

const boxOf = (text: GraphScreenText, scale: number): GraphBounds => ({
  minX: text.x - text.leftPx * scale,
  maxX: text.x + text.rightPx * scale,
  minY: text.y + text.topPx * scale,
  maxY: text.y + text.bottomPx * scale,
})

describe('phase 18 T2c · spatial typography', () => {
  it('orders type by what a thing is: Atlas and the drilled hub, hubs, workflows over agents, captions last', () => {
    const { atlasName, hubName, workflow, agent, run, satellite, caption, hubSubtext, atlasSubtitle } = SPATIAL_TYPE
    expect(atlasName.size).toBeGreaterThan(hubName.active)
    expect(hubName.focus).toBeGreaterThan(hubName.active)
    expect(hubName.active).toBeGreaterThan(hubName.calm)
    expect(hubName.calm).toBeGreaterThan(hubName.receded)
    expect(hubName.calm).toBeGreaterThan(workflow.size)
    // A workflow is easier to find than an agent: larger and heavier.
    expect(workflow.size).toBeGreaterThan(agent.size)
    expect(workflow.weight).toBeGreaterThan(agent.weight)
    expect(agent.size).toBeGreaterThanOrEqual(satellite.size)
    expect(run.size).toBeLessThan(workflow.size)
    for (const small of [hubSubtext.size, atlasSubtitle.size]) expect(small).toBeLessThan(hubName.calm)
    expect(Math.min(...Object.values(SPATIAL_TYPE).map((entry) => ('size' in entry ? entry.size : Infinity)))).toBe(caption.size)
  })

  it('steps every text down one size below the narrow canvas width, and only there', () => {
    expect(spatialTypeScale(375)).toBe(SPATIAL_NARROW_TYPE_SCALE)
    expect(spatialTypeScale(SPATIAL_NARROW_CANVAS - 1)).toBe(SPATIAL_NARROW_TYPE_SCALE)
    expect(spatialTypeScale(SPATIAL_NARROW_CANVAS)).toBe(1)
    expect(spatialTypeScale(1440)).toBe(1)
  })

  it('takes a text to be wide rather than narrow: wide glyphs, heavy weights and the halo all add', () => {
    expect(textWidthPx('', 12, 500)).toBe(5)
    expect(textWidthPx('iiii', 12, 500)).toBeLessThan(textWidthPx('aaaa', 12, 500))
    expect(textWidthPx('aaaa', 12, 500)).toBeLessThan(textWidthPx('AAAA', 12, 500))
    expect(textWidthPx('AAAA', 12, 500)).toBeLessThan(textWidthPx('MMMM', 12, 500))
    expect(textWidthPx('Familje-Stunden', 15, 650)).toBeGreaterThan(textWidthPx('Familje-Stunden', 15, 500))
    // Linear in size above the halo and each glyph's rounding.
    const fixed = 5 + [...'Månadsbrev'].length * 0.1
    expect(textWidthPx('Månadsbrev', 24, 500) - fixed).toBeCloseTo(2 * (textWidthPx('Månadsbrev', 12, 500) - fixed), 6)
    expect(textBlockHeightPx(2, 10)).toBeGreaterThan(textBlockHeightPx(1, 10))
    expect(textBlockHeightPx(0, 10)).toBe(textBlockHeightPx(1, 10))
  })

  it('breaks a name at the hyphen or space nearest its middle, keeping the hyphen, and never breaks a name without one', () => {
    expect(wrapName('Familje-Stunden')).toEqual(['Familje-', 'Stunden'])
    expect(wrapName('The Prompt')).toEqual(['The', 'Prompt'])
    expect(wrapName('Nordisk Kundservice och Supportautomation')).toEqual(['Nordisk Kundservice', 'och Supportautomation'])
    expect(wrapName('GainPilot')).toBeNull()
    expect(wrapName('MMMMMMMMMMMMMMMMMMMMMMMM')).toBeNull()
    expect(wrapName('-edge')).toBeNull()
  })

  it('leaves a selection ring room at every size, and draws a run count no smaller than legible nor past its room', () => {
    expect(selectionRingOffset(10)).toBe(6)
    expect(selectionRingOffset(100)).toBe(18)
    // A small count at a far camera is raised toward the legible minimum — never past 1.2×, the room its rings leave.
    expect(clusterDrawRadius(5, 1)).toBeCloseTo(6)
    expect(clusterDrawRadius(20, 1)).toBe(20)
    expect(clusterDrawRadius(5, 0.1)).toBe(5)
  })
})

describe('phase 18 T2b · the level’s own texts, for a fit', () => {
  it('names each thing that carries its own text once, and nothing receded', () => {
    const portfolio = spatialScreenTexts(layoutAt({ level: 'portfolio' }), COPY)
    expect(new Set(portfolio.map((text) => text.key)).size).toBe(portfolio.length)
    expect(portfolio.filter((text) => text.kind === 'hub-name')).toHaveLength(4)
    expect(portfolio.filter((text) => text.kind === 'atlas')).toHaveLength(1)
    expect(portfolio.filter((text) => text.kind === 'atlas-subtitle')).toHaveLength(1)
    const project = spatialScreenTexts(layoutAt({ level: 'project', projectId: P.familjeStunden }), COPY)
    // The drilled hub only: the other projects and Atlas have receded and carry no text.
    expect(project.filter((text) => text.kind === 'hub-name').map((text) => text.ownerId)).toEqual([`project:${P.familjeStunden}`])
    expect(project.filter((text) => text.kind === 'atlas' || text.kind === 'atlas-subtitle')).toEqual([])
    expect(project.filter((text) => text.kind === 'band')).toHaveLength(1)
  })

  it('frames names only on a narrow canvas, as they wrap', () => {
    const layout = layoutAt({ level: 'portfolio' })
    const wide = spatialScreenTexts(layout, COPY)
    const narrow = spatialScreenTexts(layout, COPY, { narrow: true })
    expect(narrow.filter((text) => text.kind === 'hub-subtext' || text.kind === 'atlas-subtitle')).toEqual([])
    const width = (text: GraphScreenText) => text.leftPx + text.rightPx
    const name = (texts: typeof wide, owner: string) => texts.find((text) => text.kind === 'hub-name' && text.ownerId === owner)!
    const familjeStunden = `project:${P.familjeStunden}`
    // "Familje-" over "Stunden", set a step smaller: narrower and taller than the one line.
    expect(width(name(narrow, familjeStunden))).toBeLessThan(width(name(wide, familjeStunden)) * 0.7)
    expect(name(narrow, familjeStunden).bottomPx).toBeGreaterThan(name(wide, familjeStunden).bottomPx)
  })

  it('reads a band caption away from its project', () => {
    const band = (angle: number): SpatialUnlinkedBand => ({ id: 'b', projectId: 'p', count: 3, x: 0, y: 0, angle, memberIds: [] })
    expect(bandAnchor(band(0))).toBe('start')
    expect(bandAnchor(band(Math.PI))).toBe('end')
    expect(bandAnchor(band(Math.PI / 2))).toBe('middle')
    expect(bandAnchor(band(-Math.PI / 2))).toBe('middle')
    // The box follows the anchor: a caption on the left side reaches left from its point.
    const layout = layoutAt({ level: 'project', projectId: P.familjeStunden })
    const end = spatialScreenTexts({ ...layout, unlinkedBands: [band(Math.PI)] }, COPY).find((text) => text.kind === 'band')!
    expect(end.rightPx).toBeLessThan(end.leftPx)
    const start = spatialScreenTexts({ ...layout, unlinkedBands: [band(0)] }, COPY).find((text) => text.kind === 'band')!
    expect(start.leftPx).toBeLessThan(start.rightPx)
  })
})

describe('phase 18 T2b · a fit keeps screen-sized text on the canvas', () => {
  const core: GraphBounds = { minX: -300, minY: -200, maxX: 300, maxY: 200 }
  const viewport = { width: 360, height: 640 }

  it('is the core itself when there is no text', () => {
    expect(boundsWithScreenText(core, [], viewport)).toBe(core)
  })

  it('holds every text box at the scale its own fit gives', () => {
    const texts: GraphScreenText[] = [
      { x: 280, y: 180, leftPx: 60, rightPx: 60, topPx: 4, bottomPx: 30 },
      { x: -290, y: -150, leftPx: 90, rightPx: 3, topPx: -12, bottomPx: 14 },
    ]
    const bounds = boundsWithScreenText(core, texts, viewport)
    const view = fitGraphBounds(bounds, viewport)
    const scale = view.w / viewport.width
    for (const text of texts) {
      const box = boxOf(text, scale)
      expect(box.minX).toBeGreaterThanOrEqual(view.x - 0.5)
      expect(box.maxX).toBeLessThanOrEqual(view.x + view.w + 0.5)
      expect(box.minY).toBeGreaterThanOrEqual(view.y - 0.5)
      expect(box.maxY).toBeLessThanOrEqual(view.y + view.h + 0.5)
    }
  })

  it('stops growing for text wider than the canvas', () => {
    const wide: GraphScreenText[] = [{ x: 0, y: 0, leftPx: 400, rightPx: 400, topPx: 0, bottomPx: 10 }]
    const bounds = boundsWithScreenText(core, wide, viewport)
    expect(Number.isFinite(bounds.minX) && Number.isFinite(bounds.maxX)).toBe(true)
    expect(fitGraphBounds(bounds, viewport).w).toBeLessThan(fitGraphBounds(core, viewport).w * 10)
  })
})
