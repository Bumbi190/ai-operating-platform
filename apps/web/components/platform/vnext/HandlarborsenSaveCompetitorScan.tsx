'use client'
import { useState } from 'react'

const endpoint = '/api/projects/handlarborsen/competitors/history'

/** Explicit Owner gesture. No background scans, timers or automatic retries. */
export function HandlarborsenSaveCompetitorScan() {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  async function save() {
    if (busy) return
    setBusy(true)
    setNotice('')
    try {
      const result = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
      })
      if (!result.ok) {
        setNotice('Kunde inte spara kontrollen. Ingen sparad observation kan bekräftas.')
      } else {
        const body: unknown = await result.json()
        const status = body && typeof body === 'object' && 'status' in body ? body.status : null
        if (status === 'saved') {
          setNotice('Kontrollen har sparats. Ladda om sidan för att se historiken.')
        } else if (status === 'already_saved') {
          setNotice('En kontroll finns redan för denna UTC-dag. Inga värden skrevs över.')
        } else {
          setNotice('Sparresultatet kunde inte verifieras. Försök inte automatiskt igen.')
        }
      }
    } catch {
      setNotice('Ett nätverksfel uppstod. Kontrollera status innan du försöker igen.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={save}
        className="min-h-11 rounded-lg border border-cyan-400/40 bg-cyan-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-60"
      >
        {busy ? 'Kontrollerar och sparar …' : 'Kontrollera och spara dagens observation'}
      </button>
      {notice ? <p role="status" className="mt-2 text-sm text-cyan-100">{notice}</p> : null}
      <p className="mt-2 text-xs text-slate-400">
        Manuell kontroll, maximalt en sparad uppsättning per UTC-dag. Inga automatiska körningar.
      </p>
    </div>
  )
}
