'use client'

/**
 * SVG renderer for the existing Intelligence Graph contract.
 *
 * Runtime status is always a separate layer over stable node identity. Project
 * territories are derived only from verified projectId membership, and motion
 * is limited to interaction transitions (no synthetic operational activity).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import type { IntelligenceGraphEdge, IntelligenceGraphNode } from '@/lib/intelligence/graph-contract'
import { computeLayout } from './force-layout'
import {
  calculateGraphBounds,
  canonicalKindOrder,
  fitGraphBounds,
  fitNodeIds,
  getEdgeReadability,
  getGraphZoomLevel,
  getNodeSemanticVisibility,
  getSemanticZoomPolicy,
  graphCameraPreservationKey,
  preserveSelectedNeighborhoodCamera,
  selectTerritoryLabelPlacements,
  selectVisibleNodeLabels,
  type GraphViewBox,
  type GraphZoomLevel,
} from './graph-readability'
import { buildDenseViewSummaries } from './graph-navigation'
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
  semanticContext?: 'auto' | 'detail' | 'execution'
  dimmedIds?: ReadonlySet<string>
  dimmedEdgeIds?: ReadonlySet<string>
  isolatedIds?: ReadonlySet<string> | null
  inspectorOpen?: boolean
  searchResultId?: string | null
  cameraCommand?: GraphCameraCommand | null
  onCameraChange?: (view: GraphViewBox) => void
  onZoomLevelChange?: (level: GraphZoomLevel) => void
  onSearchRequest?: () => void
  onIsolate?: (node: IntelligenceGraphNode) => void
  onEscape?: () => void
  appearance?: GraphAppearance
  className?: string
}

export interface GraphCameraCommand {
  nonce: number
  type: 'fit-graph' | 'fit-node' | 'fit-scope' | 'restore'
  nodeIds?: readonly string[]
  view?: GraphViewBox
}

const WORLD_W = 1200
const WORLD_H = 800

export function GraphCanvas({
  nodes,
  edges,
  selectedId,
  onSelect,
  onOpen,
  fitSignal = 0,
  mode = 'system',
  semanticContext = 'auto',
  dimmedIds = new Set<string>(),
  dimmedEdgeIds = new Set<string>(),
  isolatedIds = null,
  inspectorOpen = false,
  searchResultId = null,
  cameraCommand = null,
  onCameraChange,
  onZoomLevelChange,
  onSearchRequest,
  onIsolate,
  onEscape,
  appearance = 'dark',
  className,
}: GraphCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const nodeRefs = useRef(new Map<string, SVGGElement>())
  const [view, setView] = useState<GraphViewBox>({ x: 0, y: 0, w: WORLD_W, h: WORLD_H })
  const [viewport, setViewport] = useState({ width: WORLD_W, height: WORLD_H })
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; view: GraphViewBox } | null>(null)
  const movedRef = useRef(false)
  const autoFitRef = useRef(true)
  const handledViewportRef = useRef(`${WORLD_W}x${WORLD_H}`)
  const handledCameraContextRef = useRef(`${WORLD_W}x${WORLD_H}:closed::`)

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
  const graphBounds = useMemo(() => calculateGraphBounds(layout, territories), [layout, territories])

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

  const selectedNeighborhood = useMemo(() => {
    if (!selectedId) return new Set<string>()
    const ids = new Set<string>([selectedId])
    for (const edge of edges) {
      if (edge.source === selectedId || edge.target === selectedId) {
        ids.add(edge.source)
        ids.add(edge.target)
      }
    }
    return ids
  }, [selectedId, edges])

  const attentionNodeIds = useMemo(() => new Set(
    nodes.filter(node => getStatusVisual(node)?.attention).map(node => node.id),
  ), [nodes])

  const semanticNeighborIds = isolatedIds ?? selectedNeighborhood
  const zoomLevel = semanticContext === 'execution'
    ? getGraphZoomLevel(view.w, true)
    : semanticContext === 'detail'
      ? 'detail'
      : getGraphZoomLevel(view.w)
  const semanticPolicy = getSemanticZoomPolicy(zoomLevel)
  const semanticVisibility = useMemo(() => new Map(nodes.map(node => [
    node.id,
    getNodeSemanticVisibility(node, {
      level: zoomLevel,
      mode,
      selectedId,
      focusId,
      searchResultId,
      neighborIds: semanticNeighborIds,
    }),
  ])), [nodes, zoomLevel, mode, selectedId, focusId, searchResultId, semanticNeighborIds])
  const structurallyVisibleIds = useMemo(() => new Set(
    nodes.filter(node => semanticVisibility.get(node.id) !== 'hidden'
      && (!isolatedIds || isolatedIds.has(node.id))).map(node => node.id),
  ), [nodes, semanticVisibility, isolatedIds])
  const summaries = useMemo(
    () => buildDenseViewSummaries(nodes, edges, zoomLevel),
    [nodes, edges, zoomLevel],
  )
  const summaryByParent = useMemo(() => new Map(summaries.map(summary => [summary.parentId, summary])), [summaries])
  const inspectorBottomInset = inspectorOpen && viewport.width < 768 ? view.h * 0.48 : 0
  const reservedBoxes = useMemo(() => inspectorBottomInset > 0 ? [{
    minX: view.x,
    minY: view.y + view.h - inspectorBottomInset,
    maxX: view.x + view.w,
    maxY: view.y + view.h,
  }] : [], [inspectorBottomInset, view])
  const visibleTerritories = useMemo(
    () => territories.filter(territory => !isolatedIds
      || nodes.some(node => node.projectId === territory.id && isolatedIds.has(node.id))),
    [territories, isolatedIds, nodes],
  )
  const territoryLabelPlacements = useMemo(() => selectTerritoryLabelPlacements({
    territories: visibleTerritories,
    layout,
    view,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    reservedBoxes,
  }), [visibleTerritories, layout, view, viewport, reservedBoxes])
  const territoryLabelById = useMemo(
    () => new Map(territoryLabelPlacements.map(label => [label.id, label])),
    [territoryLabelPlacements],
  )
  const territoryLabelBoxes = useMemo(
    () => territoryLabelPlacements.map(label => label.bounds),
    [territoryLabelPlacements],
  )
  const visibleLabels = useMemo(() => new Map(
    selectVisibleNodeLabels({
      nodes,
      layout,
      view,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      mode,
      level: zoomLevel,
      selectedId,
      hoverId,
      focusId,
      searchResultId,
      neighborIds: semanticNeighborIds,
      structurallyVisibleIds,
      reservedBoxes,
      occupiedBoxes: territoryLabelBoxes,
    }).map(label => [label.id, label]),
  ), [nodes, layout, view, viewport, mode, zoomLevel, selectedId, hoverId, focusId, searchResultId, semanticNeighborIds, structurallyVisibleIds, reservedBoxes, territoryLabelBoxes])

  const fit = useCallback(() => {
    setView(fitGraphBounds(graphBounds, viewport))
  }, [graphBounds, viewport])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const updateViewport = () => {
      const rect = svg.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        setViewport(current => current.width === rect.width && current.height === rect.height
          ? current
          : { width: rect.width, height: rect.height })
      }
    }
    updateViewport()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateViewport)
    observer.observe(svg)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    autoFitRef.current = true
    fit()
  // A new graph or explicit fit/reset gets a complete, aspect-aware fit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignal, graphBounds])

  useEffect(() => {
    if (!cameraCommand) return
    if (cameraCommand.type === 'restore' && cameraCommand.view) {
      autoFitRef.current = false
      setView(cameraCommand.view)
      return
    }
    if (cameraCommand.type === 'fit-graph') {
      autoFitRef.current = true
      fit()
      return
    }
    const ids = new Set(cameraCommand.nodeIds ?? [])
    const next = fitNodeIds(layout, ids, viewport)
    if (next) {
      autoFitRef.current = false
      setView(next)
    }
  }, [cameraCommand, fit, layout, viewport])

  useEffect(() => { onCameraChange?.(view) }, [view, onCameraChange])
  useEffect(() => { onZoomLevelChange?.(zoomLevel) }, [zoomLevel, onZoomLevelChange])

  useEffect(() => {
    const viewportKey = `${viewport.width}x${viewport.height}`
    const contextKey = graphCameraPreservationKey(viewport, inspectorOpen, selectedId, selectedNeighborhood)
    if (handledCameraContextRef.current === contextKey) return
    const viewportChanged = handledViewportRef.current !== viewportKey
    handledViewportRef.current = viewportKey
    handledCameraContextRef.current = contextKey
    if (selectedNeighborhood.size > 0 && (viewportChanged || viewport.width < 768)) {
      setView(current => preserveSelectedNeighborhoodCamera(
        current,
        layout,
        selectedNeighborhood,
        selectedId,
        viewport,
        inspectorOpen,
      ))
    } else if (selectedNeighborhood.size === 0 && viewportChanged && autoFitRef.current) {
      fit()
    }
  }, [viewport, selectedId, selectedNeighborhood, layout, fit, inspectorOpen])

  const onWheel = useCallback((event: React.WheelEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const px = (event.clientX - rect.left) / rect.width
    const py = (event.clientY - rect.top) / rect.height
    const factor = event.deltaY > 0 ? 1.12 : 1 / 1.12
    autoFitRef.current = false
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
    autoFitRef.current = false
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

  const changeZoom = useCallback((factor: number) => {
    autoFitRef.current = false
    setView(current => {
      const w = Math.min(WORLD_W * 3, Math.max(80, current.w * factor))
      const h = Math.min(WORLD_H * 3, Math.max(53, current.h * factor))
      return { x: current.x + (current.w - w) / 2, y: current.y + (current.h - h) / 2, w, h }
    })
  }, [])

  const focusDirectionalNode = useCallback((fromId: string, key: string) => {
    const from = layout.get(fromId)
    if (!from) return
    const candidates = nodes.flatMap(node => {
      if (node.id === fromId || !structurallyVisibleIds.has(node.id)) return []
      const position = layout.get(node.id)
      if (!position) return []
      const dx = position.x - from.x
      const dy = position.y - from.y
      const inDirection = key === 'ArrowRight' ? dx > 0 && Math.abs(dy) <= Math.abs(dx) * 1.8
        : key === 'ArrowLeft' ? dx < 0 && Math.abs(dy) <= Math.abs(dx) * 1.8
          : key === 'ArrowDown' ? dy > 0 && Math.abs(dx) <= Math.abs(dy) * 1.8
            : dy < 0 && Math.abs(dx) <= Math.abs(dy) * 1.8
      if (!inDirection) return []
      return [{
        id: node.id,
        distance: Math.hypot(dx, dy),
        semanticOrder: canonicalKindOrder(node.kind),
      }]
    }).sort((a, b) => a.distance - b.distance || a.semanticOrder - b.semanticOrder || a.id.localeCompare(b.id))
    if (candidates[0]) nodeRefs.current.get(candidates[0].id)?.focus()
  }, [layout, nodes, structurallyVisibleIds])

  const handleCanvasKeyDown = useCallback((event: React.KeyboardEvent<SVGSVGElement>) => {
    if (event.key === '+' || event.key === '=') { event.preventDefault(); changeZoom(1 / 1.16) }
    else if (event.key === '-') { event.preventDefault(); changeZoom(1.16) }
    else if (event.key === '0') { event.preventDefault(); fit() }
    else if (event.key === '/') { event.preventDefault(); onSearchRequest?.() }
    else if (event.key === 'Escape') {
      event.preventDefault()
      if (onEscape) onEscape()
      else onSelect(null)
    }
    else if (event.key.toLowerCase() === 'f' && selectedNeighborhood.size > 0) {
      event.preventDefault()
      const next = fitNodeIds(layout, selectedNeighborhood, viewport)
      if (next) setView(next)
    }
  }, [changeZoom, fit, layout, onEscape, onSearchRequest, onSelect, selectedNeighborhood, viewport])

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
      onKeyDown={handleCanvasKeyDown}
      role="group"
      aria-label={mode === 'system' ? 'System Map intelligence graph' : 'Live Operations snapshot graph'}
      data-semantic-zoom={zoomLevel}
      data-semantic-meaning={semanticPolicy.meaning}
      data-structural-detail={semanticPolicy.structuralDetail}
      data-label-detail={semanticPolicy.labelDetail}
      data-edge-detail={semanticPolicy.edgeDetail}
      data-interaction-detail={semanticPolicy.interactionDetail}
      data-inspector-detail={semanticPolicy.inspectorDetail}
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

      <g className={styles.territories}>
        {visibleTerritories.map(territory => {
          const label = territoryLabelById.get(territory.id)
          return (
          <g key={territory.id}>
            <ellipse
              cx={territory.cx}
              cy={territory.cy}
              rx={territory.rx}
              ry={territory.ry}
              fill={territory.color}
              fillOpacity={0.022}
              stroke={territory.color}
              strokeOpacity={0.14}
              strokeWidth={1}
              strokeDasharray="3 8"
              vectorEffect="non-scaling-stroke"
              aria-hidden="true"
            />
            {label && <text
              x={label.x}
              y={label.y}
              textAnchor={label.textAnchor}
              className={styles.territoryLabel}
              fontSize={label.fontSize}
              fontWeight={label.fontWeight}
              style={{ strokeWidth: label.haloWidth }}
              role="img"
              aria-label={`${label.fullText} territory`}
            >
              <title>{`${label.fullText} · territory`}</title>
              {label.text}
            </text>}
          </g>
          )
        })}
      </g>

      <g aria-hidden="true">
        {edges.map(edgeValue => {
          const source = layout.get(edgeValue.source)
          const target = layout.get(edgeValue.target)
          if (!source || !target || !structurallyVisibleIds.has(edgeValue.source) || !structurallyVisibleIds.has(edgeValue.target)) return null
          const visual = getEdgeVisual(edgeValue)
          const isHot = highlighted?.edgeIds.has(edgeValue.id) ?? false
          const readability = getEdgeReadability({
            edge: edgeValue,
            visual,
            zoomLevel,
            highlighted: isHot,
            attentionPath: attentionNodeIds.has(edgeValue.source) || attentionNodeIds.has(edgeValue.target),
            hasInteraction: highlighted !== null,
          })
          if (!readability.visible) return null
          const filterDimmed = dimmedEdgeIds.has(edgeValue.id) && !isHot && !attentionNodeIds.has(edgeValue.source) && !attentionNodeIds.has(edgeValue.target)
          const bundled = typeof edgeValue.metadata?.bundledEdges === 'number' ? edgeValue.metadata.bundledEdges : 1
          const bundledWidth = Math.min(2.2, Math.log2(1 + bundled) * 0.28)
          const stroke = isHot ? GRAPH_VISUAL_TOKENS.edge.selected : visual.stroke
          const marker = readability.showMarker
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
              strokeOpacity={filterDimmed ? Math.min(0.012, readability.opacity) : readability.opacity}
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
          if (!position || !structurallyVisibleIds.has(node.id)) return null
          const visual = getNodeVisual(node)
          const status = getStatusVisual(node)
          const fill = node.kind === 'project' ? projectAccent(node) : nodeColor(node)
          const isSelected = node.id === selectedId
          const isFocused = node.id === focusId
          const semanticState = semanticVisibility.get(node.id)
          const filterDimmed = dimmedIds.has(node.id) && !status?.attention && !isSelected
          const isHot = (highlighted?.ids.has(node.id) ?? !dim) && !filterDimmed
          const label = visibleLabels.get(node.id)
          const summary = summaryByParent.get(node.id)
          return (
            <g
              key={node.id}
              ref={element => {
                if (element) nodeRefs.current.set(node.id, element)
                else nodeRefs.current.delete(node.id)
              }}
              transform={`translate(${position.x},${position.y})`}
              opacity={isHot ? (semanticState === 'dimmed' ? 0.42 : 1) : filterDimmed ? 0.12 : 0.22}
              className={cn(styles.node, 'cursor-pointer focus:outline-none')}
              tabIndex={0}
              role="button"
              aria-label={`${node.kind}: ${node.label}${node.status ? ` (${node.status})` : ''}`}
              aria-pressed={isSelected}
              onKeyDown={event => {
                if (event.key.startsWith('Arrow')) {
                  event.preventDefault()
                  event.stopPropagation()
                  focusDirectionalNode(node.id, event.key)
                } else if (event.key === 'Enter') {
                  event.preventDefault()
                  event.stopPropagation()
                  if (isSelected) onOpen?.(node)
                  else onSelect(node)
                } else if (event.key === ' ') {
                  event.preventDefault()
                  event.stopPropagation()
                  onSelect(node)
                } else if (event.key.toLowerCase() === 'i' && onIsolate) {
                  event.preventDefault()
                  event.stopPropagation()
                  onIsolate(node)
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
              {summary && (
                <g className={styles.summaryBadge} transform={`translate(${position.r + 8},${position.r + 8})`} aria-hidden="true">
                  <rect x={-4} y={-8} width={Math.max(25, summary.label.length * 4.8)} height={16} rx={8} />
                  <text x={4} y={3.5} fontSize={8.5}>{summary.label}</text>
                </g>
              )}
              {label && (
                <>
                  {label.leaderLine && (
                    <line
                      className={styles.leaderLine}
                      x1={label.leaderLine.x1}
                      y1={label.leaderLine.y1}
                      x2={label.leaderLine.x2}
                      y2={label.leaderLine.y2}
                      vectorEffect="non-scaling-stroke"
                      aria-hidden="true"
                    />
                  )}
                  <text
                    x={label.x}
                    y={label.y}
                    textAnchor={label.textAnchor}
                    className={styles.label}
                    fontSize={label.fontSize}
                    fontWeight={label.fontWeight}
                    fill={label.tier === 'interaction' || label.tier === 'project'
                      ? 'var(--ig-label-strong)'
                      : 'var(--ig-label)'}
                    pointerEvents="none"
                    style={{ strokeWidth: label.haloWidth }}
                  >
                    {label.lines.map((line, index) => (
                      <tspan key={`${line}:${index}`} x={label.x} dy={index === 0 ? 0 : label.lineHeight}>{line}</tspan>
                    ))}
                    {status?.attention && node.status && (
                      <tspan x={label.x} dy={label.statusLineHeight} fontSize={label.statusFontSize} fill={status.stroke}>
                        {node.status.replaceAll('_', ' ')}
                      </tspan>
                    )}
                  </text>
                </>
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
