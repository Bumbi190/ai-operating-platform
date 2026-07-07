import { cn } from '@/lib/utils'
import { PulseDot } from './PulseDot'

interface SystemReadyBannerProps {
  /** ISO timestamp of last boot (omit for "moments ago") */
  bootedAt?: string
  /** number of systems online */
  systemsOnline?: number
  /** total systems */
  systemsTotal?: number
  className?: string
}

/**
 * SystemReadyBanner · the OS-native readiness strip that crowns each page.
 *
 * Reads like a Falcon 9 launch console: discrete signals separated by
 * monospace pipes, no decoration, restrained.
 */
export function SystemReadyBanner({
  bootedAt,
  systemsOnline,
  systemsTotal,
  className,
}: SystemReadyBannerProps) {
  let bootLabel = 'moments ago'
  if (bootedAt) {
    const dSec = Math.max(0, Math.floor((Date.now() - new Date(bootedAt).getTime()) / 1000))
    bootLabel =
      dSec < 60 ? `${dSec}s ago` :
      dSec < 3600 ? `${Math.floor(dSec / 60)}m ago` :
      dSec < 86400 ? `${Math.floor(dSec / 3600)}h ago` :
      `${Math.floor(dSec / 86400)}d ago`
  }

  return (
    <div
      className={cn(
        'relative flex items-center gap-3 px-4 py-2.5 rounded-xl overflow-hidden tape animate-fade-in',
        className,
      )}
      style={{
        background:
          'linear-gradient(90deg, rgba(52,211,153,0.05) 0%, rgba(99,102,241,0.04) 50%, rgba(212,165,116,0.03) 100%)',
        border: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      {/* Boot OK light */}
      <span className="flex items-center gap-2 shrink-0">
        <PulseDot tone="emerald" size={5} />
        <span className="eyebrow !text-[9px] !text-emerald-300/85">
          Boot complete
        </span>
      </span>

      <span className="text-faint caption-mono text-[10px]">|</span>

      <span className="caption-mono text-[10.5px] text-zinc-400 shrink-0">
        <span className="text-meta">SYS</span>{' '}
        <span className="text-white/85">
          {systemsOnline ?? '—'}<span className="text-faint">/{systemsTotal ?? '—'}</span>
        </span>
        {' '}<span className="text-meta">online</span>
      </span>

      <span className="text-faint caption-mono text-[10px] hidden md:inline">|</span>

      <span className="caption-mono text-[10.5px] text-secondary hidden md:inline truncate">
        <span className="text-meta">Bus</span> <span className="text-emerald-400/80">nominal</span>
        <span className="text-faint"> · </span>
        <span className="text-meta">Mem</span> <span className="text-indigo-300/80">sync</span>
        <span className="text-faint"> · </span>
        <span className="text-meta">Telemetry</span> <span className="text-cyan-300/80">streaming</span>
      </span>

      <span className="ml-auto caption-mono text-[10px] text-meta shrink-0">
        Boot · {bootLabel}
      </span>
    </div>
  )
}
