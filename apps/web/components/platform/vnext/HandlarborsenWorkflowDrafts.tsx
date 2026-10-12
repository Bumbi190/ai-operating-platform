import type { MarketplaceReport } from '@/lib/atlas/project-analytics/handlarborsen-marketplace-report'
import { deriveHandlarborsenWorkflowDrafts } from '@/lib/atlas/project-analytics/handlarborsen-workflow-drafts'
import styles from './HandlarborsenWorkflowDrafts.module.css'

/** Server-rendered paper data, using the already authorized report and clock. */
export function HandlarborsenWorkflowDrafts({ report, now }: { report: MarketplaceReport; now: Date }) {
  const drafts = deriveHandlarborsenWorkflowDrafts(report, now)
  return (
    <section className={styles.section} aria-labelledby="hb-workflow-drafts">
      <h2 id="hb-workflow-drafts">Föreslagna arbetsflöden</h2>
      <strong className={styles.label}>Förhandsutkast – inte sparade</strong>
      <p>Manuella granskningsförslag. Inga arbetsflöden har skapats och inget kan köras här.</p>
      {drafts.length === 0 && <p>Inget granskningsförslag från aktuellt underlag.</p>}
      <div className={styles.cards}>
        {drafts.map((draft) => (
          <article className={styles.card} key={draft.id} data-paper-draft={draft.kind}>
            <h3>{draft.objective}</h3>
            <p className={styles.status}>{draft.status === 'blocked' ? 'Blockerat underlag' : 'Endast förhandsutkast'}</p>
            <p>{draft.evidenceSummary}</p>
            {draft.blockers.length > 0 && <ul aria-label="Blockerande skäl">{draft.blockers.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
            <details className={styles.steps}>
              <summary>Manuella steg – visa checklista</summary>
              <ol>{draft.humanChecklist.map((step) => <li key={step}>{step}</li>)}</ol>
            </details>
            <details className={styles.evidence}>
              <summary>Exakt underlag och proveniens</summary>
              <dl>
                <dt>Projekt</dt><dd>{draft.projectId}</dd>
                <dt>Snapshotdatum</dt><dd>{draft.sourceSnapshotDate ?? 'Okänt'}</dd>
                <dt>Observerat</dt><dd>{draft.observedAt ?? 'Okänt'}</dd>
                <dt>Regelversion</dt><dd>{draft.ruleVersion}</dd>
                <dt>Snapshotreferens</dt><dd>{draft.evidenceRefs.join('\n') || 'Saknas'}</dd>
                <dt>Underlagets stabila id</dt><dd>{draft.sourceInsightId}</dd>
                <dt>Utkastets stabila id</dt><dd>{draft.id}</dd>
              </dl>
              <pre>{JSON.stringify(draft.evidence, null, 2)}</pre>
            </details>
          </article>
        ))}
      </div>
    </section>
  )
}
