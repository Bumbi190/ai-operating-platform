import type { ReactNode, HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export type Tier = 'critical' | 'live' | 'passive' | 'archived'

interface MissionStateProps extends HTMLAttributes<HTMLDivElement> {
  tier: Tier
  surface?: boolean        // apply background/border/glow paint
  pulse?: boolean          // top pulse tape (live tier only)
  halo?: boolean           // soft breathing glow under (live tier only)
  children?: ReactNode
}

/**
 * MissionState · the four-tier visual hierarchy wrapper.
 *
 * Apply exactly one tier per surface so the eye instantly reads:
 *   CRITICAL  – needs operator attention now (warm gold)
 *   LIVE      – systems doing autonomous work (indigo)
 *   PASSIVE   – informational, calm (white-on-glass)
 *   ARCHIVED  – history, dimmed (zinc)
 *
 * The wrapper exposes `--tier-color`, `--tier-color-soft`, `--tier-bg`,
 * `--tier-border`, and `--tier-glow` as CSS vars so children can reference
 * them via `style={{ color: 'var(--tier-color)' }}` without re-deriving.
 */
export function MissionState({
  tier,
  surface = false,
  pulse = false,
  halo = false,
  className,
  children,
  ...props
}: MissionStateProps) {
  return (
    <div
      {...props}
      className={cn(
        `tier-${tier}`,
        surface && 'tier-surface',
        halo && tier === 'live' && 'halo',
        'relative',
        className,
      )}
    >
      {pulse && tier === 'live' && <span className="pulse-tape" aria-hidden />}
      {children}
    </div>
  )
}

/**
 * TierBadge · the canonical mission-state pill.
 * Use sparingly · one per section to anchor what tier you're reading.
 */
export function TierBadge({
  tier,
  label,
  className,
}: {
  tier: Tier
  label?: string
  className?: string
}) {
  const defaultLabels: Record<Tier, string> = {
    critical: 'Critical',
    live:     'Live',
    passive:  'Passive',
    archived: 'Archived',
  }
  return (
    <span
      className={cn(
        `tier-${tier} inline-flex items-center gap-1.5 h-5 px-2 rounded-full text-[9.5px] font-bold uppercase tracking-[0.22em]`,
        className,
      )}
      style={{
        color: 'var(--tier-color-soft)',
        background: 'var(--tier-bg)',
        border: '1px solid var(--tier-border)',
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{
          background: 'var(--tier-color)',
          boxShadow: tier === 'live' || tier === 'critical'
            ? '0 0 6px var(--tier-color)'
            : 'none',
          animation: tier === 'live' || tier === 'critical'
            ? 'breatheSoft 3s ease-in-out infinite'
            : undefined,
        }}
      />
      {label ?? defaultLabels[tier]}
    </span>
  )
}
