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
import type { GraphBounds } from './graph-readability'
import type { IntelligenceGraphEdge, IntelligenceGraphNode } from '@/lib/intelligence/graph-contract'
import { computeLayout } from './force-layout'
import {
  calculateGraphBounds,
  canonicalKindOrder,
  boundsWithScreenText,
  fitGraphBounds,
  fitNodeIds,
  getEdgeReadability,
  getGraphZoomLevel,
  getNodeSemanticVisibility,
  getSemanticZoomPolicy,
  graphCameraPreservationKey,
  preserveSelectedNeighborhoodCamera,
  reservedCanvasBoxes,
  selectTerritoryLabelPlacements,
  selectVisibleNodeLabels,
  type GraphOverlayInsets,
  type GraphViewBox,
  type GraphZoomLevel,
} from './graph-readability'
import { buildDenseViewSummaries } from './graph-navigation'
import type { PositionedNode } from './force-layout'
import {
  computeSpatialLayout,
  spatialDensityLevel,
  spatialEdgeLevel,
  spatialNodeVisibility,
  spatialReportedLevel,
  type SpatialAnchor,
  type SpatialAspect,
  type SpatialAtlasOrb,
  type SpatialHub,
  type SpatialLayout,
  type SpatialRunCluster,
  type SpatialUnlinkedBand,
} from './spatial-layout'
import { bandAnchor, planSpatialTexts, spatialScreenTexts, type SpatialCopy } from './spatial-text'
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
  type GraphEdgeVisual,
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
  /**
   * Whether the open inspector covers the canvas bottom as a sheet. Absent, the
   * canvas infers it from its own width (< 768 px), as it always has — which
   * misreads a desktop canvas narrowed by a docked panel as a phone.
   */
  inspectorSheet?: boolean
  searchResultId?: string | null
  cameraCommand?: GraphCameraCommand | null
  onCameraChange?: (view: GraphViewBox) => void
  onZoomLevelChange?: (level: GraphZoomLevel) => void
  onSearchRequest?: () => void
  onIsolate?: (node: IntelligenceGraphNode) => void
  onEscape?: () => void
  appearance?: GraphAppearance
  /**
   * Optional restyling of an edge on top of its relation visual. Absent, every
   * edge renders exactly as `getEdgeVisual` describes it. The vNext surface uses
   * it to draw how certain a relation is; the canvas itself knows nothing of that.
   */
  edgeVisual?: (edge: IntelligenceGraphEdge, visual: GraphEdgeVisual) => GraphEdgeVisual
  /**
   * Optional px bands at the top and bottom of the canvas that the page covers
   * with its own controls. Fitting keeps nodes out of them and labels avoid
   * them; a change of insets never moves the camera by itself. Absent, the
   * whole canvas is usable, exactly as before.
   */
  overlayInsets?: GraphOverlayInsets
  /**
   * vNext Live Operations only: place the graph with the deterministic spatial
   * layout (`spatial-layout.ts`) — the Atlas identity orb at the centre, project
   * hubs around it, runs counted per workflow — instead of the force layout.
   * Absent, the canvas renders exactly what legacy and System Map always have.
   */
  spatial?: GraphSpatialOptions
  className?: string
}

export interface GraphSpatialOptions {
  anchor: SpatialAnchor
  /** The stage's aspect class — not the canvas's, so opening the inspector moves nothing. */
  aspect: SpatialAspect
  /** Activating the Atlas orb: the page decides (fit the overview, or return to it). */
  onAtlasActivate?: () => void
  /** How the page draws Atlas's derived links to hubs. */
  atlasLinkVisual?: Pick<GraphEdgeVisual, 'stroke' | 'opacity' | 'dash' | 'width'>
  /** Every word the spatial canvas shows, supplied in the page's language. */
  copy: SpatialCopy
}

export interface GraphCameraCommand {
  nonce: number
  /**
   * `zoom-in` / `zoom-out` are one step each, the same step as the `+` and `-`
   * keys, around the centre of the view.
   */
  type: 'fit-graph' | 'fit-node' | 'fit-scope' | 'restore' | 'zoom-in' | 'zoom-out'
  nodeIds?: readonly string[]
  view?: GraphViewBox
}

const WORLD_W = 1200
const WORLD_H = 800
/** One zoom step — shared by the keys and the zoom commands. */
const ZOOM_STEP = 1.16

function zoomAroundCenter(current: GraphViewBox, factor: number): GraphViewBox {
  const w = Math.min(WORLD_W * 3, Math.max(80, current.w * factor))
  const h = Math.min(WORLD_H * 3, Math.max(53, current.h * factor))
  return { x: current.x + (current.w - w) / 2, y: current.y + (current.h - h) / 2, w, h }
}

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
  inspectorSheet,
  searchResultId = null,
  cameraCommand = null,
  onCameraChange,
  onZoomLevelChange,
  onSearchRequest,
  onIsolate,
  onEscape,
  appearance = 'dark',
  edgeVisual,
  overlayInsets,
  spatial,
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
  // A zoom command already in state when this canvas mounts was issued to an
  // earlier instance; it is treated as handled rather than replayed.
  const handledZoomNonceRef = useRef<number | null>(
    cameraCommand && (cameraCommand.type === 'zoom-in' || cameraCommand.type === 'zoom-out') ? cameraCommand.nonce : null,
  )

  const spatialAnchorKey = spatial ? JSON.stringify(spatial.anchor) : null
  const spatialAspect = spatial?.aspect ?? null
  const spatialLayout = useMemo<SpatialLayout | null>(
    () => spatial ? computeSpatialLayout({ nodes, edges, anchor: spatial.anchor, aspect: spatial.aspect }) : null,
    // The anchor arrives as a new object each render; its content is the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, edges, spatialAnchorKey, spatialAspect],
  )

  const layout = useMemo<ReadonlyMap<string, PositionedNode>>(() => {
    if (spatialLayout) return spatialLayout.positions
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
  }, [nodes, edges, spatialLayout])

  // The spatial view separates projects by space and a soft field, not dashed territories.
  const territories = useMemo(() => spatialLayout ? [] : buildProjectTerritories(nodes, layout), [nodes, layout, spatialLayout])
  const overlayTopPx = Math.max(0, overlayInsets?.top ?? 0)
  const overlayBottomPx = Math.max(0, overlayInsets?.bottom ?? 0)
  // Read by the camera when it next fits; a new value alone moves nothing.
  const overlayRef = useRef<GraphOverlayInsets | undefined>(undefined)
  overlayRef.current = overlayTopPx > 0 || overlayBottomPx > 0 ? { top: overlayTopPx, bottom: overlayBottomPx } : undefined
  const forceBounds = useMemo(
    () => spatialLayout ? null : calculateGraphBounds(layout, territories),
    [layout, territories, spatialLayout],
  )
  // A spatial fit also holds the level's own names and counts, which are drawn at screen size.
  const spatialTexts = useMemo(() => spatialLayout && spatial ? spatialScreenTexts(spatialLayout, spatial.copy) : [], [spatialLayout, spatial])
  const spatialBounds = useMemo(() => {
    if (!spatialLayout) return null
    // The portfolio frames its hubs; the run counts and bands inside them unfold only with zoom.
    const framed = spatialLayout.level === 'portfolio'
      ? spatialTexts.filter(text => text.kind === 'atlas' || text.kind === 'hub-name' || text.kind === 'hub-subtext')
      : spatialTexts
    return boundsWithScreenText(spatialLayout.fitBounds, framed, viewport, undefined, overlayRef.current)
  }, [spatialLayout, spatialTexts, viewport])
  const graphBounds = spatialBounds ?? forceBounds!
  // Changes only with the layout itself; a new canvas size re-fits through the camera context instead.
  const layoutBounds = spatialLayout ? spatialLayout.fitBounds : graphBounds
  const nodeById = useMemo(() => new Map(nodes.map(node => [node.id, node])), [nodes])

  const highlighted = useMemo(() => {
    // In a drilled spatial view the selected anchor is the view itself; its selection
    // highlights nothing, so the level's own structure stays readable.
    const selectedIsAnchor = spatialLayout !== null && selectedId !== null && selectedId === spatialLayout.anchorId
    const focus = selectedIsAnchor ? (hoverId ?? focusId) : (selectedId ?? hoverId ?? focusId)
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
  }, [selectedId, hoverId, focusId, edges, spatialLayout])

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
  // Spatial zoom depth: how far the camera is inside the level's own fit. It is
  // a ratio of widths, so the same framing reads the same at any canvas size.
  const spatialFitWidth = useMemo(
    () => spatialLayout ? fitGraphBounds(graphBounds, viewport, undefined, { top: overlayTopPx, bottom: overlayBottomPx }).w : 0,
    [spatialLayout, graphBounds, viewport, overlayTopPx, overlayBottomPx],
  )
  const spatialDepth = spatialLayout ? spatialFitWidth / Math.max(1, view.w) : 1
  const executionContext = semanticContext === 'execution'
  const zoomLevel = spatialLayout
    ? spatialDensityLevel(spatialLayout.level, spatialDepth, executionContext)
    : semanticContext === 'execution'
      ? getGraphZoomLevel(view.w, true)
      : semanticContext === 'detail'
        ? 'detail'
        : getGraphZoomLevel(view.w)
  const reportedZoomLevel = spatialLayout
    ? spatialReportedLevel(spatialLayout.level, spatialDepth, executionContext)
    : zoomLevel
  const edgeZoomLevel = spatialLayout ? spatialEdgeLevel(spatialLayout.level, spatialDepth, executionContext) : zoomLevel
  const semanticPolicy = getSemanticZoomPolicy(zoomLevel)
  const semanticVisibility = useMemo(() => new Map(nodes.map(node => [
    node.id,
    spatialLayout
      ? spatialNodeVisibility(node, spatialLayout, {
        depth: spatialDepth,
        selectedId,
        focusId,
        searchResultId,
        neighborIds: semanticNeighborIds,
        executionContext,
      })
      : getNodeSemanticVisibility(node, {
        level: zoomLevel,
        mode,
        selectedId,
        focusId,
        searchResultId,
        neighborIds: semanticNeighborIds,
      }),
  ])), [nodes, zoomLevel, mode, selectedId, focusId, searchResultId, semanticNeighborIds, spatialLayout, spatialDepth, executionContext])
  const structurallyVisibleIds = useMemo(() => new Set(
    nodes.filter(node => semanticVisibility.get(node.id) !== 'hidden'
      && (!isolatedIds || isolatedIds.has(node.id))).map(node => node.id),
  ), [nodes, semanticVisibility, isolatedIds])
  const summaries = useMemo(
    () => spatialLayout ? [] : buildDenseViewSummaries(nodes, edges, zoomLevel),
    [nodes, edges, zoomLevel, spatialLayout],
  )
  const summaryByParent = useMemo(() => new Map(summaries.map(summary => [summary.parentId, summary])), [summaries])
  const sheetPresentation = inspectorSheet ?? viewport.width < 768
  const inspectorBottomInset = inspectorOpen && sheetPresentation ? view.h * 0.48 : 0
  const reservedBoxes = useMemo(
    () => reservedCanvasBoxes(view, viewport.height, inspectorBottomInset, { top: overlayTopPx, bottom: overlayBottomPx }),
    [inspectorBottomInset, view, viewport.height, overlayTopPx, overlayBottomPx],
  )
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
  const labelScale = view.w / Math.max(1, viewport.width)
  // Hubs, Atlas, clusters and band captions carry their own text; node labels route around what is drawn.
  const spatialTextPlan = useMemo(
    () => spatialLayout ? planSpatialTexts(spatialLayout, spatialTexts, labelScale, structurallyVisibleIds) : null,
    [spatialLayout, spatialTexts, labelScale, structurallyVisibleIds],
  )
  const spatialObstacles = useMemo(() => spatialTextPlan?.obstacles ?? [], [spatialTextPlan])
  const labelNodes = useMemo(() => spatialLayout ? nodes.filter(node => node.kind !== 'project') : nodes, [nodes, spatialLayout])
  // A drilled project is the view itself: its selection does not make every agent's name eligible.
  const labelSelectedId = spatialLayout && selectedId !== null && selectedId === spatialLayout.anchorId && nodeById.get(selectedId)?.kind === 'project'
    ? null
    : selectedId
  const visibleLabels = useMemo(() => new Map(
    selectVisibleNodeLabels({
      nodes: labelNodes,
      layout,
      view,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      mode,
      level: zoomLevel,
      selectedId: labelSelectedId,
      hoverId,
      focusId,
      searchResultId,
      neighborIds: semanticNeighborIds,
      structurallyVisibleIds,
      reservedBoxes,
      occupiedBoxes: spatialLayout ? [...territoryLabelBoxes, ...spatialObstacles] : territoryLabelBoxes,
    }).map(label => [label.id, label]),
  ), [labelNodes, layout, view, viewport, mode, zoomLevel, labelSelectedId, hoverId, focusId, searchResultId, semanticNeighborIds, structurallyVisibleIds, reservedBoxes, territoryLabelBoxes, spatialLayout, spatialObstacles])
  // A label that had nowhere else to go (a selected or attention label) keeps its place; counts and captions under it give way.
  const spatialTextsShown = useMemo(() => {
    if (!spatialTextPlan) return null
    const labelBoxes = [...visibleLabels.values()].map(label => label.bounds)
    const covered = spatialTextPlan.yielding.filter(text => labelBoxes.some(box => box.minX < text.box.maxX && box.maxX > text.box.minX && box.minY < text.box.maxY && box.maxY > text.box.minY))
    if (covered.length === 0) return spatialTextPlan.shown
    const shown = new Set(spatialTextPlan.shown)
    for (const text of covered) shown.delete(text.key)
    return shown
  }, [spatialTextPlan, visibleLabels])

  const fit = useCallback(() => {
    setView(fitGraphBounds(graphBounds, viewport, undefined, overlayRef.current))
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
  }, [fitSignal, layoutBounds])

  useEffect(() => {
    if (!cameraCommand) return
    if (cameraCommand.type === 'zoom-in' || cameraCommand.type === 'zoom-out') {
      // A step, not a target: this effect re-runs when the layout or viewport
      // changes, and replaying the step then would zoom again on every resize.
      if (handledZoomNonceRef.current === cameraCommand.nonce) return
      handledZoomNonceRef.current = cameraCommand.nonce
      autoFitRef.current = false
      const factor = cameraCommand.type === 'zoom-in' ? 1 / ZOOM_STEP : ZOOM_STEP
      setView(current => zoomAroundCenter(current, factor))
      return
    }
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
    const next = fitNodeIds(layout, ids, viewport, overlayRef.current)
    if (next) {
      autoFitRef.current = false
      setView(next)
    }
  }, [cameraCommand, fit, layout, viewport])

  useEffect(() => { onCameraChange?.(view) }, [view, onCameraChange])
  useEffect(() => { onZoomLevelChange?.(reportedZoomLevel) }, [reportedZoomLevel, onZoomLevelChange])

  useEffect(() => {
    const viewportKey = `${viewport.width}x${viewport.height}`
    const contextKey = graphCameraPreservationKey(viewport, inspectorOpen, selectedId, selectedNeighborhood)
    if (handledCameraContextRef.current === contextKey) return
    const viewportChanged = handledViewportRef.current !== viewportKey
    handledViewportRef.current = viewportKey
    handledCameraContextRef.current = contextKey
    if (spatialLayout && viewportChanged && autoFitRef.current) {
      // Nobody has moved the spatial camera since it fitted: a new canvas size re-fits the level,
      // still keeping a selection clear of the sheet and the page's overlays.
      const fitted = fitGraphBounds(graphBounds, viewport, undefined, overlayRef.current)
      setView(selectedNeighborhood.size > 0
        ? preserveSelectedNeighborhoodCamera(fitted, layout, selectedNeighborhood, selectedId, viewport, inspectorOpen, overlayRef.current, inspectorSheet)
        : fitted)
    } else if (selectedNeighborhood.size > 0 && (viewportChanged || sheetPresentation)) {
      setView(current => preserveSelectedNeighborhoodCamera(
        current,
        layout,
        selectedNeighborhood,
        selectedId,
        viewport,
        inspectorOpen,
        overlayRef.current,
        inspectorSheet,
      ))
    } else if (selectedNeighborhood.size === 0 && viewportChanged && autoFitRef.current) {
      fit()
    }
  }, [viewport, selectedId, selectedNeighborhood, layout, fit, inspectorOpen, spatialLayout, graphBounds, inspectorSheet, sheetPresentation])

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
    setView(current => zoomAroundCenter(current, factor))
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
    if (event.key === '+' || event.key === '=') { event.preventDefault(); changeZoom(1 / ZOOM_STEP) }
    else if (event.key === '-') { event.preventDefault(); changeZoom(ZOOM_STEP) }
    else if (event.key === '0') { event.preventDefault(); fit() }
    else if (event.key === '/') { event.preventDefault(); onSearchRequest?.() }
    else if (event.key === 'Escape') {
      event.preventDefault()
      if (onEscape) onEscape()
      else onSelect(null)
    }
    else if (event.key.toLowerCase() === 'f' && selectedNeighborhood.size > 0) {
      event.preventDefault()
      const next = fitNodeIds(layout, selectedNeighborhood, viewport, overlayRef.current)
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
      data-appearance={appearance === 'dark' ? undefined : appearance}
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
      data-layout={spatialLayout ? 'spatial' : undefined}
      data-spatial-level={spatialLayout?.level}
      data-spatial-aspect={spatialLayout?.aspect}
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
        {spatialLayout && <SpatialDefs />}
      </defs>

      {spatialLayout && (
        <SpatialFields layout={spatialLayout} visibleIds={structurallyVisibleIds} />
      )}
      {spatialLayout && spatial && (
        <AtlasLinks
          atlas={spatialLayout.atlas}
          layout={layout}
          visibleIds={structurallyVisibleIds}
          visual={spatial.atlasLinkVisual}
        />
      )}

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
          const visual = edgeVisual ? edgeVisual(edgeValue, getEdgeVisual(edgeValue)) : getEdgeVisual(edgeValue)
          const isHot = highlighted?.edgeIds.has(edgeValue.id) ?? false
          // Spatial views state project membership by placement. A hub's line to an agent is drawn only
          // while that agent is the focus — never as a fan of every agent around a selected hub.
          if (spatialLayout && edgeValue.relation === 'CONTAINS' && nodeById.get(edgeValue.target)?.kind === 'agent'
            && (selectedId ?? hoverId ?? focusId) !== edgeValue.target) return null
          const readability = getEdgeReadability({
            edge: edgeValue,
            visual,
            zoomLevel: edgeZoomLevel,
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
          if (spatialLayout && (spatialLayout.roles.get(edgeValue.source) === 'context' || spatialLayout.roles.get(edgeValue.target) === 'context') && !isHot) return null
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

      {spatialLayout && spatial && (
        <RunClusters
          clusters={spatialLayout.clusters}
          nodeById={nodeById}
          visibleIds={structurallyVisibleIds}
          textsShown={spatialTextsShown}
          highlightedIds={highlighted?.ids ?? null}
          scale={labelScale}
          copy={spatial.copy}
          onSelect={onSelect}
          movedRef={movedRef}
        />
      )}
      {spatialLayout && spatial && (
        <UnlinkedBands
          bands={spatialLayout.unlinkedBands}
          visibleIds={structurallyVisibleIds}
          textsShown={spatialTextsShown}
          scale={labelScale}
          copy={spatial.copy}
        />
      )}

      <g>
        {(spatialLayout ? spatialRenderOrder(nodes, spatialLayout) : nodes).map(node => {
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
          const hub = spatialLayout && node.kind === 'project' ? spatialLayout.hubs.find(entry => entry.nodeId === node.id) : undefined
          const spatialRole = spatialLayout?.roles.get(node.id)
          const baseOpacity = isHot ? (semanticState === 'dimmed' ? 0.42 : 1) : filterDimmed ? 0.12 : 0.22
          return (
            <g
              key={node.id}
              ref={element => {
                if (element) nodeRefs.current.set(node.id, element)
                else nodeRefs.current.delete(node.id)
              }}
              transform={spatialLayout ? undefined : `translate(${position.x},${position.y})`}
              style={spatialLayout ? { transform: `translate(${position.x}px, ${position.y}px)` } : undefined}
              opacity={spatialRole === 'context' ? (isSelected ? 1 : Math.min(baseOpacity, 0.36)) : baseOpacity}
              className={cn(styles.node, spatialLayout && styles.spatialNode, 'cursor-pointer focus:outline-none')}
              data-spatial-role={spatialRole}
              tabIndex={0}
              role="button"
              aria-label={hub && spatial
                ? `${node.kind}: ${node.label} · ${spatial.copy.hubDescription(hub)}`
                : `${node.kind}: ${node.label}${node.status ? ` (${node.status})` : ''}`}
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
              {spatialLayout ? (
                <g className={styles.spatialAppear}>
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
                  {hub ? (
                    <HubGlyph hub={hub} scale={labelScale} selected={isSelected} showSubtext={spatialTextsShown?.has(`hub-subtext:${hub.nodeId}`) ?? true} />
                  ) : (
                    <>
                      {status && <StatusRing shape={visual.shape} radius={position.r} status={status} />}
                      <NodeGlyph node={node} visual={visual} radius={position.r} fill={fill} selected={isSelected} />
                      {status && <StatusBadge radius={position.r} status={status} />}
                    </>
                  )}
                </g>
              ) : (
                <>
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
                </>
              )}
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

      {spatialLayout && spatial && (
        <AtlasOrb
          atlas={spatialLayout.atlas}
          scale={labelScale}
          label={spatial.copy.atlasLabel}
          description={spatial.copy.atlasDescription}
          onActivate={spatial.onAtlasActivate}
        />
      )}
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

// ─── Spatial rendering (vNext Live Operations only) ─────────────────────────

const SPATIAL_ROLE_ORDER: Record<string, number> = {
  context: 0, satellite: 1, run: 2, detail: 3, structure: 4, hub: 5, anchor: 6,
}

/** Paint order for the spatial view: context first, detail under structure, hubs on top (book ¶503). */
function spatialRenderOrder(nodes: readonly IntelligenceGraphNode[], layout: SpatialLayout): IntelligenceGraphNode[] {
  return [...nodes].sort((a, b) => (SPATIAL_ROLE_ORDER[layout.roles.get(a.id) ?? ''] ?? -1) - (SPATIAL_ROLE_ORDER[layout.roles.get(b.id) ?? ''] ?? -1)
    || canonicalKindOrder(b.kind) - canonicalKindOrder(a.kind)
    || a.id.localeCompare(b.id))
}

const CLUSTER_STATUS_COLORS: Record<string, string> = {
  done: GRAPH_VISUAL_TOKENS.status.completed,
  completed: GRAPH_VISUAL_TOKENS.status.completed,
  running: GRAPH_VISUAL_TOKENS.status.running,
  failed: GRAPH_VISUAL_TOKENS.status.failed,
  awaiting_approval: GRAPH_VISUAL_TOKENS.status.waiting,
  pending: GRAPH_VISUAL_TOKENS.status.waiting,
  cancelled: GRAPH_VISUAL_TOKENS.status.cancelled,
}

function SpatialDefs() {
  return (
    <>
      <radialGradient id="ig-atlas-halo">
        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.32} />
        <stop offset="58%" stopColor="#8b5cf6" stopOpacity={0.1} />
        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
      </radialGradient>
      <radialGradient id="ig-atlas-energy" cx="44%" cy="38%" r="62%">
        <stop offset="0%" stopColor="#eef2ff" stopOpacity={0.92} />
        <stop offset="34%" stopColor="#818cf8" stopOpacity={0.6} />
        <stop offset="74%" stopColor="#6d28d9" stopOpacity={0.38} />
        <stop offset="100%" stopColor="#1e1b4b" stopOpacity={0.3} />
      </radialGradient>
      <radialGradient id="ig-atlas-core">
        <stop offset="0%" stopColor="#ffffff" stopOpacity={1} />
        <stop offset="62%" stopColor="#e0e7ff" stopOpacity={0.85} />
        <stop offset="100%" stopColor="#a5b4fc" stopOpacity={0} />
      </radialGradient>
    </>
  )
}

/** A soft field under each hub: separation by space and light, not by dashed borders. */
function SpatialFields({ layout, visibleIds }: { layout: SpatialLayout; visibleIds: ReadonlySet<string> }) {
  return (
    <g aria-hidden="true" pointerEvents="none">
      {layout.hubs.map((hub, index) => {
        if (hub.orbit === 'receded' || !visibleIds.has(hub.nodeId)) return null
        const id = `ig-hub-field-${index}`
        const radius = hub.orbit === 'focus' ? hub.r * 6.2 : hub.r * 3.1
        const strength = hub.orbit === 'calm' ? 0.07 : 0.13
        return (
          <g key={hub.nodeId} className={styles.spatialNode} style={{ transform: `translate(${hub.x}px, ${hub.y}px)` }}>
            <defs>
              <radialGradient id={id}>
                <stop offset="0%" stopColor={hub.color} stopOpacity={strength} />
                <stop offset="100%" stopColor={hub.color} stopOpacity={0} />
              </radialGradient>
            </defs>
            <circle r={radius} fill={`url(#${id})`} />
          </g>
        )
      })}
    </g>
  )
}

/** Derived links from Atlas to the hubs it may link to — drawn only between visible ends. */
function AtlasLinks({
  atlas, layout, visibleIds, visual,
}: {
  atlas: SpatialAtlasOrb
  layout: ReadonlyMap<string, PositionedNode>
  visibleIds: ReadonlySet<string>
  visual?: Pick<GraphEdgeVisual, 'stroke' | 'opacity' | 'dash' | 'width'>
}) {
  const stroke = visual?.stroke ?? '#a5b4fc'
  const opacity = (visual?.opacity ?? 0.3) * (atlas.receded ? 0.55 : 1)
  return (
    <g aria-hidden="true" pointerEvents="none" data-atlas-links={atlas.linkedHubIds.length}>
      {atlas.linkedHubIds.map(id => {
        const hub = layout.get(id)
        if (!hub || !visibleIds.has(id)) return null
        const dx = hub.x - atlas.x
        const dy = hub.y - atlas.y
        const distance = Math.hypot(dx, dy)
        if (distance <= atlas.r + hub.r + 12) return null
        const ux = dx / distance
        const uy = dy / distance
        return (
          <line
            key={id}
            x1={atlas.x + ux * (atlas.r + 8)}
            y1={atlas.y + uy * (atlas.r + 8)}
            x2={hub.x - ux * (hub.r + 10)}
            y2={hub.y - uy * (hub.r + 10)}
            stroke={stroke}
            strokeOpacity={opacity}
            strokeWidth={visual?.width ?? 1.2}
            strokeDasharray={visual?.dash}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )
      })}
    </g>
  )
}

function RunClusters({
  clusters, nodeById, visibleIds, textsShown, highlightedIds, scale, copy, onSelect, movedRef,
}: {
  clusters: readonly SpatialRunCluster[]
  nodeById: ReadonlyMap<string, IntelligenceGraphNode>
  visibleIds: ReadonlySet<string>
  textsShown: ReadonlySet<string> | null
  highlightedIds: ReadonlySet<string> | null
  scale: number
  copy: GraphSpatialOptions['copy']
  onSelect: (node: IntelligenceGraphNode | null) => void
  movedRef: React.MutableRefObject<boolean>
}) {
  return (
    <g>
      {clusters.map(cluster => {
        if (!visibleIds.has(cluster.parentId)) return null
        const parent = nodeById.get(cluster.parentId)
        const dimmed = highlightedIds !== null && !highlightedIds.has(cluster.parentId)
        const circumference = Math.PI * 2 * cluster.r
        let offset = 0
        const segments = cluster.distribution.map(entry => {
          const length = (circumference * entry.count) / Math.max(1, cluster.count)
          const segment = { status: entry.status, length, offset }
          offset += length
          return segment
        })
        const countSize = Math.max(8.5 * scale, cluster.r * (cluster.count >= 100 ? 0.74 : 0.92))
        const captionSize = 9.5 * scale
        return (
          <g
            key={cluster.id}
            className={cn(styles.cluster, styles.spatialNode)}
            style={{ transform: `translate(${cluster.x}px, ${cluster.y}px)` }}
            opacity={dimmed ? 0.28 : 1}
            data-cluster-kind={cluster.kind}
            data-cluster-count={cluster.count}
            onClick={event => {
              event.stopPropagation()
              if (!movedRef.current && parent) onSelect(parent)
            }}
          >
            <title>{copy.clusterDescription(cluster, parent?.label ?? '')}</title>
            <g className={styles.spatialAppear}>
              <circle r={cluster.r + 3 * scale} fill="var(--ig-canvas)" fillOpacity={0.88} />
              <circle r={cluster.r} fill="none" stroke="var(--ig-label-muted)" strokeOpacity={0.3} strokeWidth={0.9 * scale} />
              {segments.map(segment => (
                <circle
                  key={segment.status}
                  r={cluster.r}
                  fill="none"
                  stroke={CLUSTER_STATUS_COLORS[segment.status] ?? GRAPH_VISUAL_TOKENS.status.cancelled}
                  strokeOpacity={0.78}
                  strokeWidth={2.2 * scale}
                  strokeDasharray={`${Math.max(0, segment.length - 0.8 * scale)} ${circumference}`}
                  strokeDashoffset={-segment.offset}
                  transform="rotate(-90)"
                />
              ))}
              <text className={styles.clusterCount} textAnchor="middle" y={countSize * 0.36} fontSize={countSize}>
                {copy.clusterCount(cluster)}
              </text>
              {(textsShown?.has(`cluster-caption:${cluster.id}`) ?? true) && (
                <text className={styles.clusterCaption} textAnchor="middle" y={cluster.r + captionSize * 1.45} fontSize={captionSize}>
                  {copy.clusterCaption(cluster)}
                </text>
              )}
            </g>
          </g>
        )
      })}
    </g>
  )
}

function UnlinkedBands({
  bands, visibleIds, textsShown, scale, copy,
}: {
  bands: readonly SpatialUnlinkedBand[]
  visibleIds: ReadonlySet<string>
  textsShown: ReadonlySet<string> | null
  scale: number
  copy: GraphSpatialOptions['copy']
}) {
  return (
    <g aria-hidden="true" pointerEvents="none">
      {bands.map(band => {
        if (!band.memberIds.some(id => visibleIds.has(id)) || !(textsShown?.has(`band:${band.id}`) ?? true)) return null
        const [first, second] = copy.unlinkedAgents(band.count)
        const size = 10.5 * scale
        return (
          <text
            key={band.id}
            className={cn(styles.bandCaption, styles.spatialNode)}
            style={{ transform: `translate(${band.x}px, ${band.y}px)` }}
            textAnchor={bandAnchor(band)}
            fontSize={size}
            data-band-count={band.count}
          >
            <tspan x={0} dy={-size * 0.2}>{first}</tspan>
            <tspan x={0} dy={size * 1.25}>{second}</tspan>
          </text>
        )
      })}
    </g>
  )
}

function HubGlyph({ hub, scale, selected, showSubtext }: { hub: SpatialHub; scale: number; selected: boolean; showSubtext: boolean }) {
  const receded = hub.orbit === 'receded'
  const strength = receded ? 0.55 : hub.orbit === 'calm' ? 0.62 : 1
  const nameSize = (receded ? 11 : hub.orbit === 'focus' ? 15 : 13.5) * scale
  const subtextSize = 10.5 * scale
  return (
    <g data-hub-orbit={hub.orbit}>
      {!receded && <circle r={hub.r + 10} fill={hub.color} fillOpacity={0.07 * strength} />}
      <circle
        r={hub.r}
        fill={hub.color}
        fillOpacity={0.08 + 0.2 * strength}
        stroke={selected ? GRAPH_VISUAL_TOKENS.status.selected : hub.color}
        strokeOpacity={selected ? 1 : 0.75 * strength}
        strokeWidth={selected ? 1.8 : 1.2}
        vectorEffect="non-scaling-stroke"
        className={styles.identity}
      />
      <circle
        r={hub.r * 0.84}
        fill="none"
        stroke={hub.color}
        strokeOpacity={0.42 * strength}
        strokeWidth={hub.r * 0.035}
        strokeDasharray={`${(hub.r * 0.3).toFixed(2)} ${(hub.r * 0.13).toFixed(2)}`}
      />
      <circle r={hub.r * 0.6} fill="var(--ig-canvas)" fillOpacity={0.4} />
      <text
        className={styles.hubMonogram}
        textAnchor="middle"
        y={hub.r * 0.2}
        fontSize={hub.r * 0.56}
        fillOpacity={0.5 + 0.5 * strength}
      >
        {hub.monogram}
      </text>
      {!receded && (
        <text className={styles.hubName} textAnchor="middle" y={hub.r + nameSize * 1.4} fontSize={nameSize} fontWeight={650}>
          {hub.label}
        </text>
      )}
      {!receded && showSubtext && (
        <text className={styles.hubSubtext} textAnchor="middle" y={hub.r + nameSize * 1.4 + subtextSize * 1.5} fontSize={subtextSize}>
          {hub.subtext}
        </text>
      )}
    </g>
  )
}

/**
 * Atlas, the identity orb. Not a node of the snapshot: it has no status, no
 * inspector and no data behind its light. Its slow breathing is identity
 * motion only and stands down with reduced motion (book ¶208).
 */
function AtlasOrb({
  atlas, scale, label, description, onActivate,
}: {
  atlas: SpatialAtlasOrb
  scale: number
  label: string
  description: string
  onActivate?: () => void
}) {
  const labelSize = (atlas.receded ? 11.5 : 15) * scale
  return (
    <g
      className={cn(styles.atlas, styles.spatialNode)}
      style={{ transform: `translate(${atlas.x}px, ${atlas.y}px)` }}
      opacity={atlas.receded ? 0.6 : 1}
      data-atlas={atlas.receded ? 'receded' : 'core'}
      role="button"
      tabIndex={0}
      aria-label={`${label}. ${description}`}
      onClick={event => { event.stopPropagation(); onActivate?.() }}
      onKeyDown={event => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        event.stopPropagation()
        onActivate?.()
      }}
    >
      <title>{`${label} — ${description}`}</title>
      <g className={styles.atlasBreath} aria-hidden="true">
        <circle r={atlas.r * 2.05} fill="url(#ig-atlas-halo)" />
        <circle r={atlas.r * 1.42} fill="url(#ig-atlas-halo)" />
      </g>
      <circle r={atlas.r * 1.12} fill="none" stroke={GRAPH_VISUAL_TOKENS.status.selected} strokeWidth={1.6} vectorEffect="non-scaling-stroke" className={styles.atlasFocus} />
      <circle r={atlas.r} fill="url(#ig-atlas-energy)" />
      <circle r={atlas.r} fill="none" stroke="#a5b4fc" strokeOpacity={0.62} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <circle r={atlas.r * 0.7} fill="none" stroke="#c4b5fd" strokeOpacity={0.3} strokeWidth={0.9} vectorEffect="non-scaling-stroke" />
      <circle r={atlas.r * 0.26} fill="url(#ig-atlas-core)" />
      {!atlas.receded && (
        <text className={styles.atlasLabel} textAnchor="middle" y={atlas.r + labelSize * 1.55} fontSize={labelSize} fontWeight={650}>
          {label}
        </text>
      )}
    </g>
  )
}


