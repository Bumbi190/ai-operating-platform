import React from 'react'
import { BUSINESS_INDICATORS, parseSafePublicUrl, type BusinessIndicator } from '@/lib/handlarborsen/lead-finder/lead-research'
import styles from './HandlarborsenScbImportControl.module.css'

export interface GeneralContactSuggestion {
  email: { value: string; sourceUrl: string } | null
  switchboard: { value: string; sourceUrl: string } | null
}

/** Generic only: no mailbox with an employee's name and no arbitrary numbers. */
function parseContactSuggestion(
  raw: unknown, officialSite: unknown, classification: unknown, identityVerified: unknown, sourceMode: unknown,
): GeneralContactSuggestion | null {
  if (sourceMode !== 'search_and_page_extract' ||
    classification !== 'DEALER_EVIDENCE' || identityVerified !== true ||
    !raw || typeof raw !== 'object') return null
  const site = parseSafePublicUrl(officialSite)
  if (!site) return null
  const rec = raw as Record<string, unknown>
  if (rec.status !== 'NEEDS_MANUAL_CONTACT_CHECK' ||
      rec.contactability !== 'BLOCKED_PENDING_VERIFICATION') return null
  const host = site.host.replace(/^www\./, '')
  const sameDomain = (url: unknown) => {
    const parsed = parseSafePublicUrl(url)
    if (!parsed) return null
    const sourceHost = parsed.host.replace(/^www\./, '')
    return sourceHost === host || sourceHost.endsWith('.' + host) ? parsed : null
  }
  let email: GeneralContactSuggestion['email'] = null
  const rawEmail = rec.generalBusinessEmail
  if (rawEmail && typeof rawEmail === 'object') {
    const x = rawEmail as Record<string, unknown>
    const value = str(x.value, 110)?.toLowerCase()
    const source = sameDomain(x.sourceUrl)
    const m = value?.match(/^(info|kontakt|contact|kundservice|sales|foretag|service|order|support)@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/)
    if (m && source && (m[2] === host || host.endsWith('.' + m[2])))
      email = { value: value!, sourceUrl: source.href }
  }
  let switchboard: GeneralContactSuggestion['switchboard'] = null
  const rawPhone = rec.switchboardPhone
  if (rawPhone && typeof rawPhone === 'object') {
    const x = rawPhone as Record<string, unknown>
    const value = str(x.value, 22)
    const source = sameDomain(x.sourceUrl)
    const digits = value?.replace(/\D/g, '') ?? ''
    if (value && source && /^0[0-9\s()-]{7,20}$/.test(value) &&
      digits.length >= 8 && digits.length <= 12 &&
      !/^07/.test(digits) && !/^467/.test(digits))
      switchboard = { value, sourceUrl: source.href }
  }
  return email || switchboard ? { email, switchboard } : null
}

export interface ResearchView {
  orgnr: string
  companyName: string
  city: string
  classification: 'DEALER_EVIDENCE' | 'OUT_OF_SCOPE_EVIDENCE' | 'NEEDS_FURTHER_RESEARCH'
  reasons: string[]
  contacts: GeneralContactSuggestion | null
  evidence: { sourceUrl: string; sourceKind: string; observedOn: string; excerpt: string; indicators: BusinessIndicator[] }[]
}

const CLASSIFICATIONS = ['DEALER_EVIDENCE', 'OUT_OF_SCOPE_EVIDENCE', 'NEEDS_FURTHER_RESEARCH']
const classLabel: Record<ResearchView['classification'], string> = {
  DEALER_EVIDENCE: 'Preliminära tecken på bilförsäljning',
  OUT_OF_SCOPE_EVIDENCE: 'Preliminärt tecken på annan bransch',
  NEEDS_FURTHER_RESEARCH: 'Behöver mer research',
}
const kindLabel: Record<string, string> = {
  official_company_site: 'Företagets egen sida',
  independent_business_source: 'Oberoende företagskälla',
  search_snippet: 'Sökutdrag',
}

const str = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.length > 0 && v.length <= max ? v : null

/** Defensive client-side parse: anything unexpected from the server is dropped, never rendered. */
export function parseResearchResponse(data: unknown): ResearchView[] | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (d.status !== 'researched' || d.outreachReady !== false || !Array.isArray(d.results) || d.results.length > 5) return null
  const out: ResearchView[] = []
  for (const raw of d.results) {
    if (!raw || typeof raw !== 'object') return null
    const r = raw as Record<string, unknown>
    const orgnr = str(r.orgnr, 10)
    const classification = CLASSIFICATIONS.includes(r.classification as string) ? r.classification as ResearchView['classification'] : null
    if (!orgnr || !/^\d{10}$/.test(orgnr) || !classification || r.outreachReady !== false ||
      r.contactability !== 'BLOCKED_PENDING_VERIFICATION' || !Array.isArray(r.evidence) || r.evidence.length > 5) return null
    const evidence: ResearchView['evidence'] = []
    for (const e of r.evidence) {
      const x = (e ?? {}) as Record<string, unknown>
      const url = parseSafePublicUrl(x.sourceUrl)
      const excerpt = str(x.excerpt, 160)
      const kind = str(x.sourceKind, 40)
      const observedOn = str(x.observedOn, 10)
      const indicators: BusinessIndicator[] = Array.isArray(x.indicators)
        ? x.indicators.filter((i): i is BusinessIndicator => typeof i === 'string' && (BUSINESS_INDICATORS as readonly string[]).includes(i)).slice(0, 7)
        : []
      if (url && excerpt && kind && observedOn) evidence.push({ sourceUrl: url.href, sourceKind: kind, observedOn, excerpt, indicators })
    }
    out.push({
      orgnr, classification, evidence,
      companyName: str(r.companyName, 120) ?? 'Okänt företag',
      city: str(r.city, 60) ?? '',
      reasons: Array.isArray(r.reasons) ? r.reasons.filter((x): x is string => typeof x === 'string' && x.length <= 80).slice(0, 8) : [],
      contacts: parseContactSuggestion(r.contactSuggestion, r.officialSite, r.classification, r.identityVerified, d.sourceMode),
    })
  }
  return out
}

export function HandlarborsenResearchResults({ results }: { results: ResearchView[] }) {
  return (
    <div className={styles.researchResults} aria-label="Preliminära researchresultat">
      <h3>Preliminär research ({results.length} företag)</h3>
      <p>Endast sökutdrag som kan kopplas till det aktuella företaget visas. Generella bilannonser filtreras bort. Träffarna är fortfarande inte verifierade och inget företag är godkänt för kontakt.</p>
      <ul className={styles.researchList}>
        {results.map(r => <li key={r.orgnr}>
          <strong>{r.companyName}</strong>
          <small>{r.orgnr}{r.city ? ` · ${r.city}` : ''}</small>
          <span className={styles.reviewTag}>{classLabel[r.classification]}</span>
          {r.evidence.some(e => e.indicators.some(i => ['cars_for_sale','vehicle_stock_listings','dealer_purchases_cars'].includes(i))) ?
            <span className={styles.reviewTag}>Sökutdrag nämner bilhandel – ej verifierat</span> : null}
          {r.evidence.some(e => e.indicators.includes('registered_vehicle_trade')) ?
            <span className={styles.reviewTag}>Registrerad bilhandel nämns – ingen faktisk försäljning verifierad</span> : null}
          {r.evidence.some(e => e.indicators.some(i => ['financial_or_collection_services','wheelchairs_or_mobility_aids','unrelated_products'].includes(i))) ?
            <span className={styles.reviewTag}>Källan beskriver annan verksamhet – behöver verifieras</span> : null}
          <span className={styles.reviewTag} data-tone="warning">Ej kontaktbar</span>
          {r.contacts ? <div className={styles.researchContact}>
            <strong>Allmän företagskontakt – kräver manuell kontroll</strong>
            <small>Endast offentligt angivna växel-/funktionskontakter från verifierad källsida. Ingen kontaktbehörighet.</small>
            {r.contacts.email ? <p>
              Allmän e-post: <code>{r.contacts.email.value}</code>{' '}
              <a href={r.contacts.email.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">Källsida</a>
            </p> : null}
            {r.contacts.switchboard ? <p>
              Företagsväxel: <code>{r.contacts.switchboard.value}</code>{' '}
              <a href={r.contacts.switchboard.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">Källsida</a>
            </p> : null}
          </div> : null}
          {r.evidence.length > 0 ? <ul className={styles.researchList}>
            {r.evidence.map(e => <li key={e.sourceUrl}>
              <small>{kindLabel[e.sourceKind] ?? 'Källa'} · {e.observedOn}</small>
              {e.excerpt}{' '}
              <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">Källa</a>
            </li>)}
          </ul> : <small>{r.reasons.includes('adapter_failed')
            ? 'Sökningen kunde inte slutföras för detta företag.'
            : 'Inga företagsspecifika sökutdrag hittades. Generella annonser räknas inte som belägg.'}</small>}
        </li>)}
      </ul>
    </div>
  )
}
