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
 * CANVAS FIRST (Phase 18 T2a). The page is exactly as tall as the shell leaves
 * it, and the canvas takes everything the header and the one control row do
 * not. What describes the view — place, scope, filters, zoom, legend — lives on
 * the canvas; the inspector is a right panel whose width the operator sets, and
 * which can be put away without losing the selection. The shell's floating
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
import type { IntelligenceGraphEdge } from '@/lib/intelligence/graph-contract'
import { GraphCanvas, type GraphSpatialOptions } from '@/components/platform/intelligence/GraphCanvas'
import { classifySpatialAspect, type SpatialAnchor } from '@/components/platform/intelligence/spatial-layout'
import type { GraphEdgeVisual } from '@/components/platform/intelligence/graph-visuals'
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
import styles from './IntelligenceGraphVNext.module.css'

/** Line style carries how certain a relation is; colour and width stay the relation's own. */
export function truthEdgeVisual(edge: IntelligenceGraphEdge, visual: GraphEdgeVisual): GraphEdgeVisual {
  const stroke = RELATION_TRUTH_STROKE[relationTruth(edge)]
  return { ...visual, dash: stroke.dash, opacity: visual.opacity * stroke.opacityScale }
}

const REPLAY_UNAVAILABLE = 'Kräver händelsedata per steg, som Omnira inte registrerar ännu.'

const GRAPH_ABOUT = 'Hur Omnira hänger ihop — ritat enbart ur data som finns, med källan synlig för varje koppling.'

/** What the spatial Live Operations view adds to the explanation — its two rules, in the product's words. */
const SPATIAL_ABOUT = `${GRAPH_ABOUT} Atlas i mitten är Omniras identitet, inte en datanod; linjerna från Atlas går bara till projekt du äger. Projekt utan körningar i fönstret och utan aktivt workflow ligger på den yttre, lugnare banan. Körningar räknas per workflow — en körning visas för sig när den kör, väntar eller har misslyckats, när du väljer den, eller när du fördjupar dig i dess workflow.`

/** The legend line for Atlas's links: derived from the caller owning the project, never stored. */
const ATLAS_LINK_RELATION = 'Atlas → projekt du äger (ägarskap)'

function runStatusWords(status: string): string {
  return nodeStatus({ kind: 'run', status })?.label.toLowerCase() ?? status
}

const SPATIAL_COPY: GraphSpatialOptions['copy'] = {
  atlasLabel: 'Atlas',
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
  clusterDescription: (cluster, parentLabel) => {
    const distribution = cluster.distribution.map(entry => `${entry.count} ${runStatusWords(entry.status)}`).join(', ')
    if (cluster.kind === 'older') return `${parentLabel}: ${cluster.count} äldre körningar i fönstret (${distribution})`
    if (cluster.kind === 'no-workflow') return `${cluster.count} körningar utan workflow-referens (${distribution})`
    return `${parentLabel}: ${cluster.count} ${cluster.count === 1 ? 'körning' : 'körningar'} i fönstret (${distribution})`
  },
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
  const dockRef = useRef<HTMLDivElement>(null)
  const inspectorRef = useRef<HTMLElement>(null)
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

  const renderedWidth = clampInspectorWidth(inspectorWidth, stageRem)
  const widthMax = inspectorMaxWidth(stageRem)
  const inspectorVisible = Boolean(selected) && hiddenFor !== selected?.id

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

  const showInspector = useCallback(() => {
    setHiddenFor(null)
    requestAnimationFrame(() => inspectorRef.current?.focus())
  }, [])

  // ── What is on screen ──────────────────────────────────────────────────────
  const canvasMode = mode === 'operations' ? 'operations' : 'system'
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
      data-resizing={resizing ? 'true' : undefined}
    >
      <div className={styles.ambient} aria-hidden />

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
        />

        {/* ── Canvas + inspector ── */}
        <div ref={stageRef} className={styles.stage} data-inspector={inspectorVisible ? 'open' : 'closed'}>
          <div className={styles.canvasFrame} data-testid="graph-canvas-frame">
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

            {graphVisible && (
              <div className={styles.canvas}>
                <GraphCanvas
                  nodes={nodes}
                  edges={edges}
                  selectedId={selected?.id ?? null}
                  onSelect={node => { setSelected(node); if (!node) setSearchResultId(null) }}
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
                  overlayInsets={overlayInsets}
                  spatial={spatial}
                />
              </div>
            )}


            {graphVisible && (
              <div className={styles.zoomDock}>
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
            {payloadIsCurrent && graphVisible && (
              <GraphLegend entries={legend} snapshotNote={snapshotNote} about={canvasMode === 'operations' ? SPATIAL_ABOUT : GRAPH_ABOUT} />
            )}
          </div>

          {selected && inspectorVisible && (
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
                onClose={() => setSelected(null)}
                onHide={hideInspector}
                onSelectNeighbor={setSelected}
                onDrillIn={drillIn}
                onIsolate={isolateNode}
                onFocus={node => setCameraCommand({ nonce: Date.now(), type: 'fit-node', nodeIds: [node.id] })}
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
