'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'
import styles from './HandlarborsenLeadFinder.module.css'

type LegalReview = {
  workplaceName: string
  workplaceCfar: string | null
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

export function HandlarborsenScbProbeControl({ enabled, candidateWriteEnabled = false }: { enabled: boolean; candidateWriteEnabled?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<Record<string,string>>({})
  const [result, setResult] = useState<ProbeResult | null>(null)
  const [error, setError] = useState('')

  if (!enabled) return null

  async function run() {
    if (busy) return
    setBusy(true)
    setError('')
    setResult(null)
    setSaved({})
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

  async function saveCandidate(row: LegalReview) {
    if (!candidateWriteEnabled || !row.workplaceCfar || saving) return
    setSaving(row.workplaceCfar)
    setError('')
    try {
      const response = await fetch('/api/atlas/handlarborsen/lead-finder/scb-candidate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmation: 'LÄGG TILL SCB-KANDIDAT', cfar: row.workplaceCfar }),
        cache: 'no-store',
        credentials: 'same-origin',
      })
      const body = await response.json().catch(() => null) as {status?:string}|null
      if (!response.ok || !body || !['saved','exists'].includes(String(body.status))) throw new Error('save_failed')
      setSaved(prev => ({ ...prev, [row.workplaceCfar!]: body.status === 'saved' ? 'Sparad för manuell granskning.' : 'Finns redan i granskningslistan.' }))
    } catch {
      setError('Kandidaten kunde inte sparas. Inget utskick eller kontaktjobb skapades.')
    } finally {
      setSaving(null)
    }
  }

  return <div className={styles.source}>
    <Search size={20} aria-hidden="true" />
    <div>
      <strong>SCB – avgränsat Malmö-prov</strong>
      <p>Fast SNI 47.811, Malmö kommun och högst fem juridiskt kontrollerade arbetsställen. Provet är läsande tills du uttryckligen väljer en rad för kandidatgranskning.</p>
      <div className={styles.filters}>
        <button type="button" onClick={run} disabled={busy}>{busy ? 'Testar SCB…' : 'Testa SCB-källa'}</button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {result ? <>
        <p><strong>{result.matchCount ?? 0} Malmöträffar</strong> efter {result.scannedRows ?? 0} lästa arbetsställen på {result.pages ?? 0} sida/sidor. Ingen post sparas automatiskt.</p>
        {typeof result.knownOmniraContacts === 'number'
          ? <p>Jämförelse gjord mot {result.knownOmniraContacts} Omnira-kontakter samt dokumenterad pilothistorik. Historiken är fortfarande partiell.</p>
          : <p>Omnira-kontakthistoriken kunde inte användas i provet. Resultaten förblir blockerade.</p>}
        {result.legalReviews?.length ? <ul>
          {result.legalReviews.map((row, index) => <li key={`${row.workplaceCfar ?? row.workplaceName}-${index}`}>
            <strong>{row.workplaceName}</strong>{row.city ? ` — ${row.city}` : ''}
            <br />
            Juridisk enhet: {row.legalCompanyName ?? 'inte bekräftad'} · SCB-status: {row.scbStatusClass} · juridisk form: {row.legalFormClass}
            <br />
            {historyLabel(row.historyMatches)} · Manuell kontroll krävs alltid.
            {candidateWriteEnabled && row.workplaceCfar && row.identityReview === 'scb_legal_entity_confirmed' ? <>
              <br />
              <button type="button" onClick={() => saveCandidate(row)} disabled={saving !== null || !!saved[row.workplaceCfar]}>
                {saving === row.workplaceCfar ? 'Sparar…' : saved[row.workplaceCfar] ? 'Tillagd' : 'Lägg till för granskning'}
              </button>
              {saved[row.workplaceCfar] ? <small> {saved[row.workplaceCfar]}</small> : null}
            </> : null}
          </li>)}
        </ul> : <p>Inga juridiska granskningsrader kunde visas.</p>}
        {!candidateWriteEnabled ? <p><small>Kandidatsparande är avstängt tills den separata Preview-grinden är godkänd.</small></p> : null}
      </> : null}
    </div>
    <span className={styles.flag} data-tone="info">Preview · manuell</span>
  </div>
}
