'use client'

/**
 * IntelligenceGraphClient — the Intelligence Graph experience.
 *
 * Three modes:
 *   System Map      — static architecture (Graphify import), progressive levels
 *                     Overview (communities) → Community (drilldown)
 *   Live Operations — read-only runtime graph from real Omnira tables
 *   Execution Replay— honestly disabled (per-step event data is not granular
 *                     enough yet; see docs/intelligence-graph.md)
 *
 * All data arrives via the authenticated /api/intelligence/graph/* routes.
 * No sample data is ever fabricated: empty results render empty states.
 *
 * Since vNext Phase 18 this is the LEGACY generation's surface. Its state and
 * navigation live in useIntelligenceGraph, shared with the vNext surface; the
 * markup below is unchanged and pinned by lib/qa/vnext-intelligence-graph.test.ts.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Crosshair, Loader2, Maximize2, Minimize2, RotateCcw, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { IntelligenceGraphNode } from '@/lib/intelligence/graph-contract'
import { GraphCanvas, nodeColor } from './GraphCanvas'
import { NodeInspector } from './NodeInspector'
import {
  RUN_STATUS_FILTERS,
  TIME_FILTERS,
  toggle,
  useIntelligenceGraph,
} from './useIntelligenceGraph'

export function IntelligenceGraphClient() {
  const rootRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const {
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
    breadcrumbs,
    unavailable,
  } = useIntelligenceGraph()
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    const handleFullscreenChange = () => setFullscreen(document.fullscreenElement === rootRef.current)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const toggleFullscreen = useCallback(async () => {
    if (!rootRef.current || typeof document === 'undefined') return
    try {
      if (document.fullscreenElement === rootRef.current) await document.exitFullscreen()
      else await rootRef.current.requestFullscreen()
    } catch {
      // Browser/platform denial leaves graph selection and camera untouched.
    }
  }, [])

  return (
    <div
      ref={rootRef}
      className={cn('flex h-full min-h-0 flex-col gap-3', fullscreen && 'bg-[var(--omnira-bg)] p-4')}
    >
      {/* ── Mode tabs + toolbar ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-white/[0.07] bg-white/[0.03] p-0.5">
          <TabButton active={mode === 'system'} onClick={() => switchMode('system')}>System Map</TabButton>
          <TabButton active={mode === 'operations'} onClick={() => switchMode('operations')}>Live Operations</TabButton>
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
                <Loader2 className="h-4 w-4 animate-spin" /> Laddar graf…
              </div>
            </div>
          )}

          {error && !loading && (
            <StateMessage title="Grafen kunde inte laddas" body={error} tone="error" />
          )}

          {unavailable && !loading && !error && (
            <StateMessage
              title={mode === 'system' ? 'Ingen System Map-artifact ännu' : 'Ingen driftdata'}
              body={mode === 'system'
                ? 'Ingen distribuerad System Map-artifact är tillgänglig för den här versionen. Grafen är inte trasig; Graphify-generering och leverans hanteras separat.'
                : data?.hint ?? 'Ingen data tillgänglig ännu.'}
            />
          )}

          {!loading && !error && !unavailable && nodes.length === 0 && (
            <StateMessage
              title="Tom graf"
              body={mode === 'operations'
                ? 'Inga körningar i det valda tidsfönstret. Justera tids- eller projektfiltret.'
                : 'Inga noder matchar de aktiva filtren.'}
            />
          )}

          {!loading && !error && !unavailable && filtersActive && filterState.matchCount === 0 && nodes.length > 0 && (
            <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full border border-white/[0.08] bg-[rgba(10,12,20,0.92)] px-3 py-1.5 text-xs text-slate-300 shadow-xl" role="status">
              Inga noder matchar filtren. Grafens struktur ligger kvar dimmad.
            </div>
          )}

          {!error && !unavailable && nodes.length > 0 && (
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
