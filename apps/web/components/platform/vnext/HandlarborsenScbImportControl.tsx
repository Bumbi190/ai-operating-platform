'use client'

import React, { useRef, useState } from 'react'
import styles from './HandlarborsenScbImportControl.module.css'

type PreviewCounts = {
  count: number
  needsReview: number
  excluded: number
  suppressed: number
  inactive: number
  marketingRestricted: number
  priorContact: number
  historyCoverage: 'PARTIAL'
  contactability: 'BLOCKED_PENDING_VERIFICATION'
  outreachReady: 0
  digest: string
}

const ENDPOINT = '/api/atlas/handlarborsen/lead-finder/import'
const CONFIRMATION = 'IMPORTERA 89 SOM EJ KONTAKTBARA'
const MAX_BYTES = 150_000

function errorLabel(code: string): string {
  switch (code) {
    case 'unauthorized': return 'Du behöver logga in igen.'
    case 'denied': return 'Endast projektets ägare får använda importen.'
    case 'execution_paused': return 'Projektet är pausat. Import kan inte genomföras.'
    case 'disabled': return 'Importen är inte aktiverad på servern.'
    case 'body_too_large': return 'Filerna överskrider storleksgränsen.'
    case 'snapshot_invalid':
    case 'manifest_invalid': return 'Rapporten kunde inte verifieras. Ingen data importerades.'
    case 'digest_not_approved': return 'Den exakta rapporten är inte godkänd för import.'
    case 'table_not_empty': return 'Databasen innehåller redan kandidatposter. Ingen överskrivning gjordes.'
    case 'unavailable': return 'Importtjänsten eller databasanslutningen är inte tillgänglig.'
    default: return 'Begäran kunde inte genomföras. Ingen data har godkänts för kontakt.'
  }
}

export function HandlarborsenScbImportControl({ writeEnabled = false }: { writeEnabled?: boolean }) {
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [summaryFile, setSummaryFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<PreviewCounts | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [committed, setCommitted] = useState(false)
  const source = useRef<{ csv: string; summary: string } | null>(null)

  function clearPreview() {
    source.current = null
    setPreview(null)
    setConfirmation('')
    setCommitted(false)
    setStatus('')
  }

  async function post(mode: 'preview' | 'commit', payload: { csv: string; summary: string }) {
    const body = JSON.stringify(mode === 'preview'
      ? { mode, ...payload }
      : { mode, ...payload, confirmation: CONFIRMATION })
    if (new Blob([body]).size > MAX_BYTES) throw new Error('body_too_large')
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      cache: 'no-store',
      credentials: 'same-origin',
    })
    const data: unknown = await response.json().catch(() => null)
    if (!data || typeof data !== 'object') throw new Error('unavailable')
    const r = data as Record<string, unknown>
    if (!response.ok) throw new Error(typeof r.status === 'string' ? r.status : 'unavailable')
    return r
  }

  async function showPreview() {
    if (!csvFile || !summaryFile || busy) return
    clearPreview()
    if (csvFile.size > MAX_BYTES || summaryFile.size > MAX_BYTES ||
      csvFile.size + summaryFile.size > MAX_BYTES) {
      setStatus(errorLabel('body_too_large'))
      return
    }
    setBusy(true)
    try {
      // Browser reads the files only after an explicit click. No localStorage,
      // background upload, or download of source records is used.
      const [csv, summary] = await Promise.all([csvFile.text(), summaryFile.text()])
      const result = await post('preview', { csv, summary })
      const c = result.aggregate
      if (result.status !== 'preview' || typeof c !== 'object' || c === null) throw new Error('unavailable')
      const counts = c as PreviewCounts
      if (counts.count !== 89 || counts.outreachReady !== 0 ||
        counts.historyCoverage !== 'PARTIAL' ||
        counts.contactability !== 'BLOCKED_PENDING_VERIFICATION' ||
        !/^[0-9a-f]{64}$/.test(counts.digest)) throw new Error('unavailable')
      source.current = { csv, summary }
      setPreview(counts)
      setStatus('Förhandskontrollen är godkänd. Ingen data har importerats.')
    } catch (e) {
      source.current = null
      setStatus(errorLabel(e instanceof Error ? e.message : 'unavailable'))
    } finally {
      setBusy(false)
    }
  }

  async function importWithApproval() {
    if (!writeEnabled || !preview || !source.current || confirmation !== CONFIRMATION || busy || committed) return
    setBusy(true)
    try {
      const result = await post('commit', source.current)
      if (result.status !== 'imported' || result.imported !== true || result.count !== 89 ||
        result.digest !== preview.digest) throw new Error('unavailable')
      source.current = null
      setCommitted(true)
      setConfirmation('')
      setStatus('89 juridiska företag har lagrats för granskning. Inget företag är kontaktbart.')
    } catch (e) {
      setStatus(errorLabel(e instanceof Error ? e.message : 'unavailable'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="hb-import-heading">
      <header>
        <p className={styles.kicker}>Endast projektägaren · särskilt aktiverad funktion</p>
        <h2 id="hb-import-heading">Importförhandsgranskning</h2>
        <p>Välj den rensade SCB-rapporten och dess sammanfattning. Ingen import sker när du förhandsgranskar.</p>
      </header>
      <div className={styles.fields}>
        <label htmlFor="hb-audit-csv">Rensad SCB-rapport (.csv)</label>
        <input id="hb-audit-csv" type="file" accept=".csv,text/csv" disabled={busy}
          onChange={e => { setCsvFile(e.target.files?.[0] ?? null); clearPreview() }} />
        <label htmlFor="hb-audit-summary">Verifierad sammanfattning (.json)</label>
        <input id="hb-audit-summary" type="file" accept=".json,application/json" disabled={busy}
          onChange={e => { setSummaryFile(e.target.files?.[0] ?? null); clearPreview() }} />
        <button type="button" onClick={showPreview} disabled={!csvFile || !summaryFile || busy}>
          {busy ? 'Kontrollerar…' : 'Förhandsgranska utan import'}
        </button>
      </div>

      {preview ? <div className={styles.preview} aria-label="Verifierad importförhandsvisning">
        <strong>{preview.count} juridiska företag</strong>
        <p>{preview.needsReview} för vidare granskning, {preview.excluded} exkluderade och {preview.suppressed} spärrade. Ingen av dem är godkänd för kontakt.</p>
        <p>Tidigare kontakthistorik: ofullständig. Kontrollsumma för rapporten:</p>
        <code>{preview.digest}</code>
      </div> : null}

      {writeEnabled && preview && !committed ? <div className={styles.confirm}>
        <p>Även en framtida import lagrar endast blockerade granskningsposter. Ingen utskicksknapp aktiveras.</p>
        <label htmlFor="hb-import-confirm">Skriv exakt: {CONFIRMATION}</label>
        <input id="hb-import-confirm" type="text" autoComplete="off" spellCheck={false}
          value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={busy} />
        <button type="button" onClick={importWithApproval}
          disabled={busy || confirmation !== CONFIRMATION}>
          Importera endast som ej kontaktbara
        </button>
      </div> : null}
      {!writeEnabled ? <p className={styles.note}>Databasskrivning är avstängd. Du kan endast förhandsgranska.</p> : null}
      {status ? <p className={styles.feedback} role="status" aria-live="polite">{status}</p> : null}
    </section>
  )
}
