/**
 * Phase 18 T2b — the spatial view's own texts: kept on the canvas by a fit,
 * and never drawn over each other or over a circle that is not theirs.
 */
import { describe, expect, it } from 'vitest'
import { PROD_SHAPED_PROJECTS as P, productionShapedOperations } from '@/lib/qa/intelligence-graph-fixture'
import { boundsWithScreenText, fitGraphBounds, type GraphBounds, type GraphScreenText } from './graph-readability'
import { computeSpatialLayout, spatialNodeVisibility, type SpatialAnchor, type SpatialLayout, type SpatialUnlinkedBand } from './spatial-layout'
import { bandAnchor, planSpatialTexts, spatialScreenTexts, type SpatialCopy, type SpatialText } from './spatial-text'

const COPY: SpatialCopy = {
  atlasLabel: 'Atlas',
  atlasDescription: 'Omniras identitet, inte en datanod.',
  clusterCount: (cluster) => (cluster.kind === 'older' ? `+${cluster.count}` : String(cluster.count)),
  clusterCaption: (cluster) => (cluster.kind === 'older' ? 'äldre' : cluster.kind === 'no-workflow' ? 'utan workflow' : 'körningar'),
  unlinkedAgents: (count) => [`${count} agenter`, 'som inget workflow nämner'] as const,
  hubDescription: (hub) => hub.subtext,
  clusterDescription: (cluster, parent) => `${parent}: ${cluster.count}`,
}

function layoutAt(anchor: SpatialAnchor, hours = 24, attention = false) {
  const payload = productionShapedOperations(hours, { attention })
  const layout = computeSpatialLayout({ nodes: payload.nodes, edges: payload.edges, anchor, aspect: 'wide' })
  const visibleIds = new Set(payload.nodes.filter((node) => spatialNodeVisibility(node, layout, { depth: 1 }) !== 'hidden').map((node) => node.id))
  return { payload, layout, visibleIds }
}

const boxOf = (text: GraphScreenText, scale: number): GraphBounds => ({
  minX: text.x - text.leftPx * scale,
  maxX: text.x + text.rightPx * scale,
  minY: text.y + text.topPx * scale,
  maxY: text.y + text.bottomPx * scale,
})
const overlaps = (a: GraphBounds, b: GraphBounds) => a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY

/** Every drawn text against every other drawn text and every visible circle it does not own. */
function collisions(layout: SpatialLayout, texts: readonly SpatialText[], shown: ReadonlySet<string>, scale: number, visibleIds: ReadonlySet<string>) {
  const drawn = texts.filter((text) => shown.has(text.key))
  const found: string[] = []
  for (let i = 0; i < drawn.length; i++) {
    for (let j = i + 1; j < drawn.length; j++) {
      if (overlaps(boxOf(drawn[i], scale), boxOf(drawn[j], scale))) found.push(`${drawn[i].key} × ${drawn[j].key}`)
    }
    const own = new Set([drawn[i].ownerId, ...(layout.unlinkedBands.find((band) => band.id === drawn[i].ownerId)?.memberIds ?? [])])
    for (const [id, position] of layout.positions) {
      if (own.has(id) || !visibleIds.has(id)) continue
      const circle = { minX: position.x - position.r - 2 * scale, maxX: position.x + position.r + 2 * scale, minY: position.y - position.r - 2 * scale, maxY: position.y + position.r + 2 * scale }
      if (overlaps(circle, boxOf(drawn[i], scale))) found.push(`${drawn[i].key} × ${id}`)
    }
  }
  return found
}

describe('phase 18 T2b · the spatial view’s own texts', () => {
  it('names each thing that carries its own text once, and nothing receded', () => {
    const portfolio = spatialScreenTexts(layoutAt({ level: 'portfolio' }).layout, COPY)
    expect(new Set(portfolio.map((text) => text.key)).size).toBe(portfolio.length)
    expect(portfolio.filter((text) => text.kind === 'hub-name')).toHaveLength(4)
    expect(portfolio.filter((text) => text.kind === 'atlas')).toHaveLength(1)
    const project = spatialScreenTexts(layoutAt({ level: 'project', projectId: P.familjeStunden }).layout, COPY)
    // The drilled hub only: the other projects and Atlas have receded and carry no text.
    expect(project.filter((text) => text.kind === 'hub-name').map((text) => text.ownerId)).toEqual([`project:${P.familjeStunden}`])
    expect(project.filter((text) => text.kind === 'atlas')).toEqual([])
    expect(project.filter((text) => text.kind === 'band')).toHaveLength(1)
  })

  it('reads a band caption away from its project', () => {
    const band = (angle: number): SpatialUnlinkedBand => ({ id: 'b', projectId: 'p', count: 3, x: 0, y: 0, angle, memberIds: [] })
    expect(bandAnchor(band(0))).toBe('start')
    expect(bandAnchor(band(Math.PI))).toBe('end')
    expect(bandAnchor(band(Math.PI / 2))).toBe('middle')
    expect(bandAnchor(band(-Math.PI / 2))).toBe('middle')
    // The box follows the anchor: a caption on the left side reaches left from its point.
    const { layout } = layoutAt({ level: 'project', projectId: P.familjeStunden })
    const end = spatialScreenTexts({ ...layout, unlinkedBands: [band(Math.PI)] }, COPY).find((text) => text.kind === 'band')!
    expect(end.rightPx).toBeLessThan(end.leftPx)
    const start = spatialScreenTexts({ ...layout, unlinkedBands: [band(0)] }, COPY).find((text) => text.kind === 'band')!
    expect(start.leftPx).toBeLessThan(start.rightPx)
  })

  it('draws everything at a roomy scale, and never draws over another text or a circle that is not its own', () => {
    for (const anchor of [{ level: 'portfolio' }, { level: 'project', projectId: P.familjeStunden }, { level: 'project', projectId: P.prompt }] as SpatialAnchor[]) {
      for (const [hours, attention] of [[24, false], [24 * 7, true]] as const) {
        const { layout, visibleIds } = layoutAt(anchor, hours, attention)
        const texts = spatialScreenTexts(layout, COPY)
        for (const scale of [0.8, 1, 1.6, 2.4, 4]) {
          const plan = planSpatialTexts(layout, texts, scale, visibleIds)
          const found = collisions(layout, texts, new Set([...plan.shown].filter((key) => !key.startsWith('hub-name') && !key.startsWith('atlas'))), scale, visibleIds)
          expect(found, `${JSON.stringify(anchor)} ${hours} h · scale ${scale}`).toEqual([])
        }
      }
    }
    const { layout, visibleIds } = layoutAt({ level: 'project', projectId: P.familjeStunden })
    const roomy = planSpatialTexts(layout, spatialScreenTexts(layout, COPY), 1, visibleIds)
    expect([...roomy.shown].map((key) => key.split(':')[0]).sort()).toEqual(['band', 'hub-name', 'hub-subtext'])
  })

  it('keeps the names when space runs out, and lets counts and captions give way', () => {
    const { layout, visibleIds } = layoutAt({ level: 'portfolio' })
    const texts = spatialScreenTexts(layout, COPY)
    const crowded = planSpatialTexts(layout, texts, 12, visibleIds)
    for (const text of texts.filter((candidate) => candidate.kind === 'hub-name' || candidate.kind === 'atlas')) {
      expect(crowded.shown.has(text.key), text.key).toBe(true)
    }
    const roomy = planSpatialTexts(layout, texts, 1, visibleIds)
    const subtexts = (plan: { shown: ReadonlySet<string> }) => [...plan.shown].filter((key) => key.startsWith('hub-subtext')).length
    expect(subtexts(roomy)).toBe(4)
    expect(subtexts(crowded)).toBeLessThan(4)
    // Captions that give way are named, so a label placed over them later can hide them.
    expect(roomy.yielding.map((text) => text.key).every((key) => key.startsWith('hub-subtext') || key.startsWith('cluster-caption'))).toBe(true)
  })

  it('lets node labels route around Atlas, hubs, run counts and what is drawn', () => {
    const { layout, visibleIds } = layoutAt({ level: 'project', projectId: P.prompt })
    const texts = spatialScreenTexts(layout, COPY)
    const plan = planSpatialTexts(layout, texts, 1, visibleIds)
    const visibleClusters = layout.clusters.filter((cluster) => visibleIds.has(cluster.parentId))
    const visibleHubs = layout.hubs.filter((hub) => visibleIds.has(hub.nodeId))
    expect(plan.obstacles).toHaveLength(1 + visibleHubs.length + visibleClusters.length + plan.shown.size)
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
