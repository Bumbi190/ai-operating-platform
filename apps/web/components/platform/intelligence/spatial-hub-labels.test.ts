/**
 * Phase 18 T2c fix — a hub's name and counts are placed clear of the hub itself.
 *
 * At 6c0b6a1, a hub whose name fell back above it drew its counts under the
 * name — across its own ring — because a hub's texts were exempt from the hub.
 * The scenes below are recorded from the browser harness at 6c0b6a1: the canvas
 * size, camera, measured page chrome and selection of each case, and every text
 * the canvas drew. Replaying them through the same computations the canvas makes
 * reproduces those drawings exactly, so these tests fail on the old rule.
 *
 * Measured here with this file's own geometry. A hub's monogram is drawn inside
 * the hub by design and is not a text of the label plan, so it is not measured.
 */
import { describe, expect, it } from 'vitest'
import type { IntelligenceGraphEdge, IntelligenceGraphNode } from '@/lib/intelligence/graph-contract'
import { nodeStatus } from '@/lib/os/intelligence-graph-shared'
import { labelStressOperations, productionShapedOperations } from '@/lib/qa/intelligence-graph-fixture'
import { boundsWithScreenText, fitGraphBounds, reservedCanvasBoxes, type GraphBounds, type GraphViewBox } from './graph-readability'
import { classifySpatialAspect, computeSpatialLayout, spatialNodeVisibility, type SpatialLayout } from './spatial-layout'
import { SPATIAL_NARROW_CANVAS, clusterDrawRadius, spatialScreenTexts, spatialTypeScale, type SpatialCopy } from './spatial-text'
import { planSpatialLabels, spatialLabelCandidates, type SpatialLabelContext, type SpatialLabelPlacement } from './spatial-labels'

/** The page's own words (IntelligenceGraphVNext SPATIAL_COPY): a text's width depends on them. */
const PAGE_COPY: SpatialCopy = {
  atlasLabel: 'Atlas',
  atlasSubtitle: 'Omniras identitet',
  atlasDescription: 'Omniras identitet, inte en datanod. Linjerna från Atlas går till projekt du äger. Aktivera för översikten.',
  clusterCount: (cluster) => (cluster.kind === 'older' ? `+${cluster.count}` : String(cluster.count)),
  clusterCaption: (cluster) => (cluster.kind === 'older' ? 'äldre' : cluster.kind === 'no-workflow' ? 'utan workflow' : cluster.count === 1 ? 'körning' : 'körningar'),
  unlinkedAgents: (count) => [`${count} ${count === 1 ? 'agent' : 'agenter'}`, 'som inget workflow nämner'] as const,
  hubDescription: (hub) => hub.subtext,
  clusterDescription: (cluster, parentLabel) => `${parentLabel}: ${cluster.count}`,
  statusWord: (node) => nodeStatus(node)?.label.toLowerCase() ?? null,
}
/** One row of the page's controls (HUD_ROW_REM × the root font size). */
const HUD_ROW_PX = 3.125 * 16

type Rect = readonly [number, number, number, number]
interface RecordedScene {
  name: string
  payload: 'prod' | 'stress'
  selectedId: string | null
  stage: readonly [number, number]
  svg: readonly [number, number]
  viewBox: readonly [number, number, number, number]
  narrow: boolean
  inspectorOpen: boolean
  placeShown: boolean
  /** Measured chrome over the canvas, canvas px: [x, y, width, height]. */
  chrome: readonly Rect[]
  /** What the canvas drew: key, x, baseline y, anchor, and each line (a status last). */
  labels: ReadonlyArray<readonly [string, number, number, string, readonly string[]]>
}

/** Recorded from the harness at 6c0b6a1 (build t2c-6c0b6a1, Inter, one fresh Chrome session per case). */
const RECORDED: readonly RecordedScene[] = [
  {
    name: "1920-portfolio", payload: "prod", selectedId: null,
    stage: [1604, 870], svg: [1602, 867.890625], viewBox: [-843.7283652688891, -398.76, 1687.4567305377782, 914.1871888432515],
    narrow: false, inspectorOpen: false, placeShown: false,
    chrome: [[10, 823, 218, 34], [1100, 819, 373, 38], [1474, 782, 128, 85]],
    labels: [
      ["atlas:atlas", 0, 108.85891313401471, "middle", ["Atlas"]],
      ["hub-name:project:bbbbbbbb-0000-4000-8000-000000000004", 225.85, -192.24251836851658, "middle", ["AUDIT 0b"]],
      ["hub-name:project:bbbbbbbb-0000-4000-8000-000000000002", -449.64, -10.769843347024558, "middle", ["Familje-Stunden"]],
      ["hub-name:project:bbbbbbbb-0000-4000-8000-000000000003", -225.85, 321.2774816314834, "middle", ["GainPilot"]],
      ["hub-name:project:bbbbbbbb-0000-4000-8000-000000000001", 449.64, 169.81015665297548, "middle", ["The Prompt"]],
      ["hub-subtext:project:bbbbbbbb-0000-4000-8000-000000000004", 225.85, -175.55755294297447, "middle", ["2 inaktiva workflows"]],
      ["hub-subtext:project:bbbbbbbb-0000-4000-8000-000000000002", -449.64, 6.188991460502424, "middle", ["33 agenter · 5 workflows"]],
      ["hub-subtext:project:bbbbbbbb-0000-4000-8000-000000000003", -225.85, 337.96244705702543, "middle", ["Inga agenter eller workflows"]],
      ["hub-subtext:project:bbbbbbbb-0000-4000-8000-000000000001", 449.64, 186.7689914605025, "middle", ["2 agenter · 6 workflows · 13 körningar"]],
      ["atlas-subtitle:atlas", 0, 125.94414919476549, "middle", ["Omniras identitet"]],
    ],
  },
  {
    name: "1440-portfolio", payload: "prod", selectedId: null,
    stage: [1124, 690], svg: [1122, 687.890625], viewBox: [-757.6733393753827, -398.76, 1515.3466787507655, 929.0488181261481],
    narrow: false, inspectorOpen: false, placeShown: false,
    chrome: [[10, 643, 218, 34], [620, 639, 373, 38], [994, 602, 128, 85]],
    labels: [
      ["atlas:atlas", 0, 115.87360215554195, "middle", ["Atlas"]],
      ["hub-name:project:bbbbbbbb-0000-4000-8000-000000000004", 225.85, -188.0218156521739, "middle", ["AUDIT 0b"]],
      ["hub-name:project:bbbbbbbb-0000-4000-8000-000000000002", -449.64, -6.31135456215555, "middle", ["Familje-Stunden"]],
      ["hub-name:project:bbbbbbbb-0000-4000-8000-000000000003", -225.85, 325.4981843478261, "middle", ["GainPilot"]],
      ["hub-name:project:bbbbbbbb-0000-4000-8000-000000000001", 449.64, 174.2686454378445, "middle", ["The Prompt"]],
      ["hub-subtext:project:bbbbbbbb-0000-4000-8000-000000000004", 225.85, -166.62868606981013, "middle", ["2 inaktiva workflows"]],
      ["hub-subtext:project:bbbbbbbb-0000-4000-8000-000000000002", -449.64, 15.43292487446417, "middle", ["33 agenter · 5 workflows"]],
      ["hub-subtext:project:bbbbbbbb-0000-4000-8000-000000000003", -225.85, 346.8913139301898, "middle", ["Inga agenter eller workflows"]],
      ["hub-subtext:project:bbbbbbbb-0000-4000-8000-000000000001", 449.64, 196.01292487446423, "middle", ["2 agenter · 6 workflows · 13 körningar"]],
      ["atlas-subtitle:atlas", 0, 137.77995075566443, "middle", ["Omniras identitet"]],
    ],
  },
  {
    name: "1024-stress-portfolio", payload: "stress", selectedId: null,
    stage: [708, 419], svg: [706, 417.109375], viewBox: [-1078.5654450049933, -580.06, 2411.6568840774885, 1424.8225150595024],
    narrow: false, inspectorOpen: false, placeShown: false,
    chrome: [[10, 373, 218, 34], [472, 369, 105, 38], [578, 332, 128, 85]],
    labels: [
      ["atlas:atlas", 0, 164.6162924422503, "middle", ["Atlas"]],
      ["hub-name:project:cccccccc-0000-4000-8000-000000000004", -714.07, -330.47386377579636, "middle", ["Ekonomi"]],
      ["hub-name:project:cccccccc-0000-4000-8000-000000000007", -620.51, -2.2811080997878435, "middle", ["Familje-Stunden"]],
      ["hub-name:project:cccccccc-0000-4000-8000-000000000003", 23.05, -241.78110809978787, "middle", ["Forskningsstöd — Medicinsk litteratur"]],
      ["hub-name:project:cccccccc-0000-4000-8000-000000000005", 714.07, 296.99760674469235, "middle", ["Internt", "verktygsstöd"]],
      ["hub-name:project:cccccccc-0000-4000-8000-000000000001", 310.6941591327389, 401.5771760073884, "end", ["Nordisk Kundservice", "och Supportautomation"]],
      ["hub-name:project:cccccccc-0000-4000-8000-000000000002", -325.21244323991516, 269.15629087619425, "start", ["Q4-kampanj för", "Återförsäljare"]],
      ["node:run:q4-2-0", -556.349722975053, 242.7930236915632, "end", ["Annonsmaterial för", "sociala medier", "misslyckades"]],
      ["node:run:nk-3-0", 340.4844032522291, 40.214953856799816, "start", ["Eskalering till", "specialist · r8100200", "inväntar granskning"]],
      ["node:run:nk-orphan-0", 497.65, 479.12502812441585, "middle", ["run nkorph0", "misslyckades"]],
      ["node:run:q4-1-0", -379.2837613008916, 87.22696573298853, "end", ["Kampanjplan · r8200000", "kör"]],
      ["hub-subtext:project:cccccccc-0000-4000-8000-000000000003", 23.05, -186.7844001201171, "middle", ["3 agenter · 3 workflows · 3 körningar"]],
      ["hub-subtext:project:cccccccc-0000-4000-8000-000000000005", 714.07, 410.4069672990446, "middle", ["2 inaktiva workflows"]],
      ["hub-subtext:project:cccccccc-0000-4000-8000-000000000001", 310.6941591327389, 520.1104534542565, "end", ["30 agenter · 12 workflows · 81 körningar"]],
    ],
  },
  {
    name: "768-stress-portfolio", payload: "stress", selectedId: null,
    stage: [712, 615], svg: [710, 613.109375], viewBox: [-1068.6728900881815, -900.469902495109, 2386.4840068431645, 2060.810870257899],
    narrow: false, inspectorOpen: false, placeShown: false,
    chrome: [[10, 569, 218, 34], [476, 565, 105, 38], [582, 590, 128, 23]],
    labels: [
      ["atlas:atlas", 0, 163.32538388943476, "middle", ["Atlas"]],
      ["hub-name:project:cccccccc-0000-4000-8000-000000000004", -714.07, -331.5240944628327, "middle", ["Ekonomi"]],
      ["hub-name:project:cccccccc-0000-4000-8000-000000000007", -620.51, -3.3750983987840897, "middle", ["Familje-Stunden"]],
      ["hub-name:project:cccccccc-0000-4000-8000-000000000003", 23.05, -242.8750983987841, "middle", ["Forskningsstöd — Medicinsk litteratur"]],
      ["hub-name:project:cccccccc-0000-4000-8000-000000000005", 714.07, 544.5959055371673, "middle", ["Internt verktygsstöd"]],
      ["hub-name:project:cccccccc-0000-4000-8000-000000000001", 311.0092283388498, 400.60571262187966, "end", ["Nordisk Kundservice", "och Supportautomation"]],
      ["hub-name:project:cccccccc-0000-4000-8000-000000000002", -325.65003935951364, 269.44346332968075, "start", ["Q4-kampanj för", "Återförsäljare"]],
      ["node:run:q4-2-0", -556.076225400304, 243.36928308155947, "end", ["Annonsmaterial för", "sociala medier", "misslyckades"]],
      ["node:run:nk-3-0", 339.30289372931315, 43.05221769724654, "start", ["Eskalering till", "specialist · r8100200", "inväntar granskning"]],
      ["node:run:nk-orphan-0", 520.456225400304, 327.77496050239307, "start", ["run nkorph0", "misslyckades"]],
      ["node:run:nk-2-0", 582.9573524018239, 186.30928308155953, "start", ["Svarsförslag till", "kund · r8100100", "misslyckades"]],
      ["node:run:q4-1-0", -378.8111574917252, 88.5753087765014, "end", ["Kampanjplan · r8200000", "kör"]],
      ["hub-subtext:project:cccccccc-0000-4000-8000-000000000003", 23.05, -188.7590526098053, "middle", ["3 agenter · 3 workflows · 3 körningar"]],
      ["hub-subtext:project:cccccccc-0000-4000-8000-000000000005", 714.07, 597.8380276053302, "middle", ["2 inaktiva workflows"]],
      ["hub-subtext:project:cccccccc-0000-4000-8000-000000000001", 311.0092283388498, 517.2409168999892, "end", ["30 agenter · 12 workflows · 81 körningar"]],
    ],
  },
  {
    name: "375-portfolio", payload: "prod", selectedId: null,
    stage: [339, 425], svg: [337, 423.09375], viewBox: [-600.32, -721.6843916913947, 1200.64, 1507.3687833827894],
    narrow: true, inspectorOpen: false, placeShown: false,
    chrome: [[194, 10, 133, 34], [10, 375, 105, 38], [199, 395, 138, 28]],
    labels: [
      ["atlas:atlas", 0, 162.26605198813058, "middle", ["Atlas"]],
      ["hub-name:project:bbbbbbbb-0000-4000-8000-000000000004", 370.32, -184.19389364985165, "middle", ["AUDIT 0b"]],
      ["hub-name:project:bbbbbbbb-0000-4000-8000-000000000002", -268.35, -101.55573175074184, "middle", ["Familje-Stunden"]],
      ["hub-name:project:bbbbbbbb-0000-4000-8000-000000000003", -370.32, 395.42610635014836, "middle", ["GainPilot"]],
      ["hub-name:project:bbbbbbbb-0000-4000-8000-000000000001", 268.35, 341.80426824925814, "middle", ["The Prompt"]],
      ["hub-subtext:project:bbbbbbbb-0000-4000-8000-000000000004", 370.32, -133.24970525816025, "middle", ["2 inaktiva workflows"]],
      ["atlas-subtitle:atlas", 0, 214.40161728189912, "middle", ["Omniras identitet"]],
    ],
  },
  {
    name: "375-portfolio-select-hub", payload: "prod", selectedId: "project:bbbbbbbb-0000-4000-8000-000000000002",
    stage: [339, 425], svg: [337, 423.09375], viewBox: [-1002.7457459064486, -724.8089467344298, 1974.8129009900567, 2479.320462398403],
    narrow: true, inspectorOpen: true, placeShown: false,
    chrome: [[194, 10, 133, 34], [199, 395, 138, 28]],
    labels: [
      ["atlas:atlas", 0, 212.73201723723906, "middle", ["Atlas"]],
      ["hub-name:project:bbbbbbbb-0000-4000-8000-000000000004", 370.32, -143.17421614220044, "middle", ["AUDIT 0b"]],
      ["hub-name:project:bbbbbbbb-0000-4000-8000-000000000002", -268.35, -342.67127918136003, "middle", ["Familje-Stunden"]],
      ["hub-name:project:bbbbbbbb-0000-4000-8000-000000000003", -370.32, 436.4457838577996, "middle", ["GainPilot"]],
      ["hub-name:project:bbbbbbbb-0000-4000-8000-000000000001", 268.35, 384.4412090278204, "middle", ["The Prompt"]],
      ["hub-subtext:project:bbbbbbbb-0000-4000-8000-000000000002", -268.35, -257.53750521820416, "middle", ["33 agenter · 5 workflows"]],
      ["hub-subtext:project:bbbbbbbb-0000-4000-8000-000000000003", -370.32, 520.2387946406988, "middle", ["Inga agenter eller workflows"]],
    ],
  },
  {
    name: "zoom-1440-portfolio-in", payload: "prod", selectedId: null,
    stage: [1124, 690], svg: [1122, 687.890625], viewBox: [-418.45624043839575, -190.78828681064988, 836.9124808767915, 513.1053917474479],
    narrow: false, inspectorOpen: false, placeShown: false,
    chrome: [[10, 643, 217, 34], [620, 639, 373, 38], [994, 602, 128, 85]],
    labels: [
      ["atlas:atlas", 0, 101.60350672788974, "middle", ["Atlas"]],
      ["hub-name:project:bbbbbbbb-0000-4000-8000-000000000002", -402.1504315876169, -33.849495963266165, "start", ["Familje-", "Stunden"]],
      ["hub-name:project:bbbbbbbb-0000-4000-8000-000000000003", -225.85, 202.24714895452593, "middle", ["GainPilot"]],
      ["hub-name:project:bbbbbbbb-0000-4000-8000-000000000001", 402.1504315876169, 146.73050403673383, "end", ["The", "Prompt"]],
      ["node:workflow:tp-6", 347.57817739594157, 101.34745064434864, "end", ["Arkivering"]],
      ["node:workflow:tp-1", 361.7264947628506, 69.69261825744164, "end", ["Daglig short"]],
      ["node:workflow:tp-3", 403.5681773959416, 13.467450644348638, "end", ["Nyhetsbrev"]],
      ["node:workflow:fs-3", -370.7281773959416, -146.12254935565136, "start", ["Skola och läxor"]],
      ["node:workflow:fs-1", -347.19817739594157, -84.84254935565136, "start", ["Veckans familjeplan"]],
      ["hub-subtext:project:bbbbbbbb-0000-4000-8000-000000000002", -402.1504315876169, -7.966373782852023, "start", ["33 agenter · 5 workflows"]],
      ["hub-subtext:project:bbbbbbbb-0000-4000-8000-000000000003", -225.85, 214.06238397866886, "middle", ["Inga agenter eller workflows"]],
      ["hub-subtext:project:bbbbbbbb-0000-4000-8000-000000000001", 402.1504315876169, 172.61362621714798, "end", ["2 agenter · 6 workflows · 13 körningar"]],
      ["atlas-subtitle:atlas", 0, 113.70218804680378, "middle", ["Omniras identitet"]],
      ["cluster-caption:cluster:workflow:tp-1", 346.5663547918831, 34.273960515478905, "end", ["körningar"]],
      ["cluster-caption:cluster:workflow:tp-3", 402.1963547918831, -9.70603948452109, "end", ["körningar"]],
    ],
  },
]

const PAYLOADS: Record<RecordedScene['payload'], { nodes: IntelligenceGraphNode[]; edges: IntelligenceGraphEdge[] }> = {
  prod: productionShapedOperations(24),
  stress: labelStressOperations(),
}

/** A recorded scene through the computations GraphCanvas makes for the portfolio (overlays, sheet, depth, visibility, reserve). */
function replay(scene: RecordedScene) {
  const payload = PAYLOADS[scene.payload]
  const layout = computeSpatialLayout({ nodes: payload.nodes, edges: payload.edges, anchor: { level: 'portfolio' }, aspect: classifySpatialAspect(scene.stage[0], scene.stage[1] - 2 * HUD_ROW_PX) })
  const viewport = { width: scene.svg[0], height: scene.svg[1] }
  const view: GraphViewBox = { x: scene.viewBox[0], y: scene.viewBox[1], w: scene.viewBox[2], h: scene.viewBox[3] }
  const overlayTop = (scene.narrow ? (scene.placeShown ? 2 : 1) : scene.placeShown ? 1 : 0) * HUD_ROW_PX
  const sheetPresentation = scene.narrow
  const sheetInset = scene.inspectorOpen && sheetPresentation ? Math.min(viewport.height * 0.48, 384) : 0
  const overlayBottom = Math.max(0, HUD_ROW_PX, sheetInset)
  const overlay = { top: overlayTop, bottom: overlayBottom }
  const texts = spatialScreenTexts(layout, PAGE_COPY, { narrow: viewport.width < SPATIAL_NARROW_CANVAS })
    .filter((text) => text.kind === 'atlas' || text.kind === 'atlas-subtitle' || text.kind === 'hub-name' || text.kind === 'hub-subtext')
  const fitWidth = fitGraphBounds(boundsWithScreenText(layout.fitBounds, texts, viewport, undefined, overlay), viewport, undefined, overlay).w
  const depth = fitWidth / Math.max(1, view.w)
  const neighbours = new Set<string>(scene.selectedId ? [scene.selectedId] : [])
  for (const edge of payload.edges) {
    if (edge.source === scene.selectedId || edge.target === scene.selectedId) { neighbours.add(edge.source); neighbours.add(edge.target) }
  }
  const visibleIds = new Set(payload.nodes.filter((node) => spatialNodeVisibility(node, layout, {
    depth, selectedId: scene.selectedId, focusId: null, searchResultId: null, neighborIds: neighbours, executionContext: false, compactAgents: false,
  }) !== 'hidden').map((node) => node.id))
  const reserved: GraphBounds[] = [
    ...reservedCanvasBoxes(view, viewport.height, scene.inspectorOpen && sheetPresentation ? view.h * 0.48 : 0, overlay),
    ...scene.chrome.map(([x, y, width, height]) => ({
      minX: view.x + (x / viewport.width) * view.w, minY: view.y + (y / viewport.height) * view.h,
      maxX: view.x + ((x + width) / viewport.width) * view.w, maxY: view.y + ((y + height) / viewport.height) * view.h,
    })),
  ]
  const nodeById = new Map(payload.nodes.map((node) => [node.id, node]))
  const context: SpatialLabelContext = {
    layout, nodeById, visibleIds, copy: PAGE_COPY, view, viewport, reserved, depth,
    selectedId: scene.selectedId, hoverId: null, focusId: null, searchResultId: null, neighborIds: scene.selectedId ? neighbours : undefined,
  }
  return { layout, view, viewport, reserved, visibleIds, context, plan: planSpatialLabels(context), scale: view.w / viewport.width }
}

const drawn = (placement: SpatialLabelPlacement) => [...placement.lines, ...(placement.status ? [placement.status.text] : [])]
const distanceToBox = (x: number, y: number, box: GraphBounds) => Math.hypot(x - Math.min(Math.max(x, box.minX), box.maxX), y - Math.min(Math.max(y, box.minY), box.maxY))
const meets = (a: GraphBounds, b: GraphBounds) => a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY

/** What a replayed plan got wrong. Every circle is measured, a text's own included; its ring's stroke counts as the circle. */
function crossings(result: ReturnType<typeof replay>): string[] {
  const { layout, plan, visibleIds, reserved, scale } = result
  const found: string[] = []
  const circles = [
    { owner: 'atlas', x: layout.atlas.x, y: layout.atlas.y, r: layout.atlas.r },
    ...[...layout.positions].filter(([id]) => visibleIds.has(id)).map(([owner, position]) => ({ owner, x: position.x, y: position.y, r: position.r + 1.2 * scale })),
    ...layout.clusters.filter((cluster) => visibleIds.has(cluster.parentId)).map((cluster) => ({ owner: cluster.id, x: cluster.x, y: cluster.y, r: clusterDrawRadius(cluster.r, scale) })),
  ]
  plan.placements.forEach((label, index) => {
    for (const circle of circles) {
      if (distanceToBox(circle.x, circle.y, label.box) < circle.r - 1e-6) found.push(`${label.key} × ${circle.owner === label.ownerId ? 'its own circle' : circle.owner}`)
    }
    for (const earlier of plan.placements.slice(0, index)) if (meets(earlier.box, label.box)) found.push(`${label.key} × ${earlier.key}`)
    if (reserved.some((band) => meets(band, label.box))) found.push(`${label.key} × chrome`)
  })
  return found
}

const FAILING = ['375-portfolio-select-hub', '1024-stress-portfolio', 'zoom-1440-portfolio-in']
const REGULAR = ['1920-portfolio', '1440-portfolio', '768-stress-portfolio', '375-portfolio']
const scene = (name: string) => RECORDED.find((entry) => entry.name === name)!

describe('phase 18 T2c fix · a hub’s name and counts stay clear of the hub', () => {
  it('replays the recorded regular scenes exactly: names under their hubs, counts under their names, every other text unchanged', () => {
    for (const name of REGULAR) {
      const recorded = scene(name)
      const { plan } = replay(recorded)
      expect(plan.placements.map((label) => label.key).sort(), name).toEqual(recorded.labels.map(([key]) => key).sort())
      for (const [key, x, y, anchor, lines] of recorded.labels) {
        const label = plan.placements.find((entry) => entry.key === key)!
        expect(label.x, `${name} · ${key} x`).toBeCloseTo(x, 6)
        expect(label.y, `${name} · ${key} y`).toBeCloseTo(y, 6)
        expect(label.anchor, `${name} · ${key}`).toBe(anchor)
        expect(drawn(label), `${name} · ${key}`).toEqual(lines)
      }
    }
  })

  it('draws no text across its own hub, another circle, another text or the page’s chrome in the recorded scenes', () => {
    const found = Object.fromEntries(RECORDED.map((recorded) => [recorded.name, crossings(replay(recorded))]))
    expect(found).toEqual(Object.fromEntries(RECORDED.map((recorded) => [recorded.name, []])))
  })

  it('keeps a hub an obstacle to its own name and counts', () => {
    // The counts' places are all on the name's far side from the hub, so no drawing here can reach the hub;
    // the hub stays an obstacle all the same, so a place added later cannot cross it unnoticed. (A hub's
    // monogram is drawn inside it by its glyph and is not a text of the plan.)
    let checked = 0
    for (const recorded of RECORDED) {
      const { layout, context, scale, viewport } = replay(recorded)
      const candidates = spatialLabelCandidates(context, scale, spatialTypeScale(viewport.width))
      for (const hub of layout.hubs) {
        for (const kind of ['hub-name', 'hub-subtext']) {
          const candidate = candidates.find((entry) => entry.key === `${kind}:${hub.nodeId}`)
          if (!candidate) continue
          expect(candidate.exempt.has(hub.nodeId), `${recorded.name} · ${candidate.key}`).toBe(false)
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(40)
  })

  it('fixes the three documented cases by moving or leaving out only the counts that crossed their hub', () => {
    const expected: Record<string, { hub: string; counts: 'left out' | 'over the name' }> = {
      // The name had to go above the hub; the room above the name is under the page's top controls.
      '375-portfolio-select-hub': { hub: 'project:bbbbbbbb-0000-4000-8000-000000000002', counts: 'left out' },
      '1024-stress-portfolio': { hub: 'project:cccccccc-0000-4000-8000-000000000005', counts: 'left out' },
      // After a manual zoom the name sits above GainPilot, and its counts fit above the name.
      'zoom-1440-portfolio-in': { hub: 'project:bbbbbbbb-0000-4000-8000-000000000003', counts: 'over the name' },
    }
    for (const name of FAILING) {
      const recorded = scene(name)
      const { layout, plan } = replay(recorded)
      const { hub: hubId, counts: outcome } = expected[name]
      const hub = layout.hubs.find((entry) => entry.nodeId === hubId)!
      const countsKey = `hub-subtext:${hubId}`
      // Every other text is drawn exactly as it was — the hub's name included.
      for (const [key, x, y, anchor, lines] of recorded.labels) {
        if (key === countsKey) continue
        const label = plan.placements.find((entry) => entry.key === key)
        expect(label, `${name} · ${key}`).toBeDefined()
        expect([label!.x, label!.y, label!.anchor, drawn(label!)], `${name} · ${key}`).toEqual([expect.closeTo(x, 6), expect.closeTo(y, 6), anchor, lines])
      }
      const hubName = plan.placements.find((entry) => entry.key === `hub-name:${hubId}`)!
      expect(hubName.box.maxY, `${name}: the name is above its hub`).toBeLessThan(hub.y - hub.r)
      const counts = plan.placements.find((entry) => entry.key === countsKey)
      // At 6c0b6a1 the counts were drawn, under the name and across the hub.
      expect(recorded.labels.some(([key]) => key === countsKey), name).toBe(true)
      if (outcome === 'left out') {
        expect(counts, name).toBeUndefined()
        expect(plan.hidden, name).toContain(countsKey)
      } else {
        expect(counts, name).toBeDefined()
        expect(counts!.box.maxY, `${name}: counts over the name`).toBeLessThanOrEqual(hubName.box.minY)
        expect(counts!.lines, name).toEqual([hub.subtext])
      }
      // What the canvas leaves out stays true where it is still said: the hub's counts are unchanged.
      expect(hub.subtext, name).toBe(recorded.labels.find(([key]) => key === countsKey)![4][0])
    }
  })
})
