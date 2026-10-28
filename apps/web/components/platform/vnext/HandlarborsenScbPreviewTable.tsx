'use client'

import React, { useMemo, useState } from 'react'
import {
  filterLocalReview, paginateLocalReview, LOCAL_REVIEW_FILTERS,
  type LocalReview, type LocalReviewFilter,
} from '@/lib/handlarborsen/lead-finder/local-review'
import { buildResearchQueue } from '@/lib/handlarborsen/lead-finder/lead-research'
import styles from './HandlarborsenScbImportControl.module.css'

const filterNames: Record<LocalReviewFilter, string> = {
  all: 'Alla företag',
  active: 'Verksamma enligt SCB',
  inactive: 'Ej verksamma enligt SCB',
  restricted: 'Kontaktspärr',
  prior: 'Tidigare kontakt',
  possible_group: 'Möjlig namn-/gruppkoppling',
  other_legal_form: 'Annan juridisk form',
}

const channelNames: Record<'reklam' | 'epost' | 'telefon', string> = {
  reklam: 'reklam', epost: 'e-post', telefon: 'telefon',
}

/**
 * Client-only presentation of the owner's two selected, server-verified files.
 * No storage, network, approval, navigation to company profiles, or email action.
 * It NEVER treats the partial outreach history as proof that a firm is new.
 */
export function HandlarborsenScbPreviewTable({ review, researched = false }: { review: LocalReview; researched?: boolean }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<LocalReviewFilter>('all')
  const [page, setPage] = useState(1)
  const rows = useMemo(
    () => filterLocalReview(review.rows, query, filter)
      .sort((a, b) => a.name.localeCompare(b.name, 'sv', { sensitivity: 'base' }) || a.orgnr.localeCompare(b.orgnr)),
    [review.rows, query, filter],
  )
  const current = useMemo(() => paginateLocalReview(rows, page, 15), [rows, page])

  return (
    <section className={styles.reviewPanel} aria-labelledby="hb-preview-company-title">
      <h3 id="hb-preview-company-title">Företagen i den verifierade rapporten</h3>
      <p>
        Läsbar förhandsvisning från filerna du valde. Företagen sparas inte i databasen.
        SCB:s verksamhetsstatus är inte en bedömning av lämplighet som bilhandlare.
        Kontakthistoriken är ofullständig och ingen får kontaktas härifrån.
      </p>

      <div className={styles.reviewFilters}>
        <div>
          <label htmlFor="hb-preview-company-search">Sök på företag, organisationsnummer eller ort</label>
          <input
            id="hb-preview-company-search"
            type="search"
            value={query}
            onChange={e => { setQuery(e.target.value.slice(0, 80)); setPage(1) }}
            maxLength={80}
            placeholder="Sök bland 89 företag"
          />
        </div>
        <div>
          <label htmlFor="hb-preview-company-filter">Visa</label>
          <select
            id="hb-preview-company-filter"
            value={filter}
            onChange={e => { setFilter(e.target.value as LocalReviewFilter); setPage(1) }}
          >
            {LOCAL_REVIEW_FILTERS.map(f => <option value={f} key={f}>{filterNames[f]}</option>)}
          </select>
        </div>
      </div>
      <p className={styles.reviewCount} role="status" aria-live="polite">
        Visar {current.from}–{current.to} av {rows.length} matchande företag (totalt {review.counts.total}) · samtliga spärrade för utskick
      </p>

      {rows.length > 0 ? (
        <div className={styles.reviewTableWrap} role="region" aria-label="Verifierade företag för manuell granskning" tabIndex={0}>
          <table className={styles.reviewTable}>
            <caption className={styles.srOnly}>Juridiska företag från din SCB-rapport. Ingen post är godkänd för kontakt.</caption>
            <thead><tr>
              <th scope="col">Företag</th>
              <th scope="col">Ort / SNI</th>
              <th scope="col">SCB-status</th>
              <th scope="col">Granskningsflaggor</th>
              <th scope="col">Kontakt</th>
            </tr></thead>
            <tbody>
              {current.items.map(company => {
                const excluded = !company.scbActive || company.priorContact
                return (
                  <tr key={company.orgnr}>
                    <td>
                      <strong>{company.name}</strong>
                      <small>{company.orgnr}</small>
                      <small>{company.legalFormLabel}</small>
                    </td>
                    <td>{company.city}<small>{company.sni.replaceAll(';', ', ')}</small></td>
                    <td>
                      <span className={styles.reviewTag} data-tone={company.scbActive ? 'neutral' : 'warning'}>
                        {company.scbActive ? 'Verksam enligt SCB' : 'Ej verksam enligt SCB'}
                      </span>
                    </td>
                    <td>
                      {company.restricted ? <span className={styles.reviewTag} data-tone="warning">
                        SCB-spärr: {company.restrictedChannels.map(c => channelNames[c]).join(', ')}
                      </span> : null}
                      {company.priorContact ? <span className={styles.reviewTag} data-tone="warning">Tidigare kontakt (delhistorik)</span> : null}
                      {company.otherLegalForm ? <span className={styles.reviewTag} data-tone="neutral">Annan juridisk form</span> : null}
                      {company.groupHypothesis ? <span className={styles.reviewTag} data-tone="neutral">Möjlig namnkoppling: {company.groupHypothesis}</span> : null}
                      {!company.restricted && !excluded ? <span className={styles.reviewTag} data-tone="neutral">Kräver manuell granskning</span> : null}
                    </td>
                    <td>
                      <span className={styles.reviewTag} data-tone="warning">
                        {company.restricted ? 'Spärrad' : excluded ? 'Exkluderad från nya leads' : 'Ej kontaktbar'}
                      </span>
                      <small>Ingen utskicksbehörighet</small>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : <p className={styles.reviewEmpty}>Inga företag matchar sökningen eller filtret.</p>}
      {current.total > 0 && current.pages > 1 ? (
        <nav className={styles.reviewPagination} aria-label="Bläddra mellan företagssidor">
          <button type="button" onClick={() => setPage(current.page - 1)}
            disabled={current.page === 1}>Föregående sida</button>
          <span aria-live="polite">Sida {current.page} av {current.pages}</span>
          <button type="button" onClick={() => setPage(current.page + 1)}
            disabled={current.page === current.pages}>Nästa sida</button>
        </nav>
      ) : null}
      <p className={styles.reviewFootnote}>Företagens uppgifter visas bara i den här tillfälliga förhandsvisningen. Ingen knapp godkänner, importerar eller skickar mejl.</p>
      <AtlasResearchQueue review={review} researched={researched} />
    </section>
  )
}

/** Read-only summary of what Atlas WOULD research next. No research has run and nothing here grants contact. */
export function AtlasResearchQueue({ review, researched = false }: { review: LocalReview; researched?: boolean }) {
  const queue = useMemo(() => buildResearchQueue(review, 5), [review])
  return (
    <section className={styles.researchQueue} aria-labelledby="hb-atlas-research-title">
      <h4 id="hb-atlas-research-title">Atlas forskningskö</h4>
      {queue.status === 'ready' ? (
        <>
          <p>
            {researched
              ? `Atlas har undersökt ${queue.jobs.length} företag i den här tillfälliga vyn. Preliminära källresultat visas nedan; ingen är godkänd för kontakt.`
              : `Nästa ${queue.jobs.length} företag som Atlas skulle undersöka (av ${queue.eligible} möjliga). Ingen sökning har körts. Det här är en kö, inte ett resultat eller en rekommendation.`}
          </p>
          <ol className={styles.researchList}>
            {queue.jobs.map(job => (
              <li key={job.orgnr}>
                <strong>{job.legalName}</strong>
                <small>{job.orgnr} · {job.city} · SNI {job.sni.replaceAll(';', ', ')}</small>
                <span className={styles.reviewTag} data-tone={researched ? 'neutral' : 'warning'}>{researched ? 'Research körd – källgranska' : 'Research ej körd'}</span>
                <span className={styles.reviewTag} data-tone="neutral">Ej kontaktbar</span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className={styles.reviewEmpty}>Forskningskön är spärrad eftersom rapporten inte klarade alla kontroller ({queue.reason}).</p>
      )}
    </section>
  )
}
