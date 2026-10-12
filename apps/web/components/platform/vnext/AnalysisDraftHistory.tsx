import type { AnalysisDraftView } from '@/lib/atlas/project-analytics/analysis-draft-service'
import { InsightEvidence } from './HandlarborsenInsights'
import styles from './AnalysisDraftHistory.module.css'
export function AnalysisDraftHistory({
  items,
  nextCursor,
  slug,
}: {
  items: AnalysisDraftView[]
  nextCursor: string | null
  slug: string
}) {
  const root = '/projects/' + encodeURIComponent(slug) + '/atlas/analysis-drafts'
  return (
    <section className={styles.history} aria-label="Sparade analysutkast">
      {items.length === 0 && <p>Inga analysutkast har sparats för projektet.</p>}
      <ol className={styles.list}>
        {items.map((view, index) => (
          <li key={view.draft.id + '-' + index}>
            <article className={styles.card}>
              <p className={styles.kicker}>Analysutkast · Att granska</p>
              <h2>
                <a href={root + '/' + view.draft.id}>{view.draft.insight.title}</a>
              </h2>
              <p className={styles.identifier}>ID: {view.draft.id}</p>
              <p>
                Sparat{' '}
                <time dateTime={view.draft.createdAt}>
                  {new Date(view.draft.createdAt).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' })}
                </time>{' '}
                · svensk tid
              </p>
              <ul className={styles.warnings} aria-label="Aktuell bedömning">
                {view.stale && <li>Äldre än 26 timmar · ny bedömning behövs</li>}
                {view.supersededBy && (
                  <li>
                    Ersatt av{' '}
                    <a href={root + '/' + view.supersededBy} className={styles.identifier}>
                      {view.supersededBy}
                    </a>
                  </li>
                )}
                {view.applicability === 'new_evidence' && <li>Nytt underlag finns</li>}
                {view.applicability === 'needs_assessment' && <li>Ny bedömning behövs innan underlaget används</li>}
                {view.applicability === 'unknown' && (
                  <li>Aktuell tillämplighet är okänd · det sparade underlaget visas nedan</li>
                )}
                {view.applicability === 'current' && <li>Underlaget motsvarar den aktuella rapporten</li>}
              </ul>
              <p>{view.draft.insight.observation}</p>
              <p>{view.draft.insight.reviewReason}</p>
              <h3>Manuella kontroller</h3>
              <ol>
                {view.draft.manualSteps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
              <details>
                <summary>Sparad evidens och kvalitet</summary>
                <InsightEvidence insight={view.draft.insight} />
                <p>
                  Bedömt <time dateTime={view.draft.evaluatedAt}>{view.draft.evaluatedAt}</time> · aktuellt till{' '}
                  {view.draft.freshUntil}
                </p>
                <pre className={styles.raw}>{JSON.stringify(view.draft.insight.quality, null, 2)}</pre>
              </details>
              <details>
                <summary>Fullständigt sparat källunderlag</summary>
                <p>
                  Underlagets hash: <code className={styles.identifier}>{view.draft.evidenceHash}</code>
                </p>
                <pre className={styles.raw}>{JSON.stringify(view.draft.sourceEnvelope, null, 2)}</pre>
              </details>
            </article>
          </li>
        ))}
      </ol>
      {nextCursor && (
        <a className={styles.pageLink} href={root + '?cursor=' + encodeURIComponent(nextCursor)}>
          Nästa sida
        </a>
      )}
    </section>
  )
}
