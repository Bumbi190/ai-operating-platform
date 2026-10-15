import * as React from 'react'
import { reconcileDiscovery } from '@/lib/atlas/project-analytics/handlarborsen-competitor-discovery-core'
import { MANUALLY_REVIEWED_DISCOVERY_LEADS } from '@/lib/atlas/project-analytics/handlarborsen-competitor-discovery-leads'
import type { CandidateMemoryLoad } from '@/lib/atlas/project-analytics/handlarborsen-competitor-memory-service'
import { HandlarborsenSaveReviewedLead } from './HandlarborsenSaveReviewedLead'
import styles from './HandlarborsenCompetitors.module.css'

/**
 * P1 candidate register stays inactive until the reviewed SQL is applied and
 * the owner-only flag is enabled. No unscheduled search, public URLs, cost or
 * notification delivery is implied by this panel.
 */
export function HandlarborsenCompetitorDiscovery({
  memory = null,
  memoryEnabled = false,
}: {
  memory?: CandidateMemoryLoad | null
  memoryEnabled?: boolean
}) {
  const staticReview = reconcileDiscovery(MANUALLY_REVIEWED_DISCOVERY_LEADS, [], new Date())
  const stored = memoryEnabled && memory?.status === 'ok' ? memory.candidates : null
  const unavailable = memoryEnabled && !stored
  const entries = stored?.length ? stored : staticReview.status === 'ok' ? staticReview.candidates : []

  return (
    <section className={styles.panel} aria-labelledby="hb-new-competitor-discovery">
      <p className={styles.kicker}>ATLAS / UPPTÄCK FLER AKTÖRER</p>
      <h2 id="hb-new-competitor-discovery">Nya konkurrenter att granska</h2>
      <p>
        Automatiskt sök efter nya aktörer och externa aviseringar är ännu <strong>inte aktiverade</strong>.
        En kandidat är ny för Omniras bevakningslista – det betyder inte att företaget precis har startat.
      </p>
      {unavailable ? (
        <p role="alert">Kandidatminnet är aktiverat men kan inte läsas eller verifieras. Inga registeruppgifter visas.</p>
      ) : (
        <>
          {stored ? (
            <p role="status">
              Projektbundet kandidatminne: {memory?.status === 'ok' ? memory.awaitingReview : 0} kandidat(er)
              inväntar manuell granskning. Ingen notis har skickats och inga bevakningskällor har ändrats.
            </p>
          ) : null}
          {entries.length === 0 ? <p>Inga granskade kandidater finns i denna version.</p> : (
            <div className={styles.cards}>
              {entries.map(candidate => (
                <article className={styles.panel} key={candidate.host}>
                  <p className={styles.kicker}>
                    {stored?.some(row => row.host === candidate.host)
                      ? 'Sparad kandidatsignal · inväntar granskning'
                      : 'Förslag · inväntar granskning'}
                  </p>
                  <h3>{candidate.name}</h3>
                  <p>{candidate.relevance}</p>
                  <p>Observerad på officiell webbplats: <time dateTime={candidate.observedOn}>{candidate.observedOn}</time>.</p>
                  {'firstSeenAt' in candidate && typeof candidate.firstSeenAt === 'string'
                    ? <p>Först sparad i Omnira: <time dateTime={candidate.firstSeenAt}>{candidate.firstSeenAt.slice(0, 10)}</time>.</p>
                    : null}
                  <p><a href={candidate.officialUrl} className={styles.link} target="_blank" rel="noopener noreferrer">Öppna officiell källa ↗</a></p>
                  <p>Atlas får föreslå vidare kontroll, men får inte lägga till skanningskällor eller ändra Handlarbörsen utan ditt godkännande.</p>
                </article>
              ))}
            </div>
          )}
          {stored ? <HandlarborsenSaveReviewedLead /> : null}
        </>
      )}
      <p>
        Nästa nivå: en avtalsgodkänd sökkälla, återkommande kontroller och projektbundna aviseringar
        efter Cost Governance. Kandidatminnet är för manuell granskning och utför inga automatiska åtgärder.
      </p>
    </section>
  )
}
