'use client'

/**
 * Registered model calls in the SAME Intelligence Graph snapshot.
 * No extra polling, billing API, model invocation or fictitious graph edges.
 */
import * as React from 'react'
import type { ModelActivitySnapshot } from '@/lib/intelligence/model-activity'
import styles from './ModelActivityPanel.module.css'

export interface ModelActivityPanelProps {
  activity: ModelActivitySnapshot | undefined
  projects: readonly { id: string; name: string }[]
  runningRunIds: ReadonlySet<string>
  onFocusProject: (projectId: string) => void
}

const kr = (value: number) => new Intl.NumberFormat('sv-SE', {
  style: 'currency', currency: 'SEK', maximumFractionDigits: 2,
}).format(value)

const timeLabel = (iso: string) => new Intl.DateTimeFormat('sv-SE', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Stockholm',
}).format(new Date(iso))

export function ModelActivityPanel({
  activity, projects, runningRunIds, onFocusProject,
}: ModelActivityPanelProps): JSX.Element {
  const names = new Map(projects.map(project => [project.id, project.name]))
  const state = activity?.state ?? 'unavailable'
  const items = activity?.byModel ?? []
  const valid = state !== 'unavailable'
  const partial = state === 'partial'

  return (
    <details className={styles.panel} data-testid="model-activity-panel" data-state={state}>
      <summary className={styles.summary}>
        <span className={styles.heading}>
          <span className={styles.indicator} aria-hidden="true" />
          <strong>Registrerad modellanvändning</strong>
        </span>
        <span className={styles.headlineValue}>
          {!valid ? 'Kostnadsunderlag saknas' :
            `${activity!.recordedCalls} anrop · ${kr(activity!.observedCostSek ?? 0)}`}
        </span>
        <span className={styles.expand}>Visa detaljer</span>
      </summary>
      <div className={styles.body}>
        <p className={styles.explanation}>
          Hämtad ur Omniras cost_events för de senaste {activity?.periodHours ?? 24} timmarna.
          Modeller som bara är konfigurerade på agenter räknas inte som anrop.
          Detta är inte en avstämd AWS- eller Vercel-faktura.
        </p>
        {partial && (
          <p className={styles.notice} role="status">
            Underlaget är ofullständigt. Summan gäller endast de validerade poster som hämtats.
          </p>
        )}
        {!valid && (
          <p className={styles.notice} role="status">
            Modellkostnader kunde inte läsas. Okända värden visas inte som noll.
          </p>
        )}
        {valid && items.length === 0 && (
          <p className={styles.empty}>Inga registrerade modellanrop inom det valda tidsfönstret.</p>
        )}
        {valid && items.length > 0 && (
          <div className={styles.list}>
            {items.map(item => {
              const activeLink = item.runIds.some(runId => runningRunIds.has(runId))
              return (
                <button
                  type="button"
                  key={JSON.stringify([item.projectId, item.provider, item.model])}
                  className={styles.item}
                  onClick={() => onFocusProject(item.projectId)}
                  title="Visa projektet i Intelligence Graph"
                >
                  <span className={styles.modelTitle}>
                    <span className={activeLink ? styles.linkedRun : styles.modelDot}
                      aria-hidden="true" />
                    <strong>{item.model ?? 'Modell ej angiven'}</strong>
                    <small>{item.provider}</small>
                  </span>
                  <span className={styles.modelProject}>{names.get(item.projectId) ?? 'Projekt'}</span>
                  <span className={styles.cost}>{kr(item.costSek)}</span>
                  <span className={styles.count}>
                    {item.calls} anrop
                    {activeLink ? ' · kopplad till pågående körning' : ''}
                  </span>
                  <span className={styles.timestamp}>Senast {timeLabel(item.lastSeen)}</span>
                </button>
              )
            })}
          </div>
        )}
        {valid && (
          <p className={styles.footer}>
            {activity!.unlinkedCalls} av {activity!.recordedCalls} registrerade anrop saknar
            verifierad koppling till en körning i den aktuella grafen.
            En pulserande punkt betyder endast att en kopplad körning har status pågår
            vid senaste hämtningen, inte att modellen just nu genererar.
          </p>
        )}
      </div>
    </details>
  )
}
