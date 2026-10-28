import React from 'react'
import { BUSINESS_INDICATORS, parseSafePublicUrl, type BusinessIndicator } from '@/lib/handlarborsen/lead-finder/lead-research'
import styles from './HandlarborsenScbImportControl.module.css'

export interface ResearchView {
  orgnr: string
  companyName: string
  city: string
  classification: 'DEALER_EVIDENCE' | 'OUT_OF_SCOPE_EVIDENCE' | 'NEEDS_FURTHER_RESEARCH'
  reasons: string[]
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
          {r.evidence.some(e => e.indicators.some(i => ['financial_or_collection_services','wheelchairs_or_mobility_aids','unrelated_products'].includes(i))) ?
            <span className={styles.reviewTag}>Sökutdrag nämner annan verksamhet – ej verifierat</span> : null}
          <span className={styles.reviewTag} data-tone="warning">Ej kontaktbar</span>
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
