'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'
import styles from './HandlarborsenLeadFinder.module.css'

type LegalReview = {
  workplaceName: string
  legalCompanyName: string | null
  city: string | null
  identityReview: string
  scbStatusClass: string
  legalFormClass: string
  historyMatches: string[]
  warnings: string[]
  manualReviewOnly: true
  contactability: 'BLOCKED_PENDING_VERIFICATION'
  outreachReady: false
}

type ProbeResult = {
  status: string
  matchCount?: number
  scannedRows?: number
  pages?: number
  legalReviews?: LegalReview[]
  historyCoverage?: string
  knownOmniraContacts?: number | null
  outreachReady?: false
  persisted?: false
}

const historyLabel = (reasons: string[]) => reasons.length
  ? `Historikspärr: ${reasons.join(', ')}`
  : 'Ingen träff i anslutna historikkällor – historiken är fortfarande ofullständig.'

export function HandlarborsenScbProbeControl({ enabled }: { enabled: boolean }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ProbeResult | null>(null)
  const [error, setError] = useState('')

  if (!enabled) return null

  async function run() {
    if (busy) return
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const response = await fetch('/api/atlas/handlarborsen/lead-finder/scb-probe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmation: 'TESTA SCB BILHANDLARE' }),
        cache: 'no-store',
        credentials: 'same-origin',
      })
      const body = await response.json().catch(() => null) as ProbeResult | null
      if (!response.ok || !body || body.status !== 'ok') throw new Error('SCB-provet kunde inte genomföras.')
      setResult(body)
    } catch {
      setError('SCB-provet misslyckades. Inga kandidater sparades och inget utskick gjordes.')
    } finally {
      setBusy(false)
    }
  }

  return <div className={styles.source}>
    <Search size={20} aria-hidden="true" />
    <div>
      <strong>SCB – avgränsat Malmö-prov</strong>
      <p>Fast SNI 47.811, Malmö kommun och högst fem juridiskt kontrollerade arbetsställen. Provet är läsande och sparar inga leads.</p>
      <div className={styles.filters}>
        <button type="button" onClick={run} disabled={busy}>{busy ? 'Testar SCB…' : 'Testa SCB-källa'}</button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {result ? <>
        <p><strong>{result.matchCount ?? 0} Malmöträffar</strong> efter {result.scannedRows ?? 0} lästa arbetsställen på {result.pages ?? 0} sida/sidor. Ingen post sparades.</p>
        {typeof result.knownOmniraContacts === 'number'
          ? <p>Jämförelse gjord mot {result.knownOmniraContacts} Omnira-kontakter samt dokumenterad pilothistorik. Historiken är fortfarande partiell.</p>
          : <p>Omnira-kontakthistoriken kunde inte användas i provet. Resultaten förblir blockerade.</p>}
        {result.legalReviews?.length ? <ul>
          {result.legalReviews.map((row, index) => <li key={`${row.workplaceName}-${index}`}>
            <strong>{row.workplaceName}</strong>{row.city ? ` — ${row.city}` : ''}
            <br />
            Juridisk enhet: {row.legalCompanyName ?? 'inte bekräftad'} · SCB-status: {row.scbStatusClass} · juridisk form: {row.legalFormClass}
            <br />
            {historyLabel(row.historyMatches)} · Manuell kontroll krävs alltid.
          </li>)}
        </ul> : <p>Inga juridiska granskningsrader kunde visas.</p>}
      </> : null}
    </div>
    <span className={styles.flag} data-tone="info">Preview · läsning</span>
  </div>
}
