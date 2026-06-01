'use client'

/**
 * ExecutiveAssistant — chattens landningsvy.
 *
 * Gör assistenten till produktens centrum: en stor promptruta + exekutiva
 * snabbfrågor. Klick skapar en konversation och skickar frågan direkt
 * (via ?send=), så operatören är inne i ett svar med ett klick.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, ArrowUp, Loader2, ListChecks, BarChart3, Compass, CalendarDays, ClipboardCheck, GitBranch } from 'lucide-react'

interface Project { id: string; name: string; slug: string }

export const EXECUTIVE_PROMPTS: { label: string; icon: any }[] = [
  { label: 'Vad behöver min uppmärksamhet idag?', icon: ListChecks },
  { label: 'Visa verksamheternas resultat',        icon: BarChart3 },
  { label: 'Vad bör vi fokusera på härnäst?',      icon: Compass },
  { label: 'Skapa en veckoplan',                   icon: CalendarDays },
  { label: 'Granska väntande godkännanden',        icon: ClipboardCheck },
  { label: 'Visa flaskhalsar',                     icon: GitBranch },
]

export function ExecutiveAssistant({ projects, operatorName }: { projects: Project[]; operatorName?: string }) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)

  async function launch(prompt: string) {
    if (!prompt.trim() || loading) return
    setLoading(true)
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: null }),
      })
      const conv = await res.json()
      if (conv.id) router.push(`/chat/${conv.id}?send=${encodeURIComponent(prompt)}`)
      else setLoading(false)
    } catch {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto w-full">
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-9 h-9 rounded-2xl flex items-center justify-center chrome-edge"
          style={{ background: 'rgba(212,165,116,0.14)', border: '1px solid rgba(212,165,116,0.3)' }}>
          <Sparkles className="w-4 h-4" style={{ color: '#d4a574' }} />
        </div>
        <div>
          <h1 className="display-hero text-gradient-instrument text-[22px] leading-tight">Executive Assistant</h1>
          <p className="text-[12px] text-zinc-500">{operatorName ? `Vad kan jag hjälpa dig med, ${operatorName}?` : 'Vad kan jag hjälpa dig med?'}</p>
        </div>
      </div>

      {/* Promptruta */}
      <form
        onSubmit={(e) => { e.preventDefault(); launch(text) }}
        className="mt-4 mb-5"
      >
        <div className="flex items-end gap-2 rounded-2xl px-4 py-3 transition-colors panel focus-within:border-indigo-500/40">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); launch(text) } }}
            placeholder="Fråga assistenten vad som helst om dina verksamheter…"
            rows={1}
            disabled={loading}
            className="flex-1 bg-transparent text-[14px] resize-none focus:outline-none placeholder:text-zinc-600 max-h-32 scrollbar-thin disabled:opacity-50"
            style={{ minHeight: '24px' }}
          />
          <button
            type="submit"
            disabled={!text.trim() || loading}
            className="w-9 h-9 rounded-xl btn-omnira flex items-center justify-center disabled:opacity-30 shrink-0 press"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
          </button>
        </div>
      </form>

      {/* Exekutiva snabbfrågor */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {EXECUTIVE_PROMPTS.map((p) => (
          <button
            key={p.label}
            onClick={() => launch(p.label)}
            disabled={loading}
            className="panel ease-os lift press flex items-center gap-3 px-4 py-3 text-left transition-all disabled:opacity-50"
          >
            <p.icon className="w-4 h-4 shrink-0" style={{ color: '#a5b4fc' }} />
            <span className="text-[12.5px] text-zinc-300">{p.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
