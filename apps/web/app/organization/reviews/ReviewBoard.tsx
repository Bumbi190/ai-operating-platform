'use client'
import { useEffect, useState, type FormEvent } from 'react'
type Proposal = { id: string; project_id: string; author_id: string; title: string; detail: string; status: string; decision_reason: string | null }
export function OrganizationReviewBoard({ owner, projects }: { owner: boolean; projects: { id: string; name: string }[] }) {
  const [rows, setRows] = useState<Proposal[]>([])
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [notice, setNotice] = useState('')
  async function reload() {
    const r = await fetch('/api/organization/proposals', { cache: 'no-store' })
    if (!r.ok) throw Error('Kunde inte läsa förslag')
    const body: { proposals: Proposal[] } = await r.json()
    setRows(body.proposals)
  }
  useEffect(() => { void reload().catch(() => setNotice('Kunde inte läsa förslag.')) }, [])
  async function create(event: FormEvent) {
    event.preventDefault()
    const r = await fetch('/api/organization/proposals', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, title, detail }),
    })
    if (r.ok) {
      setNotice('Förslaget skickades för granskning, utan att någon åtgärd utfördes.')
      setTitle(''); setDetail('')
      void reload().catch(() => {})
    } else setNotice('Förslaget kunde inte skickas.')
  }
  async function decide(id: string, decision: 'approved' | 'rejected') {
    const reason = window.prompt('Valfri motivering (högst 600 tecken)', '') ?? ''
    if (reason.length > 600) return
    const r = await fetch('/api/organization/proposals/' + id, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, reason }),
    })
    setNotice(r.ok ? 'Beslutet registrerades. Ingen åtgärd kördes.' : 'Beslutet kunde inte sparas.')
    void reload().catch(() => {})
  }
  return <div className="mx-auto max-w-5xl space-y-6 px-6 py-8 text-slate-100">
    <h1 className="text-2xl font-semibold">Granskningar och förslag</h1>
    <p className="text-sm text-slate-400">Owner-beslut registreras i historiken men kör inte kod, workflows eller driftsättningar.</p>
    {!owner && <form onSubmit={create} className="grid gap-3 rounded-xl border border-white/10 p-5">
      <label>Projekt<select className="ml-3 bg-slate-900 p-2" value={projectId} onChange={e => setProjectId(e.target.value)}>
        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <input required minLength={3} maxLength={120} placeholder="Förslagets rubrik" value={title} onChange={e => setTitle(e.target.value)} className="rounded bg-slate-900 p-3" />
      <textarea required minLength={10} maxLength={4000} placeholder="Beskriv förbättringen" rows={4} value={detail} onChange={e => setDetail(e.target.value)} className="rounded bg-slate-900 p-3" />
      <button type="submit" className="rounded bg-sky-300 p-2 font-medium text-slate-950">Lämna förslag</button>
    </form>}
    {notice && <p role="status">{notice}</p>}
    <div className="grid gap-4">{rows.map(p => <article key={p.id} className="rounded-xl border border-white/10 bg-slate-900/60 p-5">
      <div className="flex items-center justify-between"><h2 className="font-semibold">{p.title}</h2><span className="text-xs">{p.status}</span></div>
      <p className="my-3 whitespace-pre-wrap text-sm text-slate-300">{p.detail}</p>
      {p.decision_reason && <p className="text-xs text-slate-400">Beslut: {p.decision_reason}</p>}
      {owner && p.status === 'pending' && <div className="mt-3 flex gap-3">
        <button className="rounded border border-white/20 p-2" onClick={() => void decide(p.id, 'approved')}>Godkänn förslag</button>
        <button className="rounded border border-white/20 p-2" onClick={() => void decide(p.id, 'rejected')}>Avvisa</button>
      </div>}
    </article>)}</div>
  </div>
}
