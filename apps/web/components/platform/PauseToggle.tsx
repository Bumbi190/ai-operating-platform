'use client'

import { toggleAutomationPause } from '@/app/actions/automation'
import { Power, Pause } from 'lucide-react'
import { useState, useTransition } from 'react'

/**
 * The GLOBAL EXECUTION STOP control (platform-operator only).
 *
 * The copy deliberately says "exekvering", not "automation". The underlying
 * column is `automation_paused` and keeps that name, but the switch stops
 * operator-requested execution too — promising only "automation" would
 * understate what the operator is about to do, and understating a kill switch
 * is how people press it expecting less than they get.
 */
export function PauseToggle({ paused }: { paused: boolean }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleToggle = () => {
    setError(null)
    startTransition(async () => {
      const r = await toggleAutomationPause(!paused)
      // The button is NOT the authority — the server is. Rendering the refusal
      // is the honest outcome: hiding the control for non-operators would make
      // UI visibility look like a permission boundary, and a stop control that
      // silently no-ops is worse than one that visibly refuses.
      if (!r.ok) {
        setError(r.error === 'not_operator'
          ? 'Kräver plattformsoperatör'
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
        ? 'Exekveringen är stoppad — klicka för att återuppta'
        : 'Stoppar all exekvering: både automatisk och manuellt begärd. '
          + 'Atlas, statusvyer och styrning förblir tillgängliga.'}
    >
      {paused ? (
        <>
          <Power className="w-3.5 h-3.5" />
          {pending ? 'Återupptar…' : 'Återuppta exekvering'}
        </>
      ) : (
        <>
          <Pause className="w-3.5 h-3.5" />
          {pending ? 'Stoppar…' : 'Stoppa exekvering'}
        </>
      )}
    </button>
      {error && <p className="text-[11px] text-red-300">{error}</p>}
    </div>
  )
}
