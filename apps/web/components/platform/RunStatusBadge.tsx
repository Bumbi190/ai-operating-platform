import { cn } from '@/lib/utils'
import type { RunStatus } from '@/lib/supabase/types'

// Keyed on the full RunStatus union — TypeScript fails the build if a status is
// missing, so this map can never silently drift from the type again.
export const statusConfig: Record<RunStatus, { label: string; className: string; dot: string }> = {
  pending: {
    label: 'Väntar',
    className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
    dot: 'bg-yellow-500',
  },
  running: {
    label: 'Kör...',
    className: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    dot: 'bg-blue-500 animate-pulse',
  },
  done: {
    label: 'Klar',
    className: 'bg-green-500/10 text-green-600 border-green-500/20',
    dot: 'bg-green-500',
  },
  failed: {
    label: 'Misslyckades',
    className: 'bg-red-500/10 text-red-600 border-red-500/20',
    dot: 'bg-red-500',
  },
  awaiting_approval: {
    label: 'Väntar godkännande',
    className: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    dot: 'bg-amber-500',
  },
  rejected: {
    label: 'Avvisad',
    className: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
    dot: 'bg-rose-500',
  },
  cancelled: {
    label: 'Avbruten',
    className: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20',
    dot: 'bg-zinc-500',
  },
}

// Defensive fallback: any status value outside the known set (e.g. raw DB data
// ahead of the type) degrades gracefully to a neutral badge instead of crashing.
export const UNKNOWN_STATUS = {
  label: 'Okänd',
  className: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20',
  dot: 'bg-zinc-500',
}

interface RunStatusBadgeProps {
  status: RunStatus
  className?: string
}

export function RunStatusBadge({ status, className }: RunStatusBadgeProps) {
  const config = statusConfig[status] ?? UNKNOWN_STATUS
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        config.className,
        className,
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', config.dot)} />
      {config.label}
    </span>
  )
}
