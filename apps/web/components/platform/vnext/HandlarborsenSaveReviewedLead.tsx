'use client'
import * as React from 'react'
import { useState } from 'react'

const endpoints = {
  owner: '/api/projects/handlarborsen/competitors/candidates',
  collaborator: '/api/organization/projects/handlarborsen/competitors/candidates',
} as const

/**
 * No automatic polling, no client-selected candidate or URL, no retries.
 * Saving an immutable reviewed lead is a deliberate authorized user click.
 */
export function HandlarborsenSaveReviewedLead({ mode = 'owner' }: { mode?: 'owner' | 'collaborator' }) {
  const endpoint = endpoints[mode]
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function submit() {
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch(endpoint, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
      })
      if (!response.ok) {
        setMessage(response.status === 403 ? 'Sparning nekades: ditt konto saknar rätt behörighet för Handlarbörsen.'
          : response.status === 401 ? 'Logga in med ett behörigt konto för att fortsätta.'
          : response.status === 409 ? 'Kandidatminnet är avstängt.'
          : 'Kandidaten kunde inte sparas. Ingen lagring kan bekräftas.')
        return
      }
      const body: unknown = await response.json()
      const status = body && typeof body === 'object' && 'status' in body ? body.status : null
      setMessage(status === 'saved' ? 'Kandidaten sparades för granskning. Ladda om sidan för att se den i minnet.'
        : status === 'already_recorded' ? 'Kandidaten finns redan sparad. Ingen dubblett skapades.'
        : 'Resultatet kunde inte bekräftas. Kontrollera historiken före ett nytt försök.')
    } catch {
      setMessage('Nätverksfel. Kontrollera om kandidaten sparades innan du försöker igen.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <button type="button" disabled={busy} onClick={submit}
        className="min-h-11 rounded-lg border border-cyan-400/40 bg-cyan-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-60">
        {busy ? 'Sparar granskad kandidat …' : 'Spara granskad kandidat'}
      </button>
      {message ? <p role="status" className="mt-2 text-sm text-cyan-100">{message}</p> : null}
      <p className="mt-2 text-xs text-slate-400">
        Endast en fördefinierad, separat granskad officiell källa. Inga automatiska sökningar eller aviseringar.
      </p>
    </div>
  )
}
