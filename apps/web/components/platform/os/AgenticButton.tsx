'use client'

/**
 * AgenticButton — en knapp som UTFÖR en åtgärd (inte bara länkar).
 *
 * Postar till en action-endpoint, visar laddning → resultat, och uppdaterar
 * sidan. Det här gör "Fixa nu" agentiskt: assistenten gör jobbet åt operatören.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Check, AlertTriangle, Wand2 } from 'lucide-react'

export function AgenticButton({
  endpoint,
  body,
  label,
}: {
  endpoint: string
  body?: Record<string, unknown>
  label: string
}) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [msg, setMsg] = useState<string | null>(null)

  async function run() {
    if (state === 'running') return
    setState('running'); setMsg(null)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? `Fel ${res.status}`)

      const resumed = typeof j.resumed === 'number' ? j.resumed : null
      setMsg(resumed != null
        ? (resumed > 0 ? `Startade om ${resumed} ${resumed === 1 ? 'körning' : 'körningar'}` : (j.message ?? 'Inget att göra'))
        : 'Klart')
      setState('done')
      setTimeout(() => router.refresh(), 1200)
    } catch (e) {
      setState('error')
      setMsg(e instanceof Error ? e.message : 'Något gick fel')
    }
  }

  return (
    <div className="inline-flex items-center gap-2 shrink-0">
      <button
        onClick={run}
        disabled={state === 'running' || state === 'done'}
        className="btn-omnira ease-os press inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-semibold disabled:opacity-70"
      >
        {state === 'running' ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : state === 'done' ? <Check className="w-3.5 h-3.5" />
          : state === 'error' ? <AlertTriangle className="w-3.5 h-3.5" />
          : <Wand2 className="w-3.5 h-3.5" />}
        {state === 'done' ? 'Klart' : state === 'running' ? 'Åtgärdar…' : label}
      </button>
      {msg && (
        <span className={`text-[11px] ${state === 'error' ? 'text-rose-300' : 'text-emerald-300'}`}>{msg}</span>
      )}
    </div>
  )
}
