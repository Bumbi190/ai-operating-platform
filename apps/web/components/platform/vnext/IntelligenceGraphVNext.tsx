'use client'

/**
 * Intelligence Graph — vNext.
 *
 * The same graph the legacy surface draws, in the vNext shell, saying no more
 * than its data supports.
 *
 * ONE IMPLEMENTATION OF THE GRAPH. Fetching, search, drilldown, isolate, Back,
 * filters and URL state come from `useIntelligenceGraph` — the hook the legacy
 * client runs too — and the canvas is the same `GraphCanvas`. Navigation cannot
 * drift between generations because there is only one copy of it. What this
 * file adds is presentation and three statements the legacy page never made:
 *
 *  - WHAT THE DATA IS. Live Operations is a snapshot: the server stamps
 *    `meta.generatedAt` when it builds the response, and that time is shown.
 *    Nothing refreshes it except the operator pressing Uppdatera, which repeats
 *    the same GET. There is no timer, no polling and no claim of "live".
 *  - HOW CERTAIN A RELATION IS. Edges are drawn and worded by their source —
 *    a stored reference, a current definition or a derivation — through
 *    `lib/os/intelligence-graph-shared.ts`, which can lower a class but never
 *    raise one. The API keys are untouched.
 *  - WHAT A COUNT COVERS. The snapshot box counts this payload and names the
 *    run window; the legend's explanation names the builder's cap and which
 *    rows only appear through a run.
 *
 * SYNCHRONIZED PRESENTATIONS (Phase 18 T3a). One graph snapshot backs both the
 * canvas and list. Desktop opens on canvas; phones open list-first. The page is
 * exactly as tall as the shell leaves it, and its presentation takes everything
 * the header and control rows do not. The inspector is a right panel whose width
 * the operator sets, and a full-stage list detail on phones. The shell's floating
 * Atlas launcher and activity peek own the bottom-right corner of the viewport,
 * so nothing interactive here is placed under them (see the stylesheet).
 *
 * No Atlas node and no Atlas edge: Atlas is this page's identity, not a datum
 * the graph has a source for.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { IntelligenceGraphEdge, IntelligenceGraphNode } from '@/lib/intelligence/graph-contract'
import { GraphCanvas, type GraphChromeRect, type GraphSpatialOptions } from '@/components/platform/intelligence/GraphCanvas'
import { classifySpatialAspect, projectMonogram, type SpatialAnchor } from '@/components/platform/intelligence/spatial-layout'
import { nodeColor, projectAccent, type GraphEdgeVisual } from '@/components/platform/intelligence/graph-visuals'
import { TIME_FILTERS, useIntelligenceGraph } from '@/components/platform/intelligence/useIntelligenceGraph'
import {
  INSPECTOR_WIDTH,
  INSPECTOR_WIDTH_STORAGE_KEY,
  OPERATIONS_RUN_CAP,
  RELATION_TRUTH_COPY,
  RELATION_TRUTH_STROKE,
  ZOOM_LEVEL_LABELS,
  clampInspectorWidth,
  graphLocation,
  nodeStatus,
  inspectorMaxWidth,
  parseStoredInspectorWidth,
  relationLegend,
  relationTruth,
  relationWording,
  snapshotCounts,
  snapshotFigures,
  snapshotStamp,
} from '@/lib/os/intelligence-graph-shared'
import { IntelligenceGraphControls } from './IntelligenceGraphControls'
import { GraphLegend, GraphPlace, SnapshotSummary } from './IntelligenceGraphHud'
import { IntelligenceGraphInspector } from './IntelligenceGraphInspector'
import { IntelligenceGraphList, type IntelligenceGraphListHandle } from './IntelligenceGraphList'
import styles from './IntelligenceGraphVNext.module.css'

/** Line style carries how certain a relation is; colour and width stay the relation's own. */
export function truthEdgeVisual(edge: IntelligenceGraphEdge, visual: GraphEdgeVisual): GraphEdgeVisual {
  const stroke = RELATION_TRUTH_STROKE[relationTruth(edge)]
  return { ...visual, dash: stroke.dash, opacity: visual.opacity * stroke.opacityScale }
}

const REPLAY_UNAVAILABLE = 'Kräver händelsedata per steg, som Omnira inte registrerar ännu.'

const GRAPH_ABOUT = 'Hur Omnira hänger ihop — ritat enbart ur data som finns, med källan synlig för varje koppling.'

/** What the spatial Live Operations view adds to the explanation — its two rules, in the product's words. */
const SPATIAL_ABOUT = `${GRAPH_ABOUT} Atlas i mitten är Omniras identitet, inte en datanod; linjerna från Atlas går bara till projekt du äger. Projekt utan körningar i fönstret och utan aktivt workflow ligger på den yttre, lugnare banan. Körningar räknas per workflow — en körning visas för sig när den kör, väntar eller har misslyckats, när du väljer den, eller när du fördjupar dig i dess workflow. På en bredare skärm visar översikten ett urval av högst tre workflows per projekt, med antalet körningar under namnet: först de vars körningar visas för sig, sedan de med flest körningar i fönstret och aktiva före inaktiva; lika viktiga sprids runt projektet. Antalen under projektet räknar alla — zooma in eller fördjupa dig i projektet för resten.`

/** The legend line for Atlas's links: derived from the caller owning the project, never stored. */
const ATLAS_LINK_RELATION = 'Atlas → projekt du äger (ägarskap)'

function runStatusWords(status: string): string {
  return nodeStatus({ kind: 'run', status })?.label.toLowerCase() ?? status
}

const SPATIAL_COPY: GraphSpatialOptions['copy'] = {
  atlasLabel: 'Atlas',
  atlasSubtitle: 'Omniras identitet',
  atlasDescription: 'Omniras identitet, inte en datanod. Linjerna från Atlas går till projekt du äger. Aktivera för översikten.',
  clusterCount: cluster => (cluster.kind === 'older' ? `+${cluster.count}` : String(cluster.count)),
  clusterCaption: cluster => (cluster.kind === 'older'
    ? 'äldre'
    : cluster.kind === 'no-workflow'
      ? 'utan workflow'
      : cluster.count === 1 ? 'körning' : 'körningar'),
  unlinkedAgents: count => [`${count} ${count === 1 ? 'agent' : 'agenter'}`, 'som inget workflow nämner'] as const,
  hubDescription: hub => (hub.orbit === 'calm'
    ? `${hub.subtext} · inga körningar i fönstret och inget aktivt workflow`
    : hub.subtext),
  previewCaption: (shown, total) => `Visar ${shown} av ${total} ${total === 1 ? 'workflow' : 'workflows'}`,
  clusterDescription: (cluster, parentLabel) => {
    const distribution = cluster.distribution.map(entry => `${entry.count} ${runStatusWords(entry.status)}`).join(', ')
    const statuses = distribution ? ` (${distribution})` : ''
    if (cluster.kind === 'older') return `${parentLabel}: ${cluster.count} äldre körningar i fönstret${statuses}`
    if (cluster.kind === 'no-workflow') return `${cluster.count} körningar utan workflow-referens${statuses}`
    return `${parentLabel}: ${cluster.count} ${cluster.count === 1 ? 'körning' : 'körningar'} i fönstret${statuses}`
  },
  statusWord: node => nodeStatus(node)?.label.toLowerCase() ?? null,
}

/**
 * One row of controls on the canvas, edge inset included: 0.625rem from the
 * edge, a 2rem control, 0.5rem of air. The stylesheet places `.hudTop`,
 * `.zoomDock` and `.legend` on the same measures.
 */
const HUD_ROW_REM = 3.125

/** The root font size in px — rem is what the display-scale preference changes. */
function rootFontPx(): number {
  if (typeof window === 'undefined') return 16
  const value = parseFloat(window.getComputedStyle(document.documentElement).fontSize)
  return Number.isFinite(value) && value > 0 ? value : 16
}

export function IntelligenceGraphVNext() {
  // The fullscreen target is the whole page body — header included — so the
  // snapshot's time and Uppdatera stay on screen in fullscreen too (book ¶751).
  const fieldRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasFrameRef = useRef<HTMLDivElement>(null)
  const floatProbeRef = useRef<HTMLSpanElement>(null)
  const dockRef = useRef<HTMLDivElement>(null)
  const inspectorRef = useRef<HTMLElement>(null)
  const listRef = useRef<IntelligenceGraphListHandle>(null)
  const showInspectorRef = useRef<HTMLButtonElement>(null)
  const zoomSequence = useRef(0)
  const graph = useIntelligenceGraph()
  const {
    cameraRef,
    navigationHistory,
    mode,
    communityId,
    projectFilter,
    setProjectFilter,
    hours,
    data,
    loading,
    error,
    selected,
    setSelected,
    fitSignal,
    setFitSignal,
    drillScope,
    isolateScope,
    cameraCommand,
    setCameraCommand,
    zoomLevel,
    setZoomLevel,
    searchResultId,
    setSearchResultId,
    nodes,
    edges,
    filterState,
    dimmedIds,
    dimmedEdgeIds,
    filtersActive,
    query,
    visibleHits,
    selectedEdges,
    neighborNodes,
    drillIn,
    isolateNode,
    exitIsolate,
    goBack,
    clearFilters,
    handleEscape,
    refresh,
    unavailable,
  } = graph
  const [fullscreen, setFullscreen] = useState(false)
  const [presentationOverride, setPresentationOverride] = useState<'canvas' | 'list' | null>(null)
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)
  const [mobileListDetail, setMobileListDetail] = useState(false)
  const [canvasFocusSignal, setCanvasFocusSignal] = useState(0)

  useEffect(() => {
    const handleFullscreenChange = () => setFullscreen(document.fullscreenElement === fieldRef.current)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const toggleFullscreen = useCallback(async () => {
    const element = fieldRef.current
    if (!element || typeof document === 'undefined') return
    try {
      if (document.fullscreenElement === element) await document.exitFullscreen()
      else await element.requestFullscreen()
    } catch {
      // Browser/platform denial leaves graph selection and camera untouched.
    }
  }, [])

  const zoom = useCallback((type: 'zoom-in' | 'zoom-out') => {
    zoomSequence.current += 1
    setCameraCommand({ nonce: zoomSequence.current, type })
  }, [setCameraCommand])

  // ── Inspector panel: width and visibility ──────────────────────────────────
  // `inspectorWidth` is the operator's preference; what renders is that
  // preference clamped to the stage on screen, so a narrow window never
  // squeezes the canvas and a wide one gives the preference back.
  const [inspectorWidth, setInspectorWidth] = useState<number>(INSPECTOR_WIDTH.default)
  const [stageRem, setStageRem] = useState(0)
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const [rootPx, setRootPx] = useState(16)
  // Below 768px the zoom controls move to the canvas's top edge (see the stylesheet).
  const [narrow, setNarrow] = useState(false)
  const [tablet, setTablet] = useState(false)
  const [resizing, setResizing] = useState(false)
  // The selection whose panel was put away. Selecting anything else opens it again.
  const [hiddenFor, setHiddenFor] = useState<string | null>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; startRem: number; rootPx: number; stageRem: number; latest: number } | null>(null)

  useEffect(() => {
    try {
      const stored = parseStoredInspectorWidth(window.localStorage.getItem(INSPECTOR_WIDTH_STORAGE_KEY))
      if (stored !== null) setInspectorWidth(stored)
    } catch {
      // Storage unavailable: the default width stands.
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const query = window.matchMedia('(min-width: 768px) and (max-width: 1023px)')
    const update = () => setTablet(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const measure = () => {
      const px = rootFontPx()
      setRootPx(px)
      setStageRem(stage.clientWidth / px)
      setStageSize(current => current.width === stage.clientWidth && current.height === stage.clientHeight
        ? current
        : { width: stage.clientWidth, height: stage.clientHeight })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!selected) setHiddenFor(null)
  }, [selected])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const query = window.matchMedia('(max-width: 767px)')
    const update = () => setNarrow(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  const presentation: 'canvas' | 'list' = mode === 'operations'
    ? presentationOverride ?? (narrow ? 'list' : 'canvas')
    : 'canvas'

  useEffect(() => {
    if (!selected) setMobileListDetail(false)
  }, [selected])

  useEffect(() => {
    if (!narrow || presentation !== 'list') setMobileListDetail(false)
  }, [narrow, presentation])

  useEffect(() => {
    if (!searchResultId || selected?.id !== searchResultId) return
    setActiveNodeId(searchResultId)
    if (narrow && presentation === 'list') setMobileListDetail(true)
  }, [narrow, presentation, searchResultId, selected])

  const changePresentation = useCallback((next: 'canvas' | 'list') => {
    setPresentationOverride(next)
    setMobileListDetail(false)
    const nodeId = activeNodeId ?? selected?.id ?? null
    if (!nodeId) return
    if (next === 'canvas') {
      setCameraCommand({ nonce: Date.now(), type: 'fit-node', nodeIds: [nodeId] })
    } else {
      requestAnimationFrame(() => listRef.current?.focusNode(nodeId))
    }
  }, [activeNodeId, selected, setCameraCommand])

  const selectFromList = useCallback((node: IntelligenceGraphNode) => {
    setActiveNodeId(node.id)
    setHiddenFor(null)
    setSelected(node)
    setSearchResultId(null)
    if (narrow) setMobileListDetail(true)
  }, [narrow, setSearchResultId, setSelected])

  const backToList = useCallback(() => {
    const nodeId = selected?.id ?? activeNodeId
    setMobileListDetail(false)
    if (nodeId) requestAnimationFrame(() => listRef.current?.focusNode(nodeId, { scroll: false }))
  }, [activeNodeId, selected])

  const renderedWidth = clampInspectorWidth(inspectorWidth, stageRem)
  const widthMax = inspectorMaxWidth(stageRem)
  const inspectorVisible = Boolean(selected) && hiddenFor !== selected?.id
  const inspectorRendered = inspectorVisible && (presentation !== 'list' || !narrow || mobileListDetail)

  // On a phone, a drilled level opens with its own inspector put away: the sheet would cover the
  // level just opened. The selection stays, and "Visa inspektören" brings the panel back.
  const drillRootId = drillScope?.rootId ?? null
  useEffect(() => {
    if (narrow && drillRootId && selected?.id === drillRootId) setHiddenFor(drillRootId)
    // Only a new drill-down (or becoming narrow) puts it away — never the operator's own choice to show it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narrow, drillRootId])

  const commitInspectorWidth = useCallback((rem: number) => {
    setInspectorWidth(rem)
    try {
      window.localStorage.setItem(INSPECTOR_WIDTH_STORAGE_KEY, String(rem))
    } catch {
      // A width that cannot be remembered still applies to this visit.
    }
  }, [])

  const onResizePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !dockRef.current || !stageRef.current) return
    const rootPx = rootFontPx()
    const startRem = dockRef.current.getBoundingClientRect().width / rootPx
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startRem,
      rootPx,
      stageRem: stageRef.current.clientWidth / rootPx,
      latest: startRem,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
    setResizing(true)
  }, [])

  const onResizePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    // The panel is on the right: moving the handle left widens it.
    const next = clampInspectorWidth(drag.startRem + (drag.startX - event.clientX) / drag.rootPx, drag.stageRem)
    if (next === drag.latest) return
    drag.latest = next
    // Straight to the element while dragging; React hears about it once, on release.
    dockRef.current?.style.setProperty('--ig-inspector-width', `${next}rem`)
  }, [])

  const onResizePointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    setResizing(false)
    commitInspectorWidth(drag.latest)
  }, [commitInspectorWidth])

  const onResizeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? INSPECTOR_WIDTH.largeStep : INSPECTOR_WIDTH.step
    let next: number | null = null
    if (event.key === 'ArrowLeft') next = renderedWidth + step
    else if (event.key === 'ArrowRight') next = renderedWidth - step
    else if (event.key === 'Home') next = INSPECTOR_WIDTH.min
    else if (event.key === 'End') next = widthMax
    if (next === null) return
    event.preventDefault()
    commitInspectorWidth(clampInspectorWidth(next, stageRem))
  }, [commitInspectorWidth, renderedWidth, stageRem, widthMax])

  const hideInspector = useCallback(() => {
    if (!selected) return
    setHiddenFor(selected.id)
    // The panel's buttons are gone; focus goes to the control that brings it back.
    requestAnimationFrame(() => showInspectorRef.current?.focus())
  }, [selected])

  const closeInspector = useCallback(() => {
    const returnTo = selected?.id ?? activeNodeId
    setSelected(null)
    if (tablet && returnTo) {
      setActiveNodeId(returnTo)
      requestAnimationFrame(() => setCanvasFocusSignal(value => value + 1))
    }
  }, [activeNodeId, selected, setSelected, tablet])

  const showInspector = useCallback(() => {
    setHiddenFor(null)
    requestAnimationFrame(() => inspectorRef.current?.focus())
  }, [])

  // ── What is on screen ──────────────────────────────────────────────────────
  const canvasMode = mode === 'operations' ? 'operations' : 'system'
  const tabletOverlay = canvasMode === 'operations' && tablet && presentation === 'canvas'
  const selectedNodeId = selected?.id ?? null
  useEffect(() => {
    if (!tabletOverlay || !inspectorRendered || !selectedNodeId) return
    const frame = requestAnimationFrame(() => inspectorRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [tabletOverlay, inspectorRendered, selectedNodeId])
  // While a new mode loads, the previous payload is still in state. Nothing is
  // stamped, counted or explained from a payload that is not this mode's.
  const payloadIsCurrent = Boolean(data?.meta && data.meta.source === (canvasMode === 'operations' ? 'runtime' : 'graphify'))
  const graphVisible = !error && !unavailable && nodes.length > 0

  const stamp = useMemo(() => {
    if (mode === 'replay') return null
    if (error && !loading) {
      return { label: canvasMode === 'operations' ? 'Ögonblicksbild · hämtningen misslyckades' : 'Kodkartan kunde inte hämtas', detail: null }
    }
    if (!payloadIsCurrent || unavailable) return null
    return snapshotStamp(canvasMode, data?.meta)
  }, [canvasMode, data, error, loading, mode, payloadIsCurrent, unavailable])

  const counts = useMemo(() => snapshotCounts(nodes), [nodes])
  const searchHitIds = useMemo(() => new Set(visibleHits.map(hit => hit.id)), [visibleHits])
  const listScopeNodeIds = isolateScope?.nodeIds ?? drillScope?.nodeIds ?? null
  // ── Spatial Live Operations ──────────────────────────────────────────────────
  // The drill-down decides the level; an agent opens its project. The aspect class
  // comes from the stage — which the inspector does not resize — less the constant
  // HUD bands, so opening a panel or a filter never re-lays the graph.
  const spatialAnchor = useMemo<SpatialAnchor>(() => {
    if (!drillScope) return { level: 'portfolio' }
    if (drillScope.kind === 'project' && drillScope.projectId) return { level: 'project', projectId: drillScope.projectId }
    if (drillScope.kind === 'workflow') return { level: 'workflow', workflowId: drillScope.rootId }
    if (drillScope.kind === 'run') return { level: 'run', runId: drillScope.rootId }
    const root = nodes.find(node => node.id === drillScope.rootId)
    return root?.projectId ? { level: 'project', projectId: root.projectId } : { level: 'portfolio' }
  }, [drillScope, nodes])
  const spatialAspect = classifySpatialAspect(stageSize.width, stageSize.height - 2 * HUD_ROW_REM * rootPx)
  const atlasLinked = spatialAnchor.level === 'portfolio' || spatialAnchor.level === 'project'

  const legend = useMemo(() => {
    const entries = relationLegend(edges)
    if (canvasMode !== 'operations' || !atlasLinked) return entries
    // The Atlas links are drawn in the derived style, so the legend names them as derived.
    const derived = entries.find(entry => entry.truth === 'derived')
    if (derived) return entries.map(entry => (entry === derived ? { ...entry, relations: [...entry.relations, ATLAS_LINK_RELATION] } : entry))
    return [...entries, { truth: 'derived' as const, ...RELATION_TRUTH_COPY.derived, relations: [ATLAS_LINK_RELATION] }]
  }, [edges, canvasMode, atlasLinked])
  // The isolation has its own chip beside the place, so the place does not repeat it.
  const location = graphLocation(canvasMode, communityId, drillScope?.label ?? null, null)
  const windowLabel = TIME_FILTERS.find(filter => filter.hours === hours)?.label ?? `${hours} h`
  const runCount = counts.items.find(item => item.kind === 'run')?.value ?? 0
  const showBack = communityId !== null || Boolean(drillScope) || Boolean(isolateScope) || navigationHistory.current.length > 0
  const figures = payloadIsCurrent && !unavailable && !error ? snapshotFigures(canvasMode, counts) : null
  const scopedProject = canvasMode === 'operations' && projectFilter !== 'all'
    ? data?.projects?.find(project => project.id === projectFilter)?.name ?? 'valt projekt'
    : null

  // What the canvas's own corners cover. The place row shows only when it has
  // something to say; zoom and the legend sit along the bottom (zoom moves to
  // the top on a narrow screen). The canvas keeps nodes out of these bands.
  const placeShown = showBack
    || location.length > 1
    || Boolean(isolateScope)
    || Boolean(scopedProject)
    || filtersActive
    || filterState.criticalOutsideFilters > 0
    || Boolean(data?.truncated && mode === 'system')
    || Boolean(selected && !inspectorVisible)
  const spatial = useMemo<GraphSpatialOptions | undefined>(() => (canvasMode === 'operations'
    ? {
      anchor: spatialAnchor,
      aspect: spatialAspect,
      onAtlasActivate: () => {
        if (drillScope || isolateScope) graph.resetView()
        else setFitSignal(value => value + 1)
      },
      atlasLinkVisual: { stroke: '#a5b4fc', opacity: 0.34, dash: RELATION_TRUTH_STROKE.derived.dash, width: 1.2 },
      copy: SPATIAL_COPY,
    }
    : undefined), [canvasMode, spatialAnchor, spatialAspect, drillScope, isolateScope, graph.resetView, setFitSignal])

  // What lies over the canvas, in canvas px: its own controls (the place row item by item, the zoom
  // dock, the legend bar) and the shell's floating corner. Texts keep out of it and receded context
  // gives way to it; the camera does not move for it. Measured, because a phone wraps the place row.
  const [chromeRects, setChromeRects] = useState<ReadonlyArray<GraphChromeRect>>([])
  const measureChrome = useCallback(() => {
    const frame = canvasFrameRef.current
    const probe = floatProbeRef.current
    if (!frame || !probe || typeof window === 'undefined') return
    // In the canvas's own px: the drawing surface sits inside the frame's border.
    const canvas = (frame.querySelector('svg[role="group"]') ?? frame).getBoundingClientRect()
    const clipped = (left: number, top: number, right: number, bottom: number): GraphChromeRect | null => {
      const x1 = Math.max(left, canvas.left)
      const y1 = Math.max(top, canvas.top)
      const x2 = Math.min(right, canvas.right)
      const y2 = Math.min(bottom, canvas.bottom)
      return x2 > x1 && y2 > y1
        ? { x: Math.floor(x1 - canvas.left), y: Math.floor(y1 - canvas.top), width: Math.ceil(x2 - x1), height: Math.ceil(y2 - y1) }
        : null
    }
    const next = [
      ...frame.querySelectorAll<HTMLElement>('[data-graph-chrome-items] > *, [data-graph-chrome]'),
    ].flatMap(element => {
      if (element.closest('[hidden]')) return []
      const box = element.getBoundingClientRect()
      const rect = box.width > 0 && box.height > 0 ? clipped(box.left, box.top, box.right, box.bottom) : null
      return rect ? [rect] : []
    })
    const corner = clipped(window.innerWidth - probe.offsetWidth, window.innerHeight - probe.offsetHeight, window.innerWidth, window.innerHeight)
    if (corner) next.push(corner)
    if (tabletOverlay && dockRef.current) {
      const box = dockRef.current.getBoundingClientRect()
      const rect = clipped(box.left, box.top, box.right, box.bottom)
      if (rect) next.push(rect)
    }
    setChromeRects(current => JSON.stringify(current) === JSON.stringify(next) ? current : next)
  }, [tabletOverlay])
  // After every render — the controls change with the place, the selection and the filters — and on resize.
  useEffect(() => { measureChrome() })
  useEffect(() => {
    const frame = canvasFrameRef.current
    if (!frame || typeof window === 'undefined') return
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measureChrome)
    observer?.observe(frame)
    window.addEventListener('resize', measureChrome)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measureChrome)
    }
  }, [measureChrome, graphVisible])

  // The selection's identity as the canvas draws it: its project's colour, and a hub's monogram.
  const selectedIdentity = useMemo(() => {
    if (!selected) return null
    const hub = selected.kind === 'project'
      ? selected
      : nodes.find(node => node.kind === 'project' && node.projectId === selected.projectId)
    return {
      accent: hub ? projectAccent(hub) : nodeColor(selected),
      monogram: selected.kind === 'project' ? projectMonogram(selected.label) : undefined,
    }
  }, [selected, nodes])

  const overlayInsets = {
    // A phone wraps the place row under the zoom controls: two rows.
    top: (narrow ? (placeShown ? 2 : 1) : placeShown ? 1 : 0) * HUD_ROW_REM * rootPx,
    bottom: HUD_ROW_REM * rootPx,
  }

  const relationName = (relation: string) => relationWording(
    edges.find(edge => edge.relation === relation) ?? { relation: relation as IntelligenceGraphEdge['relation'], metadata: {} },
  ).name

  const snapshotNote = canvasMode === 'operations'
    ? `${runCount === 0
      ? `Inga körningar skapade de senaste ${windowLabel}. `
      : `Körningar skapade de senaste ${windowLabel}, högst ${OPERATIONS_RUN_CAP} per hämtning. `}Granskningar, utdata och uppgifter visas bara när de hör till en av körningarna.`
    : null

  return (
    <div
      ref={fieldRef}
      className={styles.field}
      data-testid="intelligence-graph-vnext"
      data-mode={canvasMode}
      data-presentation={presentation}
      data-resizing={resizing ? 'true' : undefined}
      data-tablet-overlay={tabletOverlay ? 'true' : undefined}
    >
      <div className={styles.ambient} aria-hidden />
      {/* Measures the shell's floating corner (--ig-float-right × --ig-float-top) for the canvas's chrome. */}
      <span ref={floatProbeRef} className={styles.floatProbe} aria-hidden />

      <header className={styles.header}>
        {/* T1's lede — how the graph is drawn — now opens the canvas's Förklaring,
            so the title and the snapshot box share one row from 1280px. */}
        <div className={styles.headline}>
          <p className={styles.eyebrow}>Atlas Intelligence</p>
          <h1 className={styles.title}>Intelligence Graph</h1>
        </div>

        {mode !== 'replay' && (
          <SnapshotSummary
            mode={canvasMode}
            stamp={stamp}
            loading={loading}
            onRefresh={refresh}
            figures={figures}
            windowLabel={windowLabel}
            runCapReached={counts.runCapReached}
          />
        )}
      </header>

      <div className={styles.workspace}>
        <IntelligenceGraphControls
          graph={graph}
          searchInputRef={searchInputRef}
          replayUnavailable={REPLAY_UNAVAILABLE}
          relationName={relationName}
          fullscreen={fullscreen}
          onToggleFullscreen={() => { void toggleFullscreen() }}
          presentation={presentation}
          onPresentationChange={changePresentation}
        />

        {/* ── Canvas + inspector ── */}
        <div
          ref={stageRef}
          className={styles.stage}
          data-inspector={inspectorRendered ? 'open' : 'closed'}
          data-presentation={presentation}
          data-mobile-detail={narrow && presentation === 'list' && mobileListDetail ? 'open' : undefined}
          data-inspector-layout={tabletOverlay ? 'overlay' : narrow ? 'sheet' : 'docked'}
        >
          <div ref={canvasFrameRef} className={styles.canvasFrame} data-testid="graph-canvas-frame" data-presentation={presentation}>
            {loading && (
              <div className={styles.loading} role="status">
                {canvasMode === 'operations' ? 'Hämtar ögonblicksbild…' : 'Laddar kodkartan…'}
              </div>
            )}

            {error && !loading && (
              <StateMessage title="Hämtningen misslyckades" body={error} tone="error" />
            )}

            {unavailable && !loading && !error && (
              <StateMessage
                title={mode === 'system' ? 'Ingen System Map-artefakt ännu' : 'Ingen driftdata'}
                body={mode === 'system'
                  ? 'Ingen distribuerad System Map-artefakt är tillgänglig för den här versionen. Grafen är inte trasig; Graphify-generering och leverans hanteras separat.'
                  : data?.hint ?? 'Ingen data tillgänglig ännu.'}
              />
            )}

            {!loading && !error && !unavailable && nodes.length === 0 && (
              <StateMessage
                title="Tom graf"
                body={mode === 'operations'
                  ? 'Ögonblicksbilden innehåller inga noder för ditt projektscope och tidsfönster.'
                  : 'Vyn innehåller inga noder.'}
              />
            )}

            {/* Before the canvas in the document, so Tab reaches Tillbaka first. */}
            {presentation === 'canvas' && (
              <GraphPlace
                location={location}
                onBack={showBack ? goBack : null}
                projectScope={scopedProject ? { name: scopedProject, onClear: () => setProjectFilter('all') } : null}
                isolate={isolateScope ? {
                  label: isolateScope.label,
                  onExit: exitIsolate,
                  onFit: () => setCameraCommand({ nonce: Date.now(), type: 'fit-scope', nodeIds: [...isolateScope.nodeIds] }),
                } : null}
                filters={filtersActive ? { matchCount: filterState.matchCount, onClear: clearFilters } : null}
                criticalOutsideFilters={filterState.criticalOutsideFilters}
                truncatedAt={data?.truncated && mode === 'system' ? nodes.length : null}
                noMatch={!loading && graphVisible && filtersActive && filterState.matchCount === 0}
                hiddenInspector={selected && !inspectorVisible
                  ? { label: selected.label, onShow: showInspector, buttonRef: showInspectorRef }
                  : null}
              />
            )}

            {graphVisible && presentation === 'canvas' && (
              <div className={styles.canvas}>
                <GraphCanvas
                  nodes={nodes}
                  edges={edges}
                  selectedId={selected?.id ?? null}
                  onSelect={node => {
                    setSelected(node)
                    if (node) setActiveNodeId(node.id)
                    else setSearchResultId(null)
                  }}
                  activeNodeId={activeNodeId}
                  focusSignal={canvasFocusSignal}
                  onFocusNode={node => setActiveNodeId(node.id)}
                  onOpen={drillIn}
                  fitSignal={fitSignal}
                  mode={canvasMode}
                  semanticContext={drillScope?.kind === 'run' ? 'execution' : communityId !== null || drillScope ? 'detail' : 'auto'}
                  dimmedIds={dimmedIds}
                  dimmedEdgeIds={dimmedEdgeIds}
                  isolatedIds={isolateScope?.nodeIds ?? (drillScope?.kind === 'run' ? drillScope.nodeIds : null)}
                  inspectorOpen={inspectorVisible}
                  inspectorSheet={narrow}
                  searchResultId={searchResultId}
                  cameraCommand={cameraCommand}
                  onCameraChange={view => { cameraRef.current = view }}
                  onZoomLevelChange={setZoomLevel}
                  onSearchRequest={() => searchInputRef.current?.focus()}
                  onIsolate={isolateNode}
                  onEscape={handleEscape}
                  appearance="vnext"
                  edgeVisual={truthEdgeVisual}
                  edgeTruth={canvasMode === 'operations' ? relationTruth : undefined}
                  overlayInsets={overlayInsets}
                  spatial={spatial}
                  chromeRects={canvasMode === 'operations' ? chromeRects : undefined}
                  releaseAccessibility={canvasMode === 'operations'}
                  manualCameraGuard={canvasMode === 'operations'}
                />
              </div>
            )}

            {graphVisible && presentation === 'list' && (
              <IntelligenceGraphList
                ref={listRef}
                nodes={nodes}
                edges={edges}
                projects={data?.projects ?? []}
                selectedId={selected?.id ?? null}
                activeNodeId={activeNodeId}
                dimmedIds={dimmedIds}
                dimmedEdgeIds={dimmedEdgeIds}
                searchHitIds={searchHitIds}
                scopeNodeIds={listScopeNodeIds}
                filtersActive={filtersActive}
                matchCount={filterState.matchCount}
                query={query}
                onSelect={selectFromList}
                onFocusNode={node => setActiveNodeId(node.id)}
              />
            )}

            {graphVisible && presentation === 'canvas' && (
              <div className={styles.zoomDock} data-graph-chrome>
                <div className={styles.zoomGroup} role="group" aria-label="Zoom">
                  <button type="button" className={styles.zoomStep} onClick={() => zoom('zoom-out')} aria-label="Zooma ut">−</button>
                  <button type="button" className={styles.zoomFit} onClick={() => setFitSignal(x => x + 1)}>Anpassa</button>
                  <button type="button" className={styles.zoomStep} onClick={() => zoom('zoom-in')} aria-label="Zooma in">+</button>
                </div>
                <span className={styles.zoomLevel} data-testid="graph-zoom-level">
                  Nivå: {ZOOM_LEVEL_LABELS[zoomLevel] ?? zoomLevel}
                </span>
              </div>
            )}

            {/* ── How to read the lines, and what the snapshot covers ── */}
            {payloadIsCurrent && graphVisible && presentation === 'canvas' && (
              <GraphLegend entries={legend} snapshotNote={snapshotNote} about={canvasMode === 'operations' ? SPATIAL_ABOUT : GRAPH_ABOUT} />
            )}
          </div>

          {selected && inspectorRendered && (
            <div
              ref={dockRef}
              className={styles.inspectorDock}
              data-testid="graph-inspector-dock"
              style={{ '--ig-inspector-width': `${renderedWidth}rem` } as CSSProperties}
            >
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Inspektörens bredd"
                aria-valuemin={INSPECTOR_WIDTH.min}
                aria-valuemax={widthMax}
                aria-valuenow={renderedWidth}
                aria-valuetext={`${renderedWidth} rem`}
                tabIndex={0}
                className={styles.resizeHandle}
                title="Dra för att ändra bredd · dubbelklicka för standardbredd"
                onPointerDown={onResizePointerDown}
                onPointerMove={onResizePointerMove}
                onPointerUp={onResizePointerEnd}
                onPointerCancel={onResizePointerEnd}
                onKeyDown={onResizeKeyDown}
                onDoubleClick={() => commitInspectorWidth(clampInspectorWidth(INSPECTOR_WIDTH.default, stageRem))}
                data-testid="graph-inspector-resize"
              />
              <IntelligenceGraphInspector
                ref={inspectorRef}
                node={selected}
                edges={selectedEdges}
                neighbors={neighborNodes}
                meta={payloadIsCurrent ? data?.meta : undefined}
                mode={canvasMode}
                onClose={closeInspector}
                onHide={hideInspector}
                overlay={tabletOverlay}
                onEscape={tabletOverlay ? hideInspector : undefined}
                onSelectNeighbor={node => { setActiveNodeId(node.id); setSelected(node) }}
                onDrillIn={drillIn}
                onIsolate={isolateNode}
                onFocus={node => {
                  setActiveNodeId(node.id)
                  setPresentationOverride('canvas')
                  setMobileListDetail(false)
                  setCameraCommand({ nonce: Date.now(), type: 'fit-node', nodeIds: [node.id] })
                }}
                identity={canvasMode === 'operations' ? selectedIdentity ?? undefined : undefined}
                listBack={narrow && presentation === 'list' ? { label: 'Tillbaka till listan', onBack: backToList } : undefined}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Small atoms ─────────────────────────────────────────────────────────────

function StateMessage({ title, body, tone = 'default' }: { title: string; body: string; tone?: 'default' | 'error' }) {
  return (
    <div className={styles.state} data-tone={tone}>
      <p className={styles.stateTitle}>{title}</p>
      <p className={styles.stateBody}>{body}</p>
    </div>
  )
}
