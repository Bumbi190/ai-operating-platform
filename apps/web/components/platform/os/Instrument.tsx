import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Sparkline } from './Sparkline'
import { PulseDot } from './PulseDot'

interface InstrumentProps {
  label: string
  value: ReactNode
  unit?: string
  delta?: { value: string; positive?: boolean }
  trend?: number[]
  color?: string
  caption?: string
  live?: boolean
  delay?: number
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

/**
 * Instrument · single-line aircraft-cluster readout.
 * The dashboard's primary metric format — designed to feel like a panel
 * of dials in a Falcon cockpit, not a marketing landing page.
 */
export function Instrument({
  label,
  value,
  unit,
  delta,
  trend,
  color = '#a5b4fc',
  caption,
  live = false,
  delay = 0,
  className,
  size = 'md',
}: InstrumentProps) {
  const valueClass =
    size === 'lg' ? 'text-[40px]' :
    size === 'sm' ? 'text-[22px]' :
    'text-[30px]'

  return (
    <div
      className={cn('relative group animate-fade-in-up', className)}
      style={{
        animationDelay: `${delay}ms`,
        animationFillMode: 'both',
      }}
    >
      {/* Top eyebrow row */}
      <div className="flex items-center justify-between mb-2">
        <span className="eyebrow !text-[9px] !tracking-[0.22em] flex items-center gap-1.5">
          {live && <PulseDot tone="emerald" size={4} />}
          {label}
        </span>
        {delta && (
          <span
            className="caption-mono text-[9.5px] font-semibold px-1 py-0 rounded"
            style={{
              color: delta.positive ? '#34d399' : '#f87171',
            }}
          >
            {delta.positive ? '↑' : '↓'} {delta.value}
          </span>
        )}
      </div>

      {/* Value */}
      <div className="flex items-baseline gap-1.5">
        <span
          className={cn('font-semibold leading-none num-display', valueClass)}
          style={{ color }}
        >
          {value}
        </span>
        {unit && (
          <span className="text-[11px] text-meta caption-mono">{unit}</span>
        )}
      </div>

      {/* Caption + sparkline */}
      <div className="mt-2.5 flex items-center justify-between gap-3">
        {caption && (
          <span className="text-[10.5px] text-meta truncate">{caption}</span>
        )}
        {trend && trend.length > 1 && (
          <div className="shrink-0 ml-auto">
            <Sparkline values={trend} color={color} height={26} width={72} fill />
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * InstrumentCluster — a row of Instruments separated by vertical dividers,
 * the way Interstellar's cockpit lays out tightly grouped readings.
 */
export function InstrumentCluster({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 lg:grid-cols-4 gap-x-0 gap-y-6 panel p-6',
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * Divider · vertical hairline between instruments
 */
export function ClusterDivider() {
  return (
    <div
      className="absolute top-2 bottom-2 w-px"
      style={{ background: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.06), transparent)' }}
    />
  )
}
