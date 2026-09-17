'use client'

/**
 * The Intelligence Graph control bar — one row above the canvas.
 *
 * T1 spent two rows and a counts strip on controls; the canvas got what was
 * left. Here the modes stay in view, search stays one keystroke away, and the
 * rest folds into two menus: Filter (project, time window, run status, node
 * kinds, relations) and a menu for the resets and fullscreen. What a filter
 * DOES to the graph is never folded away — the canvas says it in its own
 * corner (`GraphPlace`), so a narrowed view cannot pass for the whole one.
 *
 * Every value and handler comes from `useIntelligenceGraph`; this file owns
 * nothing but whether a menu is open.
 */

import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Maximize2, Minimize2, MoreHorizontal, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react'
import type { IntelligenceGraphNode } from '@/lib/intelligence/graph-contract'
import { nodeColor } from '@/components/platform/intelligence/GraphCanvas'
import {
  RUN_STATUS_FILTERS,
  TIME_FILTERS,
  toggle,
  type useIntelligenceGraph,
} from '@/components/platform/intelligence/useIntelligenceGraph'
import { kindFilterLabel, kindLabel, nodeStatus } from '@/lib/os/intelligence-graph-shared'
import styles from './IntelligenceGraphVNext.module.css'

type GraphState = ReturnType<typeof useIntelligenceGraph>

/**
 * A menu that closes on Escape (handing focus back to its button) and on a
 * pointer press outside it. Nothing traps focus: Tab leaves the menu the way
 * it leaves any other group of buttons.
 */
export function usePopover() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // Only a menu the operator is in: Escape on the canvas belongs to the graph.
      if (!rootRef.current?.contains(document.activeElement)) return
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const close = useCallback(() => setOpen(false), [])
  return { open, setOpen, close, rootRef, triggerRef }
}

export interface IntelligenceGraphControlsProps {
  graph: GraphState
  searchInputRef: RefObject<HTMLInputElement>
  replayUnavailable: string
  /** The relation's name in the product's words. */
  relationName: (relation: string) => string
  fullscreen: boolean
  onToggleFullscreen: () => void
}

export function IntelligenceGraphControls({
  graph, searchInputRef, replayUnavailable, relationName, fullscreen, onToggleFullscreen,
}: IntelligenceGraphControlsProps) {
  const { mode, switchMode } = graph

  return (
    <div className={styles.controls} data-testid="graph-controls">
      <div className={styles.modes} role="group" aria-label="Grafläge">
        <ModeButton active={mode === 'system'} onClick={() => switchMode('system')}>System Map</ModeButton>
        <ModeButton active={mode === 'operations'} onClick={() => switchMode('operations')}>Live Operations</ModeButton>
        <ModeButton active={false} disabled title={replayUnavailable}>Execution Replay</ModeButton>
      </div>

      <div className={styles.controlsEnd}>
        <GraphSearch graph={graph} inputRef={searchInputRef} />
        <FilterMenu graph={graph} relationName={relationName} />
        <ViewMenu graph={graph} fullscreen={fullscreen} onToggleFullscreen={onToggleFullscreen} />
      </div>
    </div>
  )
}

// ─── Search ──────────────────────────────────────────────────────────────────

function GraphSearch({ graph, inputRef }: { graph: GraphState; inputRef: RefObject<HTMLInputElement> }) {
  const { query, setQuery, searchPending, visibleHits, openSearchHit } = graph
  return (
    <div className={styles.search}>
      <Search className={styles.searchIcon} aria-hidden />
      <input
        ref={inputRef}
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
  )
}

// ─── Filter ──────────────────────────────────────────────────────────────────

function FilterMenu({ graph, relationName }: { graph: GraphState; relationName: (relation: string) => string }) {
  const {
    mode, data, projectFilter, setProjectFilter, hours, setHours, statusFilter, setStatusFilter,
    presentKinds, kindFilter, setKindFilter, presentRelations, relationFilter, setRelationFilter,
    filtersActive, clearFilters,
  } = graph
  const popover = usePopover()
  const panelId = `${useId()}-filters`
  const operations = mode === 'operations'
  const showKinds = presentKinds.length > 1
  const showRelations = presentRelations.length > 1
  if (!operations && !showKinds && !showRelations) return null

  const activeCount = kindFilter.size + relationFilter.size + statusFilter.size
  return (
    <div ref={popover.rootRef} className={styles.popoverAnchor}>
      <button
        ref={popover.triggerRef}
        type="button"
        className={styles.controlButton}
        aria-expanded={popover.open}
        aria-controls={panelId}
        onClick={() => popover.setOpen(open => !open)}
        data-testid="graph-filter-toggle"
      >
        <SlidersHorizontal className={styles.buttonIcon} aria-hidden />
        Filter
        {activeCount > 0 && <span className={styles.controlBadge} aria-label={`${activeCount} aktiva`}>{activeCount}</span>}
      </button>

      <div
        id={panelId}
        className={`${styles.popover} ${styles.filterPanel}`}
        data-columns={operations ? 'two' : 'one'}
        hidden={!popover.open}
        data-testid="graph-filter-panel"
      >
        {operations && (
          <>
            <label className={styles.popoverGroup}>
              <span className={styles.popoverLabel}>Projekt</span>
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
            </label>

            <div className={styles.popoverGroup}>
              <span className={styles.popoverLabel}>Tidsfönster för körningar</span>
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
            </div>

            <div className={styles.popoverGroup}>
              <span className={styles.popoverLabel}>Körningsstatus</span>
              <div className={styles.chips} role="group" aria-label="Körningsstatus">
                {RUN_STATUS_FILTERS.map(filter => (
                  <Chip key={filter.id} active={statusFilter.has(filter.id)} onClick={() => toggle(statusFilter, filter.id, setStatusFilter)}>
                    {filter.label}
                  </Chip>
                ))}
              </div>
            </div>
          </>
        )}

        {showKinds && (
          <div className={styles.popoverGroup}>
            <span className={styles.popoverLabel}>Nodtyper</span>
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
          </div>
        )}

        {showRelations && (
          <div className={`${styles.popoverGroup} ${styles.popoverWide}`}>
            <span className={styles.popoverLabel}>Relationer</span>
            <div className={styles.chips} role="group" aria-label="Relationer">
              {presentRelations.map(relation => (
                <Chip key={relation} active={relationFilter.has(relation)} onClick={() => toggle(relationFilter, relation, setRelationFilter)}>
                  {relationName(relation)}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {/* What each group does, per `computeGraphFilterState` and the hook's fetch parameters. */}
        <p className={`${styles.popoverNote} ${styles.popoverWide}`}>
          {operations
            ? 'Projekt och tidsfönster styr vad som hämtas. Status, nodtyper och relationer dimmar det som inte matchar – objekt som kräver uppmärksamhet dimmas inte.'
            : 'Nodtyper och relationer dimmar det som inte matchar. Strukturen ligger kvar.'}
        </p>

        <div className={`${styles.popoverFooter} ${styles.popoverWide}`}>
          <button type="button" className={styles.inlineAction} onClick={clearFilters} disabled={!filtersActive}>
            Rensa filter
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── View menu ───────────────────────────────────────────────────────────────

function ViewMenu({
  graph, fullscreen, onToggleFullscreen,
}: {
  graph: GraphState
  fullscreen: boolean
  onToggleFullscreen: () => void
}) {
  const popover = usePopover()
  const panelId = `${useId()}-view`
  const run = (action: () => void) => () => { popover.close(); action() }

  return (
    <div ref={popover.rootRef} className={styles.popoverAnchor}>
      <button
        ref={popover.triggerRef}
        type="button"
        className={`${styles.controlButton} ${styles.iconButton}`}
        aria-expanded={popover.open}
        aria-controls={panelId}
        aria-label="Vy: återställ och helskärm"
        title="Återställ och helskärm"
        onClick={() => popover.setOpen(open => !open)}
        data-testid="graph-view-toggle"
      >
        <MoreHorizontal className={styles.buttonIcon} aria-hidden />
      </button>

      <div id={panelId} className={`${styles.popover} ${styles.menu}`} hidden={!popover.open} data-testid="graph-view-panel">
        <MenuItem icon={<RotateCcw className={styles.buttonIcon} aria-hidden />} onClick={run(graph.resetView)} hint="Rensar val och fördjupning och anpassar vyn">
          Återställ vy
        </MenuItem>
        <MenuItem icon={<X className={styles.buttonIcon} aria-hidden />} onClick={run(graph.resetAll)} hint="Rensar även filter, sökning, isolering och historik">
          Återställ allt
        </MenuItem>
        <MenuItem
          icon={fullscreen ? <Minimize2 className={styles.buttonIcon} aria-hidden /> : <Maximize2 className={styles.buttonIcon} aria-hidden />}
          onClick={run(onToggleFullscreen)}
          hint={fullscreen ? 'Tillbaka till sidan' : 'Grafen och kontrollerna fyller skärmen'}
        >
          {fullscreen ? 'Avsluta helskärm' : 'Helskärm'}
        </MenuItem>
      </div>
    </div>
  )
}

// ─── Small atoms ─────────────────────────────────────────────────────────────

function MenuItem({ icon, hint, onClick, children }: { icon: ReactNode; hint: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={styles.menuItem} onClick={onClick}>
      <span className={styles.menuItemLabel}>{icon}{children}</span>
      <span className={styles.menuItemHint}>{hint}</span>
    </button>
  )
}

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

export function Chip({
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
