/**
 * The spatial view's typography (Phase 18 T2b, refined in T2c): the words the
 * page supplies, the sizes every spatial text is drawn at, how wide a text is
 * taken to be, and where a level's own names and counts sit.
 *
 * Texts are drawn at screen size under world points, so how much room they take
 * depends on the camera. Two things build on this module:
 *  - a fit keeps the level's own names and counts on the canvas
 *    (`spatialScreenTexts` feeds `boundsWithScreenText`);
 *  - `planSpatialLabels` (spatial-labels.ts) decides, deterministically, which
 *    texts are drawn and where, and hides a text rather than let it overlap.
 */

import type { IntelligenceGraphNode } from '@/lib/intelligence/graph-contract'
import type { GraphScreenText } from './graph-readability'
import type { SpatialHub, SpatialLayout, SpatialRunCluster, SpatialUnlinkedBand } from './spatial-layout'

/** Every word the spatial canvas shows, supplied by the page in its language. */
export interface SpatialCopy {
  atlasLabel: string
  /** A short line under Atlas's name — what Atlas is, never what it is doing. */
  atlasSubtitle: string
  atlasDescription: string
  /** The number in a run cluster ("29", or "+16" for older runs in a workflow view). */
  clusterCount: (cluster: SpatialRunCluster) => string
  /** The word under it ("körningar", "äldre", "utan workflow"). */
  clusterCaption: (cluster: SpatialRunCluster) => string
  /** Two lines: "8 agenter" / "som inget workflow nämner". */
  unlinkedAgents: (count: number) => readonly [string, string]
  hubDescription: (hub: SpatialHub) => string
  clusterDescription: (cluster: SpatialRunCluster, parentLabel: string) => string
  /** The stored status in words ("misslyckades"), or null when a node carries none. */
  statusWord: (node: IntelligenceGraphNode) => string | null
}

// ─── Typography (screen px) ─────────────────────────────────────────────────

export const SPATIAL_TYPE = {
  atlasName: { size: 17, weight: 650 },
  atlasSubtitle: { size: 11, weight: 500 },
  hubName: { active: 15, calm: 14, focus: 17, receded: 12, weight: 650 },
  hubSubtext: { size: 11.5, weight: 500 },
  workflow: { size: 12.5, weight: 600 },
  agent: { size: 11.5, weight: 500 },
  run: { size: 11.5, weight: 500 },
  satellite: { size: 11, weight: 500 },
  status: { size: 10.5, weight: 600 },
  band: { size: 11, weight: 500 },
  caption: { size: 10, weight: 500 },
} as const

/** Below this canvas width every spatial text is set a step smaller. */
export const SPATIAL_NARROW_CANVAS = 520
export const SPATIAL_NARROW_TYPE_SCALE = 0.88

export const TEXT_LINE_HEIGHT = 1.24
export const TEXT_ASCENT = 0.8
export const TEXT_DESCENT = 0.26

/** Gaps, in px, between a circle and the text under it. */
export const TEXT_GAP = { hub: 8, atlas: 10, cluster: 4, subtext: 3, node: 5 } as const

export function spatialTypeScale(viewportWidth: number): number {
  return viewportWidth < SPATIAL_NARROW_CANVAS ? SPATIAL_NARROW_TYPE_SCALE : 1
}

/** How far out a selection or focus ring sits from a circle, in world units; labels always leave it room. */
export function selectionRingOffset(radius: number): number {
  return Math.max(6, radius * 0.18)
}

/** A run count is drawn at least this many px in radius, so its number stays legible. */
export const CLUSTER_MIN_RADIUS_PX = 9.5

/** The radius a run count is drawn at: its layout radius, raised to a legible minimum, never past 1.2× — the room its rings leave it. */
export function clusterDrawRadius(radius: number, scale: number): number {
  return Math.min(radius * 1.2, Math.max(radius, CLUSTER_MIN_RADIUS_PX * scale))
}

/**
 * Advance widths, in em, of Inter — the app's font — at weight 500 with the
 * labels' letter-spacing, grouped and rounded up (measured in Chrome from the
 * font this app builds). A glyph not listed is taken to be wide.
 */
const GLYPH_WIDTHS: ReadonlyArray<readonly [string, number]> = [
  ['ijl ', 0.28],
  ['I', 0.29],
  ['.,:;·!\'`|', 0.36],
  ['t/()[]f', 0.39],
  ['r1', 0.43],
  ['{}-', 0.47],
  ['^"–_', 0.51],
  ['*?', 0.54],
  ['sxzkLaåä7JcvyeéF', 0.6],
  ['nhuü5Eoö2bdpqg3869', 0.64],
  ['#ZP0$SRT&4B', 0.67],
  ['+<=>~', 0.68],
  ['KYXAVÅÄ', 0.72],
  ['DCUHGNOÖQ', 0.78],
  ['w', 0.84],
  ['mM…', 0.92],
  ['@%—W', 1.01],
]
const GLYPH_EM = new Map(GLYPH_WIDTHS.flatMap(([glyphs, em]) => [...glyphs].map(glyph => [glyph, em] as const)))
const UNLISTED_GLYPH_EM = 0.8
/** How much wider Inter sets at a weight, measured: 650 is up to 8.6 % wider than 500, 700 up to 11.5 %. */
const weightFactor = (weight: number) => (weight >= 700 ? 1.12 : weight >= 600 ? 1.09 : 1)

/**
 * A generous width, in px, for a line of text: each glyph's measured advance,
 * heavier weights wider, what small sizes add by rounding each glyph's position,
 * plus the halo on both sides. It errs wide, so a text that fits by this
 * measure fits on screen.
 */
export function textWidthPx(text: string, size: number, weight: number): number {
  let em = 0
  let glyphs = 0
  for (const glyph of text) {
    em += GLYPH_EM.get(glyph) ?? UNLISTED_GLYPH_EM
    glyphs++
  }
  return em * size * weightFactor(weight) + glyphs * 0.1 + 5
}

/** Height, in px, of a block of `lines` lines at `size`. */
export function textBlockHeightPx(lines: number, size: number): number {
  return (Math.max(1, lines) - 1) * size * TEXT_LINE_HEIGHT + size * (TEXT_ASCENT + TEXT_DESCENT)
}

export function hubNameSize(hub: Pick<SpatialHub, 'orbit'>): number {
  return SPATIAL_TYPE.hubName[hub.orbit]
}

/** Two lines for a name that can break at a hyphen or a space near its middle; null when it cannot. */
export function wrapName(name: string): readonly [string, string] | null {
  const breaks: number[] = []
  for (let index = 1; index < name.length - 1; index++) {
    if (name[index] === ' ' || name[index] === '-') breaks.push(index)
  }
  if (breaks.length === 0) return null
  const middle = name.length / 2
  const at = breaks.reduce((best, index) => (Math.abs(index - middle) < Math.abs(best - middle) ? index : best), breaks[0])
  const first = name[at] === '-' ? name.slice(0, at + 1) : name.slice(0, at)
  const second = name.slice(at + 1)
  return first.trim() && second.trim() ? [first.trim(), second.trim()] : null
}

// ─── The level's own texts, for a fit ───────────────────────────────────────

export type SpatialTextKind = 'atlas' | 'atlas-subtitle' | 'hub-name' | 'hub-subtext' | 'band' | 'cluster-caption'

export interface SpatialText extends GraphScreenText {
  kind: SpatialTextKind
  /** The hub, cluster or band the text belongs to. */
  ownerId: string
  key: string
}

export type BandAnchor = 'start' | 'middle' | 'end'

/** A band's caption reads away from the project it describes: outward on the sides, centred above and below. */
export function bandAnchor(band: SpatialUnlinkedBand): BandAnchor {
  const horizontal = Math.cos(band.angle)
  return horizontal < -0.55 ? 'end' : horizontal > 0.55 ? 'start' : 'middle'
}

/**
 * The level's own names and counts, at their widest (one line each) — what a
 * fit must keep on the canvas. Positions match `planSpatialLabels`.
 */
export function spatialScreenTexts(layout: SpatialLayout, copy: SpatialCopy, options: { narrow?: boolean } = {}): SpatialText[] {
  const texts: SpatialText[] = []
  const add = (kind: SpatialTextKind, ownerId: string, x: number, y: number, width: number, topPx: number, bottomPx: number, anchor: BandAnchor = 'middle') => texts.push({
    kind, ownerId, key: `${kind}:${ownerId}`, x, y, topPx, bottomPx,
    leftPx: anchor === 'start' ? 3 : anchor === 'end' ? width : width / 2,
    rightPx: anchor === 'end' ? 3 : anchor === 'start' ? width : width / 2,
  })
  const { atlasName, atlasSubtitle, hubSubtext, band: bandType, caption } = SPATIAL_TYPE
  // A narrow canvas frames names only — counts and subtitles give way there first — and names as they wrap.
  const narrow = options.narrow ?? false
  const scaleType = narrow ? SPATIAL_NARROW_TYPE_SCALE : 1
  if (!layout.atlas.receded) {
    const nameHeight = textBlockHeightPx(1, atlasName.size * scaleType)
    add('atlas', 'atlas', layout.atlas.x, layout.atlas.y + layout.atlas.r, textWidthPx(copy.atlasLabel, atlasName.size * scaleType, atlasName.weight), TEXT_GAP.atlas, TEXT_GAP.atlas + nameHeight)
    if (!narrow) {
      const subtitleTop = TEXT_GAP.atlas + nameHeight + TEXT_GAP.subtext
      add('atlas-subtitle', 'atlas', layout.atlas.x, layout.atlas.y + layout.atlas.r, textWidthPx(copy.atlasSubtitle, atlasSubtitle.size, atlasSubtitle.weight), subtitleTop, subtitleTop + textBlockHeightPx(1, atlasSubtitle.size))
    }
  }
  for (const hub of layout.hubs) {
    if (hub.orbit === 'receded') continue
    const size = hubNameSize(hub) * scaleType
    const wrapped = narrow ? wrapName(hub.label) : null
    const lines = wrapped ?? [hub.label]
    const nameHeight = textBlockHeightPx(lines.length, size)
    add('hub-name', hub.nodeId, hub.x, hub.y + hub.r, Math.max(...lines.map(line => textWidthPx(line, size, SPATIAL_TYPE.hubName.weight))), TEXT_GAP.hub, TEXT_GAP.hub + nameHeight)
    if (narrow) continue
    const subtextTop = TEXT_GAP.hub + nameHeight + TEXT_GAP.subtext
    add('hub-subtext', hub.nodeId, hub.x, hub.y + hub.r, textWidthPx(hub.subtext, hubSubtext.size, hubSubtext.weight), subtextTop, subtextTop + textBlockHeightPx(1, hubSubtext.size))
  }
  for (const band of layout.unlinkedBands) {
    const lines = copy.unlinkedAgents(band.count)
    const width = Math.max(...lines.map(line => textWidthPx(line, bandType.size, bandType.weight)))
    const height = textBlockHeightPx(2, bandType.size)
    add('band', band.id, band.x, band.y, width, -height / 2, height / 2, bandAnchor(band))
  }
  for (const cluster of layout.clusters) {
    add('cluster-caption', cluster.id, cluster.x, cluster.y + cluster.r, textWidthPx(copy.clusterCaption(cluster), caption.size, caption.weight), TEXT_GAP.cluster, TEXT_GAP.cluster + textBlockHeightPx(1, caption.size))
  }
  return texts
}
