'use client'

/**
 * SVG renderer for the existing Intelligence Graph contract.
 *
 * Runtime status is always a separate layer over stable node identity. Project
 * territories are derived only from verified projectId membership, and motion
 * is limited to interaction transitions (no synthetic operational activity).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import type { IntelligenceGraphEdge, IntelligenceGraphNode } from '@/lib/intelligence/graph-contract'
import { computeLayout, type PositionedNode } from './force-layout'
import {
  GRAPH_VISUAL_TOKENS,
  buildProjectTerritories,
  getEdgeVisual,
  getNodeVisual,
  getStatusVisual,
  nodeColor,
  projectAccent,
  stableGroupId,
  type GraphAppearance,
  type GraphNodeShape,
  type GraphNodeVisual,
  type GraphStatusVisual,
} from './graph-visuals'
import styles from './GraphCanvas.module.css'

export { nodeColor } from './graph-visuals'

export interface GraphCanvasProps {
  nodes: IntelligenceGraphNode[]
  edges: IntelligenceGraphEdge[]
  selectedId: string | null
  onSelect: (node: IntelligenceGraphNode | null) => void
  onOpen?: (node: IntelligenceGraphNode) => void
  fitSignal?: number
  mode?: 'system' | 'operations'
  appearance?: GraphAppearance
  className?: string
}

const WORLD_W = 1200
const WORLD_H = 800

interface ViewBox { x: number; y: number; w: number; h: number }

export function GraphCanvas({
  nodes,
  edges,
  selectedId,
  onSelect,
  onOpen,
  fitSignal = 0,
  mode = 'system',
  appearance = 'dark',
  className,
}: GraphCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [view, setView] = useState<ViewBox>({ x: 0, y: 0, w: WORLD_W, h: WORLD_H })
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; view: ViewBox } | null>(null)
  const movedRef = useRef(false)

  const layout = useMemo(() => {
    const positioned = computeLayout(
      nodes.map(node => ({
        id: node.id,
        weight: node.degree ?? 1,
        group: node.projectId
          ? stableGroupId(node.projectId)
          : node.community ?? undefined,
        radius: getNodeVisual(node).radius,
        role: node.kind === 'project' ? 'project' : 'detail',
      })),
      edges.map(edge => ({ source: edge.source, target: edge.target })),
      { width: WORLD_W, height: WORLD_H },
    )
    return new Map(positioned.map(node => [node.id, node]))
  }, [nodes, edges])

  const territories = useMemo(() => buildProjectTerritories(nodes, layout), [nodes, layout])

  const highlighted = useMemo(() => {
    const focus = selectedId ?? hoverId ?? focusId
    if (!focus) return null
    const ids = new Set<string>([focus])
    const edgeIds = new Set<string>()
    for (const edge of edges) {
      if (edge.source === focus || edge.target === focus) {
        ids.add(edge.source)
        ids.add(edge.target)
        edgeIds.add(edge.id)
      }
    }
    return { ids, edgeIds }
  }, [selectedId, hoverId, focusId, edges])

  const fit = useCallback(() => {
    if (layout.size === 0) {
      setView({ x: 0, y: 0, w: WORLD_W, h: WORLD_H })
      return
    }
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const position of layout.values()) {
      minX = Math.min(minX, position.x - position.r)
      minY = Math.min(minY, position.y - position.r)
      maxX = Math.max(maxX, position.x + position.r)
      maxY = Math.max(maxY, position.y + position.r)
    }
    for (const territory of territories) {
      minX = Math.min(minX, territory.cx - territory.rx)
      minY = Math.min(minY, territory.cy - territory.ry - 18)
      maxX = Math.max(maxX, territory.cx + territory.rx)
      maxY = Math.max(maxY, territory.cy + territory.ry)
    }
    const pad = 46
    setView({
      x: minX - pad,
      y: minY - pad,
      w: Math.max(200, maxX - minX + pad * 2),
      h: Math.max(150, maxY - minY + pad * 2),
    })
  }, [layout, territories])

  useEffect(() => { fit() }, [fit, fitSignal])

  const onWheel = useCallback((event: React.WheelEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const px = (event.clientX - rect.left) / rect.width
    const py = (event.clientY - rect.top) / rect.height
    const factor = event.deltaY > 0 ? 1.12 : 1 / 1.12
    setView(current => {
      const w = Math.min(WORLD_W * 3, Math.max(80, current.w * factor))
      const h = Math.min(WORLD_H * 3, Math.max(53, current.h * factor))
      return {
        x: current.x + (current.w - w) * px,
        y: current.y + (current.h - h) * py,
        w,
        h,
      }
    })
  }, [])

  const onPointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
    dragRef.current = { startX: event.clientX, startY: event.clientY, view }
    movedRef.current = false
  }, [view])

  const onPointerMove = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current
    const svg = svgRef.current
    if (!drag || !svg) return
    const rect = svg.getBoundingClientRect()
    const dx = ((event.clientX - drag.startX) / rect.width) * drag.view.w
    const dy = ((event.clientY - drag.startY) / rect.height) * drag.view.h
    if (Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY) > 4) movedRef.current = true
    setView({ ...drag.view, x: drag.view.x - dx, y: drag.view.y - dy })
  }, [])

  const onPointerUp = useCallback(() => { dragRef.current = null }, [])
  const backgroundClick = useCallback(() => {
    if (!movedRef.current) onSelect(null)
  }, [onSelect])

  const theme = GRAPH_VISUAL_TOKENS.appearance[appearance]
  const cssVariables = {
    '--ig-canvas': theme.canvas,
    '--ig-canvas-depth': theme.canvasDepth,
    '--ig-label': theme.label,
    '--ig-label-strong': theme.labelStrong,
    '--ig-label-muted': theme.labelMuted,
    '--ig-territory-label': theme.territoryLabel,
  } as CSSProperties
  const dim = highlighted !== null

  return (
    <svg
      ref={svgRef}
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      className={cn(styles.canvas, 'h-full w-full touch-none select-none cursor-grab active:cursor-grabbing', className)}
      style={cssVariables}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onClick={backgroundClick}
      role="img"
      aria-label={mode === 'system' ? 'System Map intelligence graph' : 'Live Operations snapshot graph'}
    >
      <defs>
        <marker id="ig-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L6,3 L0,6 Z" fill={GRAPH_VISUAL_TOKENS.edge.structural} />
        </marker>
        <marker id="ig-arrow-hot" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L6,3 L0,6 Z" fill={GRAPH_VISUAL_TOKENS.edge.selected} />
        </marker>
        <marker id="ig-arrow-approval" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L6,3 L0,6 Z" fill={GRAPH_VISUAL_TOKENS.edge.approval} />
        </marker>
      </defs>

      <g className={styles.territories} aria-hidden="true">
        {territories.map(territory => (
          <g key={territory.id}>
            <ellipse
              cx={territory.cx}
              cy={territory.cy}
              rx={territory.rx}
              ry={territory.ry}
              fill={territory.color}
              fillOpacity={0.035}
              stroke={territory.color}
              strokeOpacity={0.22}
              strokeWidth={1}
              strokeDasharray="2 7"
            />
            <text
              x={territory.cx - territory.rx + 16}
              y={territory.cy - territory.ry + 18}
              className={styles.territoryLabel}
              fontSize={9}
            >
              {truncate(territory.label, 34)} · project territory
            </text>
          </g>
        ))}
      </g>

      <g aria-hidden="true">
        {edges.map(edgeValue => {
          const source = layout.get(edgeValue.source)
          const target = layout.get(edgeValue.target)
          if (!source || !target) return null
          const visual = getEdgeVisual(edgeValue)
          const isHot = highlighted?.edgeIds.has(edgeValue.id) ?? false
          const bundled = typeof edgeValue.metadata?.bundledEdges === 'number' ? edgeValue.metadata.bundledEdges : 1
          const bundledWidth = Math.min(2.2, Math.log2(1 + bundled) * 0.28)
          const stroke = isHot ? GRAPH_VISUAL_TOKENS.edge.selected : visual.stroke
          const marker = visual.directional
            ? visual.attention === 'approval'
              ? 'url(#ig-arrow-approval)'
              : isHot ? 'url(#ig-arrow-hot)' : 'url(#ig-arrow)'
            : undefined
          return (
            <line
              key={edgeValue.id}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke={stroke}
              strokeOpacity={isHot ? 0.92 : dim ? Math.min(0.12, visual.opacity) : visual.opacity}
              strokeWidth={visual.width + bundledWidth + (isHot ? 0.7 : 0)}
              strokeDasharray={visual.dash}
              markerEnd={marker}
              vectorEffect="non-scaling-stroke"
            />
          )
        })}
      </g>

      <g>
        {nodes.map(node => {
          const position = layout.get(node.id)
          if (!position) return null
          const visual = getNodeVisual(node)
          const status = getStatusVisual(node)
          const fill = node.kind === 'project' ? projectAccent(node) : nodeColor(node)
          const isSelected = node.id === selectedId
          const isFocused = node.id === focusId
          const isHot = highlighted?.ids.has(node.id) ?? !dim
          const showLabel = isSelected
            || node.id === hoverId
            || isFocused
            || Boolean(status?.attention)
            || view.w < 700
            || node.kind === 'community'
            || node.kind === 'project'
          return (
            <g
              key={node.id}
              transform={`translate(${position.x},${position.y})`}
              opacity={isHot ? 1 : 0.22}
              className={cn(styles.node, 'cursor-pointer focus:outline-none')}
              tabIndex={0}
              role="button"
              aria-label={`${node.kind}: ${node.label}${node.status ? ` (${node.status})` : ''}`}
              aria-pressed={isSelected}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  event.stopPropagation()
                  onSelect(node)
                }
              }}
              onFocus={() => setFocusId(node.id)}
              onBlur={() => setFocusId(current => current === node.id ? null : current)}
              onClick={event => { event.stopPropagation(); if (!movedRef.current) onSelect(node) }}
              onDoubleClick={event => { event.stopPropagation(); onOpen?.(node) }}
              onPointerEnter={() => setHoverId(node.id)}
              onPointerLeave={() => setHoverId(current => current === node.id ? null : current)}
            >
              <title>{`${node.label} · ${node.kind}${node.status ? ` · ${node.status}` : ''}`}</title>
              <circle r={Math.max(22, position.r + 8)} fill="transparent" pointerEvents="all" />
              {isFocused && <FocusRings radius={position.r} />}
              {isSelected && (
                <circle
                  r={position.r + 7}
                  fill="none"
                  stroke={GRAPH_VISUAL_TOKENS.status.selected}
                  strokeWidth={1.8}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {status && <StatusRing shape={visual.shape} radius={position.r} status={status} />}
              <NodeGlyph node={node} visual={visual} radius={position.r} fill={fill} selected={isSelected} />
              {status && <StatusBadge radius={position.r} status={status} />}
              {showLabel && (
                <text
                  y={position.r + 14}
                  textAnchor="middle"
                  className={styles.label}
                  fontSize={node.kind === 'community' || node.kind === 'project' ? 11 : 9.5}
                  fill={isSelected ? 'var(--ig-label-strong)' : 'var(--ig-label)'}
                  pointerEvents="none"
                >
                  <tspan x={0}>{truncate(node.label, node.kind === 'community' ? 42 : 30)}</tspan>
                  {status?.attention && node.status && (
                    <tspan x={0} dy={11} fontSize={8} fill={status.stroke}>{node.status.replaceAll('_', ' ')}</tspan>
                  )}
                </text>
              )}
            </g>
          )
        })}
      </g>
    </svg>
  )
}

function NodeGlyph({
  node,
  visual,
  radius,
  fill,
  selected,
}: {
  node: IntelligenceGraphNode
  visual: GraphNodeVisual
  radius: number
  fill: string
  selected: boolean
}) {
  const common = {
    fill,
    fillOpacity: 0.72,
    stroke: selected ? GRAPH_VISUAL_TOKENS.status.selected : visual.stroke,
    strokeWidth: selected ? 1.7 : 1.15,
    vectorEffect: 'non-scaling-stroke' as const,
    className: styles.identity,
  }

  switch (visual.shape) {
    case 'project':
      return (
        <g>
          <circle r={radius + 4} fill={fill} fillOpacity={0.08} stroke={fill} strokeOpacity={0.42} strokeDasharray="7 5" />
          <polygon points={polygonPoints(radius, 8, Math.PI / 8)} {...common} />
          <circle r={radius * 0.35} fill="var(--ig-canvas)" fillOpacity={0.68} stroke={visual.stroke} strokeOpacity={0.7} />
        </g>
      )
    case 'community':
      return <polygon points={polygonPoints(radius, 7, -Math.PI / 2)} {...common} />
    case 'workflow':
      return <polygon points={polygonPoints(radius, 6, Math.PI / 6)} {...common} />
    case 'task':
      return <path d={shieldPath(radius)} {...common} />
    case 'approval':
      return <polygon points={`0,${-radius} ${radius},0 0,${radius} ${-radius},0`} {...common} />
    case 'run':
      return (
        <g>
          <circle r={radius} fill="var(--ig-canvas)" fillOpacity={0.78} stroke={common.stroke} strokeWidth={common.strokeWidth} className={styles.identity} />
          <circle r={Math.max(2.4, radius * 0.28)} fill={fill} />
        </g>
      )
    case 'output':
      return <rect x={-radius * 1.25} y={-radius * 0.7} width={radius * 2.5} height={radius * 1.4} rx={radius * 0.38} {...common} />
    case 'code':
      return <rect x={-radius * 0.78} y={-radius * 0.78} width={radius * 1.56} height={radius * 1.56} rx={radius * 0.26} {...common} />
    case 'document':
      return <path d={documentPath(radius)} {...common} />
    case 'rationale':
      return <polygon points={`0,${-radius} ${radius * 0.86},0 0,${radius} ${-radius * 0.86},0`} {...common} />
    default:
      return <circle r={radius} {...common} />
  }
}

function StatusRing({ shape, radius, status }: { shape: GraphNodeShape; radius: number; status: GraphStatusVisual }) {
  const outer = radius + 5
  const common = {
    fill: 'none',
    stroke: status.stroke,
    strokeWidth: status.attention ? 2 : 1.35,
    strokeDasharray: status.dash,
    vectorEffect: 'non-scaling-stroke' as const,
    className: styles.statusRing,
  }
  if (shape === 'approval' || shape === 'rationale') {
    return <polygon points={`0,${-outer} ${outer},0 0,${outer} ${-outer},0`} {...common} />
  }
  if (shape === 'output' || shape === 'document' || shape === 'code') {
    return <rect x={-outer * 1.12} y={-outer * 0.82} width={outer * 2.24} height={outer * 1.64} rx={4} {...common} />
  }
  return <circle r={outer} {...common} />
}

function StatusBadge({ radius, status }: { radius: number; status: GraphStatusVisual }) {
  const badgeRadius = 5.2
  return (
    <g transform={`translate(${radius * 0.78},${-radius * 0.78})`} aria-hidden="true">
      <circle r={badgeRadius} fill="var(--ig-canvas)" stroke={status.stroke} strokeWidth={1.2} />
      <text y={2.4} textAnchor="middle" fontSize={6.5} fontWeight={700} fill={status.stroke}>{status.badge}</text>
    </g>
  )
}

function FocusRings({ radius }: { radius: number }) {
  return (
    <g aria-hidden="true">
      <circle r={radius + 9} fill="none" stroke="var(--ig-label-strong)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <circle r={radius + 13} fill="none" stroke="var(--ig-label-strong)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
    </g>
  )
}

function polygonPoints(radius: number, sides: number, phase: number): string {
  return Array.from({ length: sides }, (_, index) => {
    const angle = phase + index * Math.PI * 2 / sides
    return `${Math.cos(angle) * radius},${Math.sin(angle) * radius}`
  }).join(' ')
}

function shieldPath(radius: number): string {
  return `M0 ${-radius} L${radius * 0.82} ${-radius * 0.48} L${radius * 0.7} ${radius * 0.5} L0 ${radius} L${-radius * 0.7} ${radius * 0.5} L${-radius * 0.82} ${-radius * 0.48} Z`
}

function documentPath(radius: number): string {
  const width = radius * 0.9
  const fold = radius * 0.32
  return `M${-width} ${-radius} H${width - fold} L${width} ${-radius + fold} V${radius} H${-width} Z`
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`
}
