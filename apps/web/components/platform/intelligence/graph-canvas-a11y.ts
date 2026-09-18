import type { IntelligenceGraphNode } from '@/lib/intelligence/graph-contract'
import type { PositionedNode } from './force-layout'
import type { SpatialRunCluster } from './spatial-layout'

/**
 * Swedish instructions for the vNext Live Operations canvas. The list and
 * inspector remain the textual, verifiable representation; the canvas does
 * not turn relations into thousands of tab stops.
 */
export const LIVE_OPERATIONS_CANVAS_INSTRUCTIONS =
  'Grafisk presentation av samma ögonblicksbild som listan. Använd vänster- eller uppåtpil för föregående och höger- eller nedåtpil för nästa nod eller körningsgrupp. Enter eller blanksteg väljer. Heldragna linjer är direkta referenser, streckade linjer är aktuella definitioner och punktstreckade linjer är härledda relationer. Atlas är identitet och navigation, inte en datanod. Inspektören och listan är den textuella verifierbara representationen.'

export interface CanvasRovingItem {
  id: string
  kind: 'node' | 'cluster'
  x: number
  y: number
}

/**
 * Presentation order is geometric and deterministic: top to bottom, then
 * left to right, then stable id. It never infers status, priority or domain
 * meaning from keyboard order.
 */
export function canvasRovingOrder(
  nodes: readonly IntelligenceGraphNode[],
  layout: ReadonlyMap<string, PositionedNode>,
  clusters: readonly SpatialRunCluster[],
  visibleNodeIds: ReadonlySet<string>,
): CanvasRovingItem[] {
  const items: CanvasRovingItem[] = nodes.flatMap(node => {
    const position = layout.get(node.id)
    return position && visibleNodeIds.has(node.id)
      ? [{ id: node.id, kind: 'node' as const, x: position.x, y: position.y }]
      : []
  })
  for (const cluster of clusters) {
    if (visibleNodeIds.has(cluster.parentId)) {
      items.push({ id: cluster.id, kind: 'cluster', x: cluster.x, y: cluster.y })
    }
  }
  return items.sort((a, b) => a.y - b.y || a.x - b.x || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id))
}

/** Previous/next in the documented presentation order; the ends wrap. */
export function nextCanvasRovingId(
  orderedIds: readonly string[],
  currentId: string,
  key: string,
): string | null {
  if (orderedIds.length === 0) return null
  if (key === 'Home') return orderedIds[0]
  if (key === 'End') return orderedIds[orderedIds.length - 1]
  const delta = key === 'ArrowLeft' || key === 'ArrowUp'
    ? -1
    : key === 'ArrowRight' || key === 'ArrowDown'
      ? 1
      : 0
  if (delta === 0) return null
  const at = Math.max(0, orderedIds.indexOf(currentId))
  return orderedIds[(at + delta + orderedIds.length) % orderedIds.length]
}
