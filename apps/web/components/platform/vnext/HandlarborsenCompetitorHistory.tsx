import type { HistoryAnalysis } from '@/lib/atlas/project-analytics/handlarborsen-competitor-history-core'
import styles from './HandlarborsenCompetitorHistory.module.css'

/**
 * Read-only decision dashboard. A null input is the explicit OFF state; never
 * substitute fixture events, projected counts, or zeroes for absent history.
 */
export function HandlarborsenCompetitorHistory({ history, historyEnabled = false }: { history: HistoryAnalysis | null; historyEnabled?: boolean }) {
  if (!history) {
    return (
      <section className={styles.panel} aria-labelledby="hb-competitor-history">
        <header className={styles.heading}>
          <div>
            <p className={styles.kicker}>Konkurrentspanaren / Historik</p>
            <h2 id="hb-competitor-history">Förändringar över tid</h2>
          </div>
          <span className={styles.disabled}>{historyEnabled ? 'Kan inte läsa historik' : 'Inväntar lagring'}</span>
        </header>
        <p className={styles.explainer}>
          {historyEnabled
            ? 'Historik är aktiverad men kunde inte hämtas eller verifieras. Inga mätvärden visas.'
            : 'Historik är avstängd i den här miljön. Tidigare sparade observationer raderas inte och visas när läsningen aktiveras. Inga påhittade värden visas.'}
        </p>
      </section>
    )
  }

  if (history.status === 'invalid') {
    return (
      <section className={styles.panel} aria-labelledby="hb-competitor-history">
        <h2 id="hb-competitor-history">Förändringar över tid</h2>
        <p role="alert" className={styles.warning}>Historiken kunde inte verifieras. Inga förändringsvärden visas.</p>
      </section>
    )
  }

  const days = history.daily
  const changed = history.comparisons.filter(item => item.kind === 'changed').length
  const validComparisons = history.comparisons.filter(item => item.kind === 'changed' || item.kind === 'unchanged').length
  const maxBar = Math.max(1, ...days.map(day => day.comparablePairs))

  return (
    <section className={styles.panel} aria-labelledby="hb-competitor-history">
      <header className={styles.heading}>
        <div>
          <p className={styles.kicker}>Konkurrentspanaren / Historik</p>
          <h2 id="hb-competitor-history">Förändringar över tid</h2>
        </div>
        <span className={styles.verified}>Observerade data</span>
      </header>
      {days.length === 0 ? (
        <p className={styles.explainer}>
          Inga observationer är sparade ännu. En kontroll måste göras och lagras innan den första mätpunkten finns.
        </p>
      ) : (
        <>
          <div className={styles.summary}>
            <div><span>Observerade dagar</span><strong>{history.observedDays}</strong></div>
            <div><span>Kontrollerade källor</span><strong>{history.successfullyObservedSources} / {history.sourceCount}</strong></div>
            <div><span>Jämförbara rubriker</span><strong>{validComparisons}</strong></div>
            <div><span>Ändrade titlar</span><strong>{changed}</strong></div>
          </div>
          <div className={styles.chart} role="img" aria-label="Verkliga UTC-dagar med antal jämförbara och ändrade sidtitlar; inga saknade dagar interpoleras">
            {days.map(day => (
              <div className={styles.day} key={day.date}>
                <div className={styles.plot}>
                  {day.comparablePairs > 0 && (
                    <div className={styles.bar} style={{ height: day.comparablePairs / maxBar * 100 + '%' }}>
                      {day.changedTitles > 0 && (
                        <div className={styles.changed} style={{ height: day.changedTitles / day.comparablePairs * 100 + '%' }} />
                      )}
                    </div>
                  )}
                </div>
                <time dateTime={day.date}>{day.date.slice(5)}</time>
                <span>{day.comparablePairs === 0 ? 'Ingen jämförelse' : day.changedTitles + '/' + day.comparablePairs + ' ändrade'}</span>
              </div>
            ))}
          </div>
          <p className={styles.explainer}>Blått: jämförbara titlar. Turkost: ändrade titlar. Endast sparade UTC-dagar visas; saknade dagar och misslyckade kontroller är inte noll.</p>
        </>
      )}
      <div className={styles.proposals}>
        <h3>Atlas · att granska</h3>
        {history.proposals.length === 0 ? (
          <p>Inga verifierade titelskillnader kräver manuell granskning med det här underlaget.</p>
        ) : (
          <ol>
            {history.proposals.map(proposal => (
              <li key={proposal.id}>
                <strong>{proposal.title}</strong>
                <p>{proposal.prompt}</p>
                <small>{proposal.sourceId} · {proposal.observedBefore.slice(0, 10)} → {proposal.observedAfter.slice(0, 10)}</small>
                <details>
                  <summary>Visa exakt underlag</summary>
                  <p>Före: {proposal.evidence[0].title}</p>
                  <p>Efter: {proposal.evidence[1].title}</p>
                </details>
                <span className={styles.review}>Förslag – inte godkänt eller utfört</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}
