'use client'
import * as React from 'react'
import { useState } from 'react'

const endpoints = {
  owner: '/api/projects/handlarborsen/competitors/history',
  collaborator: '/api/organization/projects/handlarborsen/competitors/history',
} as const

/** Explicit owner/collaborator gesture, separately authorized at each endpoint. No background scans or retries. */
export function HandlarborsenSaveCompetitorScan({ mode = 'owner' }: { mode?: 'owner' | 'collaborator' }) {
  const endpoint = endpoints[mode]
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
        // The response exposes only safe, fixed status codes. Show the HTTP code
        // so Preview failures can be diagnosed without collecting session data.
        const reason = result.status === 400 ? 'Ogiltig begäran'
          : result.status === 401 ? 'Inloggning krävs'
          : result.status === 403 ? 'Behörighets- eller ursprungskontroll avvisade begäran'
          : result.status === 409 ? 'Historiklagringen är avstängd'
          : result.status === 422 ? 'Underlaget kunde inte valideras'
          : result.status === 503 ? 'Kontrollen eller lagringen är otillgänglig'
          : result.status === 504 ? 'Kontrollen tog för lång tid' : 'Okänt serverfel'
        setNotice(`Kunde inte spara kontrollen (HTTP ${result.status}: ${reason}). Ingen observation kan bekräftas.`)
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
