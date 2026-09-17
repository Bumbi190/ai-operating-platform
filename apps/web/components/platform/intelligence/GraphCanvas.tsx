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
  type GraphLabelPlacement,
  type GraphOverlayInsets,
  type GraphScreenText,
  type GraphViewBox,
  type GraphZoomLevel,
} from './graph-readability'
import { buildDenseViewSummaries } from './graph-navigation'
import type { PositionedNode } from './force-layout'
import {
  PORTFOLIO_REVEAL,
  PROJECT_REVEAL,
  computeSpatialLayout,
  previewsAtOverview,
  spatialClusterShown,
  spatialDensityLevel,
  spatialEdgeLevel,
  spatialNodeVisibility,
  spatialReportedLevel,
  type SpatialAnchor,
  type SpatialAspect,
  type SpatialAtlasOrb,
  type SpatialLayout,
  type SpatialRunCluster,
} from './spatial-layout'
import { SPATIAL_NARROW_CANVAS, spatialScreenTexts, type SpatialCopy, type SpatialText } from './spatial-text'
import { AGENT_NAMES_AT_OVERVIEW, partialPreviews, planSpatialLabels, previewNameScreenTexts } from './spatial-labels'
import {
  AgentGlyph,
  AtlasCore,
  CLUSTER_STATUS_COLORS,
  HubFields,
  ProjectHubGlyph,
  RunClusterGlyph,
  RunGlyph,
  SatelliteGlyph,
  SpatialLabelLayer,
  SpatialSceneDefs,
  WorkflowGlyph,
  clearSpatialEdgePath,
  identityColour,
  projectColours,
} from './spatial-scene'
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
  /** Optional presentation bridge: focus this exact existing node when the canvas mounts. */
  activeNodeId?: string | null
  /** Reports keyboard focus without changing graph selection. */
  onFocusNode?: (node: IntelligenceGraphNode) => void
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
  /**
   * Spatial view only: canvas px rectangles the page's chrome lies over — its
   * controls on the canvas and the shell's floating corner. Texts keep out of
   * them and receded context gives way to them; the camera does not move for them.
   */
  chromeRects?: ReadonlyArray<GraphChromeRect>
  className?: string
}

/** A rectangle of the canvas, in px from its top left corner. */
export interface GraphChromeRect { x: number; y: number; width: number; height: number }

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
/** A fit gives previewed workflows' names room while the previews widen the overview's view by at most this share. */
const PREVIEW_NAME_ROOM = 0.1
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
  activeNodeId = null,
  onFocusNode,
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
  chromeRects,
  className,
}: GraphCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const nodeRefs = useRef(new Map<string, SVGGElement>())
  // A spatial view opens already fitted to its level, so the first paint — and the server's markup — frames it.
  const [view, setView] = useState<GraphViewBox>(() => spatial
    ? initialSpatialView(nodes, edges, spatial, overlayInsets)
    : { x: 0, y: 0, w: WORLD_W, h: WORLD_H })
  const [viewport, setViewport] = useState({ width: WORLD_W, height: WORLD_H })
  const [viewportMeasured, setViewportMeasured] = useState(false)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; view: GraphViewBox } | null>(null)
  const movedRef = useRef(false)
  const autoFitRef = useRef(true)
  const handledViewportRef = useRef(`${WORLD_W}x${WORLD_H}`)
  const handledInspectorRef = useRef(inspectorOpen)
  const handledCameraContextRef = useRef(`${WORLD_W}x${WORLD_H}:closed::`)
  // A zoom command already in state when this canvas mounts was issued to an
  // earlier instance; it is treated as handled rather than replayed.
  const handledZoomNonceRef = useRef<number | null>(
    cameraCommand && (cameraCommand.type === 'zoom-in' || cameraCommand.type === 'zoom-out') ? cameraCommand.nonce : null,
  )

  useEffect(() => {
    if (!activeNodeId) return
    nodeRefs.current.get(activeNodeId)?.focus()
  }, [activeNodeId])

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
  const sheetPresentation = inspectorSheet ?? viewport.width < 768
  // A spatial view fits above an open mobile sheet, so nothing it frames lies under the panel.
  const sheetInsetPx = spatial && inspectorOpen && sheetPresentation ? Math.min(viewport.height * 0.48, 384) : 0
  // The sheet covers the page's bottom controls too: the band is whichever reaches higher.
  const overlayBottomPx = Math.max(0, overlayInsets?.bottom ?? 0, sheetInsetPx)
  // Read by the camera when it next fits; a new value alone moves nothing.
  const overlayRef = useRef<GraphOverlayInsets | undefined>(undefined)
  overlayRef.current = overlayTopPx > 0 || overlayBottomPx > 0 ? { top: overlayTopPx, bottom: overlayBottomPx } : undefined
  const forceBounds = useMemo(
    () => spatialLayout ? null : calculateGraphBounds(layout, territories),
    [layout, territories, spatialLayout],
  )
  // The portfolio previews each project's workflows where the page has room: not where the inspector is a sheet
  // (a phone, whose overview stays compact), and not before the canvas is measured, so the server's markup and
  // the first paint are the compact overview on every screen.
  const previewing = spatialLayout?.level === 'portfolio' && viewportMeasured && !sheetPresentation
  // A spatial fit also holds the level's own names and counts, which are drawn at screen size.
  const narrowCanvas = viewport.width < SPATIAL_NARROW_CANVAS
  const spatialTexts = useMemo(
    () => spatialLayout && spatial ? spatialScreenTexts(spatialLayout, spatial.copy, { narrow: narrowCanvas, preview: previewing }) : [],
    [spatialLayout, spatial, narrowCanvas, previewing],
  )
  // A narrow canvas opening a project with many agents frames the project's core; its agents come with zoom.
  const compactAgents = useMemo(() => {
    if (!spatialLayout || !narrowCanvas || spatialLayout.level !== 'project' || !spatialLayout.anchorId) return false
    const projectId = nodes.find(node => node.id === spatialLayout.anchorId)?.projectId
    return nodes.filter(node => node.kind === 'agent' && node.projectId === projectId).length > AGENT_NAMES_AT_OVERVIEW
  }, [spatialLayout, narrowCanvas, nodes])
  const nodeById = useMemo(() => new Map(nodes.map(node => [node.id, node])), [nodes])
  const spatialBounds = useMemo(() => {
    if (!spatialLayout) return null
    const texts = framedSpatialTexts(spatialLayout, spatialTexts).filter(text => !compactAgents || text.kind !== 'band')
    const fitted = (core: GraphBounds, more: readonly GraphScreenText[] = []) => boundsWithScreenText(core, [...texts, ...more], viewport, undefined, overlayRef.current)
    if (!previewing || !spatial) return fitted(compactAgents ? projectCoreBounds(spatialLayout, nodes) : spatialLayout.fitBounds)
    // The previews widen the frame: always for their workflows, and for their names while the whole widens the overview's
    // view by at most PREVIEW_NAME_ROOM. On a narrower canvas — a docked inspector's — names drawn at screen size would
    // shrink the overview until hub names give way; there a previewed name without room is left out instead.
    const width = (bounds: GraphBounds) => fitGraphBounds(bounds, viewport, undefined, overlayRef.current).w
    const overview = boundsWithScreenText(spatialLayout.fitBounds, texts.filter(text => text.kind !== 'hub-preview'), viewport, undefined, overlayRef.current)
    const named = fitted(spatialLayout.preview.fitBounds, previewNameScreenTexts(spatialLayout, nodeById, spatial.copy))
    return width(named) <= width(overview) * (1 + PREVIEW_NAME_ROOM) ? named : fitted(spatialLayout.preview.fitBounds)
  }, [spatialLayout, spatialTexts, viewport, compactAgents, nodes, previewing, spatial, nodeById])
  const graphBounds = spatialBounds ?? forceBounds!
  // Changes only with the layout itself — and with whether its previews show; a new canvas size re-fits through the camera context instead.
  const layoutBounds = spatialLayout ? (previewing ? spatialLayout.preview.fitBounds : spatialLayout.fitBounds) : graphBounds

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
        compactAgents,
        preview: previewing,
      })
      : getNodeSemanticVisibility(node, {
        level: zoomLevel,
        mode,
        selectedId,
        focusId,
        searchResultId,
        neighborIds: semanticNeighborIds,
      }),
  ])), [nodes, zoomLevel, mode, selectedId, focusId, searchResultId, semanticNeighborIds, spatialLayout, spatialDepth, executionContext, compactAgents, previewing])
  // The page's chrome over the canvas, in world units.
  const chromeBoxes = useMemo(() => (spatialLayout ? chromeRects ?? [] : []).map(rect => ({
    minX: view.x + (rect.x / Math.max(1, viewport.width)) * view.w,
    minY: view.y + (rect.y / Math.max(1, viewport.height)) * view.h,
    maxX: view.x + ((rect.x + rect.width) / Math.max(1, viewport.width)) * view.w,
    maxY: view.y + ((rect.y + rect.height) / Math.max(1, viewport.height)) * view.h,
  })), [spatialLayout, chromeRects, view, viewport])
  // An open mobile sheet ends the canvas: the scene is drawn above it, never through it.
  const sheetTop = spatialLayout && sheetInsetPx > 0 ? view.y + view.h * (1 - (sheetInsetPx + 2) / Math.max(1, viewport.height)) : null
  // Receded context — Atlas and the projects around a drilled view — gives way to the page's chrome
  // and to the sheet instead of showing around their edges; the level's own structure is framed clear of both.
  const contextClear = useCallback((x: number, y: number, reach: number) => (sheetTop === null || y + reach <= sheetTop)
    && !chromeBoxes.some(box => circleMeetsBox({ x, y, r: reach }, box)), [sheetTop, chromeBoxes])
  const sheetClip = sheetTop !== null ? 'url(#ig-sheet-clip)' : undefined
  const atlasShown = !spatialLayout || !spatialLayout.atlas.receded
    || contextClear(spatialLayout.atlas.x, spatialLayout.atlas.y, spatialLayout.atlas.r * 1.5)
  // Keyed by content: a camera frame that changes nothing drawn keeps the same set, so what derives
  // from it (line obstacles and routes) is not recomputed while the operator pans or zooms.
  const visibleKey = nodes.filter(node => {
    if (semanticVisibility.get(node.id) === 'hidden' || (isolatedIds && !isolatedIds.has(node.id))) return false
    if (spatialLayout?.roles.get(node.id) !== 'context') return true
    const position = layout.get(node.id)
    return !position || contextClear(position.x, position.y, position.r + 9)
  }).map(node => node.id).join('\u0000')
  const structurallyVisibleIds = useMemo(() => new Set(visibleKey ? visibleKey.split('\u0000') : []), [visibleKey])
  // While the overview previews workflows, a workflow's run count is said under its name; its ring comes with zoom.
  const countsUnderNames = spatialLayout !== null && previewsAtOverview(spatialLayout, { depth: spatialDepth, preview: previewing })
  const shownClusters = useMemo(
    () => spatialLayout ? spatialLayout.clusters.filter(cluster => spatialClusterShown(cluster, structurallyVisibleIds, countsUnderNames)) : [],
    [spatialLayout, structurallyVisibleIds, countsUnderNames],
  )
  // What each hub's preview leaves out — said under its counts and in its accessible name.
  const previewNotes = useMemo(
    () => spatialLayout && previewing ? partialPreviews(spatialLayout, nodeById, structurallyVisibleIds) : new Map<string, { shown: number; total: number }>(),
    [spatialLayout, previewing, nodeById, structurallyVisibleIds],
  )
  const summaries = useMemo(
    () => spatialLayout ? [] : buildDenseViewSummaries(nodes, edges, zoomLevel),
    [nodes, edges, zoomLevel, spatialLayout],
  )
  const summaryByParent = useMemo(() => new Map(summaries.map(summary => [summary.parentId, summary])), [summaries])
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
  const visibleLabels = useMemo(() => spatialLayout ? new Map<string, GraphLabelPlacement>() : new Map(
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
  ), [nodes, layout, view, viewport, mode, zoomLevel, selectedId, hoverId, focusId, searchResultId, semanticNeighborIds, structurallyVisibleIds, reservedBoxes, territoryLabelBoxes, spatialLayout])

  // ── The spatial view's texts: one deterministic plan (spatial-labels.ts) ──
  // A drilled project is the view itself: its selection neither labels it again nor names all it contains.
  const labelSelection = spatialLayout && selectedId !== null && selectedId === spatialLayout.anchorId ? null : selectedId
  const spatialLabels = useMemo(() => spatialLayout && spatial
    ? planSpatialLabels({
      layout: spatialLayout,
      nodeById,
      visibleIds: structurallyVisibleIds,
      copy: spatial.copy,
      view,
      viewport,
      reserved: [...reservedBoxes, ...chromeBoxes],
      depth: spatialDepth,
      selectedId: labelSelection,
      hoverId,
      focusId,
      searchResultId,
      neighborIds: labelSelection ? selectedNeighborhood : undefined,
      preview: previewing,
    })
    : null, [spatialLayout, spatial, nodeById, structurallyVisibleIds, view, viewport, reservedBoxes, chromeBoxes, spatialDepth, labelSelection, hoverId, focusId, searchResultId, selectedNeighborhood, previewing])
  const colours = useMemo(() => spatialLayout ? projectColours(spatialLayout) : new Map<string, string>(), [spatialLayout])
  // What a line keeps clear of: every circle drawn, so a line never passes through a node it does not touch.
  const lineObstacles = useMemo(() => spatialLayout
    ? spatialLineObstacles(spatialLayout, structurallyVisibleIds, shownClusters, atlasShown)
    : [], [spatialLayout, structurallyVisibleIds, shownClusters, atlasShown])
  // A line's path depends on the layout and what is drawn, never on the camera; each is found once.
  const spatialPaths = useMemo(() => new Map<string, string | null>(), [lineObstacles])
  const labelDimmed = useCallback((ownerId: string) => {
    if (!spatialLayout || ownerId === 'atlas') return false
    const cluster = spatialLayout.clusters.find(entry => entry.id === ownerId)
    const band = cluster ? undefined : spatialLayout.unlinkedBands.find(entry => entry.id === ownerId)
    const owners = cluster ? [cluster.parentId] : band ? band.memberIds : [ownerId]
    if (highlighted && !owners.some(id => highlighted.ids.has(id))) return true
    return owners.every(id => dimmedIds.has(id))
  }, [spatialLayout, highlighted, dimmedIds])

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
        setViewportMeasured(true)
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
    if (spatialLayout && cameraCommand.type === 'fit-node') {
      // A spatial view shows a found or focused node among what it touches, and never dives past the
      // depth at which its level already shows everything: the node keeps its place in the whole.
      const touched = edges.flatMap(edge => ids.has(edge.source) ? [edge.target] : ids.has(edge.target) ? [edge.source] : [])
      for (const id of touched) if (spatialLayout.roles.get(id) !== 'context') ids.add(id)
      const next = fitNodeIds(layout, ids, viewport, overlayRef.current)
      if (!next) return
      const maxDepth = spatialLayout.level === 'portfolio' ? PORTFOLIO_REVEAL.satellites : PROJECT_REVEAL.satellites
      const factor = Math.max(1, spatialFitWidth / maxDepth / next.w)
      const target = layout.get(cameraCommand.nodeIds?.[0] ?? '')
      const cx = target?.x ?? next.x + next.w / 2
      const cy = target?.y ?? next.y + next.h / 2
      autoFitRef.current = false
      setView({ x: cx - (cx - next.x) * factor, y: cy - (cy - next.y) * factor, w: next.w * factor, h: next.h * factor })
      return
    }
    const next = fitNodeIds(layout, ids, viewport, overlayRef.current)
    if (next) {
      autoFitRef.current = false
      setView(next)
    }
  // The spatial fit width changes with the canvas; a new width alone replays no command.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraCommand, fit, layout, viewport])

  useEffect(() => { onCameraChange?.(view) }, [view, onCameraChange])
  useEffect(() => { onZoomLevelChange?.(reportedZoomLevel) }, [reportedZoomLevel, onZoomLevelChange])

  useEffect(() => {
    const viewportKey = `${viewport.width}x${viewport.height}`
    const contextKey = graphCameraPreservationKey(viewport, inspectorOpen, selectedId, selectedNeighborhood)
    if (handledCameraContextRef.current === contextKey) return
    const viewportChanged = handledViewportRef.current !== viewportKey
    const sheetChanged = sheetPresentation && handledInspectorRef.current !== inspectorOpen
    handledViewportRef.current = viewportKey
    handledInspectorRef.current = inspectorOpen
    handledCameraContextRef.current = contextKey
    if (spatialLayout && (viewportChanged || sheetChanged) && autoFitRef.current) {
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
        {spatialLayout && <SpatialSceneDefs hubs={spatialLayout.hubs} />}
        {sheetTop !== null && (
          <clipPath id="ig-sheet-clip">
            <rect x={view.x - view.w} y={view.y - view.h} width={view.w * 3} height={Math.max(0, sheetTop - (view.y - view.h))} />
          </clipPath>
        )}
      </defs>

      {spatialLayout && (
        <g clipPath={sheetClip}>
          <HubFields layout={spatialLayout} visibleIds={structurallyVisibleIds} />
          {spatial && atlasShown && (
            <AtlasLinks
              atlas={spatialLayout.atlas}
              layout={layout}
              visibleIds={structurallyVisibleIds}
              visual={spatial.atlasLinkVisual}
              obstacles={lineObstacles}
            />
          )}
        </g>
      )}

      <g className={styles.territories} clipPath={sheetClip}>
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

      <g aria-hidden="true" clipPath={sheetClip}>
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
          if (spatialLayout) {
            let d = spatialPaths.get(edgeValue.id)
            if (d === undefined) {
              d = clearSpatialEdgePath(
                source,
                target,
                spatialEdgeCentre(spatialLayout, nodeById.get(edgeValue.source)),
                edgeValue.relation === 'CONTAINS' ? 0.05 : 0.11,
                lineObstacles.filter(circle => circle.id !== edgeValue.source && circle.id !== edgeValue.target),
              )
              spatialPaths.set(edgeValue.id, d)
            }
            if (!d) return null
            const owner = nodeById.get(edgeValue.source)
            const colour = owner ? identityColour(owner, colours) : visual.stroke
            // A selection brightens what it touches and dims the rest; nothing it does not touch disappears.
            const opacity = filterDimmed
              ? Math.min(0.05, readability.opacity)
              : isHot ? Math.max(0.85, readability.opacity) : highlighted ? readability.opacity * 0.4 : readability.opacity
            return (
              <g key={edgeValue.id} data-relation={edgeValue.relation}>
                {isHot && <path d={d} fill="none" stroke={colour} strokeOpacity={0.18} strokeWidth={5.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
                <path
                  d={d}
                  fill="none"
                  stroke={isHot ? GRAPH_VISUAL_TOKENS.edge.selected : colour}
                  strokeOpacity={opacity}
                  strokeWidth={visual.width + (isHot ? 0.6 : 0)}
                  strokeDasharray={visual.dash}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  className={styles.spatialEdge}
                />
              </g>
            )
          }
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
        <g clipPath={sheetClip}>
          <RunClusters
            clusters={shownClusters}
            nodeById={nodeById}
            visibleIds={structurallyVisibleIds}
            highlightedIds={highlighted?.ids ?? null}
            colours={colours}
            copy={spatial.copy}
            onSelect={onSelect}
            movedRef={movedRef}
            scale={view.w / Math.max(1, viewport.width)}
          />
        </g>
      )}

      <g clipPath={sheetClip}>
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
          const previewNote = hub ? previewNotes.get(node.id) : undefined
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
                ? `${node.kind}: ${node.label} · ${spatial.copy.hubDescription(hub)}${previewNote ? ` · ${spatial.copy.previewCaption(previewNote.shown, previewNote.total)}` : ''}`
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
              onFocus={() => { setFocusId(node.id); onFocusNode?.(node) }}
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
                  {hub ? (
                    <ProjectHubGlyph hub={hub} selected={isSelected} focused={isFocused} />
                  ) : node.kind === 'workflow' ? (
                    <WorkflowGlyph radius={position.r} colour={identityColour(node, colours)} inactive={node.status === 'inactive'} selected={isSelected} focused={isFocused} nodeId={node.id} />
                  ) : node.kind === 'agent' ? (
                    <AgentGlyph radius={position.r} colour={identityColour(node, colours)} selected={isSelected} focused={isFocused} nodeId={node.id} />
                  ) : node.kind === 'run' ? (
                    <RunGlyph radius={position.r} status={status} colour={identityColour(node, colours)} selected={isSelected} focused={isFocused} nodeId={node.id} />
                  ) : (
                    <SatelliteGlyph kind={node.kind} radius={position.r} status={status} selected={isSelected} focused={isFocused} nodeId={node.id} />
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

      {spatialLayout && (
        <g clipPath={sheetClip}>
          {spatial && atlasShown && (
            <AtlasCore
              atlas={spatialLayout.atlas}
              label={spatial.copy.atlasLabel}
              description={spatial.copy.atlasDescription}
              onActivate={spatial.onAtlasActivate}
            />
          )}
          {spatialLabels && (
            <SpatialLabelLayer
              placements={spatialLabels.placements}
              dimmedOwners={labelDimmed}
              attributesFor={label => label.kind === 'band'
                ? { 'data-band-count': spatialLayout.unlinkedBands.find(band => band.id === label.ownerId)?.count ?? 0 }
                : undefined}
            />
          )}
        </g>
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

/**
 * The level's own names and counts a fit keeps on the canvas: the portfolio
 * frames its hubs and Atlas, with what a preview leaves out under the counts;
 * run counts and bands inside them unfold with zoom.
 */
function framedSpatialTexts(layout: SpatialLayout, texts: readonly SpatialText[]): SpatialText[] {
  return layout.level === 'portfolio'
    ? texts.filter(text => text.kind === 'atlas' || text.kind === 'atlas-subtitle' || text.kind === 'hub-name' || text.kind === 'hub-subtext' || text.kind === 'hub-preview')
    : [...texts]
}

/** A project's core — hub, workflows, run counts and runs shown on their own — for a narrow first view. */
function projectCoreBounds(layout: SpatialLayout, nodes: readonly IntelligenceGraphNode[]): GraphBounds {
  const kinds = new Map(nodes.map(node => [node.id, node.kind]))
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  const include = (x: number, y: number, r: number) => {
    bounds.minX = Math.min(bounds.minX, x - r)
    bounds.minY = Math.min(bounds.minY, y - r)
    bounds.maxX = Math.max(bounds.maxX, x + r)
    bounds.maxY = Math.max(bounds.maxY, y + r)
  }
  for (const [id, role] of layout.roles) {
    const position = layout.positions.get(id)
    if (!position || role === 'context' || layout.aggregatedRunIds.has(id) || layout.shownWithParent.has(id)) continue
    if (role === 'structure' && kinds.get(id) === 'agent') continue
    include(position.x, position.y, position.r + 12)
  }
  for (const cluster of layout.clusters) include(cluster.x, cluster.y, cluster.r + 12)
  if (!Number.isFinite(bounds.minX)) return layout.fitBounds
  return { minX: bounds.minX - 36, minY: bounds.minY - 36, maxX: bounds.maxX + 36, maxY: bounds.maxY + 36 }
}

/** The first view of a spatial canvas: its level fitted to the default canvas, before the real one is measured. */
function initialSpatialView(
  nodes: IntelligenceGraphNode[],
  edges: IntelligenceGraphEdge[],
  spatial: GraphSpatialOptions,
  overlayInsets: GraphOverlayInsets | undefined,
): GraphViewBox {
  const layout = computeSpatialLayout({ nodes, edges, anchor: spatial.anchor, aspect: spatial.aspect })
  const viewport = { width: WORLD_W, height: WORLD_H }
  const overlay = overlayInsets && ((overlayInsets.top ?? 0) > 0 || (overlayInsets.bottom ?? 0) > 0) ? overlayInsets : undefined
  const bounds = boundsWithScreenText(layout.fitBounds, framedSpatialTexts(layout, spatialScreenTexts(layout, spatial.copy)), viewport, undefined, overlay)
  return fitGraphBounds(bounds, viewport, undefined, overlay)
}

function circleMeetsBox(circle: { x: number; y: number; r: number }, box: GraphBounds): boolean {
  const nearestX = Math.min(Math.max(circle.x, box.minX), box.maxX)
  const nearestY = Math.min(Math.max(circle.y, box.minY), box.maxY)
  return Math.hypot(circle.x - nearestX, circle.y - nearestY) < circle.r
}

interface SpatialLineObstacle { id: string; x: number; y: number; r: number }

/** Every circle the spatial view draws — nodes, run counts, Atlas — with a little room around it. */
function spatialLineObstacles(
  layout: SpatialLayout,
  visibleIds: ReadonlySet<string>,
  clusters: readonly SpatialRunCluster[],
  atlasShown: boolean,
): SpatialLineObstacle[] {
  const circles: SpatialLineObstacle[] = []
  for (const id of [...visibleIds].sort()) {
    const position = layout.positions.get(id)
    if (position) circles.push({ id, x: position.x, y: position.y, r: position.r + 3 })
  }
  for (const cluster of clusters) {
    // At its largest drawn size (`clusterDrawRadius` never exceeds 1.2×), so no camera moves a line.
    circles.push({ id: cluster.id, x: cluster.x, y: cluster.y, r: cluster.r * 1.2 + 3 })
  }
  if (atlasShown) circles.push({ id: 'atlas', x: layout.atlas.x, y: layout.atlas.y, r: layout.atlas.r * 1.12 + 3 })
  return circles
}

/** The point a relation's curve bows away from: its hub on the portfolio, the level's centre elsewhere. */
function spatialEdgeCentre(layout: SpatialLayout, source: IntelligenceGraphNode | undefined): { x: number; y: number } {
  if (layout.level === 'portfolio' && source?.projectId) {
    const hub = layout.hubs.find(entry => entry.projectId === source.projectId)
    if (hub && hub.nodeId !== source.id) return { x: hub.x, y: hub.y }
  }
  return { x: 0, y: 0 }
}

/** Derived links from Atlas to the hubs it may link to — drawn only between visible ends. */
function AtlasLinks({
  atlas, layout, visibleIds, visual, obstacles,
}: {
  atlas: SpatialAtlasOrb
  layout: ReadonlyMap<string, PositionedNode>
  visibleIds: ReadonlySet<string>
  visual?: Pick<GraphEdgeVisual, 'stroke' | 'opacity' | 'dash' | 'width'>
  obstacles: ReadonlyArray<SpatialLineObstacle>
}) {
  const stroke = visual?.stroke ?? '#a5b4fc'
  const opacity = (visual?.opacity ?? 0.3) * (atlas.receded ? 0.55 : 1)
  return (
    <g aria-hidden="true" pointerEvents="none" data-atlas-links={atlas.linkedHubIds.length}>
      {atlas.linkedHubIds.map(id => {
        const hub = layout.get(id)
        if (!hub || !visibleIds.has(id)) return null
        const d = clearSpatialEdgePath(
          { x: atlas.x, y: atlas.y, r: atlas.r * 1.12 + 4 },
          { x: hub.x, y: hub.y, r: hub.r + 8 },
          { x: atlas.x + 1, y: atlas.y + 1 },
          0.07,
          obstacles.filter(circle => circle.id !== 'atlas' && circle.id !== id),
        )
        if (!d) return null
        return (
          <path
            key={id}
            d={d}
            fill="none"
            stroke={stroke}
            strokeOpacity={opacity}
            strokeWidth={visual?.width ?? 1.2}
            strokeDasharray={visual?.dash}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            data-atlas-link={id}
          />
        )
      })}
    </g>
  )
}

function RunClusters({
  clusters, nodeById, visibleIds, highlightedIds, colours, copy, onSelect, movedRef, scale,
}: {
  clusters: readonly SpatialRunCluster[]
  nodeById: ReadonlyMap<string, IntelligenceGraphNode>
  visibleIds: ReadonlySet<string>
  highlightedIds: ReadonlySet<string> | null
  colours: ReadonlyMap<string, string>
  copy: GraphSpatialOptions['copy']
  onSelect: (node: IntelligenceGraphNode | null) => void
  movedRef: React.MutableRefObject<boolean>
  scale: number
}) {
  return (
    <g>
      {clusters.map(cluster => {
        if (!visibleIds.has(cluster.parentId)) return null
        const parent = nodeById.get(cluster.parentId)
        const dimmed = highlightedIds !== null && !highlightedIds.has(cluster.parentId)
        // The mark takes the colour of the most frequent stored status that needs attention.
        const attention = cluster.attentionCount > 0
          ? cluster.distribution.find(entry => entry.status === 'failed' || entry.status === 'awaiting_approval' || entry.status === 'pending')
          : undefined
        return (
          <g
            key={cluster.id}
            className={cn(styles.cluster, styles.spatialNode)}
            style={{ transform: `translate(${cluster.x}px, ${cluster.y}px)` }}
            data-cluster-kind={cluster.kind}
            data-cluster-count={cluster.count}
            onClick={event => {
              event.stopPropagation()
              if (!movedRef.current && parent) onSelect(parent)
            }}
          >
            <title>{copy.clusterDescription(cluster, parent?.label ?? '')}</title>
            <g className={styles.spatialAppear}>
              <RunClusterGlyph
                cluster={cluster}
                colour={parent ? identityColour(parent, colours) : '#a5b4fc'}
                count={copy.clusterCount(cluster)}
                dimmed={dimmed}
                attentionColour={attention ? CLUSTER_STATUS_COLORS[attention.status] ?? null : null}
                scale={scale}
              />
            </g>
          </g>
        )
      })}
    </g>
  )
}
