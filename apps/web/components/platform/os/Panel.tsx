import { cn } from '@/lib/utils'
import type { HTMLAttributes, ReactNode } from 'react'

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'flat' | 'edge'
  glow?: 'none' | 'indigo' | 'violet' | 'cyan' | 'emerald' | 'amber' | 'rose'
  children?: ReactNode
}

/**
 * Cinematic floating panel — the workhorse surface.
 * Premium glass + gradient hairline + deep cinematic shadow.
 */
export function Panel({
  variant = 'default',
  glow = 'none',
  className,
  children,
  ...props
}: PanelProps) {
  return (
    <div
      className={cn(
        'panel',
        variant === 'elevated' && 'panel-elevated',
        variant === 'edge' && 'edge-gradient',
        variant === 'flat' && '!shadow-none',
        glow !== 'none' && `glow-${glow}`,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function PanelHeader({
  eyebrow,
  title,
  subtitle,
  icon,
  right,
  className,
}: {
  eyebrow?: string
  title: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  right?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 mb-5', className)}>
      <div className="flex items-start gap-3 min-w-0">
        {icon && (
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 chrome-edge"
            style={{
              background: 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(139,92,246,0.12))',
              border: '1px solid rgba(99,102,241,0.25)',
            }}
          >
            {icon}
          </div>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-300/70 mb-1">
              {eyebrow}
            </p>
          )}
          <h2 className="text-[15px] font-semibold tracking-tight text-white/95 leading-tight">
            {title}
          </h2>
          {subtitle && (
            <p className="text-[11.5px] text-secondary mt-1">{subtitle}</p>
          )}
        </div>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}
