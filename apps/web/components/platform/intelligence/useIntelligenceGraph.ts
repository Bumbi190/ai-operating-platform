'use client'

/**
 * useIntelligenceGraph — the Intelligence Graph's state and navigation, shared by
 * both UI generations.
 *
 * Moved out of IntelligenceGraphClient verbatim, so the legacy client and the
 * vNext surface run ONE implementation of fetching, search, drilldown, isolate,
 * Back, filters and URL state. Neither generation can drift from the other's
 * navigation, because there is only one copy of it. Presentation — layout,
 * chrome, fullscreen and focus refs — stays in each component.
 *
 * Read-only by construction: the only requests are the two authenticated GET
 * routes the client always used, `/api/intelligence/graph/system` and
 * `/api/intelligence/graph/operations`, with the same query parameters.
 *
 * `refresh()` is the one addition. It re-requests the current URL on an
 * explicit operator action — there is no timer and no polling — and keeps the
 * selection, drilldown and isolate only when the same ids exist in the new
 * payload. The canvas refits, as it does for every new payload. The legacy
 * client never calls it, so its fetch path is unchanged.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  IntelligenceGraphEdge,
  IntelligenceGraphMeta,
  IntelligenceGraphNode,
} from '@/lib/intelligence/graph-contract'
import type { GraphCameraCommand } from './GraphCanvas'
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

export type Mode = 'system' | 'operations' | 'replay'

export interface GraphPayload {
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
}

export interface SearchHit {
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

export const RUN_STATUS_FILTERS = [
  { id: 'running', label: 'Kör' },
  { id: 'awaiting_approval', label: 'Väntar' },
  { id: 'failed', label: 'Fel' },
  { id: 'done', label: 'Klar' },
] as const

export const TIME_FILTERS = [
  { hours: 24, label: '24 h' },
  { hours: 24 * 7, label: '7 d' },
  { hours: 24 * 30, label: '30 d' },
] as const

export const toggle = (set: Set<string>, value: string, apply: (next: Set<string>) => void) => {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  apply(next)
}

export function useIntelligenceGraph() {
  const cameraRef = useRef<GraphViewBox>({ x: 0, y: 0, w: 1200, h: 800 })
  const navigationHistory = useRef<NavigationSnapshot[]>([])
  const pendingRestore = useRef<NavigationSnapshot | null>(null)
  const isolateCamera = useRef<GraphViewBox | null>(null)
  const initialUrlRead = useRef(false)
  const [mode, setMode] = useState<Mode>('system')

  // System Map state
  const [communityId, setCommunityId] = useState<number | null>(null)

  // Live Operations state
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
  const [searchResultId, setSearchResultId] = useState<string | null>(null)

  // Explicit refresh — an operator action, never a timer.
  const [refreshNonce, setRefreshNonce] = useState(0)
  const handledRefreshNonce = useRef(0)
  const refreshIntent = useRef<GraphNavigationIntent | null>(null)

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
    // A refresh re-requests the SAME url; any other run of this effect is a new
    // url, and a refresh that was waiting must not apply to a different graph.
    const isRefresh = refreshNonce !== handledRefreshNonce.current
    handledRefreshNonce.current = refreshNonce
    const intent = isRefresh ? refreshIntent.current : null
    refreshIntent.current = null
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
        if (intent) {
          // Selection and scopes survive only where the new snapshot still
          // contains those ids — never a manufactured node. The canvas fits
          // the new payload the way it fits any payload.
          const resolved = resolveGraphNavigationIntent(payload.nodes ?? [], payload.edges ?? [], intent)
          setSelected(resolved.selected)
          setDrillScope(resolved.drillScope)
          setIsolateScope(resolved.isolateScope)
          setSearchResultId(null)
          return
        }
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
  }, [url, refreshNonce])

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

  const switchMode = useCallback((next: Mode) => {
    cancelPendingNavigation()
    setMode(next)
    setCommunityId(null)
    setDrillScope(null)
    setIsolateScope(null)
    setSelected(null)
    setSearchResultId(null)
    setQuery('')
    navigationHistory.current = []
  }, [cancelPendingNavigation])

  /**
   * Re-request the current graph now. Carries the current selection and scopes
   * as an intent, resolved against the NEW payload; nothing is kept that the
   * new snapshot does not contain. No-op while a request is in flight.
   */
  const refresh = useCallback(() => {
    if (!url || loading) return
    refreshIntent.current = {
      selectedId: selected?.id ?? null,
      drillId: drillScope?.rootId ?? null,
      isolateId: isolateScope?.rootId ?? null,
    }
    setRefreshNonce(x => x + 1)
  }, [drillScope, isolateScope, loading, selected, url])

  const breadcrumbs = useMemo(
    () => buildGraphBreadcrumbs(mode === 'operations' ? 'operations' : 'system', communityId, drillScope, isolateScope),
    [communityId, drillScope, isolateScope, mode],
  )

  const unavailable = data && data.available === false

  return {
    cameraRef,
    navigationHistory,
    mode,
    communityId,
    projectFilter,
    setProjectFilter,
    hours,
    setHours,
    statusFilter,
    setStatusFilter,
    data,
    loading,
    error,
    selected,
    setSelected,
    fitSignal,
    setFitSignal,
    kindFilter,
    setKindFilter,
    relationFilter,
    setRelationFilter,
    drillScope,
    isolateScope,
    cameraCommand,
    setCameraCommand,
    zoomLevel,
    setZoomLevel,
    searchResultId,
    setSearchResultId,
    query,
    setQuery,
    searchPending,
    nodes,
    edges,
    filterState,
    dimmedIds,
    dimmedEdgeIds,
    filtersActive,
    visibleHits,
    presentKinds,
    presentRelations,
    selectedEdges,
    neighborNodes,
    drillIn,
    isolateNode,
    exitIsolate,
    goBack,
    openSearchHit,
    clearFilters,
    resetView,
    resetAll,
    handleEscape,
    switchMode,
    refresh,
    breadcrumbs,
    unavailable,
  }
}
