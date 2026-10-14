'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import styles from '@/components/platform/vnext/ProjectCommandCenter.module.css'

type Workflow = {
  id: string
  name: string
  description: string | null
  trigger: string
  active: boolean
  created_at: string | null
}

const ENDPOINT = '/api/organization/projects/handlarborsen/workflows'

function MetadataEditor({ workflow, onSaved }: { workflow: Workflow; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(workflow.name)
  const [description, setDescription] = useState(workflow.description ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = await fetch(ENDPOINT + '/' + encodeURIComponent(workflow.id), {
        method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      })
      if (!response.ok) throw Error('Uppdateringen nekades. Kontrollera dina rättigheter.')
      try {
        await onSaved()
      } catch {
        setError('Ändringen sparades, men listan kunde inte läsas om.')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Kunde inte spara ändringen.')
    } finally { setBusy(false) }
  }

  return <form onSubmit={save} className="grid gap-2 rounded-lg border border-white/10 p-3">
    <label className="text-xs text-slate-300">Workflow-namn
      <input className="mt-1 w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
        maxLength={120} required value={name} onChange={event => setName(event.target.value)} />
    </label>
    <label className="text-xs text-slate-300">Beskrivning
      <textarea className="mt-1 w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
        maxLength={1600} value={description} onChange={event => setDescription(event.target.value)} rows={2} />
    </label>
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-slate-400">{workflow.active ? 'Aktiv – körning ändras inte' : 'Inaktiv'}</span>
      <button type="submit" disabled={busy} className="rounded bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50">
        {busy ? 'Sparar…' : 'Spara metadata'}
      </button>
    </div>
    {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
  </form>
}

export function HandlarborsenCollaboratorWorkflows() {
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const refresh = useCallback(async () => {
    const response = await fetch(ENDPOINT, { credentials: 'same-origin', cache: 'no-store' })
    if (!response.ok) throw Error('Kunde inte läsa Handlarbörsens workflows.')
    const body: { workflows?: Workflow[] } = await response.json()
    if (!Array.isArray(body.workflows)) throw Error('Felaktigt svar från servern.')
    setWorkflows(body.workflows)
  }, [])

  useEffect(() => {
    let live = true
    void refresh().catch(() => { if (live) setMessage('Kunde inte läsa workflows just nu.') })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [refresh])

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      })
      if (!response.ok) throw Error('Workflow-utkastet kunde inte skapas.')
      setName('')
      setDescription('')
      setMessage('Ett inaktivt utkast skapades. Det kommer inte att köras automatiskt.')
      try {
        await refresh()
      } catch {
        setMessage('Utkastet skapades, men listan kunde inte läsas om ännu.')
      }
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Kunde inte skapa workflow-utkastet.')
    } finally { setBusy(false) }
  }

  return <section className={styles.panel} aria-labelledby="collaborator-workflow-editor">
    <h2 id="collaborator-workflow-editor" className="mb-3 text-lg font-semibold">Handlarbörsen · Workflow-arbete</h2>
    <p className="mb-4 text-sm text-slate-300">Du får skapa inaktiva utkast och ändra namn eller beskrivningar. Att aktivera, köra, ändra steg eller radera workflows kräver Owner.</p>
    <form onSubmit={create} className="mb-6 grid gap-3 rounded-xl border border-white/10 p-4">
      <label className="text-sm">Nytt workflow-utkast
        <input required maxLength={120} placeholder="Namn på utkastet" value={name}
          onChange={event => setName(event.target.value)}
          className="mt-2 w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
      </label>
      <textarea maxLength={1600} rows={2} placeholder="Beskriv vad workflowet ska göra"
        value={description} onChange={event => setDescription(event.target.value)}
        className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
      <button type="submit" disabled={busy} className="rounded bg-sky-200 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">
        {busy ? 'Skapar…' : 'Skapa inaktivt utkast'}
      </button>
    </form>
    {message && <p role="status" className="mb-3 text-sm text-sky-200">{message}</p>}
    {loading ? <p role="status">Läser workflows…</p> : workflows.length === 0
      ? <p className="text-sm text-slate-400">Inga workflows tillgängliga i listan.</p>
      : <div className="grid gap-3 lg:grid-cols-2">
          {workflows.map(workflow =>
            <MetadataEditor key={workflow.id} workflow={workflow} onSaved={refresh} />)}
        </div>}
  </section>
}
