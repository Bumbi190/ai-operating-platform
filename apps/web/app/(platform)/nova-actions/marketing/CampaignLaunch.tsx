'use client'

import { useEffect, useState } from 'react'

type QueuedRun = { run_id: string; status: string; target_month: string }
type Stage = 'form' | 'review' | 'submitting' | 'queued' | 'existing' | 'error'

function validMonth(value: string): boolean {
  return /^20\d{2}-(0[1-9]|1[0-2])$/.test(value)
}
function reasonableWindow(value: string): boolean {
  if (!validMonth(value)) return false
  const date = new Date(value + '-01T12:00:00')
  const now = new Date()
  const min = new Date(now.getFullYear(), now.getMonth(), 1)
  const max = new Date(now.getFullYear(), now.getMonth() + 13, 1)
  return date >= min && date < max
}

/** Authenticated, explicit approval surface; not an auto-publisher. */
export function CampaignLaunch() {
  const [month, setMonth] = useState('')
  const [stage, setStage] = useState<Stage>('form')
  const [message, setMessage] = useState('')
  const [run, setRun] = useState<QueuedRun | null>(null)

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('month') ?? ''
    if (reasonableWindow(requested)) setMonth(requested)
    else {
      const next = new Date()
      next.setMonth(next.getMonth() + 1)
      setMonth(next.getFullYear() + '-' + String(next.getMonth() + 1).padStart(2, '0'))
    }
  }, [])

  function changeMonth(value: string) {
    setMonth(value)
    setStage('form')
    setMessage('')
    setRun(null)
  }

  function review() {
    if (!reasonableWindow(month)) {
      setStage('error')
      setMessage('Välj aktuell eller kommande månad, högst ett år framåt.')
      return
    }
    setStage('review')
    setMessage('')
  }

  async function authorize() {
    if (stage !== 'review' || !reasonableWindow(month)) return
    setStage('submitting')
    setMessage('Kontrollerar att en kampanjplan inte redan finns ...')
    try {
      const check = await fetch('/api/marketing/plans?month=' + encodeURIComponent(month), {
        method: 'GET', credentials: 'same-origin', cache: 'no-store',
        headers: { Accept: 'application/json' },
      })
      if (check.status === 200) {
        setStage('existing')
        setMessage('En kampanjplan finns redan för månaden. Ingen ny körning beställdes.')
        return
      }
      if (check.status !== 404) {
        throw new Error('Kunde inte kontrollera tidigare plan (HTTP ' + check.status + ').')
      }
      const response = await fetch('/api/marketing/plans/generate', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ target_month: month }),
      })
      if (!response.ok) {
        throw new Error('Omnira avvisade beställningen (HTTP ' + response.status + ').')
      }
      const body = await response.json() as Partial<QueuedRun>
      if (response.status !== 202 || body.status !== 'pending' ||
          typeof body.run_id !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.run_id)) {
        throw new Error('Ingen verifierad run-id i svaret. Kontrollera körningar i Omnira.')
      }
      setRun({ run_id: body.run_id, status: body.status, target_month: month })
      setStage('queued')
      setMessage('Campaign Planner har köats. Omnira rapporterar pending – inte färdigt innehåll.')
    } catch (error) {
      setStage('error')
      setMessage(error instanceof Error ? error.message : 'Ett fel inträffade.')
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-12 text-zinc-100">
      <div className="rounded-3xl border border-indigo-500/30 bg-zinc-950/85 p-7 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.2em] text-indigo-300">Omnira / Nova / Marknadsarbete</p>
        <h1 className="mt-2 text-2xl font-semibold">Beställ en kampanjplan</h1>
        <p className="mt-4 text-sm leading-6 text-zinc-300">
          Nova använder Omniras befintliga Campaign Planner för Familje-Stunden.
          En godkänd beställning skapar en spårbar agentkörning som senare kan skapa
          kampanjplan och briefs. Den publicerar eller schemalägger inga inlägg.
        </p>
        <label htmlFor="target-month" className="mt-7 block text-sm font-semibold">Månad</label>
        <input id="target-month" type="month" value={month}
               onChange={event => changeMonth(event.target.value)}
               disabled={stage === 'submitting' || stage === 'queued'}
               className="mt-2 w-full rounded-xl border border-zinc-600 bg-zinc-900 px-4 py-3 text-white" />
        {stage === 'review' && (
          <section className="mt-6 rounded-xl border border-indigo-500/40 bg-indigo-950/30 p-4">
            <h2 className="font-semibold">Granska innan du godkänner</h2>
            <p className="mt-2 text-sm text-zinc-200">
              Projekt: <strong>Familje-Stunden</strong>. Månad: <strong>{month}</strong>.
              Begärd åtgärd: köa Campaign Planner. Inga sociala inlägg skickas eller
              schemaläggs. Detta kan använda Omniras befintliga AI-budget.
            </p>
          </section>
        )}
        {message && <p role="status" className="mt-5 text-sm text-zinc-200">{message}</p>}
        {run && <p className="mt-3 break-all text-sm text-emerald-300">
          Verifierat körnings-ID: {run.run_id}
        </p>}
        <div className="mt-7 flex flex-wrap gap-3">
          {stage !== 'queued' && stage !== 'submitting' && stage !== 'review' &&
            <button type="button" onClick={review}
                    className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold">
              Granska uppdrag
            </button>}
          {stage === 'review' &&
            <button type="button" onClick={authorize}
                    className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold">
              Godkänn och köa Campaign Planner
            </button>}
          {stage === 'review' &&
            <button type="button" onClick={() => setStage('form')}
                    className="rounded-xl border border-zinc-600 px-5 py-3 text-sm">
              Avbryt
            </button>}
          <a href="/atlas/marketing" className="rounded-xl border border-zinc-600 px-5 py-3 text-sm">
            Öppna marknadsgranskning
          </a>
        </div>
        <p className="mt-7 text-xs leading-5 text-zinc-500">
          Endast inloggade användare med rätt projektbehörighet kan köa arbetsflödet.
          Utkast måste granskas separat; publicering är inte inkopplad här.
        </p>
      </div>
    </main>
  )
}
