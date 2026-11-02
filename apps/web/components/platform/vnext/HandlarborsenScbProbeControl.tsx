'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'
import styles from './HandlarborsenLeadFinder.module.css'

type ProbeResult = {
  status: string
  matchCount?: number
  scannedRows?: number
  pages?: number
  sample?: Array<{ name: string; city: string | null; cfar: string | null; sniCodes: string[] }>
  outreachReady?: false
  persisted?: false
}

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
      <p>Fast SNI 47.811, Malmö kommun och högst fem visade arbetsställen. Provet är läsande och sparar inga leads.</p>
      <div className={styles.filters}>
        <button type="button" onClick={run} disabled={busy}>{busy ? 'Testar SCB…' : 'Testa SCB-källa'}</button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {result ? <>
        <p><strong>{result.matchCount ?? 0} Malmöträffar</strong> efter {result.scannedRows ?? 0} lästa arbetsställen på {result.pages ?? 0} sida/sidor. Ingen post sparades.</p>
        {result.sample?.length ? <ul>
          {result.sample.map(row => <li key={row.cfar ?? row.name}>{row.name}{row.city ? ` — ${row.city}` : ''}</li>)}
        </ul> : <p>Inga Malmöträffar hittades i detta avgränsade prov.</p>}
      </> : null}
    </div>
    <span className={styles.flag} data-tone="info">Preview · läsning</span>
  </div>
}
