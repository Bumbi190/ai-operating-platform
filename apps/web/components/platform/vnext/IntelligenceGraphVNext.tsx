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
 *  - WHAT A COUNT COVERS. The strip counts this payload, names the run window
 *    and the builder's cap, and says which rows only appear through a run.
 *
 * No Atlas node and no Atlas edge: Atlas is this page's identity, not a datum
 * the graph has a source for.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Maximize2, Minimize2, RotateCcw, RotateCw, Search, X } from 'lucide-react'
import type { IntelligenceGraphEdge, IntelligenceGraphNode } from '@/lib/intelligence/graph-contract'
import { GraphCanvas, nodeColor } from '@/components/platform/intelligence/GraphCanvas'
import type { GraphEdgeVisual } from '@/components/platform/intelligence/graph-visuals'
import {
  RUN_STATUS_FILTERS,
  TIME_FILTERS,
  toggle,
  useIntelligenceGraph,
} from '@/components/platform/intelligence/useIntelligenceGraph'
import {
  OPERATIONS_RUN_CAP,
  RELATION_TRUTH_STROKE,
  ZOOM_LEVEL_LABELS,
  graphLocation,
  kindFilterLabel,
  kindLabel,
  nodeStatus,
  relationLegend,
  relationTruth,
  relationWording,
  snapshotCounts,
  snapshotStamp,
} from '@/lib/os/intelligence-graph-shared'
import { IntelligenceGraphInspector } from './IntelligenceGraphInspector'
import styles from './IntelligenceGraphVNext.module.css'

/** Line style carries how certain a relation is; colour and width stay the relation's own. */
export function truthEdgeVisual(edge: IntelligenceGraphEdge, visual: GraphEdgeVisual): GraphEdgeVisual {
  const stroke = RELATION_TRUTH_STROKE[relationTruth(edge)]
  return { ...visual, dash: stroke.dash, opacity: visual.opacity * stroke.opacityScale }
}

const REPLAY_UNAVAILABLE = 'Kräver händelsedata per steg, som Omnira inte registrerar ännu.'

export function IntelligenceGraphVNext() {
  const workspaceRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const zoomSequence = useRef(0)
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
    refresh,
    unavailable,
  } = useIntelligenceGraph()
  const [fullscreen, setFullscreen] = useState(false)
  // Narrow screens fold the filter chips behind one button; wide screens ignore it.
  const [filtersOpen, setFiltersOpen] = useState(false)

  useEffect(() => {
    const handleFullscreenChange = () => setFullscreen(document.fullscreenElement === workspaceRef.current)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const toggleFullscreen = useCallback(async () => {
    const element = workspaceRef.current
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
  const legend = useMemo(() => relationLegend(edges), [edges])
  const location = graphLocation(canvasMode, communityId, drillScope?.label ?? null, isolateScope?.label ?? null)
  const windowLabel = TIME_FILTERS.find(filter => filter.hours === hours)?.label ?? `${hours} h`
  const runCount = counts.items.find(item => item.kind === 'run')?.value ?? 0
  const showBack = communityId !== null || Boolean(drillScope) || Boolean(isolateScope) || navigationHistory.current.length > 0

  const activeFilterCount = kindFilter.size + relationFilter.size + statusFilter.size
  const hasFilterGroups = mode === 'operations' || presentKinds.length > 1 || presentRelations.length > 1
  const hasFilterRow = hasFilterGroups || filtersActive || filterState.criticalOutsideFilters > 0 || Boolean(data?.truncated && mode === 'system')
  const relationName = (relation: string) => relationWording(
    edges.find(edge => edge.relation === relation) ?? { relation: relation as IntelligenceGraphEdge['relation'], metadata: {} },
  ).name

  return (
    <div className={styles.field} data-testid="intelligence-graph-vnext" data-mode={canvasMode}>
      <div className={styles.ambient} aria-hidden />

      <header className={styles.header}>
        <div className={styles.headline}>
          <p className={styles.eyebrow}>Atlas Intelligence</p>
          <h1 className={styles.title}>Intelligence Graph</h1>
          <p className={styles.lede}>
            Hur Omnira hänger ihop — ritat enbart ur data som finns, med källan synlig för varje koppling.
          </p>
        </div>

        {mode === 'operations' && (
          <div className={styles.snapshot} data-testid="graph-snapshot">
            <div className={styles.snapshotText}>
              {stamp && (
                <p className={styles.stamp} title={stamp.detail ?? undefined} aria-live="polite" data-testid="graph-stamp">
                  {stamp.label}
                </p>
              )}
              <p className={styles.stampNote}>Uppdateras inte automatiskt.</p>
            </div>
            <button
              type="button"
              className={styles.refresh}
              onClick={refresh}
              disabled={loading}
              data-testid="graph-refresh"
            >
              <RotateCw className={styles.buttonIcon} aria-hidden />
              {loading ? 'Uppdaterar…' : 'Uppdatera'}
            </button>
          </div>
        )}
        {mode === 'system' && stamp && (
          <div className={styles.snapshot} data-testid="graph-snapshot">
            <p className={styles.stamp} title={stamp.detail ?? undefined} data-testid="graph-stamp">{stamp.label}</p>
          </div>
        )}
      </header>

      <div ref={workspaceRef} className={styles.workspace}>
        {/* ── Mode, place and search ── */}
        <div className={styles.toolbar}>
          <div className={styles.modes} role="group" aria-label="Grafläge">
            <ModeButton active={mode === 'system'} onClick={() => switchMode('system')}>System Map</ModeButton>
            <ModeButton active={mode === 'operations'} onClick={() => switchMode('operations')}>Live Operations</ModeButton>
            <ModeButton active={false} disabled title={REPLAY_UNAVAILABLE}>Execution Replay</ModeButton>
          </div>

          {showBack && (
            <button type="button" onClick={goBack} className={styles.quietButton}>
              <ArrowLeft className={styles.buttonIcon} aria-hidden /> Tillbaka
            </button>
          )}

          <nav aria-label="Plats i grafen" className={styles.location}>
            {location.map((crumb, index) => (
              <span key={`${crumb}:${index}`} data-current={index === location.length - 1 ? 'true' : undefined}>
                {index > 0 ? <span className={styles.locationSeparator} aria-hidden>/</span> : null}{crumb}
              </span>
            ))}
          </nav>

          <div className={styles.toolbarEnd}>
            <div className={styles.search}>
              <Search className={styles.searchIcon} aria-hidden />
              <input
                ref={searchInputRef}
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Sök nod…"
                aria-label="Sök i aktuell graf"
                aria-controls="graph-search-results"
                className={styles.searchInput}
              />
              {query.trim().length >= 2 && !searchPending && (
                <ul id="graph-search-results" className={styles.searchResults}>
                  {visibleHits.map(hit => {
                    const status = hit.status ? nodeStatus({ kind: hit.kind as IntelligenceGraphNode['kind'], status: hit.status }) : null
                    const details = [
                      kindLabel(hit.kind),
                      status ? (status.unknown ? `${status.label} (${status.raw})` : status.label) : null,
                      typeof hit.community === 'number' ? `subsystem ${hit.community}` : null,
                      hit.sourceFile ?? null,
                    ].filter(Boolean).join(' · ')
                    return (
                      <li key={hit.id}>
                        <button type="button" onClick={() => openSearchHit(hit)} className={styles.searchHit}>
                          <span className={styles.searchHitLabel}>{hit.label}</span>
                          <span className={styles.searchHitMeta}>{details}</span>
                        </button>
                      </li>
                    )
                  })}
                  {visibleHits.length === 0 && (
                    <li className={styles.searchEmpty} role="status">Inga noder matchar i aktuell behörig scope.</li>
                  )}
                </ul>
              )}
            </div>

            <button
              type="button"
              onClick={resetView}
              className={styles.quietButton}
              aria-label="Återställ vy"
              title="Rensar val och fördjupning och anpassar vyn"
            >
              <RotateCcw className={styles.buttonIcon} aria-hidden /><span className={styles.buttonLabel}>Återställ vy</span>
            </button>
            <button
              type="button"
              onClick={resetAll}
              className={styles.quietButton}
              aria-label="Återställ allt"
              title="Rensar även filter, sökning, isolering och historik"
            >
              <X className={styles.buttonIcon} aria-hidden /><span className={styles.buttonLabel}>Återställ allt</span>
            </button>
            <button
              type="button"
              onClick={() => { void toggleFullscreen() }}
              className={styles.quietButton}
              aria-label={fullscreen ? 'Avsluta helskärm' : 'Helskärm'}
              title={fullscreen ? 'Avsluta helskärm' : 'Helskärm'}
            >
              {fullscreen ? <Minimize2 className={styles.buttonIcon} aria-hidden /> : <Maximize2 className={styles.buttonIcon} aria-hidden />}
            </button>
          </div>
        </div>

        {/* ── Filters ── */}
        {hasFilterRow && (
          <div className={styles.filters}>
            {mode === 'operations' && (
              <>
                <select
                  value={projectFilter}
                  onChange={event => setProjectFilter(event.target.value)}
                  className={styles.select}
                  aria-label="Projektfilter"
                >
                  <option value="all">Alla projekt</option>
                  {(data?.projects ?? []).map(project => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>

                <div className={styles.segmented} role="group" aria-label="Tidsfönster för körningar">
                  {TIME_FILTERS.map(filter => (
                    <button
                      key={filter.hours}
                      type="button"
                      aria-pressed={hours === filter.hours}
                      onClick={() => setHours(filter.hours)}
                      className={styles.segment}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {hasFilterGroups && (
              <button
                type="button"
                className={styles.filterToggle}
                aria-expanded={filtersOpen}
                aria-controls="graph-filter-groups"
                onClick={() => setFiltersOpen(open => !open)}
              >
                Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </button>
            )}

            <div id="graph-filter-groups" className={styles.filterGroups} data-open={filtersOpen ? 'true' : 'false'}>
              {mode === 'operations' && (
                <div className={styles.chips} role="group" aria-label="Körningsstatus">
                  {RUN_STATUS_FILTERS.map(filter => (
                    <Chip key={filter.id} active={statusFilter.has(filter.id)} onClick={() => toggle(statusFilter, filter.id, setStatusFilter)}>
                      {filter.label}
                    </Chip>
                  ))}
                </div>
              )}

              {presentKinds.length > 1 && (
                <div className={styles.chips} role="group" aria-label="Nodtyper">
                  {presentKinds.map(kind => (
                    <Chip
                      key={kind}
                      active={kindFilter.has(kind)}
                      onClick={() => toggle(kindFilter, kind, setKindFilter)}
                      dotColor={nodeColor({ kind, id: '', label: '', source: 'graphify', metadata: {} } as IntelligenceGraphNode)}
                    >
                      {kindFilterLabel(kind)}
                    </Chip>
                  ))}
                </div>
              )}

              {presentRelations.length > 1 && (
                <details className={styles.relationMenu}>
                  <summary className={styles.relationSummary}>
                    Relationer{relationFilter.size > 0 ? ` (${relationFilter.size})` : ''}
                  </summary>
                  <div className={styles.relationPanel}>
                    {presentRelations.map(relation => (
                      <Chip key={relation} active={relationFilter.has(relation)} onClick={() => toggle(relationFilter, relation, setRelationFilter)}>
                        {relationName(relation)}
                      </Chip>
                    ))}
                  </div>
                </details>
              )}
            </div>

            {filtersActive && (
              <span className={styles.filterState}>
                {filterState.matchCount} matchar · övriga dimmade
                <button type="button" onClick={clearFilters} className={styles.inlineAction}>Rensa filter</button>
              </span>
            )}
            {filterState.criticalOutsideFilters > 0 && (
              <span className={styles.filterNote} data-tone="waiting">
                {filterState.criticalOutsideFilters} kritiska objekt bevarade utanför filtermatch
              </span>
            )}
            {data?.truncated && mode === 'system' && (
              <span className={styles.filterNote} data-tone="waiting">
                Vyn är trunkerad — högst {nodes.length} noder visas
              </span>
            )}
          </div>
        )}

        {/* ── What this snapshot contains ── */}
        {payloadIsCurrent && !unavailable && !error && (
          <section
            className={styles.counts}
            aria-label={mode === 'operations' ? 'Antal i denna ögonblicksbild' : 'Antal i den här vyn'}
            data-testid="graph-counts"
          >
            <p className={styles.countsTitle}>{mode === 'operations' ? 'I denna ögonblicksbild' : 'I den här vyn'}</p>
            <ul className={styles.countList}>
              {counts.items.map(item => (
                <li key={item.kind} className={styles.count} data-kind={item.kind}>
                  <span><strong className={styles.countValue}>{item.value}</strong> {item.noun}</span>
                  {item.breakdown.length > 0 && (
                    <span className={styles.countBreakdown}>
                      {item.breakdown.map(entry => (
                        <span key={entry.status} className={styles.countStatus} data-tone={entry.tone}>
                          {entry.value} {entry.label}
                        </span>
                      ))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {mode === 'operations' && (
              <p className={styles.countsNote}>
                {runCount === 0
                  ? `Inga körningar skapade de senaste ${windowLabel}. `
                  : `Körningar skapade de senaste ${windowLabel}, högst ${OPERATIONS_RUN_CAP} per hämtning. `}
                Granskningar, utdata och uppgifter visas bara när de hör till en av körningarna.
              </p>
            )}
            {mode === 'operations' && counts.runCapReached && (
              <p className={styles.capNote} role="note" data-testid="graph-run-cap">
                Taket på {OPERATIONS_RUN_CAP} körningar nåddes — äldre körningar i fönstret kan saknas.
              </p>
            )}
          </section>
        )}

        {isolateScope && (
          <div className={styles.scopeBar} role="status">
            <span>Isolerad: <strong>{isolateScope.label}</strong></span>
            <button type="button" onClick={exitIsolate} className={styles.inlineAction}>Lämna isolering</button>
            <button
              type="button"
              onClick={() => setCameraCommand({ nonce: Date.now(), type: 'fit-scope', nodeIds: [...isolateScope.nodeIds] })}
              className={styles.inlineAction}
            >
              Anpassa till urvalet
            </button>
          </div>
        )}

        {/* ── Canvas + inspector ── */}
        <div className={styles.stage}>
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

            {!loading && graphVisible && filtersActive && filterState.matchCount === 0 && (
              <div className={styles.noMatch} role="status">
                Inga noder matchar filtren. Grafens struktur ligger kvar dimmad.
              </div>
            )}

            {graphVisible && (
              <>
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
                    inspectorOpen={Boolean(selected)}
                    searchResultId={searchResultId}
                    cameraCommand={cameraCommand}
                    onCameraChange={view => { cameraRef.current = view }}
                    onZoomLevelChange={setZoomLevel}
                    onSearchRequest={() => searchInputRef.current?.focus()}
                    onIsolate={isolateNode}
                    onEscape={handleEscape}
                    appearance="vnext"
                    edgeVisual={truthEdgeVisual}
                  />
                </div>

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
              </>
            )}
          </div>

          {selected && (
            <div className={styles.inspectorDock} data-testid="graph-inspector-dock">
              <IntelligenceGraphInspector
                node={selected}
                edges={selectedEdges}
                neighbors={neighborNodes}
                meta={payloadIsCurrent ? data?.meta : undefined}
                mode={canvasMode}
                onClose={() => setSelected(null)}
                onSelectNeighbor={setSelected}
                onDrillIn={drillIn}
                onIsolate={isolateNode}
                onFocus={node => setCameraCommand({ nonce: Date.now(), type: 'fit-node', nodeIds: [node.id] })}
              />
            </div>
          )}
        </div>

        {/* ── How to read the lines ── */}
        {payloadIsCurrent && graphVisible && legend.length > 0 && (
          <section className={styles.legend} aria-label="Förklaring till kopplingarna" data-testid="graph-legend">
            <p className={styles.legendTitle}>Kopplingar</p>
            <ul className={styles.legendList}>
              {legend.map(entry => (
                <li
                  key={entry.truth}
                  className={styles.legendItem}
                  data-truth={entry.truth}
                  title={`${entry.label}: ${entry.relations.join(', ')}`}
                >
                  <svg className={styles.legendSwatch} viewBox="0 0 30 6" aria-hidden="true">
                    <line x1="1" y1="3" x2="29" y2="3" strokeDasharray={RELATION_TRUTH_STROKE[entry.truth].dash} />
                  </svg>
                  <strong className={styles.legendLabel}>{entry.label}</strong>
                  <span className={styles.legendDescription}>{entry.description}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}

// ─── Small atoms ─────────────────────────────────────────────────────────────

function ModeButton({
  active, disabled, title, onClick, children,
}: {
  active: boolean
  disabled?: boolean
  title?: string
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={styles.mode}
      aria-pressed={disabled ? undefined : active}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function Chip({
  active, dotColor, onClick, children,
}: {
  active: boolean
  dotColor?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button type="button" className={styles.chip} aria-pressed={active} onClick={onClick}>
      {dotColor && <span className={styles.chipDot} style={{ backgroundColor: dotColor }} aria-hidden />}
      {children}
    </button>
  )
}

function StateMessage({ title, body, tone = 'default' }: { title: string; body: string; tone?: 'default' | 'error' }) {
  return (
    <div className={styles.state} data-tone={tone}>
      <p className={styles.stateTitle}>{title}</p>
      <p className={styles.stateBody}>{body}</p>
    </div>
  )
}
