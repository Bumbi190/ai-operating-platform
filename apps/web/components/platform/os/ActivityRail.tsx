'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  Activity, ShieldCheck, GitBranch, Database, Send, AlertTriangle,
  Brain, Cpu, Sparkles, Film, FileText, Zap, Filter,
} from 'lucide-react'

export type ActivityEventType =
  | 'agent'
  | 'approval'
  | 'workflow'
  | 'memory'
  | 'publish'
  | 'render'
  | 'failure'
  | 'api'
  | 'decision'
  | 'script'

export interface ActivityEvent {
  id: string
  type: ActivityEventType
  title: string
  detail?: string
  project?: string
  projectColor?: string
  timestamp: string
  intense?: boolean
}

// Restrained icon palette — mostly monochrome with subtle warm/cool accents.
const TYPE_META: Record<ActivityEventType, { icon: any; color: string; label: string }> = {
  agent:    { icon: Brain,         color: '#a78bfa', label: 'Agent' },
  approval: { icon: ShieldCheck,   color: '#d4a574', label: 'Review' },
  workflow: { icon: GitBranch,     color: '#818cf8', label: 'Workflow' },
  memory:   { icon: Database,      color: '#67e8f9', label: 'Memory' },
  publish:  { icon: Send,          color: '#34d399', label: 'Publish' },
  render:   { icon: Film,          color: '#c084fc', label: 'Render' },
  failure:  { icon: AlertTriangle, color: '#f87171', label: 'Failure' },
  api:      { icon: Cpu,           color: '#60a5fa', label: 'API' },
  decision: { icon: Sparkles,      color: '#e8c89a', label: 'Decision' },
  script:   { icon: FileText,      color: '#a5b4fc', label: 'Script' },
}

function relative(iso: string, nowMs: number) {
  const t = new Date(iso).getTime()
  const dSec = Math.max(0, Math.floor((nowMs - t) / 1000))
  if (dSec < 5) return 'just now'
  if (dSec < 60) return `${dSec}s ago`
  if (dSec < 3600) return `${Math.floor(dSec / 60)}m ago`
  if (dSec < 86400) return `${Math.floor(dSec / 3600)}h ago`
  return `${Math.floor(dSec / 86400)}d ago`
}

/**
 * Live Activity Rail · realtime ops feed
 * Linear-quiet design — monochrome with restrained color accents on icons.
 */
export function ActivityRail({ events: initial = [] }: { events?: ActivityEvent[] }) {
  const [events] = useState<ActivityEvent[]>(initial)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5_000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="relative h-full flex flex-col rail-border-gradient">
      {/* Header — quieter, smaller, less chrome.                              */}
      <div
        className="shrink-0 px-4 pt-4 pb-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
      >
        <div className="flex items-center justify-between mb-1.5">
          <p className="eyebrow !text-[9px] !tracking-[0.22em] !text-white/45">
            Telemetry
          </p>
          <button
            className="w-5 h-5 rounded-md flex items-center justify-center text-zinc-700 hover:text-zinc-400 transition-colors"
            style={{ background: 'rgba(255,255,255,0.018)', border: '1px solid rgba(255,255,255,0.035)' }}
            title="Filter"
          >
            <Filter className="w-2.5 h-2.5" />
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="relative inline-flex w-1 h-1">
            <span className="absolute inset-0 rounded-full bg-emerald-400/80" />
          </span>
          <span className="text-[10px] text-zinc-600">
            {events.length} events
          </span>
        </div>
      </div>

      {/* Stream */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {events.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <div
              className="w-9 h-9 rounded-xl mx-auto mb-3 flex items-center justify-center chrome-edge"
              style={{
                background: 'rgba(99,102,241,0.06)',
                border: '1px solid rgba(99,102,241,0.16)',
              }}
            >
              <Activity className="w-3.5 h-3.5 text-indigo-300" />
            </div>
            <p className="text-[11.5px] text-zinc-400 font-medium">Listening for events</p>
            <p className="text-[10px] text-zinc-600 mt-1">No platform activity yet</p>
          </div>
        ) : (
          <div className="px-1.5 py-1.5">
            {events.map((e, i) => {
              const meta = TYPE_META[e.type]
              const Icon = meta.icon
              return (
                <div
                  key={e.id}
                  className={cn(
                    'relative flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/[0.02] transition-colors ease-os group cursor-pointer animate-fade-in-up',
                  )}
                  style={{ animationDelay: `${i * 25}ms`, animationFillMode: 'both' }}
                >
                  {/* Icon — quieter, smaller, no halo unless intense          */}
                  <div className="shrink-0 mt-0.5 relative">
                    <div
                      className="w-6 h-6 rounded-md flex items-center justify-center"
                      style={{
                        background: 'rgba(255,255,255,0.018)',
                        border: '1px solid rgba(255,255,255,0.04)',
                      }}
                    >
                      <Icon className="w-2.5 h-2.5" style={{ color: meta.color, opacity: 0.7 }} />
                    </div>
                    {e.intense && (
                      <span
                        className="absolute -top-0 -right-0 w-1 h-1 rounded-full"
                        style={{ background: meta.color }}
                      />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* meta line — single muted row                            */}
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span
                        className="eyebrow !text-[8px] !tracking-[0.18em]"
                        style={{ color: `${meta.color}99` }}
                      >
                        {meta.label}
                      </span>
                      {e.project && (
                        <>
                          <span className="text-zinc-800 text-[8px]">·</span>
                          <span className="inline-flex items-center gap-1 text-[9px] text-zinc-600">
                            <span className="w-1 h-1 rounded-full" style={{ background: e.projectColor ?? '#818cf8', opacity: 0.7 }} />
                            {e.project}
                          </span>
                        </>
                      )}
                    </div>
                    {/* title — slightly smaller, slightly softer color         */}
                    <p className="text-[11px] text-zinc-300 leading-snug tracking-tight">
                      {e.title}
                    </p>
                    {e.detail && (
                      <p className="text-[9.5px] text-zinc-600 mt-0.5 leading-snug line-clamp-1">
                        {e.detail}
                      </p>
                    )}
                    <p className="caption-mono text-[9px] text-zinc-700 mt-1">
                      {relative(e.timestamp, now)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer status — minimal ambient ribbon                            */}
      <div
        className="shrink-0 px-4 py-2.5 flex items-center justify-between caption-mono text-[9px]"
        style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}
      >
        <span className="text-zinc-700">primary</span>
        <span className="flex items-center gap-1 text-emerald-500/70">
          <Zap className="w-2 h-2" /> live
        </span>
      </div>
    </div>
  )
}
