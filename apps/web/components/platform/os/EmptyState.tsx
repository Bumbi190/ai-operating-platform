import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { DotMatrix } from './DotMatrix'

interface EmptyStateProps {
  eyebrow?: string
  title: string
  body?: string
  icon?: ReactNode
  action?: ReactNode
  variant?: 'standard' | 'silent'
  className?: string
}

/**
 * Cinematic empty state — "Awaiting first directive."
 *
 * Two variants:
 *   standard — panel + icon + CTA (default)
 *   silent   — bare minimum, generous breathing room (for sections that
 *              don't yet have data but shouldn't shout about it)
 */
export function EmptyState({
  eyebrow,
  title,
  body,
  icon,
  action,
  variant = 'standard',
  className,
}: EmptyStateProps) {
  if (variant === 'silent') {
    return (
      <div className={cn('px-6 py-12 text-center relative', className)}>
        <div className="absolute inset-0 opacity-30 flex items-center justify-center pointer-events-none">
          <DotMatrix cols={20} rows={8} mask="fade-radial" gap={14} />
        </div>
        <div className="relative">
          {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
          <p className="text-[12px] text-secondary tracking-tight">{title}</p>
          {body && <p className="text-[10.5px] text-meta mt-1.5 max-w-xs mx-auto leading-relaxed">{body}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className={cn('panel-quiet p-12 text-center relative overflow-hidden', className)}>
      <div className="absolute -top-4 left-1/2 -translate-x-1/2 opacity-40 pointer-events-none">
        <DotMatrix cols={32} rows={10} mask="fade-radial" gap={14} />
      </div>

      <div className="relative">
        {icon && (
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5 chrome-edge"
            style={{
              background: 'linear-gradient(135deg, rgba(99,102,241,0.10), rgba(139,92,246,0.04))',
              border: '1px solid rgba(99,102,241,0.20)',
              boxShadow: '0 10px 28px -12px rgba(99,102,241,0.40)',
            }}
          >
            {icon}
          </div>
        )}

        {eyebrow && (
          <p className="eyebrow eyebrow-accent mb-2.5">{eyebrow}</p>
        )}

        <h3 className="display-section text-white/90 tracking-tight">
          {title}
        </h3>

        {body && (
          <p className="text-[12.5px] text-secondary mt-3 max-w-sm mx-auto leading-relaxed">
            {body}
          </p>
        )}

        {action && <div className="mt-6 inline-flex">{action}</div>}
      </div>
    </div>
  )
}
