/**
 * Phase 18 T2c — which texts the spatial view draws, and where.
 *
 * Every plan is measured here with this file's own geometry, not the planner's
 * helpers: over the production-shaped snapshot and a synthetic stress snapshot,
 * at the six canvas sizes the owner checks and at several zoom depths, with the
 * page's controls, a phone's sheet and the shell's floating corner over the canvas.
 */
import { describe, expect, it } from 'vitest'
import type { IntelligenceGraphEdge, IntelligenceGraphNode } from '@/lib/intelligence/graph-contract'
import {
  LABEL_STRESS_PROJECTS as STRESS,
  PROD_SHAPED_PROJECTS as P,
  labelStressOperations,
  productionShapedOperations,
} from '@/lib/qa/intelligence-graph-fixture'
import { getStatusVisual } from './graph-visuals'
import { boundsWithScreenText, fitGraphBounds, reservedCanvasBoxes, type GraphBounds, type GraphViewBox } from './graph-readability'
import {
  PORTFOLIO_REVEAL,
  PROJECT_REVEAL,
  classifySpatialAspect,
  computeSpatialLayout,
  previewsAtOverview,
  spatialClusterShown,
  spatialNodeVisibility,
  type SpatialAnchor,
} from './spatial-layout'
import {
  SPATIAL_NARROW_CANVAS,
  SPATIAL_TYPE,
  TEXT_ASCENT,
  TEXT_DESCENT,
  TEXT_GAP,
  clusterDrawRadius,
  spatialScreenTexts,
  textWidthPx,
  type SpatialCopy,
} from './spatial-text'
import { AGENT_NAMES_AT_OVERVIEW, nodeLabelVariants, planSpatialLabels, previewNameScreenTexts, type SpatialLabelPlan } from './spatial-labels'

const COPY: SpatialCopy = {
  atlasLabel: 'Atlas',
  atlasSubtitle: 'Omniras identitet',
  atlasDescription: 'Omniras identitet, inte en datanod.',
  clusterCount: (cluster) => (cluster.kind === 'older' ? `+${cluster.count}` : String(cluster.count)),
  clusterCaption: (cluster) => (cluster.kind === 'older' ? 'äldre' : cluster.kind === 'no-workflow' ? 'utan workflow' : 'körningar'),
  unlinkedAgents: (count) => [`${count} agenter`, 'som inget workflow nämner'] as const,
  hubDescription: (hub) => hub.subtext,
  previewCaption: (shown, total) => `Visar ${shown} av ${total} workflows`,
  clusterDescription: (cluster, parent) => `${parent}: ${cluster.count}`,
  statusWord: (node) => ({ failed: 'misslyckades', running: 'körs', awaiting_approval: 'väntar på godkännande', pending: 'väntar', cancelled: 'avbruten' } as Record<string, string>)[node.status ?? ''] ?? null,
}

type Payload = { nodes: IntelligenceGraphNode[]; edges: IntelligenceGraphEdge[] }
const prod = productionShapedOperations(24)
const week = productionShapedOperations(24 * 7, { attention: true })
const stress = labelStressOperations()

const SCENES: ReadonlyArray<{ name: string; payload: Payload; anchor: SpatialAnchor }> = [
  { name: 'portfolio', payload: prod, anchor: { level: 'portfolio' } },
  { name: 'Familje-Stunden', payload: prod, anchor: { level: 'project', projectId: P.familjeStunden } },
  { name: 'The Prompt', payload: prod, anchor: { level: 'project', projectId: P.prompt } },
  { name: 'GainPilot', payload: prod, anchor: { level: 'project', projectId: P.gainPilot } },
  { name: 'AUDIT 0b', payload: prod, anchor: { level: 'project', projectId: P.audit } },
  { name: 'attention', payload: week, anchor: { level: 'project', projectId: P.prompt } },
  { name: 'workflow', payload: week, anchor: { level: 'workflow', workflowId: 'workflow:tp-1' } },
  { name: 'stress portfolio', payload: stress, anchor: { level: 'portfolio' } },
  { name: 'stress crowded', payload: stress, anchor: { level: 'project', projectId: STRESS.crowded } },
  { name: 'stress named', payload: stress, anchor: { level: 'project', projectId: STRESS.named } },
  { name: 'stress workflow', payload: stress, anchor: { level: 'workflow', workflowId: 'workflow:nk-02' } },
]
const FRAMES = [
  { width: 1920, height: 900 }, { width: 1440, height: 640 }, { width: 1280, height: 470 },
  { width: 1024, height: 520 }, { width: 768, height: 640 }, { width: 339, height: 425 },
] as const
const ZOOMS = [0.7, 1, 1.6, 2.6, 4] as const
const ROW_PX = 50

interface SceneOptions {
  payload: Payload
  anchor: SpatialAnchor
  frame: { width: number; height: number }
  zoom?: number
  selectedId?: string | null
  searchResultId?: string | null
  hoverId?: string | null
  sheet?: boolean
  /** A desktop page: the portfolio previews its workflows. */
  preview?: boolean
}

/** A scene as the canvas composes it: the level fitted between the page's rows, zoomed, with what covers it. */
function compose(options: SceneOptions) {
  const { payload, anchor, frame } = options
  const layout = computeSpatialLayout({ nodes: payload.nodes, edges: payload.edges, anchor, aspect: classifySpatialAspect(frame.width, frame.height) })
  const narrow = frame.width < SPATIAL_NARROW_CANVAS
  const sheetPx = options.sheet ? Math.min(frame.height * 0.48, 384) : 0
  const overlay = { top: (narrow ? 2 : 1) * ROW_PX, bottom: Math.max(ROW_PX, sheetPx) }
  const preview = options.preview === true && layout.level === 'portfolio'
  const texts = spatialScreenTexts(layout, COPY, { narrow, preview })
  const framed = layout.level === 'portfolio'
    ? texts.filter((text) => text.kind === 'atlas' || text.kind === 'atlas-subtitle' || text.kind === 'hub-name' || text.kind === 'hub-subtext' || text.kind === 'hub-preview')
    : texts
  const nodeById = new Map(payload.nodes.map((node) => [node.id, node]))
  const widthOf = (bounds: GraphBounds) => fitGraphBounds(bounds, frame, undefined, overlay).w
  const overview = boundsWithScreenText(layout.fitBounds, framed.filter((text) => text.kind !== 'hub-preview'), frame, undefined, overlay)
  // Like the canvas: the previewed workflows always, their names too while the previews widen the view by at most a tenth.
  const named = preview ? boundsWithScreenText(layout.preview.fitBounds, [...framed, ...previewNameScreenTexts(layout, nodeById, COPY)], frame, undefined, overlay) : null
  const framing = !preview ? 'overview' : named && widthOf(named) <= widthOf(overview) * 1.1 ? 'names' : 'workflows'
  const fitted = framing === 'overview' ? overview
    : framing === 'names' ? named!
      : boundsWithScreenText(layout.preview.fitBounds, framed, frame, undefined, overlay)
  const fit = fitGraphBounds(fitted, frame, undefined, overlay)
  const zoom = options.zoom ?? 1
  const view: GraphViewBox = { x: fit.x + (fit.w - fit.w / zoom) / 2, y: fit.y + (fit.h - fit.h / zoom) / 2, w: fit.w / zoom, h: fit.h / zoom }
  const selectedId = options.selectedId ?? null
  // Like the canvas, the camera brings a selection out from under the page's rows and the sheet.
  const chosen = selectedId ? layout.positions.get(selectedId) : undefined
  if (chosen) {
    const unitsPerPx = view.w / frame.width
    const screenY = (chosen.y - view.y) / unitsPerPx
    const screenX = (chosen.x - view.x) / unitsPerPx
    if (screenY < overlay.top + 60 || screenY > frame.height - overlay.bottom - 60 || screenX < 60 || screenX > frame.width - 60) {
      view.x = chosen.x - (frame.width / 2) * unitsPerPx
      view.y = chosen.y - ((overlay.top + frame.height - overlay.bottom) / 2) * unitsPerPx
    }
  }
  const neighbours = new Set<string>(selectedId ? [selectedId] : [])
  for (const edge of payload.edges) {
    if (edge.source === selectedId) neighbours.add(edge.target)
    if (edge.target === selectedId) neighbours.add(edge.source)
  }
  const projectId = anchor.level === 'project' ? anchor.projectId : null
  const compactAgents = narrow && projectId !== null
    && payload.nodes.filter((node) => node.kind === 'agent' && node.projectId === projectId).length > AGENT_NAMES_AT_OVERVIEW
  const visibleIds = new Set(payload.nodes.filter((node) => spatialNodeVisibility(node, layout, {
    depth: zoom, selectedId, focusId: options.hoverId ?? null, searchResultId: options.searchResultId ?? null, neighborIds: neighbours, compactAgents, preview,
  }) !== 'hidden').map((node) => node.id))
  const unitsPerPx = view.w / frame.width
  const px = (rect: { x: number; y: number; width: number; height: number }): GraphBounds => ({
    minX: view.x + rect.x * unitsPerPx, minY: view.y + rect.y * unitsPerPx,
    maxX: view.x + (rect.x + rect.width) * unitsPerPx, maxY: view.y + (rect.y + rect.height) * unitsPerPx,
  })
  const reserved = [
    ...reservedCanvasBoxes(view, frame.height, options.sheet ? view.h * 0.48 : 0, overlay),
    // The shell's floating corner, and a wrapped place row on a phone.
    px({ x: frame.width - 150, y: frame.height - 110, width: 150, height: 110 }),
    ...(narrow ? [px({ x: 0, y: 0, width: 200, height: ROW_PX * 2.4 })] : []),
  ]
  const anchorId = layout.anchorId
  const labelSelection = selectedId !== null && selectedId === anchorId ? null : selectedId
  const plan = planSpatialLabels({
    layout, nodeById, visibleIds, copy: COPY, view, viewport: frame, reserved, depth: zoom,
    selectedId: labelSelection, hoverId: options.hoverId ?? null, focusId: null, searchResultId: options.searchResultId ?? null,
    neighborIds: labelSelection ? neighbours : undefined, preview,
  })
  const countsUnderNames = previewsAtOverview(layout, { depth: zoom, preview })
  return { layout, view, frame, reserved, visibleIds, nodeById, plan, scale: unitsPerPx, countsUnderNames, framing }
}

type Composed = ReturnType<typeof compose>

const meets = (a: GraphBounds, b: GraphBounds) => a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY
const distanceToBox = (x: number, y: number, box: GraphBounds) => Math.hypot(x - Math.min(Math.max(x, box.minX), box.maxX), y - Math.min(Math.max(y, box.minY), box.maxY))

/** Every circle the scene draws, as the canvas sizes it: Atlas, the visible nodes, the visible run counts. */
function drawnCircles(scene: Composed, grown = true) {
  const { layout, visibleIds, scale } = scene
  const pad = (px: number) => (grown ? px * scale : 0)
  return [
    { owner: 'atlas', x: layout.atlas.x, y: layout.atlas.y, r: layout.atlas.r + pad(4) },
    ...[...layout.positions].filter(([id]) => visibleIds.has(id)).map(([owner, position]) => ({ owner, x: position.x, y: position.y, r: position.r + pad(2) })),
    ...layout.clusters.filter((cluster) => spatialClusterShown(cluster, visibleIds, scene.countsUnderNames))
      .map((cluster) => ({ owner: cluster.id, x: cluster.x, y: cluster.y, r: clusterDrawRadius(cluster.r, scale) + pad(4) })),
  ]
}

/** What a plan got wrong, in words: nothing, when it is right. */
function problems(scene: Composed): string[] {
  const { plan, view, reserved, scale } = scene
  const found: string[] = []
  const edge = 8 * scale - 1e-6
  const circles = drawnCircles(scene)
  plan.placements.forEach((label, index) => {
    const box = label.box
    if (box.minX < view.x + edge || box.maxX > view.x + view.w - edge || box.minY < view.y + edge || box.maxY > view.y + view.h - edge) {
      found.push(`${label.key} leaves the canvas`)
    }
    if (reserved.some((band) => meets(band, box))) found.push(`${label.key} lies under the page's chrome`)
    for (const earlier of plan.placements.slice(0, index)) {
      const room = 2 * scale - 1e-6
      if (meets({ minX: earlier.box.minX - room, minY: earlier.box.minY - room, maxX: earlier.box.maxX + room, maxY: earlier.box.maxY + room }, box)) {
        found.push(`${label.key} lies on ${earlier.key}`)
      }
    }
    // Every circle, the text's own included: the plan draws texts outside what they name (a hub's monogram,
    // drawn inside the hub by its glyph, is not a text of the plan).
    for (const circle of circles) {
      if (distanceToBox(circle.x, circle.y, box) < circle.r - 1e-6) found.push(`${label.key} lies on ${circle.owner === label.ownerId ? 'its own circle' : circle.owner}`)
    }
  })
  return found
}

const placed = (plan: SpatialLabelPlan, key: string) => plan.placements.find((label) => label.key === key)

describe('phase 18 T2c · the spatial label plan', () => {
  it('draws no text over another, over any circle — its own included — under the page’s chrome or past the canvas edge', () => {
    let plans = 0
    for (const { name, payload, anchor } of SCENES) {
      for (const frame of FRAMES) {
        for (const zoom of ZOOMS) {
          const scene = compose({ payload, anchor, frame, zoom })
          expect(problems(scene), `${name} · ${frame.width}×${frame.height} · zoom ${zoom}`).toEqual([])
          plans++
        }
        // A phone or tablet with a node selected and its sheet open.
        if (frame.width < 1024) {
          const selectedId = payload.nodes.find((node) => node.kind === 'workflow' && belongsTo(anchor, node))?.id ?? null
          const withSheet = compose({ payload, anchor, frame, selectedId, sheet: true })
          expect(problems(withSheet), `${name} · ${frame.width}×${frame.height} · sheet`).toEqual([])
          plans++
        }
      }
    }
    expect(plans).toBe(SCENES.length * FRAMES.length * ZOOMS.length + SCENES.length * 2)
  })

  it('draws each text where its box says, and gives it at least the width its words measure', () => {
    for (const { name, payload, anchor } of SCENES) {
      for (const frame of [FRAMES[1], FRAMES[5]]) {
        const scene = compose({ payload, anchor, frame, zoom: 1.6 })
        for (const label of scene.plan.placements) {
          const where = `${name} · ${frame.width} · ${label.key}`
          expect(label.box.minY, where).toBeCloseTo(label.y - label.fontSize * TEXT_ASCENT, 6)
          const centre = (label.box.minX + label.box.maxX) / 2
          const at = label.anchor === 'middle' ? centre : label.anchor === 'start' ? label.box.minX : label.box.maxX
          expect(at, where).toBeCloseTo(label.x, 6)
          const size = label.fontSize / scene.scale
          const words = Math.max(...label.lines.map((line) => textWidthPx(line, size, label.weight)))
          expect(label.widthPx, where).toBeGreaterThanOrEqual(words - 1e-6)
          expect(label.box.maxY - label.box.minY, where).toBeGreaterThanOrEqual((label.lines.length - 1 + (label.status ? 1 : 0)) * label.lineHeight)
        }
      }
    }
  })

  it('is deterministic: the same snapshot, in any order, gives the same plan', () => {
    for (const { name, payload, anchor } of SCENES) {
      const reversed = { nodes: [...payload.nodes].reverse(), edges: [...payload.edges].reverse() }
      for (const frame of [FRAMES[1], FRAMES[5]]) {
        const first = compose({ payload, anchor, frame }).plan
        expect(compose({ payload, anchor, frame }).plan, name).toEqual(first)
        expect(compose({ payload: reversed, anchor, frame }).plan, `${name} reversed`).toEqual(first)
      }
    }
  })

  it('places texts in order of importance, and hides what finds no place rather than letting it overlap', () => {
    for (const { name, payload, anchor } of SCENES) {
      for (const frame of FRAMES) {
        const { plan } = compose({ payload, anchor, frame })
        const tiers = plan.placements.map((label) => label.tier)
        expect(tiers, name).toEqual([...tiers].sort((a, b) => a - b))
        // Every text is either drawn or named as hidden — never both.
        const keys = plan.placements.map((label) => label.key)
        expect(new Set([...keys, ...plan.hidden]).size, name).toBe(keys.length + plan.hidden.length)
      }
    }
    // The crowded project on a phone has more to say than room: some texts give way, none overlap.
    const phone = compose({ payload: stress, anchor: { level: 'project', projectId: STRESS.crowded }, frame: FRAMES[5], zoom: 1.6 })
    expect(phone.plan.hidden.length).toBeGreaterThan(0)
    expect(problems(phone)).toEqual([])
  })

  it('names Atlas and every hub before anything else competes for the room', () => {
    for (const frame of FRAMES) {
      for (const payload of [prod, stress]) {
        const { plan, layout } = compose({ payload, anchor: { level: 'portfolio' }, frame })
        const where = `${payload === prod ? 'prod' : 'stress'} · ${frame.width}`
        expect(placed(plan, 'atlas:atlas'), where).toBeDefined()
        const unplaced = layout.hubs.filter((hub) => !placed(plan, `hub-name:${hub.nodeId}`)).map((hub) => hub.label)
        if (payload === prod) {
          expect(unplaced, where).toEqual([])
        } else if (frame.width >= 768) {
          // Seven projects with long names: only a name with no place to break may find no room, below a laptop's width.
          // (A phone's seven-project stress portfolio leaves some names to the hubs' monograms and the inspector.)
          expect(unplaced.filter((label) => frame.width >= 1024 || /[\s-]/.test(label)), where).toEqual([])
        }
      }
    }
  })

  it('always names the selection and the search result, in the strong tone', () => {
    const cases: Array<[SpatialAnchor, Payload, string]> = [
      [{ level: 'project', projectId: P.familjeStunden }, prod, 'agent:fs-01'],
      [{ level: 'project', projectId: P.familjeStunden }, prod, 'workflow:fs-3'],
      [{ level: 'project', projectId: P.prompt }, week, 'run:tp-001'],
      [{ level: 'portfolio' }, prod, 'agent:tp-editor'],
      [{ level: 'project', projectId: STRESS.crowded }, stress, 'agent:nk-17'],
    ]
    for (const frame of [FRAMES[1], FRAMES[5]]) {
      for (const [anchor, payload, id] of cases) {
        const selected = placed(compose({ payload, anchor, frame, selectedId: id, sheet: frame.width < 768 }).plan, `node:${id}`)
        expect(selected, `${id} selected · ${frame.width}`).toMatchObject({ tier: 0, tone: 'strong' })
        expect(selected!.weight).toBeGreaterThanOrEqual(600)
        // Search selects what it finds and brings it into view; with room, a result is named even when not selected.
        const foundScene = compose({ payload, anchor, frame, searchResultId: id, selectedId: frame.width < 768 ? id : null })
        const found = placed(foundScene.plan, `node:${id}`)
        expect(found, `${id} found · ${frame.width}`).toMatchObject({ tier: 0, tone: 'strong' })
      }
    }
  })

  it('names what needs attention with its stored status in words — and never over a run count', () => {
    for (const frame of FRAMES) {
      for (const zoom of ZOOMS) {
        const scene = compose({ payload: week, anchor: { level: 'project', projectId: P.prompt }, frame, zoom })
        const counts = drawnCircles(scene, false).filter((circle) => circle.owner.startsWith('cluster:'))
        for (const label of scene.plan.placements) {
          const node = scene.nodeById.get(label.ownerId)
          if (!node || !getStatusVisual(node)?.attention) continue
          expect(label.status?.text, label.key).toBe(COPY.statusWord(node))
          for (const count of counts) expect(distanceToBox(count.x, count.y, label.box), `${label.key} × ${count.owner} · ${frame.width} · ${zoom}`).toBeGreaterThanOrEqual(count.r)
        }
      }
    }
    // With room, every one of them is named.
    const roomy = compose({ payload: week, anchor: { level: 'project', projectId: P.prompt }, frame: FRAMES[1] })
    const attention = [...roomy.visibleIds].filter((id) => getStatusVisual(roomy.nodeById.get(id)!)?.attention)
    expect(attention.length).toBeGreaterThanOrEqual(4)
    for (const id of attention) expect(placed(roomy.plan, `node:${id}`), id).toBeDefined()
  })

  it('names The Prompt’s two agents from its first view, and Familje-Stunden’s 33 only as the operator zooms in', () => {
    const agentsNamed = (plan: SpatialLabelPlan) => plan.placements.filter((label) => label.ownerId.startsWith('agent:')).map((label) => label.ownerId).sort()
    for (const frame of [FRAMES[0], FRAMES[1], FRAMES[2]]) {
      expect(agentsNamed(compose({ payload: prod, anchor: { level: 'project', projectId: P.prompt }, frame }).plan), `${frame.width}`).toEqual(['agent:tp-editor', 'agent:tp-writer'])
      expect(agentsNamed(compose({ payload: prod, anchor: { level: 'project', projectId: P.familjeStunden }, frame }).plan), `${frame.width}`).toEqual([])
      expect(agentsNamed(compose({ payload: prod, anchor: { level: 'project', projectId: P.familjeStunden }, frame, zoom: PROJECT_REVEAL.agentLabels + 0.3 }).plan).length).toBeGreaterThan(0)
      // Eight agents are named from the first view; thirty are not.
      expect(agentsNamed(compose({ payload: stress, anchor: { level: 'project', projectId: STRESS.named }, frame }).plan).length, `${frame.width}`).toBeGreaterThan(0)
      expect(agentsNamed(compose({ payload: stress, anchor: { level: 'project', projectId: STRESS.crowded }, frame }).plan), `${frame.width}`).toEqual([])
    }
  })

  it('keeps a phone’s project name off its workflow icons', () => {
    for (const [payload, projectId] of [[prod, P.familjeStunden], [prod, P.prompt], [stress, STRESS.crowded], [stress, STRESS.named]] as const) {
      for (const zoom of ZOOMS) {
        const scene = compose({ payload, anchor: { level: 'project', projectId }, frame: FRAMES[5], zoom })
        const name = placed(scene.plan, `hub-name:project:${projectId}`)
        if (!name) continue
        for (const [id, position] of scene.layout.positions) {
          if (!scene.visibleIds.has(id) || scene.nodeById.get(id)?.kind !== 'workflow') continue
          expect(distanceToBox(position.x, position.y, name.box), `${projectId} × ${id} · zoom ${zoom}`).toBeGreaterThanOrEqual(position.r)
        }
      }
    }
  })

  it('keeps a hub’s counts with its name, outside the hub, or leaves them out with it', () => {
    let under = 0
    for (const { name, payload, anchor } of SCENES) {
      for (const frame of FRAMES) {
        for (const zoom of ZOOMS) {
          const scene = compose({ payload, anchor, frame, zoom })
          for (const subtext of scene.plan.placements.filter((label) => label.kind === 'hub-subtext')) {
            const where = `${name} · ${frame.width} · zoom ${zoom} · ${subtext.key}`
            const hubName = placed(scene.plan, `hub-name:${subtext.ownerId}`)
            expect(hubName, where).toBeDefined()
            const hub = scene.layout.hubs.find((entry) => entry.nodeId === subtext.ownerId)!
            const gap = TEXT_GAP.subtext * scene.scale
            // Directly under or directly over the name, aligned with it.
            const isUnder = Math.abs(subtext.box.minY - (hubName!.box.maxY + gap)) < 1e-6
            const isOver = Math.abs(subtext.box.maxY - (hubName!.box.minY - gap)) < 1e-6
            expect(isUnder || isOver, where).toBe(true)
            expect([subtext.x, subtext.anchor], where).toEqual([hubName!.x, hubName!.anchor])
            // On the name's side away from the hub — never between the hub and its name, never across the hub.
            if (hubName!.box.minY >= hub.y) expect(isUnder, `${where}: under a name below the hub`).toBe(true)
            if (hubName!.box.maxY <= hub.y) expect(isOver, `${where}: over a name above the hub`).toBe(true)
            expect(distanceToBox(hub.x, hub.y, subtext.box), where).toBeGreaterThanOrEqual(hub.r)
            // A name under its hub keeps its counts under it, as before.
            if (hubName!.box.minY > hub.y + hub.r) under++
          }
        }
      }
    }
    expect(under).toBeGreaterThan(100)
  })

  it('never writes a word the node does not carry', () => {
    let checked = 0
    for (const { name, payload, anchor } of SCENES) {
      for (const frame of FRAMES) {
        for (const zoom of [1, 4]) {
          const scene = compose({ payload, anchor, frame, zoom })
          for (const label of scene.plan.placements.filter((entry) => entry.kind === 'node')) {
            const node = scene.nodeById.get(label.ownerId)!
            // The drawn words, lines joined, are a run of the stored label itself — a wrap, its head, or the whole.
            const words = label.lines.join(' ')
            const shown = words.endsWith('…') ? words.slice(0, -1) : words
            expect(node.label.includes(shown), `${name} · ${label.key}: "${words}" in "${node.label}"`).toBe(true)
            if (label.status) expect(label.status.text).toBe(COPY.statusWord(node))
            checked++
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(200)
    // A label longer than a line is wrapped or shortened to its head — never cut mid-word with invented text.
    const long: IntelligenceGraphNode = { id: 'workflow:x', kind: 'workflow', label: 'Kunskapsbas: uppdatering av artiklar · veckovis', source: 'runtime', metadata: {} }
    for (const lines of nodeLabelVariants(long)) expect(long.label.includes(lines.join(' '))).toBe(true)
  })

  it('gives each kind of text its place in the order of importance', () => {
    // The owner's order, stated here independently of the planner: selection and search first, then Atlas and
    // hub names, attention, what is hovered or running or touched, workflows, captions and counts, agents and
    // runs, run-count captions last.
    const expected = (scene: Composed, label: SpatialLabelPlan['placements'][number], selectedId: string | null) => {
      if (label.kind === 'atlas' || label.kind === 'hub-name') return 1
      if (label.kind === 'atlas-subtitle' || label.kind === 'band') return 5
      if (label.kind === 'hub-subtext') return scene.layout.anchorId === label.ownerId ? 3 : 5
      if (label.kind === 'cluster-caption') return 7
      const node = scene.nodeById.get(label.ownerId)!
      if (label.ownerId === selectedId) return 0
      if (getStatusVisual(node)?.attention) return 2
      if (node.kind === 'run' && node.status === 'running') return 3
      if (node.kind === 'workflow') return 4
      return 6
    }
    let attention = 0
    for (const { name, payload, anchor } of SCENES) {
      for (const frame of [FRAMES[1], FRAMES[3], FRAMES[5]]) {
        const scene = compose({ payload, anchor, frame })
        for (const label of scene.plan.placements) {
          expect(label.tier, `${name} · ${frame.width} · ${label.key}`).toBe(expected(scene, label, null))
          if (label.tier === 2) attention++
        }
      }
    }
    expect(attention).toBeGreaterThan(10)
  })

  it('moves a hub’s name above it when the room under it is taken, before trying its corners, and its counts with it', () => {
    const scene = compose({ payload: prod, anchor: { level: 'project', projectId: P.prompt }, frame: FRAMES[1] })
    const hub = scene.layout.hubs.find((entry) => entry.orbit === 'focus')!
    const under = placed(scene.plan, `hub-name:${hub.nodeId}`)!
    expect(under.box.minY).toBeGreaterThan(hub.y)
    // Cover the room under the hub, as a control or the sheet would.
    const blocked = planSpatialLabels({
      layout: scene.layout, nodeById: scene.nodeById, visibleIds: scene.visibleIds, copy: COPY, view: scene.view, viewport: scene.frame,
      reserved: [...scene.reserved, { minX: hub.x - hub.r * 4, maxX: hub.x + hub.r * 4, minY: hub.y + hub.r, maxY: hub.y + hub.r * 5 }], depth: 1,
    })
    const above = placed(blocked, `hub-name:${hub.nodeId}`)!
    expect(above.anchor).toBe('middle')
    expect(above.box.maxY).toBeLessThan(hub.y - hub.r)
    // Its counts go with it, over the name — never under it, where the hub is.
    const counts = placed(blocked, `hub-subtext:${hub.nodeId}`)!
    expect(counts.box.maxY).toBeCloseTo(above.box.minY - TEXT_GAP.subtext * scene.scale, 6)
    expect(distanceToBox(hub.x, hub.y, counts.box)).toBeGreaterThanOrEqual(hub.r)
    // With the room over the name taken too, the name stays and the counts are left out rather than cross the hub.
    const crowded = planSpatialLabels({
      layout: scene.layout, nodeById: scene.nodeById, visibleIds: scene.visibleIds, copy: COPY, view: scene.view, viewport: scene.frame,
      reserved: [
        ...scene.reserved,
        { minX: hub.x - hub.r * 4, maxX: hub.x + hub.r * 4, minY: hub.y + hub.r, maxY: hub.y + hub.r * 5 },
        { minX: counts.box.minX, maxX: counts.box.maxX, minY: counts.box.minY, maxY: counts.box.maxY },
      ],
      depth: 1,
    })
    expect(placed(crowded, `hub-name:${hub.nodeId}`)!.box).toEqual(above.box)
    expect(placed(crowded, `hub-subtext:${hub.nodeId}`)).toBeUndefined()
    expect(crowded.hidden).toContain(`hub-subtext:${hub.nodeId}`)
  })

  it('stresses what it claims: long names with and without a place to break, and more agents than a first view names', () => {
    const projects = stress.nodes.filter((entry) => entry.kind === 'project')
    expect(projects).toHaveLength(7)
    expect(projects.some((entry) => entry.label.length > 36 && /\s/.test(entry.label))).toBe(true)
    expect(projects.some((entry) => entry.label.length > 20 && !/[\s-]/.test(entry.label))).toBe(true)
    const agents = (projectId: string) => stress.nodes.filter((entry) => entry.kind === 'agent' && entry.projectId === projectId).length
    expect(agents(STRESS.crowded)).toBeGreaterThan(AGENT_NAMES_AT_OVERVIEW)
    expect(agents(STRESS.named)).toBe(AGENT_NAMES_AT_OVERVIEW)
    const crowdedWorkflows = stress.nodes.filter((entry) => entry.kind === 'workflow' && entry.projectId === STRESS.crowded)
    expect(crowdedWorkflows.length).toBeGreaterThanOrEqual(12)
    expect(crowdedWorkflows.filter((entry) => entry.label.length > 30).length).toBeGreaterThan(0)
    const needsAttention = stress.nodes.filter((entry) => entry.projectId === STRESS.crowded && getStatusVisual(entry)?.attention)
    expect(needsAttention.length).toBeGreaterThanOrEqual(6)
  })
})

describe('phase 18 T2c · the desktop overview’s preview in the label plan', () => {
  const DESKTOP = FRAMES.filter((frame) => frame.width >= 768)
  const PAYLOADS = [['prod', prod], ['week', week], ['stress', stress]] as const
  const portfolio: SpatialAnchor = { level: 'portfolio' }
  const hubOf = (projectId: string) => `project:${projectId}`

  it('draws no text over another, over any circle — its own included — under the page’s chrome or past the canvas edge', () => {
    let plans = 0
    for (const [name, payload] of PAYLOADS) {
      const previewed = computeSpatialLayout({ nodes: payload.nodes, edges: payload.edges, anchor: portfolio, aspect: 'wide' }).preview
      const workflow = previewed.hubs.find((entry) => entry.workflowIds.length > 0)!
      const hidden = payload.nodes.find((node) => node.kind === 'workflow' && !previewed.ids.has(node.id))!
      for (const frame of DESKTOP) {
        for (const zoom of ZOOMS) {
          expect(problems(compose({ payload, anchor: portfolio, frame, zoom, preview: true })), `${name} · ${frame.width} · zoom ${zoom}`).toEqual([])
          plans++
        }
        // A selected hub, a selected previewed workflow, and a workflow the preview leaves out found by search.
        for (const selection of [{ selectedId: workflow.hubId }, { selectedId: workflow.workflowIds[0] }, { searchResultId: hidden.id, selectedId: hidden.id }]) {
          expect(problems(compose({ payload, anchor: portfolio, frame, preview: true, ...selection })), `${name} · ${frame.width} · ${JSON.stringify(selection)}`).toEqual([])
          plans++
        }
      }
    }
    expect(plans).toBe(PAYLOADS.length * DESKTOP.length * (ZOOMS.length + 3))
  })

  it('says what a preview leaves out, under the counts it qualifies, only while workflows are left out', () => {
    const scene = compose({ payload: prod, anchor: portfolio, frame: FRAMES[1], preview: true })
    const captions = Object.fromEntries(scene.plan.placements.filter((label) => label.kind === 'hub-preview').map((label) => [label.ownerId, label.lines]))
    expect(captions).toEqual({
      [hubOf(P.familjeStunden)]: ['Visar 3 av 5 workflows'],
      [hubOf(P.prompt)]: ['Visar 3 av 6 workflows'],
    })
    // Without the preview, or once zoom unfolds every workflow, nothing is left out and nothing is said.
    expect(compose({ payload: prod, anchor: portfolio, frame: FRAMES[1] }).plan.placements.filter((label) => label.kind === 'hub-preview')).toEqual([])
    expect(compose({ payload: prod, anchor: portfolio, frame: FRAMES[1], zoom: PORTFOLIO_REVEAL.workflows + 0.2, preview: true }).plan.placements.filter((label) => label.kind === 'hub-preview')).toEqual([])
    // What is drawn is what is counted: a workflow the preview left out, found by search, is one more shown.
    const found = compose({ payload: prod, anchor: portfolio, frame: FRAMES[1], preview: true, searchResultId: 'workflow:fs-2', selectedId: 'workflow:fs-2' })
    expect(placed(found.plan, `hub-preview:${hubOf(P.familjeStunden)}`)?.lines).toEqual(['Visar 4 av 5 workflows'])
    // Everywhere: with its counts, beyond them, away from the hub, and in the counts' alignment.
    let checked = 0
    for (const [name, payload] of PAYLOADS) {
      for (const frame of DESKTOP) {
        for (const zoom of ZOOMS) {
          const where = `${name} · ${frame.width} · zoom ${zoom}`
          const composed = compose({ payload, anchor: portfolio, frame, zoom, preview: true })
          for (const caption of composed.plan.placements.filter((label) => label.kind === 'hub-preview')) {
            const counts = placed(composed.plan, `hub-subtext:${caption.ownerId}`)
            expect(counts, `${where} · ${caption.key}`).toBeDefined()
            const hub = composed.layout.hubs.find((entry) => entry.nodeId === caption.ownerId)!
            const gap = TEXT_GAP.subtext * composed.scale
            const under = Math.abs(caption.box.minY - (counts!.box.maxY + gap)) < 1e-6
            const over = Math.abs(caption.box.maxY - (counts!.box.minY - gap)) < 1e-6
            expect(under || over, `${where} · ${caption.key}`).toBe(true)
            if (counts!.box.minY >= hub.y) expect(under, `${where} · ${caption.key} under counts below the hub`).toBe(true)
            if (counts!.box.maxY <= hub.y) expect(over, `${where} · ${caption.key} over counts above the hub`).toBe(true)
            expect([caption.x, caption.anchor], where).toEqual([counts!.x, counts!.anchor])
            expect(caption.tone).toBe('muted')
            checked++
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(40)
  })

  it('names a previewed workflow with its run count after every hub’s own texts, and as a ring again once workflows unfold', () => {
    const scene = compose({ payload: prod, anchor: portfolio, frame: FRAMES[1], preview: true })
    const tp1 = placed(scene.plan, 'node:workflow:tp-1')!
    expect(tp1.lines).toEqual(['Daglig short'])
    expect(tp1.detail?.text).toBe('5 körningar')
    expect(tp1.widthPx).toBeGreaterThanOrEqual(textWidthPx('5 körningar', SPATIAL_TYPE.nodeDetail.size, SPATIAL_TYPE.nodeDetail.weight) - 1e-6)
    // The detail line's descent ends where the plan's box does: the box holds what is drawn.
    expect(tp1.y + (tp1.lines.length - 1) * tp1.lineHeight + tp1.detail!.dy + tp1.detail!.fontSize * TEXT_DESCENT).toBeCloseTo(tp1.box.maxY, 6)
    expect(tp1.detail!.fontSize / scene.scale).toBeCloseTo(SPATIAL_TYPE.nodeDetail.size, 6)
    // A workflow with no runs in the window has no count to say.
    expect(placed(scene.plan, 'node:workflow:fs-4')?.detail).toBeUndefined()
    // Hub names, counts and captions are placed before any previewed name.
    const index = (key: string) => scene.plan.placements.findIndex((label) => label.key === key)
    const lastHubText = Math.max(...scene.plan.placements.filter((label) => label.kind.startsWith('hub-')).map((label) => index(label.key)))
    for (const id of scene.layout.preview.ids) {
      if (placed(scene.plan, `node:${id}`)) expect(index(`node:${id}`), id).toBeGreaterThan(lastHubText)
    }
    // Every previewed workflow of the production-shaped snapshot is named at a desktop overview's first view.
    for (const frame of DESKTOP) {
      const first = compose({ payload: prod, anchor: portfolio, frame, preview: true })
      expect([...first.layout.preview.ids].filter((id) => !placed(first.plan, `node:${id}`)), `${frame.width}`).toEqual([])
    }
    // Once zoom unfolds every workflow, names are as before — no count under them — and counts are rings with captions.
    const unfolded = compose({ payload: prod, anchor: portfolio, frame: FRAMES[0], zoom: PORTFOLIO_REVEAL.workflows + 0.2, preview: true })
    expect(unfolded.countsUnderNames).toBe(false)
    expect(unfolded.plan.placements.filter((label) => label.detail)).toEqual([])
    expect(unfolded.plan.placements.filter((label) => label.kind === 'node' && label.ownerId.startsWith('workflow:')).every((label) => label.tier === 4)).toBe(true)
    // At the overview no workflow's count is a ring, so none has a caption.
    expect(scene.plan.placements.filter((label) => label.kind === 'cluster-caption' && label.ownerId.startsWith('cluster:workflow:'))).toEqual([])
    // The count said is the snapshot's own: its cluster's count.
    for (const [name, payload] of PAYLOADS) {
      const composed = compose({ payload, anchor: portfolio, frame: FRAMES[1], preview: true })
      for (const label of composed.plan.placements.filter((entry) => entry.detail)) {
        const cluster = composed.layout.clusters.find((entry) => entry.kind === 'workflow' && entry.parentId === label.ownerId)!
        expect(label.detail!.text, `${name} · ${label.key}`).toBe(`${cluster.count} ${COPY.clusterCaption(cluster)}`)
      }
    }
  })

  it('follows its counts over a name moved above the hub, or is left out with no room there, never crossing the hub', () => {
    const scene = compose({ payload: prod, anchor: portfolio, frame: FRAMES[1], preview: true })
    const hub = scene.layout.hubs.find((entry) => entry.projectId === P.familjeStunden)!
    const context = {
      layout: scene.layout, nodeById: scene.nodeById, visibleIds: scene.visibleIds, copy: COPY, view: scene.view, viewport: scene.frame, depth: 1, preview: true,
    }
    // Cover the room under the hub, as a control or the sheet would.
    const underHub = { minX: hub.x - hub.r * 4, maxX: hub.x + hub.r * 4, minY: hub.y + hub.r, maxY: hub.y + hub.r * 5 }
    const blocked = planSpatialLabels({ ...context, reserved: [...scene.reserved, underHub] })
    const name = placed(blocked, `hub-name:${hub.nodeId}`)!
    const counts = placed(blocked, `hub-subtext:${hub.nodeId}`)!
    const caption = placed(blocked, `hub-preview:${hub.nodeId}`)!
    expect(name.box.maxY).toBeLessThan(hub.y)
    expect(counts.box.maxY).toBeLessThan(name.box.minY)
    // Over the counts, which are over the name: the reading order away from the hub is caption, counts, name, hub.
    expect(caption.lines).toEqual(['Visar 3 av 5 workflows'])
    expect(caption.box.maxY).toBeCloseTo(counts.box.minY - TEXT_GAP.subtext * scene.scale, 6)
    expect([caption.x, caption.anchor]).toEqual([counts.x, counts.anchor])
    expect(distanceToBox(hub.x, hub.y, caption.box)).toBeGreaterThanOrEqual(hub.r)
    // With the room over the counts taken as well, the caption is left out; the name and counts stay where they were.
    const crowded = planSpatialLabels({ ...context, reserved: [...scene.reserved, underHub, { ...caption.box }] })
    expect(placed(crowded, `hub-name:${hub.nodeId}`)!.box).toEqual(name.box)
    expect(placed(crowded, `hub-subtext:${hub.nodeId}`)!.box).toEqual(counts.box)
    expect(placed(crowded, `hub-preview:${hub.nodeId}`)).toBeUndefined()
    expect(crowded.hidden).toContain(`hub-preview:${hub.nodeId}`)
  })

  it('frames previewed names while the previews widen the overview by at most a tenth, and only their workflows on a docked inspector’s canvas', () => {
    const framing = (frame: { width: number; height: number }) => compose({ payload: prod, anchor: portfolio, frame, preview: true }).framing
    // The page at 1920, 1440 and 1280 px, the inspector closed.
    for (const frame of [{ width: 1602, height: 900 }, { width: 1122, height: 688 }, { width: 962, height: 520 }]) expect(framing(frame), `${frame.width}`).toBe('names')
    // The same pages with the inspector docked.
    for (const frame of [{ width: 758, height: 640 }, { width: 598, height: 470 }, { width: 382, height: 520 }]) expect(framing(frame), `${frame.width}`).toBe('workflows')
    // Either way, the view is at most a tenth wider than the overview's without the previews.
    for (const frame of [{ width: 1602, height: 900 }, { width: 1122, height: 688 }, { width: 962, height: 520 }, { width: 758, height: 640 }, { width: 598, height: 470 }, { width: 382, height: 520 }]) {
      const plain = compose({ payload: prod, anchor: portfolio, frame })
      const shown = compose({ payload: prod, anchor: portfolio, frame, preview: true })
      expect(shown.view.w / plain.view.w, `${frame.width}`).toBeLessThanOrEqual(1.1 + 1e-9)
    }
  })

  it('costs the overview no hub name or count at its first view, on a canvas narrowed by a docked inspector too', () => {
    // The desktop canvases, and those a docked inspector leaves at 1440, 1280 and 1024 px.
    const canvases = [...DESKTOP, { width: 758, height: 640 }, { width: 598, height: 470 }, { width: 382, height: 520 }]
    for (const [name, payload] of PAYLOADS) {
      for (const frame of canvases) {
        const plain = compose({ payload, anchor: portfolio, frame }).plan
        const shown = compose({ payload, anchor: portfolio, frame, preview: true }).plan
        const hubTexts = (plan: SpatialLabelPlan) => plan.placements.filter((label) => label.kind === 'hub-name' || label.kind === 'hub-subtext').map((label) => label.key).sort()
        // Every hub text the compact overview draws is drawn with the preview too.
        expect(hubTexts(plain).filter((key) => !hubTexts(shown).includes(key)), `${name} · ${frame.width}`).toEqual([])
      }
    }
  })
})

/** Whether a node belongs to the level an anchor opens (for picking a selection). */
function belongsTo(anchor: SpatialAnchor, node: IntelligenceGraphNode): boolean {
  if (anchor.level === 'project') return node.projectId === anchor.projectId
  if (anchor.level === 'workflow') return node.id === anchor.workflowId
  return true
}


