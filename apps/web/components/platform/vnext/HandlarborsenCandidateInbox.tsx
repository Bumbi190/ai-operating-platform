'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { CompetitorInboxLoad, InboxAudience } from '@/lib/atlas/project-analytics/handlarborsen-candidate-inbox-service'

const links: Record<InboxAudience,string> = {
  owner:'/api/projects/handlarborsen/competitors/inbox',
  collaborator:'/api/organization/projects/handlarborsen/competitors/inbox',
}
/** No hooks or data access at all while inbox flag is OFF. */
export function HandlarborsenCandidateInbox(props: {
  enabled: boolean
  inbox: CompetitorInboxLoad | null
  mode: InboxAudience
}) {
  if (!props.enabled) return null
  return <ActiveInbox inbox={props.inbox} mode={props.mode} />
}

/** Never represents an in-app row as a sent push/email. */
function ActiveInbox({ inbox,mode }: {
  inbox: CompetitorInboxLoad | null
  mode: InboxAudience
}) {
  const router = useRouter()
  const [busy,setBusy] = useState<string | null>(null)
  const [notice,setNotice] = useState('')
  if (inbox?.status !== 'ok') {
    return <section aria-label="Atlas inkorg" className="rounded-xl border border-amber-400/30 bg-slate-900/70 p-5">
      <h2 className="font-semibold text-slate-100">Atlas inkorg · kunde inte verifieras</h2>
      <p role="alert" className="mt-2 text-sm text-slate-300">
        Inkorgen kan inte läsas. Antalet olästa notiser är okänt, inte noll.
      </p>
    </section>
  }
  async function update(host: string, read: boolean) {
    if (busy) return
    setBusy(host)
    setNotice('')
    try {
      const response = await fetch(links[mode],{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{ 'content-type':'application/json' },
        body:JSON.stringify({host,read}),
      })
      if (!response.ok) {
        setNotice(response.status===403 ? 'Du saknar rätt att ändra den här notisen.'
          : response.status===401 ? 'Logga in igen.'
          : 'Ändringen kunde inte verifieras. Kontrollera inkorgen.')
        return
      }
      const result: unknown = await response.json()
      const status = result && typeof result === 'object' && 'status' in result
        ? (result as {status:unknown}).status : null
      setNotice(status==='updated' ? 'Din läskvittens sparades.'
        : status==='unchanged' ? 'Lässtatusen var redan sparad.'
        : 'Resultatet kunde inte verifieras.')
      router.refresh()
    } catch {
      setNotice('Nätverksfel. Kontrollera inkorgen innan du försöker igen.')
    } finally {
      setBusy(null)
    }
  }
  return <section className="rounded-xl border border-cyan-300/25 bg-slate-900/70 p-5"
    aria-labelledby="hb-atlas-inbox-title" data-inbox="verified">
    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-cyan-300">Atlas · Handlarbörsen</p>
    <h2 id="hb-atlas-inbox-title" className="text-lg font-semibold">Inkorg för nya konkurrenter</h2>
    <p role="status" className="mt-1 text-sm text-slate-300">
      {inbox.unreadCount} olästa av {inbox.notifications.length} sparade notiser.
    </p>
    <p className="my-2 text-xs text-slate-400">
      Detta är interna Omnira-notiser, inte skickade mejl eller pushmeddelanden.
      En notis skapas bara när en ny verifierad kandidat sparas.
    </p>
    {inbox.notifications.length === 0 ? (
      <p className="text-sm text-slate-300">Inga notiser har skapats för ditt konto.</p>
    ) : <ul className="mt-3 space-y-3">
      {inbox.notifications.map(row => <li key={row.host}
        className="rounded-lg border border-white/10 bg-slate-950/45 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-sm text-slate-100">{row.name}</strong>
          <span className="text-xs text-slate-300">{row.unread ? 'Ny · oläst' : 'Läst'}</span>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Sparad i din inkorg <time dateTime={row.createdAt}>{row.createdAt.slice(0,10)}</time>.
        </p>
        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          <a href={row.officialUrl} target="_blank" rel="noopener noreferrer"
            className="text-cyan-200 underline">Officiell källa ↗</a>
          <button type="button" disabled={busy!==null}
            onClick={() => { void update(row.host,row.unread) }}
            className="min-h-11 rounded-lg border border-cyan-300/40 px-3 py-2 text-cyan-100 disabled:opacity-50">
            {row.unread ? 'Markera som läst' : 'Markera oläst'}
          </button>
        </div>
      </li>)}
    </ul>}
    {notice ? <p role="status" className="mt-3 text-sm text-cyan-200">{notice}</p> : null}
  </section>
}
