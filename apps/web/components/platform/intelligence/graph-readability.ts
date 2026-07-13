import type { IntelligenceGraphEdge, IntelligenceGraphNode, NodeKind } from '@/lib/intelligence/graph-contract'
import type { PositionedNode } from './force-layout'
import {
  getStaticLabelPriority,
  getStatusVisual,
  type GraphEdgeVisual,
  type ProjectTerritory,
} from './graph-visuals'

/** Canonical Phase 2 semantic levels from book chapter 4.3. */
export type GraphZoomLevel = 'portfolio' | 'project' | 'operational' | 'detail' | 'execution'
export type GraphStructuralVisibility = 'visible' | 'dimmed' | 'hidden'
export type GraphLabelTier = 'interaction' | 'project' | 'community' | 'workflow' | 'ordinary'

export interface GraphSemanticPolicy {
  level: GraphZoomLevel
  meaning: string
  structuralDetail: 'landmarks' | 'communities' | 'operations' | 'local-detail' | 'execution-chain'
  labelDetail: 'landmarks' | 'context' | 'operational' | 'detail' | 'execution'
  edgeDetail: 'primary' | 'structural' | 'operational' | 'relations' | 'path'
  interactionDetail: 'select' | 'community' | 'operations' | 'inspect' | 'path'
  inspectorDetail: 'summary' | 'context' | 'operational' | 'full' | 'execution'
}

export interface GraphLabelPlacement {
  id: string
  priority: number
  tier: GraphLabelTier
  lines: readonly string[]
  fontSize: number
  statusFontSize: number
  fontWeight: number
  haloWidth: number
  x: number
  y: number
  lineHeight: number
  statusLineHeight: number
  textAnchor: 'start' | 'middle' | 'end'
  bounds: GraphBounds
  leaderLine?: { x1: number; y1: number; x2: number; y2: number }
}

export interface GraphTerritoryLabelPlacement {
  id: string
  text: string
  fullText: string
  x: number
  y: number
  textAnchor: 'start' | 'middle' | 'end'
  fontSize: number
  fontWeight: number
  haloWidth: number
  bounds: GraphBounds
}

export const GRAPH_LABEL_TYPOGRAPHY = {
  screenFontSize: {
    territory: 13.5,
    project: 13.5,
    community: 12.75,
    workflow: 12.5,
    ordinary: 11.5,
    interaction: 15,
  },
  statusScreenFontSize: { default: 10.5, interaction: 12 },
  fontWeight: { territory: 650, project: 650, community: 625, workflow: 600, ordinary: 500, interaction: 650 },
  haloScreenWidth: { default: 2.4, strong: 3 },
} as const

export interface GraphBounds { minX: number; minY: number; maxX: number; maxY: number }
export interface GraphViewBox { x: number; y: number; w: number; h: number }

interface LabelSelectionOptions {
  nodes: readonly IntelligenceGraphNode[]
  layout: ReadonlyMap<string, PositionedNode>
  view: GraphViewBox
  viewportWidth?: number
  viewportHeight?: number
  mode?: 'system' | 'operations'
  level?: GraphZoomLevel
  selectedId?: string | null
  hoverId?: string | null
  focusId?: string | null
  searchResultId?: string | null
  neighborIds?: ReadonlySet<string>
  structurallyVisibleIds?: ReadonlySet<string>
  reservedBoxes?: readonly GraphBounds[]
  occupiedBoxes?: readonly GraphBounds[]
}

interface TerritoryLabelSelectionOptions {
  territories: readonly ProjectTerritory[]
  layout: ReadonlyMap<string, PositionedNode>
  view: GraphViewBox
  viewportWidth?: number
  viewportHeight?: number
  reservedBoxes?: readonly GraphBounds[]
}

interface EdgeReadabilityOptions {
  edge: IntelligenceGraphEdge
  visual: GraphEdgeVisual
  zoomLevel: GraphZoomLevel
  highlighted: boolean
  attentionPath: boolean
  hasInteraction: boolean
}

interface Box { minX: number; minY: number; maxX: number; maxY: number }
interface LabelAnchor {
  x: number
  y: number
  textAnchor: 'start' | 'middle' | 'end'
  leader: boolean
}

const WORLD_WIDTH = 1200
const LOW_VALUE_RELATIONS = new Set<IntelligenceGraphEdge['relation']>([
  'TRACKS', 'PRODUCED', 'method', 'references', 'indirect_call',
])

const SEMANTIC_POLICIES: Record<GraphZoomLevel, GraphSemanticPolicy> = {
  portfolio: {
    level: 'portfolio', meaning: 'Portfolio overview', structuralDetail: 'landmarks',
    labelDetail: 'landmarks', edgeDetail: 'primary', interactionDetail: 'select', inspectorDetail: 'summary',
  },
  project: {
    level: 'project', meaning: 'Project and community overview', structuralDetail: 'communities',
    labelDetail: 'context', edgeDetail: 'structural', interactionDetail: 'community', inspectorDetail: 'context',
  },
  operational: {
    level: 'operational', meaning: 'Operational overview', structuralDetail: 'operations',
    labelDetail: 'operational', edgeDetail: 'operational', interactionDetail: 'operations', inspectorDetail: 'operational',
  },
  detail: {
    level: 'detail', meaning: 'Detailed inspection', structuralDetail: 'local-detail',
    labelDetail: 'detail', edgeDetail: 'relations', interactionDetail: 'inspect', inspectorDetail: 'full',
  },
  execution: {
    level: 'execution', meaning: 'Execution detail', structuralDetail: 'execution-chain',
    labelDetail: 'execution', edgeDetail: 'path', interactionDetail: 'path', inspectorDetail: 'execution',
  },
}

export function getSemanticZoomPolicy(level: GraphZoomLevel): GraphSemanticPolicy {
  return SEMANTIC_POLICIES[level]
}

/**
 * Numeric thresholds belong to this retained 1200-unit SVG engine. Level 4 is
 * deliberately entered by explicit detail context, not accidental extreme zoom.
 */
export function getGraphZoomLevel(viewWidth: number, executionContext = false): GraphZoomLevel {
  if (executionContext) return 'execution'
  if (viewWidth >= 1100) return 'portfolio'
  if (viewWidth >= 760) return 'project'
  if (viewWidth >= 440) return 'operational'
  return 'detail'
}

export function getNodeSemanticVisibility(
  node: IntelligenceGraphNode,
  options: {
    level: GraphZoomLevel
    mode: 'system' | 'operations'
    selectedId?: string | null
    focusId?: string | null
    searchResultId?: string | null
    neighborIds?: ReadonlySet<string>
  },
): GraphStructuralVisibility {
  const { level, mode, selectedId, focusId, searchResultId, neighborIds = new Set<string>() } = options
  if (node.id === selectedId || node.id === focusId || node.id === searchResultId || getStatusVisual(node)?.attention) return 'visible'
  if (selectedId && neighborIds.has(node.id)) return 'visible'
  if (level === 'execution') return neighborIds.has(node.id) ? 'visible' : 'hidden'
  if (level === 'detail') return selectedId && !neighborIds.has(node.id) ? 'dimmed' : 'visible'

  if (mode === 'system') {
    if (level === 'portfolio') return node.kind === 'community' ? 'visible' : 'hidden'
    if (level === 'project') {
      if (node.kind === 'community') return 'visible'
      return (node.degree ?? 0) >= 8 ? 'visible' : 'hidden'
    }
    return node.kind === 'rationale' && (node.degree ?? 0) < 2 ? 'dimmed' : 'visible'
  }

  if (level === 'portfolio') return node.kind === 'project' ? 'visible' : 'hidden'
  if (level === 'project') {
    if (node.kind === 'project' || node.kind === 'workflow') return 'visible'
    if (node.kind === 'agent' && node.status === 'running') return 'visible'
    return 'hidden'
  }
  if (node.kind === 'project' || node.kind === 'workflow' || node.kind === 'agent' || node.kind === 'approval') return 'visible'
  if (node.kind === 'run') return node.status === 'running' || node.status === 'awaiting_approval' ? 'visible' : 'hidden'
  return 'hidden'
}

/** Converts CSS-pixel typography targets to SVG user units for the current camera and canvas. */
export function getScreenStableLabelScale(viewWidth: number, viewportWidth = WORLD_WIDTH): number {
  return Math.max(1, viewWidth) / Math.max(1, viewportWidth)
}

export function getLabelBudget(
  zoomLevel: GraphZoomLevel,
  nodeCount: number,
  persistentCount: number,
  viewport = { width: 1200, height: 800 },
): number {
  const base: Record<GraphZoomLevel, number> = {
    portfolio: 14, project: 26, operational: 46, detail: 82, execution: 96,
  }
  const density = nodeCount / Math.max(1, viewport.width * viewport.height / 150_000)
  const sizeFactor = Math.max(0.55, Math.min(1.45, Math.sqrt(viewport.width * viewport.height / (1200 * 800))))
  const densityFactor = density > 100 ? 0.55 : density > 60 ? 0.72 : density > 30 ? 0.88 : 1
  const canonicalMaximum = zoomLevel === 'portfolio' ? 25 : zoomLevel === 'project' ? 45 : zoomLevel === 'operational' ? 60 : 120
  return Math.max(persistentCount, Math.min(canonicalMaximum, Math.round(base[zoomLevel] * sizeFactor * densityFactor)))
}

export function getTerritoryLabelTypography(viewWidth: number, viewportWidth = WORLD_WIDTH) {
  const scale = getScreenStableLabelScale(viewWidth, viewportWidth)
  return {
    fontSize: GRAPH_LABEL_TYPOGRAPHY.screenFontSize.territory * scale,
    fontWeight: GRAPH_LABEL_TYPOGRAPHY.fontWeight.territory,
    haloWidth: GRAPH_LABEL_TYPOGRAPHY.haloScreenWidth.strong * scale,
  }
}

export function getLabelPriority(
  node: IntelligenceGraphNode,
  interaction: {
    selectedId?: string | null
    hoverId?: string | null
    focusId?: string | null
    searchResultId?: string | null
  } = {},
): number {
  if (node.id === interaction.selectedId) return 1500
  if (node.id === interaction.focusId) return 1450
  if (node.id === interaction.hoverId) return 1400
  if (node.status === 'failed') return 1350
  if (node.kind === 'approval' && getStatusVisual(node)?.attention) return 1300
  if (node.id === interaction.searchResultId) return 1250
  if (node.status === 'running') return 1050
  return getStaticLabelPriority(node)
}

export function formatGraphLabel(value: string, tier: GraphLabelTier, maxCharacters?: number): readonly string[] {
  const withoutTechnicalSuffix = value.replace(/\s*[·_-]\s*[a-f\d]{6,}$/i, '').trim() || value.trim()
  const defaultMax = tier === 'project' ? 34 : tier === 'community' ? 32 : tier === 'interaction' ? 36 : 28
  const max = Math.max(12, Math.min(defaultMax, maxCharacters ?? defaultMax))
  if (withoutTechnicalSuffix.length <= max) return [withoutTechnicalSuffix]

  const firstBreak = withoutTechnicalSuffix.lastIndexOf(' ', max)
  const split = firstBreak >= Math.floor(max * 0.55) ? firstBreak : max
  const first = withoutTechnicalSuffix.slice(0, split).trim()
  const remainder = withoutTechnicalSuffix.slice(split).trim()
  const second = remainder.length <= max
    ? remainder
    : `${remainder.slice(0, Math.max(1, max - 1)).trimEnd()}…`
  return [first, second]
}

export function formatTerritoryLabel(value: string, viewportWidth: number): string {
  const max = viewportWidth < 480 ? 18 : viewportWidth < 768 ? 26 : 34
  const name = truncateWithEllipsis(value.trim(), max)
  return viewportWidth < 768 ? name : `${name} · territory`
}

export function selectTerritoryLabelPlacements({
  territories,
  layout,
  view,
  viewportWidth = WORLD_WIDTH,
  viewportHeight = 800,
  reservedBoxes = [],
}: TerritoryLabelSelectionOptions): GraphTerritoryLabelPlacement[] {
  if (viewportWidth <= 0 || viewportHeight <= 0) return []
  const scale = getScreenStableLabelScale(view.w, viewportWidth)
  const typography = getTerritoryLabelTypography(view.w, viewportWidth)
  const edgePadding = 8 * scale
  const viewportBox = usableViewportBox(view, edgePadding, reservedBoxes)
  const occupied: Box[] = [...reservedBoxes]
  const nodeObstacles = [...layout.values()].map(position => ({
    minX: position.x - position.r - 2 * scale,
    minY: position.y - position.r - 2 * scale,
    maxX: position.x + position.r + 2 * scale,
    maxY: position.y + position.r + 2 * scale,
  }))
  const visible: GraphTerritoryLabelPlacement[] = []

  for (const territory of [...territories].sort((a, b) => a.id.localeCompare(b.id))) {
    const territoryBox: Box = {
      minX: territory.cx - territory.rx,
      minY: territory.cy - territory.ry,
      maxX: territory.cx + territory.rx,
      maxY: territory.cy + territory.ry,
    }
    if (!boxesIntersect(territoryBox, viewportBox)) continue

    const text = formatTerritoryLabel(territory.label, viewportWidth)
    const width = Math.max(48 * scale, text.length * typography.fontSize * 0.7)
    const height = typography.fontSize * 1.2
    const anchors = territoryLabelAnchors(territory, scale, typography.fontSize)
    const candidates = anchors.map(anchor => ({
      anchor,
      box: absoluteLabelBox(anchor.x, anchor.y, anchor.textAnchor, width, height, typography.fontSize),
    })).filter(candidate => boxInside(viewportBox, candidate.box))
    const selected = candidates.find(candidate => (
      !nodeObstacles.some(obstacle => boxesOverlap(obstacle, candidate.box, 2 * scale))
      && !occupied.some(existing => boxesOverlap(existing, candidate.box, 4 * scale))
    )) ?? candidates
      .map((candidate, index) => ({
        ...candidate,
        index,
        conflicts: nodeObstacles.filter(obstacle => boxesOverlap(obstacle, candidate.box, 2 * scale)).length
          + occupied.filter(existing => boxesOverlap(existing, candidate.box, 4 * scale)).length * 2,
      }))
      .sort((a, b) => a.conflicts - b.conflicts || a.index - b.index)[0]

    if (!selected) continue
    visible.push({
      id: territory.id,
      text,
      fullText: territory.label,
      x: selected.anchor.x,
      y: selected.anchor.y,
      textAnchor: selected.anchor.textAnchor,
      fontSize: typography.fontSize,
      fontWeight: typography.fontWeight,
      haloWidth: typography.haloWidth,
      bounds: selected.box,
    })
    occupied.push(selected.box)
  }

  return visible
}

export function selectVisibleNodeLabels({
  nodes,
  layout,
  view,
  viewportWidth = WORLD_WIDTH,
  viewportHeight = 800,
  mode = 'system',
  level = getGraphZoomLevel(view.w),
  selectedId,
  hoverId,
  focusId,
  searchResultId,
  neighborIds = new Set<string>(),
  structurallyVisibleIds,
  reservedBoxes = [],
  occupiedBoxes = [],
}: LabelSelectionOptions): GraphLabelPlacement[] {
  const scale = getScreenStableLabelScale(view.w, viewportWidth)
  const interaction = { selectedId, hoverId, focusId, searchResultId }
  const candidates = nodes
    .map(node => ({
      node,
      position: layout.get(node.id),
      priority: getLabelPriority(node, interaction),
      attention: Boolean(getStatusVisual(node)?.attention),
      forced: node.id === selectedId || node.id === hoverId || node.id === focusId || node.id === searchResultId,
      neighbor: neighborIds.has(node.id),
    }))
    .filter((candidate): candidate is typeof candidate & { position: PositionedNode } => Boolean(candidate.position))
    .filter(candidate => !structurallyVisibleIds || structurallyVisibleIds.has(candidate.node.id) || candidate.forced || candidate.attention)
    .sort((a, b) => b.priority - a.priority
      || (b.node.degree ?? 0) - (a.node.degree ?? 0)
      || a.node.id.localeCompare(b.node.id))

  const persistentCount = candidates.filter(candidate => candidate.forced || candidate.attention || candidate.node.kind === 'project').length
  const budget = getLabelBudget(level, nodes.length, persistentCount, { width: viewportWidth, height: viewportHeight })
  const edgePadding = 8 * scale
  const viewportBox = usableViewportBox(view, edgePadding, reservedBoxes)
  const occupied: Box[] = [...reservedBoxes, ...occupiedBoxes]
  const nodeObstacles = candidates.map(candidate => ({
    id: candidate.node.id,
    box: {
      minX: candidate.position.x - candidate.position.r - 2 * scale,
      minY: candidate.position.y - candidate.position.r - 2 * scale,
      maxX: candidate.position.x + candidate.position.r + 2 * scale,
      maxY: candidate.position.y + candidate.position.r + 2 * scale,
    },
  }))
  const visible: GraphLabelPlacement[] = []

  for (const candidate of candidates) {
    const { node, position, attention, forced, neighbor } = candidate
    if (!isLabelEligible(node, level, mode, { forced, attention, neighbor, selectedId })) continue
    const persistent = forced || attention || node.kind === 'project'
    if (!persistent && visible.length >= budget) continue

    const tier: GraphLabelTier = forced
      ? 'interaction'
      : node.kind === 'project'
        ? 'project'
        : node.kind === 'community'
          ? 'community'
          : node.kind === 'workflow'
            ? 'workflow'
            : 'ordinary'
    const fontSize = GRAPH_LABEL_TYPOGRAPHY.screenFontSize[tier] * scale
    const statusFontSize = GRAPH_LABEL_TYPOGRAPHY.statusScreenFontSize[tier === 'interaction' ? 'interaction' : 'default'] * scale
    const lineHeight = fontSize * 1.18
    const statusLineHeight = (tier === 'interaction' ? 15 : 13.5) * scale
    const fontWeight = GRAPH_LABEL_TYPOGRAPHY.fontWeight[tier]
    const haloWidth = GRAPH_LABEL_TYPOGRAPHY.haloScreenWidth[
      tier === 'interaction' || tier === 'project' ? 'strong' : 'default'
    ] * scale
    const lines = formatGraphLabel(node.label, tier, responsiveLabelLimit(tier, viewportWidth))
    const textLength = Math.max(...lines.map(line => line.length))
    const width = Math.max(32 * scale, textLength * fontSize * 0.62)
    const height = lines.length * lineHeight + (attention && node.status ? statusLineHeight : 0)
    const anchors = labelAnchors(position, scale, fontSize, forced || attention)
    let selectedPlacement: GraphLabelPlacement | null = null
    let selectedBox: Box | null = null

    for (const anchor of anchors) {
      const box = labelBox(position, anchor, width, height, fontSize)
      const crossesViewport = !boxInside(viewportBox, box)
      const crossesNode = nodeObstacles.some(obstacle => obstacle.id !== node.id && boxesOverlap(obstacle.box, box, 2 * scale))
      if (crossesViewport || crossesNode || occupied.some(existing => boxesOverlap(existing, box, 3 * scale))) continue
      selectedPlacement = createPlacement(candidate, tier, lines, fontSize, statusFontSize, fontWeight, haloWidth, lineHeight, statusLineHeight, anchor, box)
      selectedBox = box
      break
    }

    // Selected, project, and attention labels are truth-preserving. Twelve
    // routed candidates normally keep them collision-free; this deterministic
    // fallback is used only when every local position is exhausted.
    if (!selectedPlacement && persistent && boxesIntersect(nodeObstacles.find(obstacle => obstacle.id === node.id)!.box, viewportBox)) {
      const fallback = anchors.map((anchor, index) => {
        const clamped = clampLabelAnchor(position, anchor, width, height, fontSize, viewportBox)
        const box = labelBox(position, clamped, width, height, fontSize)
        const nodeConflicts = nodeObstacles.filter(obstacle => obstacle.id !== node.id && boxesOverlap(obstacle.box, box, 2 * scale)).length
        const labelConflicts = occupied.filter(existing => boxesOverlap(existing, box, 3 * scale)).length
        return { anchor: clamped, box, index, conflicts: nodeConflicts + labelConflicts * 2 }
      }).filter(value => boxInside(viewportBox, value.box))
        .sort((a, b) => a.conflicts - b.conflicts || a.index - b.index)[0]
      if (fallback) {
        selectedPlacement = createPlacement(candidate, tier, lines, fontSize, statusFontSize, fontWeight, haloWidth, lineHeight, statusLineHeight, fallback.anchor, fallback.box)
        selectedBox = fallback.box
      }
    }

    if (selectedPlacement && selectedBox) {
      visible.push(selectedPlacement)
      occupied.push(selectedBox)
    }
  }
  return visible
}

export function getEdgeReadability({
  edge, visual, zoomLevel, highlighted, attentionPath, hasInteraction,
}: EdgeReadabilityOptions): { visible: boolean; opacity: number; showMarker: boolean } {
  if (highlighted) return { visible: true, opacity: 0.92, showMarker: visual.directional }
  if (attentionPath || visual.attention === 'approval') {
    return { visible: true, opacity: zoomLevel === 'portfolio' ? 0.34 : 0.48, showMarker: visual.directional }
  }
  if (hasInteraction) return { visible: true, opacity: 0.018, showMarker: false }

  const lowValue = LOW_VALUE_RELATIONS.has(edge.relation)
  if (zoomLevel === 'portfolio') {
    return lowValue
      ? { visible: false, opacity: 0, showMarker: false }
      : { visible: true, opacity: Math.min(0.045, visual.opacity * 0.16), showMarker: false }
  }
  if (zoomLevel === 'project') {
    return lowValue
      ? { visible: false, opacity: 0, showMarker: false }
      : { visible: true, opacity: Math.min(0.075, visual.opacity * 0.26), showMarker: false }
  }
  if (zoomLevel === 'operational') {
    return { visible: true, opacity: Math.min(lowValue ? 0.04 : 0.12, visual.opacity * 0.4), showMarker: false }
  }
  return {
    visible: true,
    opacity: Math.min(lowValue ? 0.1 : 0.2, visual.opacity * 0.66),
    showMarker: visual.directional && (!lowValue || zoomLevel === 'execution'),
  }
}

export function calculateGraphBounds(
  layout: ReadonlyMap<string, PositionedNode>,
  territories: readonly ProjectTerritory[],
): GraphBounds {
  if (layout.size === 0 && territories.length === 0) return { minX: 0, minY: 0, maxX: 1200, maxY: 800 }
  const bounds: GraphBounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  for (const position of layout.values()) {
    includeBox(bounds, {
      minX: position.x - position.r, minY: position.y - position.r,
      maxX: position.x + position.r, maxY: position.y + position.r,
    })
  }
  for (const territory of territories) {
    const left = territory.cx - territory.rx
    const top = territory.cy - territory.ry
    includeBox(bounds, { minX: left, minY: top - 6, maxX: territory.cx + territory.rx, maxY: territory.cy + territory.ry })
    const labelWidth = Math.min(230, Math.max(64, (territory.label.length + 12) * 5.2))
    includeBox(bounds, { minX: left + 14, minY: top + 4, maxX: left + 14 + labelWidth, maxY: top + 22 })
  }
  return bounds
}

export function fitGraphBounds(bounds: GraphBounds, viewport: { width: number; height: number }, padding = 64): GraphViewBox {
  const viewportWidth = Math.max(1, viewport.width)
  const viewportHeight = Math.max(1, viewport.height)
  const aspect = viewportWidth / viewportHeight
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerY = (bounds.minY + bounds.maxY) / 2
  let width = Math.max(200, bounds.maxX - bounds.minX + padding * 2)
  let height = Math.max(150, bounds.maxY - bounds.minY + padding * 2)
  if (width / height < aspect) width = height * aspect
  else height = width / aspect
  return { x: centerX - width / 2, y: centerY - height / 2, w: width, h: height }
}

export function fitNodeIds(
  layout: ReadonlyMap<string, PositionedNode>,
  nodeIds: ReadonlySet<string>,
  viewport: { width: number; height: number },
): GraphViewBox | null {
  const positions = [...nodeIds].flatMap(id => layout.get(id) ? [layout.get(id)!] : [])
  if (positions.length === 0) return null
  return fitGraphBounds({
    minX: Math.min(...positions.map(position => position.x - position.r)),
    minY: Math.min(...positions.map(position => position.y - position.r)),
    maxX: Math.max(...positions.map(position => position.x + position.r)),
    maxY: Math.max(...positions.map(position => position.y + position.r)),
  }, viewport, 72)
}

export function keepNodesVisible(
  view: GraphViewBox,
  layout: ReadonlyMap<string, PositionedNode>,
  nodeIds: ReadonlySet<string>,
  insets: { top?: number; right?: number; bottom?: number; left?: number } = {},
): GraphViewBox {
  const positions = [...nodeIds].flatMap(id => layout.get(id) ? [layout.get(id)!] : [])
  if (positions.length === 0) return view
  const marginX = Math.min(view.w * 0.18, 96)
  const marginY = Math.min(view.h * 0.18, 72)
  const minX = Math.min(...positions.map(position => position.x - position.r))
  const maxX = Math.max(...positions.map(position => position.x + position.r))
  const minY = Math.min(...positions.map(position => position.y - position.r))
  const maxY = Math.max(...positions.map(position => position.y + position.r))
  let x = view.x
  let y = view.y
  const leftInset = insets.left ?? 0
  const rightInset = insets.right ?? 0
  const topInset = insets.top ?? 0
  const bottomInset = insets.bottom ?? 0
  const usableWidth = view.w - leftInset - rightInset
  const usableHeight = view.h - topInset - bottomInset
  if (maxX - minX > usableWidth - marginX * 2) x = (minX + maxX - view.w + rightInset - leftInset) / 2
  else if (minX < x + leftInset + marginX) x = minX - leftInset - marginX
  else if (maxX > x + view.w - rightInset - marginX) x = maxX + rightInset + marginX - view.w
  if (maxY - minY > usableHeight - marginY * 2) y = (minY + maxY - view.h + bottomInset - topInset) / 2
  else if (minY < y + topInset + marginY) y = minY - topInset - marginY
  else if (maxY > y + view.h - bottomInset - marginY) y = maxY + bottomInset + marginY - view.h
  return { ...view, x, y }
}

export function graphCameraPreservationKey(
  viewport: { width: number; height: number },
  inspectorOpen: boolean,
  selectedId: string | null,
  nodeIds: ReadonlySet<string>,
): string {
  return `${viewport.width}x${viewport.height}:${inspectorOpen ? 'open' : 'closed'}:${selectedId ?? ''}:${[...nodeIds].sort().join(',')}`
}

/**
 * Preserves the current zoom and minimally pans the selected neighborhood into
 * the usable canvas. Mobile reserves the bottom-sheet region; desktop keeps
 * the complete canvas available.
 */
export function preserveSelectedNeighborhoodCamera(
  view: GraphViewBox,
  layout: ReadonlyMap<string, PositionedNode>,
  nodeIds: ReadonlySet<string>,
  selectedId: string | null,
  viewport: { width: number; height: number },
  inspectorOpen: boolean,
): GraphViewBox {
  const insets = {
    bottom: inspectorOpen && viewport.width < 768 ? view.h * 0.48 : 0,
  }
  const neighborhoodView = keepNodesVisible(view, layout, nodeIds, insets)
  return selectedId
    ? keepNodesVisible(neighborhoodView, layout, new Set([selectedId]), insets)
    : neighborhoodView
}

function isLabelEligible(
  node: IntelligenceGraphNode,
  level: GraphZoomLevel,
  mode: 'system' | 'operations',
  state: { forced: boolean; attention: boolean; neighbor: boolean; selectedId?: string | null },
): boolean {
  if (state.forced || state.attention || node.kind === 'project') return true
  if (state.selectedId) return state.neighbor
  if (level === 'execution') return state.neighbor
  if (level === 'detail') return true
  if (level === 'operational') {
    if (mode === 'system') return node.kind !== 'rationale' || (node.degree ?? 0) >= 4
    return node.kind === 'workflow' || node.kind === 'agent' || node.status === 'running'
  }
  if (level === 'project') return node.kind === 'community' || node.kind === 'workflow' || node.status === 'running'
  return node.kind === 'community'
}

function createPlacement(
  candidate: { node: IntelligenceGraphNode; position: PositionedNode; priority: number },
  tier: GraphLabelTier,
  lines: readonly string[],
  fontSize: number,
  statusFontSize: number,
  fontWeight: number,
  haloWidth: number,
  lineHeight: number,
  statusLineHeight: number,
  anchor: LabelAnchor,
  bounds: Box,
): GraphLabelPlacement {
  const leaderLine = anchor.leader ? leaderLineFor(candidate.position, anchor) : undefined
  return {
    id: candidate.node.id, priority: candidate.priority, tier, lines, fontSize, statusFontSize,
    fontWeight, haloWidth, x: anchor.x, y: anchor.y, lineHeight, statusLineHeight,
    textAnchor: anchor.textAnchor, bounds, leaderLine,
  }
}

function responsiveLabelLimit(tier: GraphLabelTier, viewportWidth: number): number | undefined {
  if (viewportWidth >= 480) return undefined
  const mobileMaximum: Record<GraphLabelTier, number> = {
    interaction: 30,
    project: 28,
    community: 26,
    workflow: 24,
    ordinary: 22,
  }
  return mobileMaximum[tier]
}

function territoryLabelAnchors(
  territory: ProjectTerritory,
  scale: number,
  fontSize: number,
): Array<{ x: number; y: number; textAnchor: 'start' | 'middle' | 'end' }> {
  const inset = 14 * scale
  const top = territory.cy - territory.ry + fontSize + 4 * scale
  const bottom = territory.cy + territory.ry - 8 * scale
  const left = territory.cx - territory.rx + inset
  const right = territory.cx + territory.rx - inset
  return [
    { x: left, y: top, textAnchor: 'start' },
    { x: territory.cx, y: top, textAnchor: 'middle' },
    { x: right, y: top, textAnchor: 'end' },
    { x: left, y: bottom, textAnchor: 'start' },
    { x: territory.cx, y: bottom, textAnchor: 'middle' },
    { x: right, y: bottom, textAnchor: 'end' },
  ]
}

function clampLabelAnchor(
  position: PositionedNode,
  anchor: LabelAnchor,
  width: number,
  height: number,
  fontSize: number,
  viewport: Box,
): LabelAnchor {
  const box = labelBox(position, anchor, width, height, fontSize)
  const dx = box.minX < viewport.minX
    ? viewport.minX - box.minX
    : box.maxX > viewport.maxX ? viewport.maxX - box.maxX : 0
  const dy = box.minY < viewport.minY
    ? viewport.minY - box.minY
    : box.maxY > viewport.maxY ? viewport.maxY - box.maxY : 0
  return { ...anchor, x: anchor.x + dx, y: anchor.y + dy, leader: anchor.leader || dx !== 0 || dy !== 0 }
}

function usableViewportBox(view: GraphViewBox, edgePadding: number, reservedBoxes: readonly GraphBounds[]): Box {
  const box: Box = {
    minX: view.x + edgePadding,
    minY: view.y + edgePadding,
    maxX: view.x + view.w - edgePadding,
    maxY: view.y + view.h - edgePadding,
  }
  for (const reserved of reservedBoxes) {
    const spansWidth = reserved.minX <= box.minX && reserved.maxX >= box.maxX
    const spansHeight = reserved.minY <= box.minY && reserved.maxY >= box.maxY
    if (spansWidth && reserved.maxY >= box.maxY) box.maxY = Math.min(box.maxY, reserved.minY - edgePadding)
    else if (spansWidth && reserved.minY <= box.minY) box.minY = Math.max(box.minY, reserved.maxY + edgePadding)
    else if (spansHeight && reserved.maxX >= box.maxX) box.maxX = Math.min(box.maxX, reserved.minX - edgePadding)
    else if (spansHeight && reserved.minX <= box.minX) box.minX = Math.max(box.minX, reserved.maxX + edgePadding)
  }
  return box
}

function absoluteLabelBox(
  x: number,
  y: number,
  textAnchor: 'start' | 'middle' | 'end',
  width: number,
  height: number,
  fontSize: number,
): Box {
  const minX = textAnchor === 'middle' ? x - width / 2 : textAnchor === 'end' ? x - width : x
  return { minX, minY: y - fontSize, maxX: minX + width, maxY: y - fontSize + height }
}

function labelAnchors(position: PositionedNode, scale: number, fontSize: number, important: boolean): LabelAnchor[] {
  const gap = (important ? 5 : 3.5) * scale
  const horizontal = position.r + gap + 3 * scale
  const vertical = position.r + fontSize + gap
  const diagonal = position.r + fontSize * 0.82 + 6 * scale
  const far = position.r + fontSize * 1.45 + 10 * scale
  return [
    { x: 0, y: vertical, textAnchor: 'middle', leader: false },
    { x: 0, y: -position.r - gap, textAnchor: 'middle', leader: false },
    { x: horizontal, y: fontSize * 0.35, textAnchor: 'start', leader: false },
    { x: -horizontal, y: fontSize * 0.35, textAnchor: 'end', leader: false },
    { x: diagonal, y: diagonal, textAnchor: 'start', leader: true },
    { x: -diagonal, y: diagonal, textAnchor: 'end', leader: true },
    { x: diagonal, y: -diagonal, textAnchor: 'start', leader: true },
    { x: -diagonal, y: -diagonal, textAnchor: 'end', leader: true },
    { x: far, y: vertical * 1.2, textAnchor: 'start', leader: true },
    { x: -far, y: vertical * 1.2, textAnchor: 'end', leader: true },
    { x: far, y: -vertical, textAnchor: 'start', leader: true },
    { x: -far, y: -vertical, textAnchor: 'end', leader: true },
  ]
}

function labelBox(position: PositionedNode, anchor: LabelAnchor, width: number, height: number, fontSize: number): Box {
  const anchorX = position.x + anchor.x
  const minX = anchor.textAnchor === 'middle' ? anchorX - width / 2 : anchor.textAnchor === 'end' ? anchorX - width : anchorX
  const baselineY = position.y + anchor.y
  return { minX, minY: baselineY - fontSize, maxX: minX + width, maxY: baselineY - fontSize + height }
}

function leaderLineFor(position: PositionedNode, anchor: LabelAnchor) {
  const distance = Math.max(1, Math.hypot(anchor.x, anchor.y))
  const ux = anchor.x / distance
  const uy = anchor.y / distance
  return {
    x1: ux * (position.r + 2), y1: uy * (position.r + 2),
    x2: anchor.x - ux * 4, y2: anchor.y - uy * 4,
  }
}

function boxInside(container: Box, box: Box): boolean {
  return box.minX >= container.minX && box.minY >= container.minY && box.maxX <= container.maxX && box.maxY <= container.maxY
}

function boxesOverlap(a: Box, b: Box, gap: number): boolean {
  return a.minX < b.maxX + gap && a.maxX + gap > b.minX && a.minY < b.maxY + gap && a.maxY + gap > b.minY
}

function boxesIntersect(a: Box, b: Box): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY
}

function truncateWithEllipsis(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(1, max - 1)).trimEnd()}…`
}

function includeBox(bounds: GraphBounds, box: Box) {
  bounds.minX = Math.min(bounds.minX, box.minX)
  bounds.minY = Math.min(bounds.minY, box.minY)
  bounds.maxX = Math.max(bounds.maxX, box.maxX)
  bounds.maxY = Math.max(bounds.maxY, box.maxY)
}

/** Useful for tests and semantic-order keyboard navigation. */
export function canonicalKindOrder(kind: NodeKind): number {
  const order: NodeKind[] = ['project', 'community', 'workflow', 'agent', 'approval', 'run', 'task', 'output', 'code', 'document', 'rationale']
  return order.indexOf(kind)
}
