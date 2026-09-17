'use client'

/**
 * What the Intelligence Graph says ABOUT the canvas, laid over and beside it.
 *
 *  - `SnapshotSummary` — the header's box: when the data was read, what it
 *    contains, and the one button that reads it again.
 *  - `GraphPlace` — the canvas's top-left corner: where the operator is, and
 *    every way the view on screen is narrower than the whole (a project scope,
 *    an isolation, active filters, a truncated code map). These stay visible
 *    by rule: a narrowed graph must never pass for the full one.
 *  - `GraphLegend` — the canvas's bottom-right corner: the three line styles
 *    in one row, with the full wording — and what a snapshot covers — one
 *    click away.
 *
 * Nothing here fetches or decides; every value is computed by the caller from
 * the payload on screen.
 */

import type { RefObject } from 'react'
import { ArrowLeft, Info, PanelRightOpen, RotateCw } from 'lucide-react'
import {
  OPERATIONS_RUN_CAP,
  RELATION_TRUTH_STROKE,
  type LegendEntry,
  type SnapshotCount,
  type SnapshotStamp,
} from '@/lib/os/intelligence-graph-shared'
import { usePopover } from './IntelligenceGraphControls'
import styles from './IntelligenceGraphVNext.module.css'

// ─── Snapshot ────────────────────────────────────────────────────────────────

export interface SnapshotSummaryProps {
  mode: 'system' | 'operations'
  stamp: SnapshotStamp | null
  loading: boolean
  onRefresh: () => void
  /** Figures of the payload on screen; null while nothing current can be counted. */
  figures: SnapshotCount[] | null
  /** The run window's label ("24 h"), said beside the run figure. */
  windowLabel: string
  runCapReached: boolean
}

export function SnapshotSummary({
  mode, stamp, loading, onRefresh, figures, windowLabel, runCapReached,
}: SnapshotSummaryProps) {
  const operations = mode === 'operations'
  // A code map with nothing to stamp has nothing to summarise either.
  if (!operations && !stamp) return null

  return (
    <div className={styles.snapshot} data-testid="graph-snapshot">
      <div className={styles.snapshotStamp}>
        {stamp && (
          <p
            className={styles.stamp}
            title={stamp.detail ?? undefined}
            aria-live={operations ? 'polite' : undefined}
            data-testid="graph-stamp"
          >
            {stamp.label}
          </p>
        )}
        {operations && <p className={styles.stampNote}>Uppdateras inte automatiskt.</p>}
      </div>

      {figures && figures.length > 0 && (
        <section
          className={styles.figures}
          aria-label={operations ? 'Antal i denna ögonblicksbild' : 'Antal i den här vyn'}
          data-testid="graph-counts"
        >
          <ul className={styles.figureList}>
            {figures.map(item => (
              <li key={item.kind} className={styles.figure} data-kind={item.kind}>
                {/* Read as "13 körningar · senaste 24 h, 1 misslyckades"; drawn with the breakdown beside the number. */}
                <strong className={styles.figureValue}>{item.value}</strong>
                <span className={styles.figureNoun}>
                  {item.noun}
                  {operations && item.kind === 'run' ? ` · senaste ${windowLabel}` : null}
                </span>
                {item.breakdown.length > 0 && (
                  <span className={styles.figureBreakdown}>
                    {item.breakdown.map(entry => (
                      <span key={entry.status} className={styles.figureStatus} data-tone={entry.tone}>
                        {entry.value} {entry.label}
                      </span>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {operations && runCapReached && (
            <p className={styles.capNote} role="note" data-testid="graph-run-cap">
              Taket på {OPERATIONS_RUN_CAP} körningar nåddes — äldre körningar i fönstret kan saknas.
            </p>
          )}
        </section>
      )}

      {operations && (
        <button
          type="button"
          className={styles.refresh}
          onClick={onRefresh}
          disabled={loading}
          data-testid="graph-refresh"
        >
          <RotateCw className={styles.buttonIcon} aria-hidden />
          {loading ? 'Uppdaterar…' : 'Uppdatera'}
        </button>
      )}
    </div>
  )
}

// ─── Place ───────────────────────────────────────────────────────────────────

export interface GraphPlaceProps {
  location: string[]
  onBack: (() => void) | null
  /** Live Operations fetched for one project only. */
  projectScope: { name: string; onClear: () => void } | null
  isolate: { label: string; onExit: () => void; onFit: () => void } | null
  /** Kind or status filters dim part of the graph. */
  filters: { matchCount: number; onClear: () => void } | null
  criticalOutsideFilters: number
  /** The code map was cut to this many nodes. */
  truncatedAt: number | null
  noMatch: boolean
  /** A selection whose panel the operator put away. */
  hiddenInspector: { label: string; onShow: () => void; buttonRef: RefObject<HTMLButtonElement> } | null
}

export function GraphPlace({
  location, onBack, projectScope, isolate, filters, criticalOutsideFilters, truncatedAt, noMatch, hiddenInspector,
}: GraphPlaceProps) {
  // At the top of an unfiltered graph there is nothing to say; the corner stays the canvas's.
  const quiet = !onBack && location.length <= 1 && !projectScope && !isolate && !filters
    && criticalOutsideFilters === 0 && truncatedAt === null && !noMatch && !hiddenInspector
  if (quiet) return null

  return (
    <div className={`${styles.hud} ${styles.hudTop}`} data-testid="graph-place" data-graph-chrome-items>
      {onBack && (
        <button type="button" onClick={onBack} className={styles.hudButton}>
          <ArrowLeft className={styles.buttonIcon} aria-hidden /> Tillbaka
        </button>
      )}

      <nav aria-label="Plats i grafen" className={styles.location}>
        {location.map((crumb, index) => (
          <span key={`${crumb}:${index}`} data-current={index === location.length - 1 ? 'true' : undefined} title={crumb}>
            {index > 0 ? <span className={styles.locationSeparator} aria-hidden>/</span> : null}{crumb}
          </span>
        ))}
      </nav>

      {projectScope && (
        <span className={styles.hudChip} data-testid="graph-project-scope">
          <span>Projekt: <strong>{projectScope.name}</strong></span>
          <button type="button" onClick={projectScope.onClear} className={styles.inlineAction} aria-label="Visa alla projekt">
            Visa alla
          </button>
        </span>
      )}

      {isolate && (
        <div className={styles.scopeBar} role="status">
          <span>Isolerad: <strong>{isolate.label}</strong></span>
          <button type="button" onClick={isolate.onExit} className={styles.inlineAction}>Lämna isolering</button>
          <button type="button" onClick={isolate.onFit} className={styles.inlineAction}>Anpassa till urvalet</button>
        </div>
      )}

      {filters && (
        <span className={styles.filterState}>
          {filters.matchCount} matchar · övriga dimmade
          <button type="button" onClick={filters.onClear} className={styles.inlineAction}>Rensa filter</button>
        </span>
      )}

      {criticalOutsideFilters > 0 && (
        <span className={styles.filterNote} data-tone="waiting">
          {criticalOutsideFilters} kritiska objekt bevarade utanför filtermatch
        </span>
      )}

      {truncatedAt !== null && (
        <span className={styles.filterNote} data-tone="waiting">
          Vyn är trunkerad — högst {truncatedAt} noder visas
        </span>
      )}

      {noMatch && (
        <span className={styles.noMatch} role="status">
          Inga noder matchar filtren. Grafens struktur ligger kvar dimmad.
        </span>
      )}

      {hiddenInspector && (
        <button
          ref={hiddenInspector.buttonRef}
          type="button"
          onClick={hiddenInspector.onShow}
          className={styles.hudButton}
          title={`Visa inspektören för ${hiddenInspector.label}`}
          data-testid="graph-show-inspector"
        >
          <PanelRightOpen className={styles.buttonIcon} aria-hidden /> Visa inspektören
        </button>
      )}
    </div>
  )
}

// ─── Legend ──────────────────────────────────────────────────────────────────

export interface GraphLegendProps {
  entries: LegendEntry[]
  /** What a Live Operations snapshot covers; null outside Live Operations. */
  snapshotNote: string | null
  /** How the graph is drawn — the page's promise, said first. */
  about: string
}

export function GraphLegend({ entries, snapshotNote, about }: GraphLegendProps) {
  const popover = usePopover()
  const panelId = 'graph-legend-panel'

  return (
    <section
      ref={popover.rootRef}
      className={styles.legend}
      aria-label="Förklaring till grafen"
      data-testid="graph-legend"
    >
      <div id={panelId} className={styles.legendPanel} hidden={!popover.open}>
        <div className={styles.legendSection}>
          <p className={styles.legendTitle}>Om grafen</p>
          <p className={styles.legendNote}>{about}</p>
        </div>
        {entries.length > 0 && (
          <div className={styles.legendSection}>
            <p className={styles.legendTitle}>Kopplingar</p>
            <ul className={styles.legendList}>
              {entries.map(entry => (
                <li key={entry.truth} className={styles.legendItem} data-truth={entry.truth}>
                  <svg className={styles.legendSwatch} viewBox="0 0 30 6" aria-hidden="true">
                    <line x1="1" y1="3" x2="29" y2="3" strokeDasharray={RELATION_TRUTH_STROKE[entry.truth].dash} />
                  </svg>
                  <span className={styles.legendText}>
                    <strong className={styles.legendLabel}>{entry.label}</strong>{' '}
                    <span className={styles.legendDescription}>{entry.description}</span>
                    <span className={styles.legendRelations}>{entry.relations.join(' · ')}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {snapshotNote && (
          <div className={styles.legendSection}>
            <p className={styles.legendTitle}>Om ögonblicksbilden</p>
            <p className={styles.legendNote}>{snapshotNote}</p>
          </div>
        )}
      </div>

      <div className={styles.legendBar} data-graph-chrome>
        {entries.length > 0 && (
          <ul className={styles.legendKey} aria-label="Linjestil efter källa">
            {entries.map(entry => (
              <li
                key={entry.truth}
                className={styles.legendKeyItem}
                data-truth={entry.truth}
                title={`${entry.label}: ${entry.relations.join(', ')}`}
              >
                <svg className={styles.legendSwatch} viewBox="0 0 30 6" aria-hidden="true">
                  <line x1="1" y1="3" x2="29" y2="3" strokeDasharray={RELATION_TRUTH_STROKE[entry.truth].dash} />
                </svg>
                {entry.label}
              </li>
            ))}
          </ul>
        )}
        <button
          ref={popover.triggerRef}
          type="button"
          className={styles.legendToggle}
          aria-expanded={popover.open}
          aria-controls={panelId}
          onClick={() => popover.setOpen(open => !open)}
        >
          <Info className={styles.buttonIcon} aria-hidden /> Förklaring
        </button>
      </div>
    </section>
  )
}
