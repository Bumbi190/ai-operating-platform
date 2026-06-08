import { cn } from '@/lib/utils'
import { RadialDial } from './Sparkline'
import { PulseDot } from './PulseDot'
import { Brain, Sparkles, Clock, Database, ChevronRight } from 'lucide-react'

export interface AgentSnapshot {
  id: string
  name: string
  role: string
  status: 'active' | 'idle' | 'reasoning' | 'blocked'
  task: string
  confidence: number          // 0-100
  memoryUsage?: number        // 0-100
  runtimeSeconds?: number     // seconds running
  lastDecision?: string
  reasoning?: string
  color?: string
  iconColor?: string
}

const STATUS_TONE: Record<AgentSnapshot['status'], { label: string; tone: 'emerald' | 'indigo' | 'amber' | 'rose' }> = {
  active:     { label: 'Live',       tone: 'emerald' },
  reasoning:  { label: 'Reasoning',  tone: 'indigo' },
  idle:       { label: 'Standby',    tone: 'amber' },
  blocked:    { label: 'Blocked',    tone: 'rose' },
}

function formatRuntime(s?: number) {
  if (s == null) return '—'
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

/**
 * Premium agent operational card — Mission Control fleet view.
 */
export function AgentCard({
  agent,
  delay = 0,
  className,
}: {
  agent: AgentSnapshot
  delay?: number
  className?: string
}) {
  const color = agent.color ?? '#818cf8'
  const status = STATUS_TONE[agent.status]
  const isActive = agent.status === 'active' || agent.status === 'reasoning'

  return (
    <div
      className={cn('panel animate-fade-in-up relative overflow-hidden group cursor-pointer', className)}
      style={{
        animationDelay: `${delay}ms`,
        animationFillMode: 'both',
      }}
    >
      {/* Ambient wash */}
      <div
        className="absolute inset-0 pointer-events-none opacity-40 group-hover:opacity-80 transition-opacity duration-700"
        style={{
          background: `radial-gradient(ellipse 80% 50% at 100% 0%, ${color}1f 0%, transparent 60%)`,
        }}
      />
      {/* Live scan line for active agents */}
      {isActive && (
        <div
          className="absolute inset-x-0 top-0 h-px opacity-70"
          style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
        />
      )}

      <div className="relative p-5 flex gap-4">
        {/* Avatar / icon */}
        <div className="shrink-0 relative">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center chrome-edge"
            style={{
              background: `linear-gradient(135deg, ${color}30 0%, ${color}12 100%)`,
              border: `1px solid ${color}55`,
              boxShadow: `0 8px 24px -8px ${color}66, inset 0 1px 0 rgba(255,255,255,0.08)`,
            }}
          >
            <Brain className="w-5 h-5" style={{ color }} />
          </div>
          {isActive && (
            <div className="absolute -bottom-1 -right-1">
              <PulseDot tone={status.tone} size={8} />
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div className="min-w-0">
              <h3 className="text-[13.5px] font-semibold text-white/95 truncate leading-tight">
                {agent.name}
              </h3>
              <p className="text-[10.5px] text-secondary mt-0.5 truncate">
                {agent.role}
              </p>
            </div>
            <span
              className="shrink-0 text-[9.5px] font-bold uppercase tracking-[0.15em] px-1.5 py-0.5 rounded"
              style={{
                color: status.tone === 'emerald' ? '#34d399'
                  : status.tone === 'indigo' ? '#a5b4fc'
                  : status.tone === 'amber' ? '#fde68a'
                  : '#fda4af',
                background:
                  status.tone === 'emerald' ? 'rgba(52,211,153,0.10)'
                  : status.tone === 'indigo' ? 'rgba(99,102,241,0.10)'
                  : status.tone === 'amber' ? 'rgba(251,191,36,0.10)'
                  : 'rgba(248,113,113,0.10)',
              }}
            >
              {status.label}
            </span>
          </div>

          {/* Current task */}
          <div className="mt-3 flex items-start gap-2">
            <Sparkles className="w-3 h-3 mt-0.5 shrink-0" style={{ color }} />
            <p className="text-[12px] text-zinc-300 leading-snug line-clamp-2">
              {agent.task}
            </p>
          </div>

          {/* Reasoning preview */}
          {agent.reasoning && (
            <div className="mt-3 pl-2.5 border-l border-white/[0.06] relative">
              <div
                className="absolute left-0 top-0 bottom-0 w-px"
                style={{ background: `linear-gradient(180deg, ${color}80, transparent)` }}
              />
              <p className="text-[10.5px] text-secondary italic leading-relaxed line-clamp-2">
                "{agent.reasoning}"
              </p>
            </div>
          )}

          {/* Bottom row — metrics */}
          <div className="mt-4 pt-3 flex items-center gap-4 text-[10.5px] text-secondary" style={{ borderTop: `1px solid ${color}1a` }}>
            <span className="flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              <span className="num text-zinc-400">{formatRuntime(agent.runtimeSeconds)}</span>
            </span>
            {agent.memoryUsage != null && (
              <span className="flex items-center gap-1">
                <Database className="w-2.5 h-2.5" />
                <span className="num text-zinc-400">{agent.memoryUsage}%</span>
              </span>
            )}
            <span className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color }}>
              View trace <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* Confidence dial */}
        <div className="shrink-0 flex flex-col items-center justify-center">
          <RadialDial value={agent.confidence} color={color} size={56} thickness={3.5} label="conf" />
        </div>
      </div>
    </div>
  )
}
