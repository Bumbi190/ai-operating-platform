import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { PulseDot } from './PulseDot'

interface MicroTickerItem {
  label: string
  value: ReactNode
  tone?: 'live' | 'critical' | 'passive' | 'archived'
}

/**
 * MicroTicker · a single-line operational readout.
 * Used at the bottom of feature panels to give a continuous sense of
 * "the system is reporting." Always reads as: pill · pill · pill ·
 */
export function MicroTicker({
  items,
  live = false,
  className,
}: {
  items: MicroTickerItem[]
  live?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-x-5 gap-y-2 flex-wrap caption-mono text-[10.5px]',
        className,
      )}
    >
      {live && (
        <span className="inline-flex items-center gap-1.5">
          <PulseDot tone="emerald" size={4} />
          <span className="text-emerald-300/85 eyebrow !text-[8.5px] !tracking-[0.22em]">Tx</span>
        </span>
      )}
      {items.map((item, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          <span className="text-meta">{item.label}</span>
          <span
            className="num"
            style={{
              color:
                item.tone === 'live'     ? 'var(--state-live-soft)' :
                item.tone === 'critical' ? 'var(--state-critical-soft)' :
                item.tone === 'archived' ? 'var(--state-archived)' :
                'rgba(255,255,255,0.85)',
            }}
          >
            {item.value}
          </span>
        </span>
      ))}
    </div>
  )
}
