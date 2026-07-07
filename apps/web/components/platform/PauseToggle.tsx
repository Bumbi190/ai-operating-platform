'use client'

import { toggleAutomationPause } from '@/app/actions/automation'
import { Power, Pause } from 'lucide-react'
import { useTransition } from 'react'

export function PauseToggle({ paused }: { paused: boolean }) {
  const [pending, startTransition] = useTransition()

  const handleToggle = () => {
    startTransition(async () => {
      await toggleAutomationPause(!paused)
    })
  }

  return (
    <button
      onClick={handleToggle}
      disabled={pending}
      className={`ease-os press inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-[12px] font-semibold transition-all ${
        paused
          ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25'
          : 'bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/20'
      } ${pending ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
      title={paused ? 'Automation är pausad — klicka för att återuppta' : 'Pausa all automation'}
    >
      {paused ? (
        <>
          <Power className="w-3.5 h-3.5" />
          {pending ? 'Återupptar…' : 'Återuppta automation'}
        </>
      ) : (
        <>
          <Pause className="w-3.5 h-3.5" />
          {pending ? 'Pausar…' : 'Pausa automation'}
        </>
      )}
    </button>
  )
}
