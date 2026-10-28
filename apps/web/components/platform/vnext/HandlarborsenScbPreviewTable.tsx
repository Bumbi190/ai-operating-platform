'use client'

import React, { useMemo, useState } from 'react'
import {
  filterLocalReview, LOCAL_REVIEW_FILTERS,
  type LocalReview, type LocalReviewFilter,
} from '@/lib/handlarborsen/lead-finder/local-review'
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
export function HandlarborsenScbPreviewTable({ review }: { review: LocalReview }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<LocalReviewFilter>('all')
  const rows = useMemo(
    () => filterLocalReview(review.rows, query, filter),
    [review.rows, query, filter],
  )

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
            onChange={e => setQuery(e.target.value.slice(0, 80))}
            maxLength={80}
            placeholder="Sök bland 89 företag"
          />
        </div>
        <div>
          <label htmlFor="hb-preview-company-filter">Visa</label>
          <select
            id="hb-preview-company-filter"
            value={filter}
            onChange={e => setFilter(e.target.value as LocalReviewFilter)}
          >
            {LOCAL_REVIEW_FILTERS.map(f => <option value={f} key={f}>{filterNames[f]}</option>)}
          </select>
        </div>
      </div>
      <p className={styles.reviewCount} role="status" aria-live="polite">
        Visar {rows.length} av {review.counts.total} företag · samtliga spärrade för utskick
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
              {rows.map(company => {
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
      <p className={styles.reviewFootnote}>Företagens uppgifter visas bara i den här tillfälliga förhandsvisningen. Ingen knapp godkänner, importerar eller skickar mejl.</p>
    </section>
  )
}
