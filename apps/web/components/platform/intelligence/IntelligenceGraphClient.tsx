'use client'

/**
 * IntelligenceGraphClient — the Intelligence Graph experience.
 *
 * Three modes:
 *   System Map      — static architecture (Graphify import), progressive levels
 *                     Overview (communities) → Community (drilldown)
 *   Operations Snapshot — read-only runtime graph from real Omnira tables
 *   Execution Replay— honestly disabled (per-step event data is not granular
 *                     enough yet; see docs/intelligence-graph.md)
 *
 * All data arrives via the authenticated /api/intelligence/graph/* routes.
 * No sample data is ever fabricated: empty results render empty states.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Crosshair, Loader2, Maximize2, Minimize2, RotateCcw, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type {
  IntelligenceGraphEdge,
  IntelligenceGraphMeta,
  IntelligenceGraphNode,
  OperationsSnapshotMeta,
} from '@/lib/intelligence/graph-contract'
import { GraphCanvas, nodeColor, type GraphCameraCommand } from './GraphCanvas'
import type { GraphViewBox, GraphZoomLevel } from './graph-readability'
import {
  beginCrossCommunitySearch,
  buildGraphBreadcrumbs,
  buildDrilldownScope,
  computeGraphFilterState,
  resolveGraphNavigationIntent,
  searchScopedNodes,
  type GraphNavigationIntent,
  type GraphScope,
} from './graph-navigation'
import { parseGraphUrlState, serializeGraphUrlState } from './graph-url-state'
import { NodeInspector } from './NodeInspector'

type Mode = 'system' | 'operations' | 'replay'

interface GraphPayload {
  available?: boolean
  reason?: string
  hint?: string
  error?: string
  level?: string
  communityId?: number
  truncated?: boolean
  meta?: IntelligenceGraphMeta
  nodes?: IntelligenceGraphNode[]
  edges?: IntelligenceGraphEdge[]
  projects?: Array<{ id: string; name: string; slug: string; color: string }>
  snapshot?: OperationsSnapshotMeta
}

interface SearchHit {
  id: string
  label: string
  kind: string
  community?: number
  sourceFile?: string
  projectId?: string
  status?: string
}

interface NavigationSnapshot {
  communityId: number | null
  drillScope: GraphScope | null
  isolateScope: GraphScope | null
  selectedId: string | null
  camera: GraphViewBox
}

interface PendingNavigationResolution {
  intent: GraphNavigationIntent
  focusSelected: boolean
  markSearchResult: boolean
}

const RUN_STATUS_FILTERS = [
  { id: 'running', label: 'Kör' },
  { id: 'awaiting_approval', label: 'Väntar' },
  { id: 'failed', label: 'Fel' },
  { id: 'done', label: 'Klar' },
] as const

const TIME_FILTERS = [
  { hours: 24, label: '24 h' },
  { hours: 24 * 7, label: '7 d' },
  { hours: 24 * 30, label: '30 d' },
] as const

export type OperationsSnapshotUiState = 'loading' | 'unavailable' | 'available' | 'empty-authorized-scope' | 'empty-runs'

export function getOperationsSnapshotUiState({
  loading,
  payload,
  nodes,
}: {
  loading: boolean
  payload: GraphPayload | null
  nodes: IntelligenceGraphNode[]
}): OperationsSnapshotUiState {
  const snapshot = payload?.available === true ? payload.snapshot : undefined
  if (!snapshot) return loading ? 'loading' : 'unavailable'
  if (snapshot.authorizedProjectIds.length === 0) return 'empty-authorized-scope'
  return nodes.some(node => node.kind === 'run') ? 'available' : 'empty-runs'
}

export function getOperationsSnapshotStateCopy(state: OperationsSnapshotUiState): { title: string; body?: string } | null {
  switch (state) {
    case 'loading':
      return { title: 'Hämtar operationssnapshot…' }
    case 'unavailable':
      return {
        title: 'Operationssnapshot är inte tillgänglig.',
        body: 'Ingen bekräftad operationssnapshot finns att visa.',
      }
    case 'empty-authorized-scope':
      return { title: 'Tom operationssnapshot', body: 'Ingen operationsdata i behörig scope.' }
    case 'empty-runs':
      return { title: 'Tom operationssnapshot', body: 'Inga körningar i vald scope och tidsperiod.' }
    case 'available':
      return null
  }
}

export function shouldRenderOperationsSnapshotGraph({
  state,
  snapshot,
  nodes,
}: {
  state: OperationsSnapshotUiState
  snapshot: OperationsSnapshotMeta | undefined
  nodes: IntelligenceGraphNode[]
}): boolean {
  return state === 'available' && Boolean(snapshot) && nodes.length > 0
}

export function OperationsSnapshotStateMessage({ state }: { state: OperationsSnapshotUiState }) {
  const copy = getOperationsSnapshotStateCopy(state)
  if (!copy) return null
  return <StateMessage title={copy.title} body={copy.body ?? ''} tone={state === 'unavailable' ? 'error' : 'default'} />
}

export function formatOperationsSnapshotGeneratedAt(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const generatedAt = new Date(value)
  if (Number.isNaN(generatedAt.getTime())) return null
  return generatedAt.toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })
}

export function OperationsSnapshotStatus({ snapshot }: { snapshot: OperationsSnapshotMeta }) {
  const generatedAt = formatOperationsSnapshotGeneratedAt(snapshot.generatedAt)

  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]" role="status" aria-label="Operationssnapshotstatus">
      <span className="rounded-full border border-indigo-400/20 bg-indigo-400/10 px-2 py-0.5 text-indigo-200">Snapshot</span>
      <span className="text-slate-400">Källfärskhet: okänd</span>
      <span className="text-slate-500">Senast bekräftade snapshot: {generatedAt ?? 'okänd'}</span>
    </div>
  )
}

export function IntelligenceGraphClient() {
  const rootRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<GraphViewBox>({ x: 0, y: 0, w: 1200, h: 800 })
  const navigationHistory = useRef<NavigationSnapshot[]>([])
  const pendingRestore = useRef<NavigationSnapshot | null>(null)
  const isolateCamera = useRef<GraphViewBox | null>(null)
  const initialUrlRead = useRef(false)
  const [mode, setMode] = useState<Mode>('system')

  // System Map state
  const [communityId, setCommunityId] = useState<number | null>(null)

  // Operations Snapshot state
  const [projectFilter, setProjectFilter] = useState<string>('all')
  const [hours, setHours] = useState<number>(24)
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set())

  // Shared state
  const [data, setData] = useState<GraphPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<IntelligenceGraphNode | null>(null)
  const [fitSignal, setFitSignal] = useState(0)
  const [kindFilter, setKindFilter] = useState<Set<string>>(new Set())
  const [relationFilter, setRelationFilter] = useState<Set<string>>(new Set())
  const [drillScope, setDrillScope] = useState<GraphScope | null>(null)
  const [isolateScope, setIsolateScope] = useState<GraphScope | null>(null)
  const [cameraCommand, setCameraCommand] = useState<GraphCameraCommand | null>(null)
  const [zoomLevel, setZoomLevel] = useState<GraphZoomLevel>('portfolio')
  const [fullscreen, setFullscreen] = useState(false)
  const [searchResultId, setSearchResultId] = useState<string | null>(null)

  // Search
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searchPending, setSearchPending] = useState(false)
  const [urlHydrated, setUrlHydrated] = useState(false)
  const [navigationPending, setNavigationPending] = useState(false)
  const searchAbort = useRef<AbortController | null>(null)
  const pendingNavigation = useRef<PendingNavigationResolution | null>(null)

  const queuePendingNavigation = useCallback((pending: PendingNavigationResolution) => {
    pendingNavigation.current = pending
    setNavigationPending(true)
  }, [])

  const cancelPendingNavigation = useCallback(() => {
    pendingNavigation.current = null
    pendingRestore.current = null
    setNavigationPending(false)
  }, [])

  const url = useMemo(() => {
    if (mode === 'system') {
      return communityId === null
        ? '/api/intelligence/graph/system?level=overview'
        : `/api/intelligence/graph/system?level=community&community=${communityId}`
    }
    if (mode === 'operations') {
      const params = new URLSearchParams({ hours: String(hours) })
      if (projectFilter !== 'all') params.set('project', projectFilter)
      return `/api/intelligence/graph/operations?${params}`
    }
    return null
  }, [mode, communityId, projectFilter, hours])

  // ── Data fetch ──
  useEffect(() => {
    if (!url) return
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetch(url, { signal: controller.signal })
      .then(async res => {
        if (res.status === 401) throw new Error('Du är inte inloggad.')
        if (!res.ok) throw new Error(`Grafen kunde inte hämtas (${res.status}).`)
        return res.json() as Promise<GraphPayload>
      })
      .then(payload => {
        setData(payload)
        const restore = pendingRestore.current
        if (restore) {
          setCameraCommand({ nonce: Date.now(), type: 'restore', view: restore.camera })
          pendingRestore.current = null
        } else if (!pendingNavigation.current) {
          setSelected(null)
          setSearchResultId(null)
          setFitSignal(x => x + 1)
        }
      })
      .catch(err => {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Okänt fel.')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [url])

  // ── Search (System Map only) ──
  useEffect(() => {
    if (mode !== 'system' || query.trim().length < 2) { setHits([]); setSearchPending(false); return }
    searchAbort.current?.abort()
    const controller = new AbortController()
    searchAbort.current = controller
    setSearchPending(true)
    const t = setTimeout(() => {
      fetch(`/api/intelligence/graph/system?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
        .then(res => (res.ok ? res.json() : { hits: [] }))
        .then(payload => setHits(payload.hits ?? []))
        .catch(() => {})
        .finally(() => { if (!controller.signal.aborted) setSearchPending(false) })
    }, 200)
    return () => { clearTimeout(t); controller.abort() }
  }, [query, mode])

  // ── Filters applied client-side ──
  const allNodes = useMemo(() => data?.nodes ?? [], [data])
  const allEdges = useMemo(() => data?.edges ?? [], [data])

  const nodes = allNodes
  const edges = allEdges
  const filterState = useMemo(() => computeGraphFilterState(allNodes, {
    kinds: kindFilter,
    statuses: mode === 'operations' ? statusFilter : new Set<string>(),
  }), [allNodes, kindFilter, statusFilter, mode])
  const scopeDimmedIds = useMemo(() => {
    if (!drillScope || drillScope.kind === 'run') return new Set<string>()
    return new Set(allNodes.filter(node => !drillScope.nodeIds.has(node.id)).map(node => node.id))
  }, [allNodes, drillScope])
  const dimmedIds = useMemo(() => new Set([...filterState.dimmedIds, ...scopeDimmedIds]), [filterState.dimmedIds, scopeDimmedIds])
  const dimmedEdgeIds = useMemo(() => relationFilter.size === 0
    ? new Set<string>()
    : new Set(allEdges.filter(edge => !relationFilter.has(edge.relation)).map(edge => edge.id)),
  [allEdges, relationFilter])
  const filtersActive = kindFilter.size > 0 || relationFilter.size > 0 || statusFilter.size > 0
  const operationHits = useMemo<SearchHit[]>(() => mode === 'operations'
    ? searchScopedNodes(isolateScope ? allNodes.filter(node => isolateScope.nodeIds.has(node.id)) : allNodes, query)
      .map(node => ({ id: node.id, label: node.label, kind: node.kind, projectId: node.projectId, status: node.status }))
    : [], [mode, allNodes, isolateScope, query])
  const visibleHits = mode === 'operations' ? operationHits : hits

  const presentKinds = useMemo(() => [...new Set(allNodes.map(n => n.kind))], [allNodes])
  const presentRelations = useMemo(() => [...new Set(allEdges.map(e => e.relation))], [allEdges])

  // Inspector data for the selected node
  const selectedEdges = useMemo(
    () => (selected ? allEdges.filter(e => e.source === selected.id || e.target === selected.id) : []),
    [selected, allEdges],
  )
  const neighborNodes = useMemo(() => {
    if (!selected) return []
    const ids = new Set<string>()
    for (const e of selectedEdges) { ids.add(e.source); ids.add(e.target) }
    return allNodes.filter(n => ids.has(n.id))
  }, [selected, selectedEdges, allNodes])

  const snapshotNavigation = useCallback((): NavigationSnapshot => ({
    communityId,
    drillScope,
    isolateScope,
    selectedId: selected?.id ?? null,
    camera: cameraRef.current,
  }), [communityId, drillScope, isolateScope, selected])

  const drillIn = useCallback((node: IntelligenceGraphNode) => {
    const scope = buildDrilldownScope(node, allNodes, allEdges)
    if (!scope) return
    navigationHistory.current.push(snapshotNavigation())
    setIsolateScope(null)
    setSelected(node)
    if (node.kind === 'community' && typeof node.community === 'number' && mode === 'system') {
      setDrillScope(null)
      setCommunityId(node.community)
      return
    }
    setDrillScope(scope)
    setCameraCommand({ nonce: Date.now(), type: 'fit-scope', nodeIds: [...scope.nodeIds] })
  }, [allNodes, allEdges, mode, snapshotNavigation])

  const isolateNode = useCallback((node: IntelligenceGraphNode) => {
    const scope = buildDrilldownScope(node, allNodes, allEdges)
    if (!scope) return
    isolateCamera.current = cameraRef.current
    setIsolateScope(scope)
    setSelected(node)
    setCameraCommand({ nonce: Date.now(), type: 'fit-scope', nodeIds: [...scope.nodeIds] })
  }, [allNodes, allEdges])

  const exitIsolate = useCallback(() => {
    setIsolateScope(null)
    if (isolateCamera.current) {
      setCameraCommand({ nonce: Date.now(), type: 'restore', view: isolateCamera.current })
      isolateCamera.current = null
    }
  }, [])

  const goBack = useCallback(() => {
    if (isolateScope) {
      exitIsolate()
      return
    }
    const previous = navigationHistory.current.pop()
    if (!previous) {
      if (selected) setSelected(null)
      return
    }
    const intent: GraphNavigationIntent = {
      selectedId: previous.selectedId,
      drillId: previous.drillScope?.rootId ?? null,
      isolateId: previous.isolateScope?.rootId ?? null,
    }
    if (previous.communityId !== communityId) {
      pendingRestore.current = previous
      queuePendingNavigation({ intent, focusSelected: false, markSearchResult: false })
      setSelected(null)
      setSearchResultId(null)
      setDrillScope(null)
      setIsolateScope(null)
      setCommunityId(previous.communityId)
      return
    }
    const resolved = resolveGraphNavigationIntent(allNodes, allEdges, intent)
    setSelected(resolved.selected)
    setDrillScope(resolved.drillScope)
    setIsolateScope(resolved.isolateScope)
    setSearchResultId(null)
    setCameraCommand({ nonce: Date.now(), type: 'restore', view: previous.camera })
  }, [allEdges, allNodes, communityId, exitIsolate, isolateScope, queuePendingNavigation, selected])

  const openSearchHit = useCallback((hit: SearchHit) => {
    setQuery('')
    setHits([])
    const transition = beginCrossCommunitySearch(communityId, hit)
    if (transition) {
      // Cross-community search leaves the old transient scopes before the new
      // authorized payload resolves, so stale ids cannot empty the next graph.
      navigationHistory.current.push(snapshotNavigation())
      queuePendingNavigation({
        intent: transition.intent,
        focusSelected: true,
        markSearchResult: true,
      })
      setSelected(transition.nextSelectionId)
      setSearchResultId(null)
      setDrillScope(transition.nextDrillScope)
      setIsolateScope(transition.nextIsolateScope)
      setCommunityId(transition.targetCommunityId)
      return
    }

    cancelPendingNavigation()
    const inView = data?.nodes?.find(n => n.id === hit.id)
    if (inView) {
      const outsideTransientScope = Boolean(
        (drillScope && !drillScope.nodeIds.has(inView.id))
        || (isolateScope && !isolateScope.nodeIds.has(inView.id)),
      )
      if (outsideTransientScope) {
        navigationHistory.current.push(snapshotNavigation())
        setDrillScope(null)
        setIsolateScope(null)
      }
      setSelected(inView)
      setSearchResultId(inView.id)
      setCameraCommand({ nonce: Date.now(), type: 'fit-node', nodeIds: [inView.id] })
    } else {
      // The result went stale between search and selection; retain the current
      // truthful graph context and never manufacture a selected node.
      setSearchResultId(null)
    }
  }, [cancelPendingNavigation, communityId, data, drillScope, isolateScope, queuePendingNavigation, snapshotNavigation])
  useEffect(() => {
    const pending = pendingNavigation.current
    if (!pending || !data) return
    const scopedNodes = data.nodes ?? []
    const resolved = resolveGraphNavigationIntent(scopedNodes, data.edges ?? [], pending.intent)
    setSelected(resolved.selected)
    setDrillScope(resolved.drillScope)
    setIsolateScope(resolved.isolateScope)
    setSearchResultId(pending.markSearchResult ? resolved.selected?.id ?? null : null)
    if (pending.focusSelected && resolved.selected) {
      setCameraCommand({ nonce: Date.now(), type: 'fit-node', nodeIds: [resolved.selected.id] })
    }
    // One independent resolution attempt per identifier and payload.
    pendingNavigation.current = null
    setNavigationPending(false)
  }, [data])

  useEffect(() => {
    if (initialUrlRead.current || typeof window === 'undefined') return
    initialUrlRead.current = true
    const state = parseGraphUrlState(window.location.search)
    setMode(state.mode)
    if (state.projectId) setProjectFilter(state.projectId)
    if (state.communityId !== undefined) setCommunityId(state.communityId)
    if (state.selectedId || state.drillId || state.isolateId) {
      queuePendingNavigation({
        intent: {
          selectedId: state.selectedId ?? null,
          drillId: state.drillId ?? null,
          isolateId: state.isolateId ?? null,
        },
        focusSelected: false,
        markSearchResult: false,
      })
    }
    setUrlHydrated(true)
  }, [queuePendingNavigation])

  useEffect(() => {
    if (!urlHydrated || navigationPending || typeof window === 'undefined') return
    const query = serializeGraphUrlState({
      mode: mode === 'operations' ? 'operations' : 'system',
      ...(mode === 'operations' && projectFilter !== 'all' ? { projectId: projectFilter } : {}),
      ...(mode === 'system' && communityId !== null ? { communityId } : {}),
      ...(selected ? { selectedId: selected.id } : {}),
      ...(drillScope ? { drillId: drillScope.rootId } : {}),
      ...(isolateScope ? { isolateId: isolateScope.rootId } : {}),
    })
    window.history.replaceState(null, '', `${window.location.pathname}?${query}`)
  }, [urlHydrated, navigationPending, mode, projectFilter, communityId, selected, drillScope, isolateScope])

  useEffect(() => {
    const handleFullscreenChange = () => setFullscreen(document.fullscreenElement === rootRef.current)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const toggle = (set: Set<string>, value: string, apply: (next: Set<string>) => void) => {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    apply(next)
  }

  const clearFilters = useCallback(() => {
    setKindFilter(new Set())
    setRelationFilter(new Set())
    setStatusFilter(new Set())
  }, [])

  const resetView = useCallback(() => {
    cancelPendingNavigation()
    setSelected(null)
    setSearchResultId(null)
    setDrillScope(null)
    setFitSignal(x => x + 1)
  }, [cancelPendingNavigation])

  const resetAll = useCallback(() => {
    cancelPendingNavigation()
    clearFilters()
    setQuery('')
    setHits([])
    setSearchResultId(null)
    setSelected(null)
    setDrillScope(null)
    setIsolateScope(null)
    navigationHistory.current = []
    if (mode === 'system') setCommunityId(null)
    else setProjectFilter('all')
    setFitSignal(x => x + 1)
  }, [cancelPendingNavigation, clearFilters, mode])

  const handleEscape = useCallback(() => {
    if (isolateScope) exitIsolate()
    else if (drillScope || communityId !== null) goBack()
    else setSelected(null)
  }, [communityId, drillScope, exitIsolate, goBack, isolateScope])

  const toggleFullscreen = useCallback(async () => {
    if (!rootRef.current || typeof document === 'undefined') return
    try {
      if (document.fullscreenElement === rootRef.current) await document.exitFullscreen()
      else await rootRef.current.requestFullscreen()
    } catch {
      // Browser/platform denial leaves graph selection and camera untouched.
    }
  }, [])

  const switchMode = useCallback((next: Mode) => {
    cancelPendingNavigation()
    setLoading(true)
    setError(null)
    setMode(next)
    setCommunityId(null)
    setDrillScope(null)
    setIsolateScope(null)
    setSelected(null)
    setSearchResultId(null)
    setQuery('')
    navigationHistory.current = []
  }, [cancelPendingNavigation])

  const breadcrumbs = useMemo(
    () => buildGraphBreadcrumbs(mode === 'operations' ? 'operations' : 'system', communityId, drillScope, isolateScope),
    [communityId, drillScope, isolateScope, mode],
  )

  const unavailable = data && data.available === false
  const operationsSnapshot = mode === 'operations' && data?.available === true ? data.snapshot : undefined
  const operationsUiState = mode === 'operations'
    ? getOperationsSnapshotUiState({ loading, payload: data, nodes })
    : null
  const hasOperationsSnapshot = Boolean(operationsSnapshot)
  const operationsStateCopy = operationsUiState ? getOperationsSnapshotStateCopy(operationsUiState) : null
  const operationsUnavailable = mode === 'operations' && !loading && operationsUiState === 'unavailable'
  const operationsEmpty = mode === 'operations'
    && (operationsUiState === 'empty-authorized-scope' || operationsUiState === 'empty-runs')

  return (
    <div
      ref={rootRef}
      className={cn('flex h-full min-h-0 flex-col gap-3', fullscreen && 'bg-[var(--omnira-bg)] p-4')}
    >
      {/* ── Mode tabs + toolbar ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-white/[0.07] bg-white/[0.03] p-0.5">
          <TabButton active={mode === 'system'} onClick={() => switchMode('system')}>System Map</TabButton>
          <TabButton active={mode === 'operations'} onClick={() => switchMode('operations')}>Operations Snapshot</TabButton>
          <TabButton active={false} disabled title="Kräver mer granulär eventdata (per-steg-tidslinje). Se docs/intelligence-graph.md.">
            Execution Replay
          </TabButton>
        </div>

        {(communityId !== null || drillScope || isolateScope || navigationHistory.current.length > 0) && (
          <button
            type="button"
            onClick={goBack}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5 text-xs text-slate-300 transition-colors hover:bg-white/[0.07]"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
        )}

        <nav aria-label="Graph location" className="hidden items-center gap-1 text-[11px] text-slate-500 lg:flex">
          {breadcrumbs.map((crumb, index) => (
            <span key={`${crumb}:${index}`} className={index === breadcrumbs.length - 1 ? 'text-slate-300' : undefined}>
              {index > 0 ? <span className="mr-1 text-slate-700">/</span> : null}{crumb}
            </span>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                ref={searchInputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Sök nod…"
                aria-label="Sök i aktuell graf"
                aria-controls="graph-search-results"
                className="w-44 rounded-lg border border-white/[0.07] bg-white/[0.03] py-1.5 pl-8 pr-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-indigo-400/40 focus:outline-none md:w-56"
              />
              {query.trim().length >= 2 && !searchPending && (
                <ul id="graph-search-results" className="absolute right-0 top-full z-20 mt-1 max-h-72 w-72 overflow-y-auto rounded-lg border border-white/[0.08] bg-[rgba(10,12,20,0.97)] p-1 shadow-2xl backdrop-blur-xl">
                  {visibleHits.map(hit => (
                    <li key={hit.id}>
                      <button
                        type="button"
                        onClick={() => openSearchHit(hit)}
                        className="flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/[0.06]"
                      >
                        <span className="truncate text-xs text-slate-200">{hit.label}</span>
                        <span className="truncate text-[10px] text-slate-500">
                          {hit.kind}{hit.status ? ` · ${hit.status}` : ''}{typeof hit.community === 'number' ? ` · community ${hit.community}` : ''}{hit.sourceFile ? ` · ${hit.sourceFile}` : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                  {visibleHits.length === 0 && (
                    <li className="px-3 py-2 text-xs text-slate-500" role="status">Inga noder matchar i aktuell behörig scope.</li>
                  )}
                </ul>
              )}
            </div>

          <IconButton onClick={() => setFitSignal(x => x + 1)} title="Fit to graph"><Maximize2 className="h-3.5 w-3.5" /></IconButton>
          {selected && <IconButton onClick={() => setCameraCommand({ nonce: Date.now(), type: 'fit-node', nodeIds: [selected.id] })} title="Fokusera vald nod"><Crosshair className="h-3.5 w-3.5" /></IconButton>}
          <IconButton onClick={resetView} title="Återställ vy"><RotateCcw className="h-3.5 w-3.5" /></IconButton>
          <IconButton onClick={resetAll} title="Återställ allt"><X className="h-3.5 w-3.5" /></IconButton>
          <IconButton onClick={() => { void toggleFullscreen() }} title={fullscreen ? 'Avsluta helskärm' : 'Helskärm'}>
            {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </IconButton>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="rounded-full border border-indigo-400/20 bg-indigo-400/10 px-2 py-0.5 text-indigo-200">
          Zoom {zoomLevel}
        </span>
        {operationsSnapshot && operationsUiState === 'available' && <OperationsSnapshotStatus snapshot={operationsSnapshot} />}
        {isolateScope && (
          <span className="flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-400/10 px-2.5 py-1 text-amber-200">
            Isolated: {isolateScope.label}
            <button type="button" onClick={exitIsolate} className="underline decoration-amber-300/40 underline-offset-2">Exit isolate</button>
            <button type="button" onClick={() => setCameraCommand({ nonce: Date.now(), type: 'fit-scope', nodeIds: [...isolateScope.nodeIds] })} className="underline decoration-amber-300/40 underline-offset-2">Fit scope</button>
          </span>
        )}
      </div>

      {/* ── Filter row ── */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {mode === 'operations' && (
          <>
            <select
              value={projectFilter}
              onChange={e => setProjectFilter(e.target.value)}
              className="rounded-lg border border-white/[0.07] bg-[rgba(10,12,20,0.9)] px-2 py-1.5 text-xs text-slate-200 focus:outline-none"
              aria-label="Projektfilter"
            >
              <option value="all">Alla projekt</option>
              {(data?.projects ?? []).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            <div className="flex rounded-lg border border-white/[0.07] bg-white/[0.03] p-0.5">
              {TIME_FILTERS.map(t => (
                <TabButton key={t.hours} active={hours === t.hours} onClick={() => setHours(t.hours)} small>{t.label}</TabButton>
              ))}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {RUN_STATUS_FILTERS.map(s => (
                <FilterChip
                  key={s.id}
                  active={statusFilter.has(s.id)}
                  onClick={() => toggle(statusFilter, s.id, setStatusFilter)}
                >
                  {s.label}
                </FilterChip>
              ))}
            </div>
          </>
        )}

        {presentKinds.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {presentKinds.map(kind => (
              <FilterChip
                key={kind}
                active={kindFilter.has(kind)}
                onClick={() => toggle(kindFilter, kind, setKindFilter)}
                dotColor={nodeColor({ kind, id: '', label: '', source: 'graphify', metadata: {} } as IntelligenceGraphNode)}
              >
                {kind}
              </FilterChip>
            ))}
          </div>
        )}

        {presentRelations.length > 1 && (
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-slate-400 transition-colors hover:bg-white/[0.07]">
              Relationer {relationFilter.size > 0 ? `(${relationFilter.size})` : ''}
            </summary>
            <div className="absolute left-0 top-full z-20 mt-1 flex w-60 flex-wrap gap-1.5 rounded-lg border border-white/[0.08] bg-[rgba(10,12,20,0.97)] p-2 shadow-2xl backdrop-blur-xl">
              {presentRelations.map(rel => (
                <FilterChip key={rel} active={relationFilter.has(rel)} onClick={() => toggle(relationFilter, rel, setRelationFilter)}>
                  {rel}
                </FilterChip>
              ))}
            </div>
          </details>
        )}

        {filtersActive && (
          <span className="flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-400/10 px-2.5 py-1 text-[11px] text-indigo-200">
            {filterState.matchCount} matchar · övriga dimmade
            <button type="button" onClick={clearFilters} className="underline decoration-indigo-300/40 underline-offset-2">Rensa filter</button>
          </span>
        )}
        {filterState.criticalOutsideFilters > 0 && (
          <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-300">
            {filterState.criticalOutsideFilters} kritiska objekt bevarade utanför filtermatch
          </span>
        )}

        {data?.meta?.builtAtCommit && mode === 'system' && (
          <span className="ml-auto font-mono text-[10px] text-slate-600" title="Git-commit som grafen byggdes från">
            {data.meta.builtAtCommit.slice(0, 10)}
          </span>
        )}
        {data?.truncated && (
          <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-300">
            Vyn är trunkerad — högst {nodes.length} noder visas
          </span>
        )}
      </div>

      {/* ── Canvas + inspector ── */}
      <div className="relative flex min-h-0 flex-1 gap-3">
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-xl border border-white/[0.06] bg-[var(--omnira-bg)]">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 backdrop-blur-[2px]">
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin" /> {mode === 'operations' && !hasOperationsSnapshot ? operationsStateCopy?.title : 'Laddar graf…'}
              </div>
            </div>
          )}

          {operationsUnavailable && <OperationsSnapshotStateMessage state="unavailable" />}

          {error && !loading && !operationsUnavailable && (
            <StateMessage title="Grafen kunde inte laddas" body={error} tone="error" />
          )}

          {unavailable && !loading && !error && !operationsUnavailable && (
            <StateMessage
              title={mode === 'system' ? 'Ingen System Map-artifact ännu' : 'Ingen driftdata'}
              body={mode === 'system'
                ? 'Ingen distribuerad System Map-artifact är tillgänglig för den här versionen. Grafen är inte trasig; Graphify-generering och leverans hanteras separat.'
                : data?.hint ?? 'Ingen data tillgänglig ännu.'}
            />
          )}

          {!loading && !error && !unavailable && ((mode === 'operations' && operationsEmpty) || (mode !== 'operations' && nodes.length === 0)) && (
            mode === 'operations'
              ? <OperationsSnapshotStateMessage state={operationsUiState!} />
              : <StateMessage title="Tom graf" body="Inga noder matchar de aktiva filtren." />
          )}

          {!loading && !error && !unavailable && filtersActive && filterState.matchCount === 0 && nodes.length > 0 && (
            <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full border border-white/[0.08] bg-[rgba(10,12,20,0.92)] px-3 py-1.5 text-xs text-slate-300 shadow-xl" role="status">
              Inga noder matchar filtren. Grafens struktur ligger kvar dimmad.
            </div>
          )}

          {!error && !unavailable && nodes.length > 0 && (mode !== 'operations' || shouldRenderOperationsSnapshotGraph({
            state: operationsUiState!,
            snapshot: operationsSnapshot,
            nodes,
          })) && (
            <GraphCanvas
              nodes={nodes}
              edges={edges}
              selectedId={selected?.id ?? null}
              onSelect={node => { setSelected(node); if (!node) setSearchResultId(null) }}
              onOpen={drillIn}
              fitSignal={fitSignal}
              mode={mode === 'operations' ? 'operations' : 'system'}
              semanticContext={drillScope?.kind === 'run' ? 'execution' : communityId !== null || drillScope ? 'detail' : 'auto'}
              dimmedIds={dimmedIds}
              dimmedEdgeIds={dimmedEdgeIds}
              isolatedIds={isolateScope?.nodeIds ?? (drillScope?.kind === 'run' ? drillScope.nodeIds : null)}
              inspectorOpen={Boolean(selected)}
              searchResultId={searchResultId}
              cameraCommand={cameraCommand}
              onCameraChange={view => { cameraRef.current = view }}
              onZoomLevelChange={setZoomLevel}
              onSearchRequest={() => searchInputRef.current?.focus()}
              onIsolate={isolateNode}
              onEscape={handleEscape}
            />
          )}
        </div>

        {selected && (
          <div className="absolute inset-x-0 bottom-0 z-10 h-[min(48%,24rem)] md:static md:z-auto md:h-auto md:w-80 md:shrink-0">
            <NodeInspector
              node={selected}
              edges={selectedEdges}
              neighbors={neighborNodes}
              builtAtCommit={data?.meta?.builtAtCommit}
              onClose={() => setSelected(null)}
              onSelectNeighbor={setSelected}
              onDrillIn={drillIn}
              onIsolate={isolateNode}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Small UI atoms ──────────────────────────────────────────────────────────

function TabButton({
  active, disabled, small, title, onClick, children,
}: {
  active: boolean
  disabled?: boolean
  small?: boolean
  title?: string
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
        small && 'px-2.5 py-1',
        active ? 'bg-indigo-400/20 text-indigo-100' : 'text-slate-400 hover:text-slate-200',
        disabled && 'cursor-not-allowed text-slate-600 hover:text-slate-600',
      )}
    >
      {children}
    </button>
  )
}

function IconButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-2 text-slate-400 transition-colors hover:bg-white/[0.07] hover:text-slate-200"
    >
      {children}
    </button>
  )
}

function FilterChip({
  active, dotColor, onClick, children,
}: {
  active: boolean
  dotColor?: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors',
        active
          ? 'border-indigo-400/40 bg-indigo-400/15 text-indigo-100'
          : 'border-white/[0.08] bg-white/[0.03] text-slate-400 hover:bg-white/[0.07]',
      )}
    >
      {dotColor && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dotColor }} />}
      {children}
    </button>
  )
}

function StateMessage({ title, body, tone = 'default' }: { title: string; body: string; tone?: 'default' | 'error' }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <p className={cn('text-sm font-medium', tone === 'error' ? 'text-red-300' : 'text-slate-200')}>{title}</p>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">{body}</p>
      </div>
    </div>
  )
}
