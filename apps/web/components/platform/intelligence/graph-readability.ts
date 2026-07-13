import type { IntelligenceGraphEdge, IntelligenceGraphNode } from '@/lib/intelligence/graph-contract'
import type { PositionedNode } from './force-layout'
import { getStatusVisual, type GraphEdgeVisual, type ProjectTerritory } from './graph-visuals'

export type GraphZoomLevel = 'overview' | 'medium' | 'close'

export interface GraphLabelPlacement {
  id: string
  priority: number
  fontSize: number
  statusFontSize: number
  x: number
  y: number
  statusLineHeight: number
  textAnchor: 'start' | 'middle' | 'end'
}

export interface GraphBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface GraphViewBox {
  x: number
  y: number
  w: number
  h: number
}

interface LabelSelectionOptions {
  nodes: IntelligenceGraphNode[]
  layout: ReadonlyMap<string, PositionedNode>
  viewWidth: number
  selectedId?: string | null
  hoverId?: string | null
  focusId?: string | null
  neighborIds?: ReadonlySet<string>
}

interface EdgeReadabilityOptions {
  edge: IntelligenceGraphEdge
  visual: GraphEdgeVisual
  zoomLevel: GraphZoomLevel
  highlighted: boolean
  attentionPath: boolean
  hasInteraction: boolean
}

interface Box {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

const WORLD_WIDTH = 1200
const LOW_VALUE_RELATIONS = new Set<IntelligenceGraphEdge['relation']>([
  'TRACKS',
  'PRODUCED',
  'method',
  'references',
  'indirect_call',
])

export function getGraphZoomLevel(viewWidth: number): GraphZoomLevel {
  if (viewWidth >= 900) return 'overview'
  if (viewWidth >= 420) return 'medium'
  return 'close'
}

/** Inverse viewBox scaling keeps SVG labels approximately stable in screen space. */
export function getScreenStableLabelScale(viewWidth: number): number {
  return Math.min(3, Math.max(0.1, viewWidth / WORLD_WIDTH))
}

export function getLabelPriority(
  node: IntelligenceGraphNode,
  interaction: { selectedId?: string | null; hoverId?: string | null; focusId?: string | null } = {},
): number {
  if (node.id === interaction.selectedId || node.id === interaction.focusId || node.id === interaction.hoverId) return 1000
  if (node.kind === 'project') return 900
  if (node.kind === 'workflow') return 800
  if (getStatusVisual(node)?.attention) return 700
  if (node.kind === 'agent') return 600
  return 500
}

/**
 * A compact Phase 1 readability policy, not the full semantic-zoom engine.
 * It applies deterministic role budgets and rejects colliding lower-priority labels.
 */
export function selectVisibleNodeLabels({
  nodes,
  layout,
  viewWidth,
  selectedId,
  hoverId,
  focusId,
  neighborIds = new Set<string>(),
}: LabelSelectionOptions): GraphLabelPlacement[] {
  const zoomLevel = getGraphZoomLevel(viewWidth)
  const scale = getScreenStableLabelScale(viewWidth)
  const interaction = { selectedId, hoverId, focusId }
  const candidates = nodes
    .map(node => ({
      node,
      position: layout.get(node.id),
      priority: getLabelPriority(node, interaction),
      attention: Boolean(getStatusVisual(node)?.attention),
      forced: node.id === selectedId || node.id === hoverId || node.id === focusId,
      neighbor: neighborIds.has(node.id),
    }))
    .filter((candidate): candidate is typeof candidate & { position: PositionedNode } => Boolean(candidate.position))
    .sort((a, b) => b.priority - a.priority
      || (b.node.degree ?? 0) - (a.node.degree ?? 0)
      || a.node.id.localeCompare(b.node.id))

  const persistentCount = candidates.filter(candidate => candidate.forced || candidate.attention || candidate.node.kind === 'project').length
  const budget = zoomLevel === 'overview'
    ? Math.max(persistentCount, 8)
    : zoomLevel === 'medium'
      ? Math.max(persistentCount, nodes.length > 120 ? 20 : 30)
      : Math.max(persistentCount, nodes.length > 120 ? 34 : 52)
  const occupied: Box[] = []
  const visible: GraphLabelPlacement[] = []
  let overviewWorkflows = 0

  for (const candidate of candidates) {
    const { node, position, attention, forced, neighbor } = candidate
    const runningAgent = node.kind === 'agent' && node.status === 'running'
    const inspectorFocused = Boolean(selectedId)
    const eligible = inspectorFocused
      ? forced || attention || neighbor || node.kind === 'project'
      : zoomLevel === 'overview'
        ? forced || attention || node.kind === 'project' || node.kind === 'workflow'
        : zoomLevel === 'medium'
          ? forced || attention || neighbor || node.kind === 'project' || node.kind === 'workflow' || runningAgent
          : true

    if (!eligible) continue
    if (zoomLevel === 'overview' && node.kind === 'workflow' && !forced && !attention) {
      if (overviewWorkflows >= 2) continue
      overviewWorkflows += 1
    }

    const persistent = forced || attention || node.kind === 'project'
    if (!persistent && visible.length >= budget) continue

    const baseFontSize = node.kind === 'project' ? 11 : node.kind === 'workflow' ? 10 : 9.25
    const fontSize = baseFontSize * scale
    const statusFontSize = 7.75 * scale
    const statusLineHeight = 10 * scale
    const textLength = Math.min(node.label.length, node.kind === 'project' ? 34 : 30)
    const width = Math.max(32 * scale, textLength * fontSize * 0.57)
    const height = fontSize * 1.25 + (attention && node.status ? statusLineHeight : 0)
    const anchors = labelAnchors(position, scale)
    let selectedPlacement: GraphLabelPlacement | null = null
    let selectedBox: Box | null = null

    for (const anchor of anchors) {
      const box = labelBox(position, anchor, width, height, fontSize)
      if (!occupied.some(existing => boxesOverlap(existing, box, 3 * scale))) {
        selectedPlacement = {
          id: node.id,
          priority: candidate.priority,
          fontSize,
          statusFontSize,
          x: anchor.x,
          y: anchor.y,
          statusLineHeight,
          textAnchor: anchor.textAnchor,
        }
        selectedBox = box
        break
      }
    }

    // Selected/hovered/focused, project, and attention labels must remain available.
    if (!selectedPlacement && persistent) {
      const anchor = anchors[0]
      selectedPlacement = {
        id: node.id,
        priority: candidate.priority,
        fontSize,
        statusFontSize,
        x: anchor.x,
        y: anchor.y,
        statusLineHeight,
        textAnchor: anchor.textAnchor,
      }
      selectedBox = labelBox(position, anchor, width, height, fontSize)
    }

    if (selectedPlacement && selectedBox) {
      visible.push(selectedPlacement)
      occupied.push(selectedBox)
    }
  }

  return visible
}

export function getEdgeReadability({
  edge,
  visual,
  zoomLevel,
  highlighted,
  attentionPath,
  hasInteraction,
}: EdgeReadabilityOptions): { visible: boolean; opacity: number; showMarker: boolean } {
  if (highlighted) return { visible: true, opacity: 0.92, showMarker: visual.directional }
  if (attentionPath || visual.attention === 'approval') {
    return { visible: true, opacity: zoomLevel === 'overview' ? 0.34 : 0.48, showMarker: visual.directional }
  }
  if (hasInteraction) return { visible: true, opacity: 0.018, showMarker: false }

  const lowValue = LOW_VALUE_RELATIONS.has(edge.relation)
  if (zoomLevel === 'overview') {
    return lowValue
      ? { visible: false, opacity: 0, showMarker: false }
      : { visible: true, opacity: Math.min(0.045, visual.opacity * 0.16), showMarker: false }
  }
  if (zoomLevel === 'medium') {
    return {
      visible: true,
      opacity: Math.min(lowValue ? 0.035 : 0.075, visual.opacity * (lowValue ? 0.16 : 0.26)),
      showMarker: false,
    }
  }
  return {
    visible: true,
    opacity: Math.min(lowValue ? 0.1 : 0.18, visual.opacity * 0.6),
    showMarker: visual.directional && !lowValue,
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
      minX: position.x - position.r,
      minY: position.y - position.r,
      maxX: position.x + position.r,
      maxY: position.y + position.r,
    })
  }
  for (const territory of territories) {
    const left = territory.cx - territory.rx
    const top = territory.cy - territory.ry
    includeBox(bounds, {
      minX: left,
      minY: top - 6,
      maxX: territory.cx + territory.rx,
      maxY: territory.cy + territory.ry,
    })
    const labelWidth = Math.min(230, Math.max(64, (territory.label.length + 12) * 5.2))
    includeBox(bounds, { minX: left + 14, minY: top + 4, maxX: left + 14 + labelWidth, maxY: top + 22 })
  }
  return bounds
}

export function fitGraphBounds(
  bounds: GraphBounds,
  viewport: { width: number; height: number },
  padding = 64,
): GraphViewBox {
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

export function keepNodesVisible(
  view: GraphViewBox,
  layout: ReadonlyMap<string, PositionedNode>,
  nodeIds: ReadonlySet<string>,
): GraphViewBox {
  const positions = [...nodeIds].flatMap(id => {
    const position = layout.get(id)
    return position ? [position] : []
  })
  if (positions.length === 0) return view

  const marginX = Math.min(view.w * 0.18, 96)
  const marginY = Math.min(view.h * 0.18, 72)
  const minX = Math.min(...positions.map(position => position.x - position.r))
  const maxX = Math.max(...positions.map(position => position.x + position.r))
  const minY = Math.min(...positions.map(position => position.y - position.r))
  const maxY = Math.max(...positions.map(position => position.y + position.r))
  let x = view.x
  let y = view.y

  if (maxX - minX > view.w - marginX * 2) x = (minX + maxX - view.w) / 2
  else if (minX < x + marginX) x = minX - marginX
  else if (maxX > x + view.w - marginX) x = maxX + marginX - view.w

  if (maxY - minY > view.h - marginY * 2) y = (minY + maxY - view.h) / 2
  else if (minY < y + marginY) y = minY - marginY
  else if (maxY > y + view.h - marginY) y = maxY + marginY - view.h

  return { ...view, x, y }
}

function labelAnchors(position: PositionedNode, scale: number) {
  return [
    { x: 0, y: position.r + 13 * scale, textAnchor: 'middle' as const },
    { x: 0, y: -position.r - 7 * scale, textAnchor: 'middle' as const },
    { x: position.r + 8 * scale, y: 3 * scale, textAnchor: 'start' as const },
    { x: -position.r - 8 * scale, y: 3 * scale, textAnchor: 'end' as const },
  ]
}

function labelBox(
  position: PositionedNode,
  anchor: { x: number; y: number; textAnchor: 'start' | 'middle' | 'end' },
  width: number,
  height: number,
  fontSize: number,
): Box {
  const anchorX = position.x + anchor.x
  const minX = anchor.textAnchor === 'middle' ? anchorX - width / 2 : anchor.textAnchor === 'end' ? anchorX - width : anchorX
  const baselineY = position.y + anchor.y
  return { minX, minY: baselineY - fontSize, maxX: minX + width, maxY: baselineY - fontSize + height }
}

function boxesOverlap(a: Box, b: Box, gap: number): boolean {
  return a.minX < b.maxX + gap && a.maxX + gap > b.minX && a.minY < b.maxY + gap && a.maxY + gap > b.minY
}

function includeBox(bounds: GraphBounds, box: Box) {
  bounds.minX = Math.min(bounds.minX, box.minX)
  bounds.minY = Math.min(bounds.minY, box.minY)
  bounds.maxX = Math.max(bounds.maxX, box.maxX)
  bounds.maxY = Math.max(bounds.maxY, box.maxY)
}
