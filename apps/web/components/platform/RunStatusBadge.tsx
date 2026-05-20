import { cn } from '@/lib/utils'
import type { RunStatus } from '@/lib/supabase/types'

const statusConfig: Record<RunStatus, { label: string; className: string; dot: string }> = {
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
}

interface RunStatusBadgeProps {
  status: RunStatus
  className?: string
}

export function RunStatusBadge({ status, className }: RunStatusBadgeProps) {
  const config = statusConfig[status]
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
