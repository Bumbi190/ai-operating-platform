'use client'

/**
 * Project-scope stop control (G3A).
 *
 * Deliberately separate from `PauseToggle`, which operates the PLATFORM switch.
 * The two scopes compose by AND and neither overrides the other, so a single
 * control that "just pauses things" would hide which authority the operator is
 * actually exercising — and resuming the wrong one looks like a no-op.
 */

import { toggleProjectExecutionPause } from '@/app/actions/automation'
import { Power, Pause } from 'lucide-react'
import { useState, useTransition } from 'react'

export function ProjectPauseToggle({
  projectId, paused, pausedReason,
}: { projectId: string; paused: boolean; pausedReason?: string | null }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleToggle = () => {
    setError(null)
    startTransition(async () => {
      const r = await toggleProjectExecutionPause(projectId, !paused)
      // Report failure rather than letting the button settle back and imply the
      // change took effect. A stop control that silently no-ops is worse than
      // one that is visibly broken.
      if (!r.ok) {
        setError(r.error === 'forbidden'
          ? 'Du saknar behörighet för det här projektet'
          : 'Kunde inte ändra pausläget — försök igen')
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleToggle}
        disabled={pending}
        className={`ease-os press inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-[12px] font-semibold transition-all ${
          paused
            ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25'
            : 'bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/20'
        } ${pending ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
        title={paused
          ? `Projektets exekvering är pausad${pausedReason ? ` — ${pausedReason}` : ''}. Klicka för att återuppta.`
          : 'Pausa all oövervakad exekvering för detta projekt'}
      >
        {paused ? (
          <>
            <Power className="w-3.5 h-3.5" />
            {pending ? 'Återupptar…' : 'Återuppta projekt'}
          </>
        ) : (
          <>
            <Pause className="w-3.5 h-3.5" />
            {pending ? 'Pausar…' : 'Pausa projekt'}
          </>
        )}
      </button>
      {error && <p className="text-[11px] text-red-300">{error}</p>}
    </div>
  )
}
