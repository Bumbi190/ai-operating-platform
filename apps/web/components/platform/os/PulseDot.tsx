import { cn } from '@/lib/utils'

type Tone = 'emerald' | 'indigo' | 'amber' | 'rose' | 'cyan' | 'violet'

const TONES: Record<Tone, { dot: string; ring: string; glow: string }> = {
  emerald: { dot: 'bg-emerald-400', ring: 'pulse-dot-emerald', glow: '#34d399' },
  indigo:  { dot: 'bg-indigo-400',  ring: 'pulse-dot-indigo',  glow: '#818cf8' },
  amber:   { dot: 'bg-amber-400',   ring: 'pulse-dot-amber',   glow: '#fbbf24' },
  rose:    { dot: 'bg-rose-400',    ring: 'pulse-dot-rose',    glow: '#f87171' },
  cyan:    { dot: 'bg-cyan-400',    ring: 'pulse-dot-cyan',    glow: '#22d3ee' },
  violet:  { dot: 'bg-violet-400',  ring: 'pulse-dot-indigo',  glow: '#a78bfa' },
}

export function PulseDot({
  tone = 'indigo',
  size = 6,
  className,
}: {
  tone?: Tone
  size?: number
  className?: string
}) {
  const t = TONES[tone]
  return (
    <span className={cn('relative inline-flex shrink-0', className)} style={{ width: size, height: size }}>
      <span
        className={cn('absolute inset-0 rounded-full', t.dot)}
        style={{ boxShadow: `0 0 8px ${t.glow}cc` }}
      />
      <span className={cn('pulse-dot block w-full h-full rounded-full', t.dot, t.ring)} />
    </span>
  )
}

/**
 * Tiny status chip — text + dot.
 */
export function StatusChip({
  tone = 'indigo',
  label,
  className,
  intense = false,
}: {
  tone?: Tone
  label: string
  className?: string
  intense?: boolean
}) {
  const colors: Record<Tone, { text: string; bg: string; border: string }> = {
    emerald: { text: '#34d399', bg: 'rgba(52,211,153,0.10)', border: 'rgba(52,211,153,0.28)' },
    indigo:  { text: '#a5b4fc', bg: 'rgba(99,102,241,0.10)', border: 'rgba(99,102,241,0.28)' },
    amber:   { text: '#fde68a', bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.28)' },
    rose:    { text: '#fda4af', bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.28)' },
    cyan:    { text: '#67e8f9', bg: 'rgba(34,211,238,0.10)', border: 'rgba(34,211,238,0.28)' },
    violet:  { text: '#c4b5fd', bg: 'rgba(139,92,246,0.10)', border: 'rgba(139,92,246,0.28)' },
  }
  const c = colors[tone]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.12em]',
        className,
      )}
      style={{
        color: c.text,
        background: intense ? `${c.bg}`.replace('0.10', '0.18') : c.bg,
        border: `1px solid ${c.border}`,
      }}
    >
      <PulseDot tone={tone} size={4} />
      {label}
    </span>
  )
}
