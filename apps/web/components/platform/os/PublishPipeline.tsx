import { cn } from '@/lib/utils'
import { Send, Clock, Globe } from 'lucide-react'
import { PulseDot } from './PulseDot'

export interface PublishItem {
  id: string
  title: string
  /** project name */
  project?: string
  projectColor?: string
  /** ISO timestamp */
  scheduledAt: string
  status: 'scheduled' | 'rendering' | 'queued' | 'published'
  platforms: string[]   // e.g. ['TikTok', 'IG Reels', 'YouTube Shorts']
}

interface PublishPipelineProps {
  items: PublishItem[]
  className?: string
}

const STATUS_META = {
  scheduled: { label: 'Scheduled', tone: 'passive' as const, color: 'rgba(255,255,255,0.5)' },
  rendering: { label: 'Rendering', tone: 'live'    as const, color: '#a5b4fc' },
  queued:    { label: 'Queued',    tone: 'live'    as const, color: '#a78bfa' },
  published: { label: 'Published', tone: 'archived'as const, color: '#34d399' },
}

function timeUntil(iso: string): string {
  const t = new Date(iso).getTime()
  const dSec = Math.floor((t - Date.now()) / 1000)
  if (dSec <= 0) {
    const past = -dSec
    if (past < 60) return `${past}s ago`
    if (past < 3600) return `${Math.floor(past / 60)}m ago`
    if (past < 86400) return `${Math.floor(past / 3600)}h ago`
    return `${Math.floor(past / 86400)}d ago`
  }
  if (dSec < 60) return `in ${dSec}s`
  if (dSec < 3600) return `in ${Math.floor(dSec / 60)}m`
  if (dSec < 86400) return `in ${Math.floor(dSec / 3600)}h`
  return `in ${Math.floor(dSec / 86400)}d`
}

/**
 * PublishPipeline · vertical timeline of upcoming and recent distribution events.
 *
 * Each row is one publish moment: title, platforms, ETA, status. The active
 * row gets a live indicator on the timeline rail.
 */
export function PublishPipeline({ items, className }: PublishPipelineProps) {
  return (
    <div className={cn('relative pl-7', className)}>
      {/* Timeline rail */}
      <div
        className="absolute left-2.5 top-1 bottom-1 w-px"
        style={{
          background:
            'linear-gradient(180deg, rgba(99,102,241,0.5) 0%, rgba(139,92,246,0.25) 50%, rgba(99,102,241,0) 100%)',
        }}
      />

      <div className="space-y-5">
        {items.map((item, i) => {
          const meta = STATUS_META[item.status]
          const isLive = item.status === 'rendering' || item.status === 'queued'
          return (
            <div key={item.id} className="relative animate-fade-in-up" style={{ animationDelay: `${i * 80}ms`, animationFillMode: 'both' }}>
              {/* Node */}
              <div
                className="absolute -left-7 top-1 w-5 h-5 rounded-full flex items-center justify-center chrome-edge"
                style={{
                  background: isLive ? `${meta.color}22` : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${isLive ? `${meta.color}55` : 'rgba(255,255,255,0.08)'}`,
                  boxShadow: isLive ? `0 0 10px ${meta.color}44` : 'none',
                }}
              >
                {item.status === 'published'
                  ? <Globe className="w-2.5 h-2.5 text-emerald-300/80" />
                  : <Send className="w-2.5 h-2.5" style={{ color: meta.color, opacity: isLive ? 1 : 0.6 }} />
                }
              </div>

              {/* Body */}
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span
                    className="eyebrow !text-[8.5px] !tracking-[0.20em]"
                    style={{ color: `${meta.color}cc` }}
                  >
                    {meta.label}
                  </span>
                  {isLive && <PulseDot tone={item.status === 'rendering' ? 'violet' : 'indigo'} size={4} />}
                  {item.project && (
                    <>
                      <span className="text-zinc-700 text-[8px]">·</span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500">
                        <span className="w-1 h-1 rounded-full" style={{ background: item.projectColor ?? '#818cf8' }} />
                        {item.project}
                      </span>
                    </>
                  )}
                </div>

                <p className="text-[12.5px] text-zinc-100 leading-snug tracking-tight">
                  {item.title}
                </p>

                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  {item.platforms.map(p => (
                    <span
                      key={p}
                      className="caption-mono text-[9.5px] px-1.5 py-0.5 rounded"
                      style={{
                        color: 'rgba(255,255,255,0.6)',
                        background: 'rgba(255,255,255,0.035)',
                        border: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      {p}
                    </span>
                  ))}
                  <span className="caption-mono text-[9.5px] text-zinc-600 inline-flex items-center gap-1 ml-1">
                    <Clock className="w-2.5 h-2.5" />
                    {timeUntil(item.scheduledAt)}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
