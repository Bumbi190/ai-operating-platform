/**
 * The spatial view's own texts (Phase 18 T2b): Atlas's name, hub names and
 * counts, run-count captions and unnamed-agent band captions. They are drawn at
 * screen size under world points, so how much room they take depends on the
 * camera; this module says where each one is and which of them are drawn.
 *
 * Two rules, both deterministic:
 *  - A fit keeps them on the canvas (`spatialScreenTexts` feeds
 *    `boundsWithScreenText`).
 *  - They never lie over each other or over a circle that is not theirs: Atlas's
 *    name and hub names always show; a band caption, a hub's counts and a run
 *    count's caption show only where they are clear, in that order
 *    (`planSpatialTexts`). What is left out is still said elsewhere — a hub's
 *    counts in its accessible name and the inspector, a cluster's in its title.
 */

import type { GraphBounds, GraphScreenText } from './graph-readability'
import type { SpatialHub, SpatialLayout, SpatialRunCluster, SpatialUnlinkedBand } from './spatial-layout'

/** Every word the spatial canvas shows, supplied by the page in its language. */
export interface SpatialCopy {
  atlasLabel: string
  atlasDescription: string
  /** The number in a run cluster ("29", or "+16" for older runs in a workflow view). */
  clusterCount: (cluster: SpatialRunCluster) => string
  /** The word under it ("körningar", "äldre", "utan workflow"). */
  clusterCaption: (cluster: SpatialRunCluster) => string
  /** Two lines: "8 agenter" / "som inget workflow nämner". */
  unlinkedAgents: (count: number) => readonly [string, string]
  hubDescription: (hub: SpatialHub) => string
  clusterDescription: (cluster: SpatialRunCluster, parentLabel: string) => string
}

export type SpatialTextKind = 'atlas' | 'hub-name' | 'band' | 'hub-subtext' | 'cluster-caption'

export interface SpatialText extends GraphScreenText {
  kind: SpatialTextKind
  /** The hub, cluster or band the text belongs to. */
  ownerId: string
  key: string
}

/**
 * The level's own names and counts, drawn at screen size under world points —
 * what a fit must keep on the canvas. Sizes and offsets follow `HubGlyph`,
 * `AtlasOrb`, `RunClusters` and `UnlinkedBands`; widths are generous estimates.
 */
export function spatialScreenTexts(layout: SpatialLayout, copy: SpatialCopy): SpatialText[] {
  const halfWidth = (text: string, size: number) => text.length * size * 0.31 + 3
  const texts: SpatialText[] = []
  const add = (kind: SpatialTextKind, ownerId: string, x: number, y: number, half: number, topPx: number, bottomPx: number, anchor: BandAnchor = 'middle') => texts.push({
    kind, ownerId, key: `${kind}:${ownerId}`, x, y, topPx, bottomPx,
    leftPx: anchor === 'start' ? 3 : anchor === 'end' ? half * 2 : half,
    rightPx: anchor === 'end' ? 3 : anchor === 'start' ? half * 2 : half,
  })
  if (!layout.atlas.receded) {
    add('atlas', 'atlas', layout.atlas.x, layout.atlas.y + layout.atlas.r, halfWidth(copy.atlasLabel, 15), 15 * 0.55, 15 * 1.85)
  }
  for (const hub of layout.hubs) {
    if (hub.orbit === 'receded') continue
    const name = hub.orbit === 'focus' ? 15 : 13.5
    const nameBaseline = name * 1.4
    const subtextBaseline = nameBaseline + 10.5 * 1.5
    add('hub-name', hub.nodeId, hub.x, hub.y + hub.r, halfWidth(hub.label, name), nameBaseline - name, nameBaseline + name * 0.3)
    add('hub-subtext', hub.nodeId, hub.x, hub.y + hub.r, halfWidth(hub.subtext, 10.5), subtextBaseline - 10.5, subtextBaseline + 10.5 * 0.3)
  }
  for (const band of layout.unlinkedBands) {
    const [first, second] = copy.unlinkedAgents(band.count)
    add('band', band.id, band.x, band.y, halfWidth(first.length > second.length ? first : second, 10.5), -10.5 * 1.2, 10.5 * 1.35, bandAnchor(band))
  }
  for (const cluster of layout.clusters) {
    add('cluster-caption', cluster.id, cluster.x, cluster.y + cluster.r, halfWidth(copy.clusterCaption(cluster), 9.5), 9.5 * 0.45, 9.5 * 1.75)
  }
  return texts
}

export type BandAnchor = 'start' | 'middle' | 'end'

/** A band's caption reads away from the project it describes: outward on the sides, centred above and below. */
export function bandAnchor(band: SpatialUnlinkedBand): BandAnchor {
  const horizontal = Math.cos(band.angle)
  return horizontal < -0.55 ? 'end' : horizontal > 0.55 ? 'start' : 'middle'
}

const SPATIAL_TEXT_TIER: Record<SpatialTextKind, number> = { atlas: 0, 'hub-name': 1, band: 2, 'hub-subtext': 3, 'cluster-caption': 4 }

export interface SpatialTextPlan {
  /** Keys of the texts drawn. */
  shown: ReadonlySet<string>
  /** Texts that give way to a node label placed over them afterwards. */
  yielding: ReadonlyArray<{ key: string; box: GraphBounds }>
  /** What node labels route around: the level's circles and the texts drawn. */
  obstacles: GraphBounds[]
}

/**
 * Which of the level's own texts are drawn at this scale. Atlas's name and the
 * hub names always are; a band caption, a hub's counts and a run count's
 * caption are drawn only where they cross no text drawn before them and no
 * circle but their own — in that order. What is left out is still said: the
 * hub's counts in its name for assistive tech and the inspector, a cluster's in
 * its title.
 */
export function planSpatialTexts(
  layout: SpatialLayout,
  texts: readonly SpatialText[],
  scale: number,
  visibleIds: ReadonlySet<string>,
): SpatialTextPlan {
  const circle = (x: number, y: number, r: number): GraphBounds => ({ minX: x - r, minY: y - r, maxX: x + r, maxY: y + r })
  const overlaps = (a: GraphBounds, b: GraphBounds) => a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY
  const circles: Array<{ ownerId: string; box: GraphBounds }> = [{ ownerId: 'atlas', box: circle(layout.atlas.x, layout.atlas.y, layout.atlas.r + 6 * scale) }]
  for (const [id, position] of layout.positions) {
    if (visibleIds.has(id)) circles.push({ ownerId: id, box: circle(position.x, position.y, position.r + 2 * scale) })
  }
  for (const cluster of layout.clusters) {
    if (visibleIds.has(cluster.parentId)) circles.push({ ownerId: cluster.id, box: circle(cluster.x, cluster.y, cluster.r + 3 * scale) })
  }
  const visible = texts.filter(text => {
    if (text.kind === 'atlas') return true
    if (text.kind === 'hub-name' || text.kind === 'hub-subtext') return visibleIds.has(text.ownerId)
    if (text.kind === 'cluster-caption') return visibleIds.has(layout.clusters.find(cluster => cluster.id === text.ownerId)?.parentId ?? '')
    return layout.unlinkedBands.find(band => band.id === text.ownerId)?.memberIds.some(id => visibleIds.has(id)) ?? false
  }).sort((a, b) => SPATIAL_TEXT_TIER[a.kind] - SPATIAL_TEXT_TIER[b.kind] || a.key.localeCompare(b.key))
  const shown = new Set<string>()
  const drawn: GraphBounds[] = []
  const yielding: Array<{ key: string; box: GraphBounds }> = []
  for (const text of visible) {
    const box = { minX: text.x - text.leftPx * scale, maxX: text.x + text.rightPx * scale, minY: text.y + text.topPx * scale, maxY: text.y + text.bottomPx * scale }
    const always = text.kind === 'atlas' || text.kind === 'hub-name'
    // A band's caption belongs to the agents it describes; only other circles are in its way.
    const own = new Set([text.ownerId, ...(text.kind === 'band' ? layout.unlinkedBands.find(band => band.id === text.ownerId)?.memberIds ?? [] : [])])
    if (!always && (drawn.some(other => overlaps(other, box)) || circles.some(other => !own.has(other.ownerId) && overlaps(other.box, box)))) continue
    shown.add(text.key)
    drawn.push(box)
    if (text.kind === 'hub-subtext' || text.kind === 'cluster-caption') yielding.push({ key: text.key, box })
  }
  // Node labels already keep clear of every node; here they also keep clear of Atlas, hubs, run counts and the texts drawn.
  const obstacles = [circle(layout.atlas.x, layout.atlas.y, layout.atlas.r + 6 * scale)]
  for (const hub of layout.hubs) if (visibleIds.has(hub.nodeId)) obstacles.push(circle(hub.x, hub.y, hub.r + 6 * scale))
  for (const cluster of layout.clusters) if (visibleIds.has(cluster.parentId)) obstacles.push(circle(cluster.x, cluster.y, cluster.r + 4 * scale))
  return { shown, yielding, obstacles: [...obstacles, ...drawn] }
}
