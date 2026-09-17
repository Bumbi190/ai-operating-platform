/**
 * Which texts the spatial view draws, and where (Phase 18 T2c).
 *
 * One deterministic plan for every text the view shows: Atlas's name, hub names
 * and counts, node labels, band and run-count captions. Texts are placed in a
 * fixed order of importance, and a text that finds no free place is left out —
 * it never overlaps:
 *
 *   0  the selected node, then the search result
 *   1  Atlas's name; hub names
 *   2  nodes whose stored status needs attention (failed, waiting, pending approval)
 *   3  the hovered or keyboard-focused node; running runs; what the selection touches;
 *      then a drilled project's counts, which keep to their name while node labels have many places
 *   4  workflows
 *   5  band captions; portfolio hub counts; Atlas's subtitle
 *   6  agents (see AGENT_NAMES_AT_OVERVIEW); runs on a workflow's time arc; satellites
 *   7  run-count captions
 *
 * "Free" means inside the canvas less its edge, clear of every band the page
 * covers (controls, the mobile sheet, the floating corner), clear of every
 * visible circle that is not the text's own, and clear of every text placed
 * before it. A hub's name and counts are placed outside the hub, so they must
 * also keep clear of the hub itself; only its monogram, drawn by the hub's glyph,
 * sits inside it. Lines are not obstacles: text has a halo.
 *
 * What is left out is still said elsewhere: every node's accessible name and
 * title carry its label and status, a hub's carry its counts, a run count's
 * title its distribution, and the inspector shows all of it.
 */

import type { IntelligenceGraphNode } from '@/lib/intelligence/graph-contract'
import type { GraphBounds, GraphViewBox } from './graph-readability'
import { getStatusVisual } from './graph-visuals'
import { PORTFOLIO_REVEAL, PROJECT_REVEAL, type SpatialLayout } from './spatial-layout'
import {
  SPATIAL_TYPE,
  TEXT_ASCENT,
  TEXT_GAP,
  TEXT_LINE_HEIGHT,
  bandAnchor,
  clusterDrawRadius,
  selectionRingOffset,
  hubNameSize,
  spatialTypeScale,
  textBlockHeightPx,
  textWidthPx,
  wrapName,
  type BandAnchor,
  type SpatialCopy,
} from './spatial-text'

/** A project with this many agents or fewer names them from its first view; a bigger one names them as you zoom in. */
export const AGENT_NAMES_AT_OVERVIEW = 8
/** Longest single label line, in characters, before it wraps. */
export const LABEL_LINE_MAX = 30

export type SpatialLabelKind = 'node' | 'atlas' | 'atlas-subtitle' | 'hub-name' | 'hub-subtext' | 'band' | 'cluster-caption'
export type SpatialLabelTone = 'strong' | 'normal' | 'muted'

export interface SpatialLabelContext {
  layout: SpatialLayout
  nodeById: ReadonlyMap<string, IntelligenceGraphNode>
  /** Nodes drawn at all (structural visibility, filters and isolation applied). */
  visibleIds: ReadonlySet<string>
  copy: SpatialCopy
  view: GraphViewBox
  viewport: { width: number; height: number }
  /** World-space bands the page covers: controls, the mobile sheet, the floating corner. */
  reserved?: readonly GraphBounds[]
  depth: number
  selectedId?: string | null
  hoverId?: string | null
  focusId?: string | null
  searchResultId?: string | null
  /** What the selection touches. */
  neighborIds?: ReadonlySet<string>
}

export interface SpatialLabelPlacement {
  key: string
  kind: SpatialLabelKind
  ownerId: string
  tier: number
  lines: readonly string[]
  /** Text anchor x and the first line's baseline, in world units. */
  x: number
  y: number
  anchor: BandAnchor
  fontSize: number
  lineHeight: number
  weight: number
  tone: SpatialLabelTone
  status?: { text: string; color: string; fontSize: number }
  box: GraphBounds
  /** The width the plan took the text block to be, in screen px. */
  widthPx: number
  leader?: { x1: number; y1: number; x2: number; y2: number }
}

export interface SpatialLabelPlan {
  placements: SpatialLabelPlacement[]
  /** Keys of texts left out for want of a free place, in the order they were tried. */
  hidden: string[]
}

interface Option {
  x: number
  /** Top of the text block, world units. */
  top: number
  anchor: BandAnchor
  leaderFrom?: { x: number; y: number }
}

interface Candidate {
  key: string
  kind: SpatialLabelKind
  ownerId: string
  tier: number
  rank: number
  order: string
  variants: ReadonlyArray<readonly string[]>
  size: number
  weight: number
  tone: SpatialLabelTone
  status?: { text: string; color: string }
  /** Circles this text may touch: its own. */
  exempt: ReadonlySet<string>
  /** Places to try, in order. `above` is the placed text this one belongs under, when it has one. */
  options: (blockHeight: number, above?: SpatialLabelPlacement) => Option[]
  /** A text that only makes sense under another (a hub's counts under its name); left out without it. */
  after?: string
  /** Try every variant in a place before the next place (a hub's name keeps to its hub, wrapped if it must). */
  placeFirst?: boolean
}

interface Circle { ownerId: string; x: number; y: number; r: number }

const KIND_ORDER: Record<string, number> = { project: 0, workflow: 1, agent: 2, run: 3, approval: 4, output: 5, task: 6 }

export function planSpatialLabels(context: SpatialLabelContext): SpatialLabelPlan {
  const { view, viewport } = context
  const scale = view.w / Math.max(1, viewport.width)
  const typeScale = spatialTypeScale(viewport.width)
  const px = (value: number) => value * scale
  const edge = px(8)
  const canvas: GraphBounds = { minX: view.x + edge, minY: view.y + edge, maxX: view.x + view.w - edge, maxY: view.y + view.h - edge }
  const reserved = context.reserved ?? []
  const circles = obstacleCircles(context, scale)
  const placements: SpatialLabelPlacement[] = []
  const hidden: string[] = []
  const placedByKey = new Map<string, SpatialLabelPlacement>()

  const candidates = spatialLabelCandidates(context, scale, typeScale)
    .sort((a, b) => a.tier - b.tier || a.rank - b.rank || a.order.localeCompare(b.order, 'sv') || a.key.localeCompare(b.key))

  for (const candidate of candidates) {
    const above = candidate.after ? placedByKey.get(candidate.after) : undefined
    if (candidate.after && !above) {
      hidden.push(candidate.key)
      continue
    }
    const size = px(candidate.size * typeScale)
    const statusSize = px(SPATIAL_TYPE.status.size * typeScale)
    let placement: SpatialLabelPlacement | null = null
    const shapes = candidate.variants.map(lines => {
      const width = px(Math.max(...lines.map(line => textWidthPx(line, candidate.size * typeScale, candidate.weight))))
      const statusWidth = candidate.status ? px(textWidthPx(candidate.status.text, SPATIAL_TYPE.status.size * typeScale, SPATIAL_TYPE.status.weight)) : 0
      const blockHeight = px(textBlockHeightPx(lines.length, candidate.size * typeScale))
        + (candidate.status ? statusSize * TEXT_LINE_HEIGHT : 0)
      return { lines, blockWidth: Math.max(width, statusWidth), blockHeight, options: candidate.options(blockHeight, above) }
    })
    // Each variant in each place — or, for a text whose place matters more than its line breaks, every variant
    // in one place before the next: centred under or over its owner the full line first, beside it the narrowest.
    const attempts = candidate.placeFirst
      ? Array.from({ length: Math.max(0, ...shapes.map(shape => shape.options.length)) }, (_, index) => {
        const here = shapes.flatMap(shape => shape.options[index] ? [{ ...shape, option: shape.options[index] }] : [])
        return here[0]?.option.anchor === 'middle' ? here : [...here].sort((a, b) => a.blockWidth - b.blockWidth)
      }).flat()
      : shapes.flatMap(shape => shape.options.map(option => ({ ...shape, option })))
    for (const { lines, blockWidth, blockHeight, option } of attempts) {
      const box = blockBox(option, blockWidth, blockHeight)
      if (!inside(canvas, box)) continue
      if (reserved.some(band => intersects(band, box))) continue
      if (placements.some(other => intersects(grow(other.box, px(2)), box))) continue
      if (circles.some(circle => !candidate.exempt.has(circle.ownerId) && circleHitsBox(circle, box))) continue
      placement = {
        key: candidate.key,
        kind: candidate.kind,
        ownerId: candidate.ownerId,
        tier: candidate.tier,
        lines,
        x: option.x,
        y: option.top + size * TEXT_ASCENT,
        anchor: option.anchor,
        fontSize: size,
        lineHeight: size * TEXT_LINE_HEIGHT,
        weight: candidate.weight,
        tone: candidate.tone,
        status: candidate.status ? { ...candidate.status, fontSize: statusSize } : undefined,
        box,
        widthPx: blockWidth / scale,
        leader: option.leaderFrom ? leaderLine(option.leaderFrom, box) : undefined,
      }
      break
    }
    if (placement) {
      placements.push(placement)
      placedByKey.set(candidate.key, placement)
    } else {
      hidden.push(candidate.key)
    }
  }
  return { placements, hidden }
}

/** Every text the view could draw now, before any is placed. Exported for tests. */
export function spatialLabelCandidates(context: SpatialLabelContext, scale: number, typeScale = 1): Candidate[] {
  const { layout, nodeById, visibleIds, copy, depth } = context
  const px = (value: number) => value * scale
  const candidates = new Map<string, Candidate>()
  const add = (candidate: Candidate) => {
    const existing = candidates.get(candidate.key)
    if (!existing || candidate.tier < existing.tier || (candidate.tier === existing.tier && candidate.rank < existing.rank)) {
      candidates.set(candidate.key, candidate)
    }
  }

  // ── Atlas ──
  if (!layout.atlas.receded) {
    const { atlasName, atlasSubtitle } = SPATIAL_TYPE
    const nameTop = layout.atlas.y + layout.atlas.r + px(TEXT_GAP.atlas)
    add({
      key: 'atlas:atlas', kind: 'atlas', ownerId: 'atlas', tier: 1, rank: 0, order: 'atlas',
      variants: [[copy.atlasLabel]], size: atlasName.size, weight: atlasName.weight, tone: 'strong', exempt: new Set(['atlas']),
      options: () => [{ x: layout.atlas.x, top: nameTop, anchor: 'middle' }],
    })
    add({
      key: 'atlas-subtitle:atlas', kind: 'atlas-subtitle', ownerId: 'atlas', tier: 5, rank: 2, order: 'atlas',
      variants: [[copy.atlasSubtitle]], size: atlasSubtitle.size, weight: atlasSubtitle.weight, tone: 'muted', exempt: new Set(['atlas']),
      after: 'atlas:atlas',
      options: (_height, name) => name ? [{ x: layout.atlas.x, top: name.box.maxY + px(TEXT_GAP.subtext), anchor: 'middle' }] : [],
    })
  }

  // ── Hubs: name, then counts with it ──
  for (const hub of layout.hubs) {
    if (hub.orbit === 'receded' || !visibleIds.has(hub.nodeId)) continue
    const size = hubNameSize(hub)
    // Clear of the hub's selection ring whether or not it is selected, so a selection never moves its name.
    const nameTop = hub.y + hub.r + Math.max(px(TEXT_GAP.hub), selectionRingOffset(hub.r) + px(3))
    const wrapped = wrapName(hub.label)
    const ring = Math.max(px(TEXT_GAP.hub), selectionRingOffset(hub.r) + px(3))
    add({
      key: `hub-name:${hub.nodeId}`, kind: 'hub-name', ownerId: hub.nodeId, tier: 1, rank: hub.orbit === 'focus' ? 0 : 1, order: hub.label,
      variants: wrapped ? [[hub.label], wrapped] : [[hub.label]], size, weight: SPATIAL_TYPE.hubName.weight, tone: 'strong',
      // Outside the hub, like every place below: the hub is an obstacle to its own name.
      exempt: new Set(), placeFirst: true,
      // Under the hub; where another name or circle is there, above it, beside it, then off its lower corners.
      options: height => [
        { x: hub.x, top: nameTop, anchor: 'middle' },
        { x: hub.x, top: hub.y - hub.r - ring - height, anchor: 'middle' },
        { x: hub.x + hub.r + ring, top: hub.y - height / 2, anchor: 'start' },
        { x: hub.x - hub.r - ring, top: hub.y - height / 2, anchor: 'end' },
        { x: hub.x + (hub.r + ring) * 0.72, top: hub.y + (hub.r + ring) * 0.72, anchor: 'start' },
        { x: hub.x - (hub.r + ring) * 0.72, top: hub.y + (hub.r + ring) * 0.72, anchor: 'end' },
        { x: hub.x + (hub.r + ring) * 0.72, top: hub.y - (hub.r + ring) * 0.72 - height, anchor: 'start' },
        { x: hub.x - (hub.r + ring) * 0.72, top: hub.y - (hub.r + ring) * 0.72 - height, anchor: 'end' },
      ],
    })
    add({
      key: `hub-subtext:${hub.nodeId}`, kind: 'hub-subtext', ownerId: hub.nodeId,
      tier: hub.orbit === 'focus' ? 3 : 5, rank: hub.orbit === 'focus' ? 9 : 1, order: hub.label,
      variants: [[hub.subtext]], size: SPATIAL_TYPE.hubSubtext.size, weight: SPATIAL_TYPE.hubSubtext.weight, tone: 'muted',
      // Never across the hub: its counts are not exempt from it. Without a free place they are left out,
      // the name stays, and the counts remain in the hub's accessible name and the inspector.
      exempt: new Set(), after: `hub-name:${hub.nodeId}`,
      // With the name as it was placed, on its side away from the hub: under a name below the hub's centre,
      // over a name above it, and either side of a name beside the hub. Never between the hub and its name.
      options: (height, name) => {
        if (!name) return []
        const under: Option = { x: name.x, top: name.box.maxY + px(TEXT_GAP.subtext), anchor: name.anchor }
        const over: Option = { x: name.x, top: name.box.minY - px(TEXT_GAP.subtext) - height, anchor: name.anchor }
        if (name.box.minY >= hub.y) return [under]
        if (name.box.maxY <= hub.y) return [over]
        return [under, over]
      },
    })
  }

  // ── Bands and run counts ──
  for (const band of layout.unlinkedBands) {
    if (!band.memberIds.some(id => visibleIds.has(id))) continue
    const lines = copy.unlinkedAgents(band.count)
    add({
      key: `band:${band.id}`, kind: 'band', ownerId: band.id, tier: 5, rank: 0, order: band.id,
      variants: [lines], size: SPATIAL_TYPE.band.size, weight: SPATIAL_TYPE.band.weight, tone: 'muted', exempt: new Set([band.id]),
      options: height => [{ x: band.x, top: band.y - height / 2, anchor: bandAnchor(band) }],
    })
  }
  for (const cluster of layout.clusters) {
    if (!visibleIds.has(cluster.parentId)) continue
    const drawn = clusterDrawRadius(cluster.r, scale)
    const gap = px(TEXT_GAP.cluster)
    add({
      key: `cluster-caption:${cluster.id}`, kind: 'cluster-caption', ownerId: cluster.id, tier: 7, rank: 0, order: cluster.id,
      variants: [[copy.clusterCaption(cluster)]], size: SPATIAL_TYPE.caption.size, weight: SPATIAL_TYPE.caption.weight, tone: 'muted',
      exempt: new Set([cluster.id]),
      // Under the count; when its workflow or a name is there, above it, then beside it.
      options: height => [
        { x: cluster.x, top: cluster.y + drawn + gap, anchor: 'middle' },
        { x: cluster.x, top: cluster.y - drawn - gap - height, anchor: 'middle' },
        { x: cluster.x + drawn + gap, top: cluster.y - height / 2, anchor: 'start' },
        { x: cluster.x - drawn - gap, top: cluster.y - height / 2, anchor: 'end' },
      ],
    })
  }

  // ── Node labels ──
  const hubNamed = new Set(layout.hubs.filter(hub => hub.orbit !== 'receded').map(hub => hub.nodeId))
  // A named hub's selection is the view itself (or its inspector): it does not name everything it contains.
  const selectionNamesNeighbours = Boolean(context.selectedId) && !hubNamed.has(context.selectedId ?? '')
  const agentsInProject = new Map<string, number>()
  for (const id of visibleIds) {
    const node = nodeById.get(id)
    if (node?.kind === 'agent' && node.projectId) agentsInProject.set(node.projectId, (agentsInProject.get(node.projectId) ?? 0) + 1)
  }
  for (const id of [...visibleIds].sort()) {
    const node = nodeById.get(id)
    const position = layout.positions.get(id)
    const role = layout.roles.get(id)
    if (!node || !position || !role || hubNamed.has(id)) continue
    const interaction = id === context.selectedId ? 0 : id === context.searchResultId ? 1 : null
    const attention = Boolean(getStatusVisual(node)?.attention)
    const hovered = id === context.hoverId || id === context.focusId
    const running = node.kind === 'run' && node.status === 'running'
    const neighbour = selectionNamesNeighbours && Boolean(context.neighborIds?.has(id))
    let tier: number | null = null
    let rank = 0
    if (interaction !== null) { tier = 0; rank = interaction }
    else if (role === 'context') tier = null
    else if (attention) tier = 2
    else if (hovered) tier = 3
    else if (running) { tier = 3; rank = 1 }
    else if (neighbour) { tier = 3; rank = 2 }
    else if (node.kind === 'workflow') tier = 4
    else if (node.kind === 'agent') tier = agentNamed(layout.level, depth, agentsInProject.get(node.projectId ?? '') ?? 0) ? 6 : null
    else if (node.kind === 'run' || role === 'satellite') tier = 6
    if (tier === null) continue
    const kindSize = node.kind === 'workflow' ? SPATIAL_TYPE.workflow
      : node.kind === 'agent' ? SPATIAL_TYPE.agent
        : node.kind === 'run' ? SPATIAL_TYPE.run
          : role === 'context' ? { size: SPATIAL_TYPE.hubName.receded, weight: SPATIAL_TYPE.hubName.weight }
            : SPATIAL_TYPE.satellite
    const statusText = attention || running ? copy.statusWord(node) : null
    const centre = labelCentre(layout, node)
    add({
      key: `node:${id}`, kind: 'node', ownerId: id, tier, rank, order: `${KIND_ORDER[node.kind] ?? 9}:${node.label}`,
      variants: nodeLabelVariants(node), size: kindSize.size, weight: interaction !== null ? Math.max(kindSize.weight, 600) : kindSize.weight,
      tone: interaction !== null || hovered ? 'strong' : node.kind === 'agent' || role === 'satellite' ? 'muted' : 'normal',
      status: statusText ? { text: statusText, color: getStatusVisual(node)?.stroke ?? 'currentColor' } : undefined,
      exempt: new Set([id]),
      // What was asked for, or needs attention, may also sit further off, on a leader, in any direction.
      options: height => nodeOptions(position, centre, height, scale, tier <= 2),
    })
  }
  return [...candidates.values()]
}

/** Whether a level names its agents without anyone asking. */
export function agentNamed(level: SpatialLayout['level'], depth: number, agentsInProject: number): boolean {
  if (level === 'workflow') return true
  if (level === 'project') return agentsInProject <= AGENT_NAMES_AT_OVERVIEW || depth >= PROJECT_REVEAL.agentLabels
  return depth >= PORTFOLIO_REVEAL.satellites
}

/** A label's full text, then two lines, then its first part — never a word the node does not carry. */
export function nodeLabelVariants(node: IntelligenceGraphNode): ReadonlyArray<readonly string[]> {
  const label = node.label.replace(/\s*[·_-]\s*[a-f\d]{6,}$/i, '').trim() || node.label.trim()
  const variants: Array<readonly string[]> = []
  if (label.length <= LABEL_LINE_MAX) variants.push([label])
  const wrapped = wrapLine(label)
  if (wrapped) variants.push(wrapped)
  const head = label.split(' · ')[0].trim()
  if (head && head !== label) {
    if (head.length <= LABEL_LINE_MAX) variants.push([head])
    else {
      const headWrapped = wrapLine(head)
      if (headWrapped) variants.push(headWrapped)
    }
  }
  if (variants.length === 0) variants.push([`${label.slice(0, LABEL_LINE_MAX - 1).trimEnd()}…`])
  return variants
}

function wrapLine(text: string): readonly [string, string] | null {
  if (text.length <= 12) return null
  const middle = text.length / 2
  let at = -1
  for (let index = 1; index < text.length - 1; index++) {
    if (text[index] !== ' ') continue
    if (at < 0 || Math.abs(index - middle) < Math.abs(at - middle)) at = index
  }
  if (at < 0) return null
  const first = text.slice(0, at).trim()
  const second = text.slice(at + 1).trim()
  if (first.length > LABEL_LINE_MAX || second.length > LABEL_LINE_MAX) return null
  return [first, second]
}

/** The point a node's label reads away from: its hub on the portfolio, the level's centre elsewhere. */
function labelCentre(layout: SpatialLayout, node: IntelligenceGraphNode) {
  if (layout.level === 'portfolio' && node.projectId) {
    const hub = layout.hubs.find(entry => entry.projectId === node.projectId)
    if (hub) return { x: hub.x, y: hub.y }
  }
  return { x: 0, y: 0 }
}

/**
 * Places for a node's label, in order: away from the centre, then below, above,
 * to the sides, then the diagonals and further out with a leader line.
 */
function nodeOptions(
  position: { x: number; y: number; r: number },
  centre: { x: number; y: number },
  height: number,
  scale: number,
  reachOut = false,
): Option[] {
  // Clear of the node's selection ring whether or not it is selected, so a selection never moves its label.
  const gap = Math.max(TEXT_GAP.node * scale, selectionRingOffset(position.r) + 2 * scale)
  const dx = position.x - centre.x
  const dy = position.y - centre.y
  const length = Math.hypot(dx, dy)
  const ux = length > 1e-6 ? dx / length : 0
  const uy = length > 1e-6 ? dy / length : 1
  const below: Option = { x: position.x, top: position.y + position.r + gap, anchor: 'middle' }
  const above: Option = { x: position.x, top: position.y - position.r - gap - height, anchor: 'middle' }
  const right: Option = { x: position.x + position.r + gap, top: position.y - height / 2, anchor: 'start' }
  const left: Option = { x: position.x - position.r - gap, top: position.y - height / 2, anchor: 'end' }
  const outward = length < 1e-6 ? below
    : Math.abs(ux) > 0.55 ? (ux > 0 ? right : left)
      : uy > 0 ? below : above
  const reach = position.r + gap + 7 * scale
  const diagonal = (sx: number, sy: number): Option => ({
    x: position.x + sx * reach * 0.72,
    top: sy < 0 ? position.y - reach * 0.72 - height : position.y + reach * 0.72,
    anchor: sx > 0 ? 'start' : 'end',
    leaderFrom: { x: position.x + sx * position.r * 0.72, y: position.y + sy * position.r * 0.72 },
  })
  const far = position.r + 30 * scale
  const farOut: Option = {
    x: position.x + ux * far,
    top: position.y + uy * far - height / 2,
    anchor: Math.abs(ux) < 0.3 ? 'middle' : ux > 0 ? 'start' : 'end',
    leaderFrom: { x: position.x + ux * position.r, y: position.y + uy * position.r },
  }
  const outwardDiagonals = [diagonal(ux >= 0 ? 1 : -1, uy >= 0 ? 1 : -1), diagonal(ux >= 0 ? 1 : -1, uy >= 0 ? -1 : 1), diagonal(ux >= 0 ? -1 : 1, uy >= 0 ? 1 : -1), diagonal(ux >= 0 ? -1 : 1, uy >= 0 ? -1 : 1)]
  const around = reachOut
    ? [[0, 1], [0, -1], [1, 0], [-1, 0], [0.72, 0.72], [-0.72, 0.72], [0.72, -0.72], [-0.72, -0.72]].map(([sx, sy]): Option => ({
      x: position.x + sx * far,
      top: position.y + sy * far - (sy === 0 ? height / 2 : sy > 0 ? 0 : height),
      anchor: sx === 0 ? 'middle' : sx > 0 ? 'start' : 'end',
      leaderFrom: { x: position.x + sx * position.r, y: position.y + sy * position.r },
    }))
    : []
  const ordered = [outward, below, above, ux >= 0 ? right : left, ux >= 0 ? left : right, ...outwardDiagonals, farOut, ...around]
  const seen = new Set<string>()
  return ordered.filter(option => {
    const key = `${option.x.toFixed(3)}:${option.top.toFixed(3)}:${option.anchor}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function obstacleCircles(context: SpatialLabelContext, scale: number): Circle[] {
  const { layout, visibleIds } = context
  const circles: Circle[] = [{ ownerId: 'atlas', x: layout.atlas.x, y: layout.atlas.y, r: layout.atlas.r + 4 * scale }]
  for (const [id, position] of layout.positions) {
    if (!visibleIds.has(id)) continue
    circles.push({ ownerId: id, x: position.x, y: position.y, r: position.r + 2 * scale })
  }
  for (const cluster of layout.clusters) {
    if (!visibleIds.has(cluster.parentId)) continue
    circles.push({ ownerId: cluster.id, x: cluster.x, y: cluster.y, r: clusterDrawRadius(cluster.r, scale) + 4 * scale })
  }
  // A band's caption keeps clear of its own agents too; its owner is the band, not them.
  return circles
}

function blockBox(option: Option, width: number, height: number): GraphBounds {
  const minX = option.anchor === 'middle' ? option.x - width / 2 : option.anchor === 'end' ? option.x - width : option.x
  return { minX, minY: option.top, maxX: minX + width, maxY: option.top + height }
}

function leaderLine(from: { x: number; y: number }, box: GraphBounds) {
  const x2 = Math.min(Math.max(from.x, box.minX), box.maxX)
  const y2 = Math.min(Math.max(from.y, box.minY), box.maxY)
  return { x1: from.x, y1: from.y, x2, y2 }
}

function inside(outer: GraphBounds, box: GraphBounds): boolean {
  return box.minX >= outer.minX && box.maxX <= outer.maxX && box.minY >= outer.minY && box.maxY <= outer.maxY
}

export function intersects(a: GraphBounds, b: GraphBounds): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY
}

function grow(box: GraphBounds, amount: number): GraphBounds {
  return { minX: box.minX - amount, minY: box.minY - amount, maxX: box.maxX + amount, maxY: box.maxY + amount }
}

export function circleHitsBox(circle: { x: number; y: number; r: number }, box: GraphBounds): boolean {
  const nearestX = Math.min(Math.max(circle.x, box.minX), box.maxX)
  const nearestY = Math.min(Math.max(circle.y, box.minY), box.maxY)
  return Math.hypot(circle.x - nearestX, circle.y - nearestY) < circle.r
}

