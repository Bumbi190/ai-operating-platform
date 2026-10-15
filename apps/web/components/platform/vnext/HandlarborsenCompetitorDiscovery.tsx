import * as React from 'react'
import { reconcileDiscovery } from '@/lib/atlas/project-analytics/handlarborsen-competitor-discovery-core'
import { MANUALLY_REVIEWED_DISCOVERY_LEADS } from '@/lib/atlas/project-analytics/handlarborsen-competitor-discovery-leads'
import styles from './HandlarborsenCompetitors.module.css'

/**
 * P0: editorial lead review only. No search API, cron, writes, emails, or
 * fabricated launch dates. The dynamic discovery/notification engine will
 * be exposed only after permissioned sources, storage and Cost Governance.
 */
export function HandlarborsenCompetitorDiscovery() {
  const result = reconcileDiscovery(MANUALLY_REVIEWED_DISCOVERY_LEADS, [], new Date())
  return (
    <section className={styles.panel} aria-labelledby="hb-new-competitor-discovery">
      <p className={styles.kicker}>ATLAS / UPPTÄCK FLER AKTÖRER</p>
      <h2 id="hb-new-competitor-discovery">Nya konkurrenter att granska</h2>
      <p>
        Automatiskt sök efter nya aktörer och aviseringar är ännu <strong>inte aktiverade</strong>.
        Här visas separat källgranskade kandidater. En kandidat är ny för Omniras bevakningslista –
        det betyder inte att företaget precis har startat.
      </p>
      {result.status === 'invalid' ? (
        <p role="alert">Kandidatunderlaget är ogiltigt. Inga granskningsförslag kan skapas.</p>
      ) : result.candidates.length === 0 ? (
        <p>Inga manuellt granskade kandidater finns i denna version.</p>
      ) : (
        <div className={styles.cards}>
          {result.candidates.map(candidate => (
            <article className={styles.panel} key={candidate.identity}>
              <p className={styles.kicker}>Förslag · inväntar granskning</p>
              <h3>{candidate.name}</h3>
              <p>{candidate.relevance}</p>
              <p>Manuellt observerad på officiell webbplats: <time dateTime={candidate.observedOn}>{candidate.observedOn}</time>.</p>
              <p><a href={candidate.officialUrl} className={styles.link} target="_blank" rel="noopener noreferrer">Öppna officiell källa ↗</a></p>
              <p>Atlas får föreslå vidare kontroll, men får inte lägga till en ny skanningskälla eller ändra Handlarbörsen utan ditt godkännande.</p>
            </article>
          ))}
        </div>
      )}
      <p>
        Planerad nästa nivå: återkommande källsökning, dubblettkontroll över tid och en
        projektbunden signal när en verifierad kandidat ännu inte finns i bevakningen.
        Ingen automatisk schemaläggning eller betaltjänst är påslagen.
      </p>
    </section>
  )
}
