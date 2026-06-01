'use client'

/**
 * QuickAdd — registrera en intäkt eller lead för hand, direkt från dashboarden.
 *
 * Postar till /api/business/revenue resp. /api/business/leads (inloggad
 * användare räcker — ingen API-nyckel behövs). Vid lyckat svar uppdateras
 * sidan så korten direkt visar den nya datan.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, Banknote, UserPlus, Loader2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ProjectOpt { id: string; name: string; slug: string; color: string }
type Mode = 'revenue' | 'lead'

export function QuickAdd({ projects }: { projects: ProjectOpt[] }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="btn-ghost ease-os press inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-medium"
      >
        <Plus className="w-3.5 h-3.5" /> Lägg till
      </button>
      {open && <QuickAddModal projects={projects} onClose={() => setOpen(false)} />}
    </>
  )
}

function QuickAddModal({ projects, onClose }: { projects: ProjectOpt[]; onClose: () => void }) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('revenue')
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [source, setSource] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    if (!projectId) { setError('Välj en verksamhet'); return }
    if (mode === 'revenue' && (!amount || Number.isNaN(Number(amount)))) { setError('Ange ett belopp'); return }

    setLoading(true)
    try {
      const endpoint = mode === 'revenue' ? '/api/business/revenue' : '/api/business/leads'
      const body = mode === 'revenue'
        ? { project_id: projectId, amount_sek: Number(amount), source: source || 'manual', description: description || null }
        : { project_id: projectId, name: name || null, email: email || null, source: source || 'manual' }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `Fel ${res.status}`)
      }
      setDone(true)
      router.refresh()
      setTimeout(onClose, 700)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Något gick fel')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg text-[13px] text-white/90 outline-none transition-colors'
  const inputStyle = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' } as const

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(3,5,22,0.7)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="panel w-full max-w-md p-6 relative animate-fade-in-up"
        style={{ animationFillMode: 'both' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-200 transition-colors">
          <X className="w-4 h-4" />
        </button>

        <p className="eyebrow eyebrow-gold mb-1">Lägg till</p>
        <h2 className="text-[18px] font-semibold text-white/95 tracking-tight mb-5">Registrera manuellt</h2>

        {/* Mode-väljare */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          <ModeBtn active={mode === 'revenue'} onClick={() => setMode('revenue')} icon={<Banknote className="w-3.5 h-3.5" />} label="Intäkt" />
          <ModeBtn active={mode === 'lead'} onClick={() => setMode('lead')} icon={<UserPlus className="w-3.5 h-3.5" />} label="Lead" />
        </div>

        <div className="space-y-3">
          {/* Projekt */}
          <Field label="Verksamhet">
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={inputCls} style={inputStyle}>
              {projects.map((p) => (
                <option key={p.id} value={p.id} style={{ background: '#0b0e1f' }}>{p.name}</option>
              ))}
            </select>
          </Field>

          {mode === 'revenue' ? (
            <>
              <Field label="Belopp (SEK)">
                <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="t.ex. 2490" className={inputCls} style={inputStyle} />
              </Field>
              <Field label="Beskrivning (valfritt)">
                <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="t.ex. Månadspaket – kund X" className={inputCls} style={inputStyle} />
              </Field>
            </>
          ) : (
            <>
              <Field label="Namn (valfritt)">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="t.ex. Anna Andersson" className={inputCls} style={inputStyle} />
              </Field>
              <Field label="E-post (valfritt)">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="anna@exempel.se" className={inputCls} style={inputStyle} />
              </Field>
            </>
          )}

          <Field label="Källa (valfritt)">
            <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="manual" className={inputCls} style={inputStyle} />
          </Field>
        </div>

        {error && <p className="text-[12px] text-rose-300 mt-4">{error}</p>}

        <button
          onClick={submit}
          disabled={loading || done}
          className="btn-omnira ease-os press w-full mt-5 inline-flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-semibold disabled:opacity-60"
        >
          {done ? <><Check className="w-4 h-4" /> Sparat</>
            : loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Sparar…</>
            : mode === 'revenue' ? 'Registrera intäkt' : 'Registrera lead'}
        </button>
      </div>
    </div>
  )
}

function ModeBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn('inline-flex items-center justify-center gap-2 py-2 rounded-lg text-[12px] font-medium transition-all', active ? 'text-white' : 'text-zinc-400 hover:text-zinc-200')}
      style={active
        ? { background: 'rgba(99,102,241,0.16)', border: '1px solid rgba(99,102,241,0.35)' }
        : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      {icon} {label}
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="eyebrow !text-[8.5px] block mb-1.5">{label}</span>
      {children}
    </label>
  )
}
