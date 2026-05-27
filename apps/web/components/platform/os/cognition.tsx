'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Brain, Sparkles, Database, AlertTriangle, ChevronRight, Lightbulb, Target } from 'lucide-react'
import { StreamingText } from './StreamingText'
import { PulseDot } from './PulseDot'

// ═══════════════════════════════════════════════════════════════════════════
// AgentThinking · the canonical "agent is reasoning" indicator
// ═══════════════════════════════════════════════════════════════════════════

interface AgentThinkingProps {
  agentName: string
  /** rotating reasoning lines · the agent's "thought stream" */
  thoughts: string[]
  /** current confidence (0–100) — fluctuates live */
  confidence?: number
  color?: string
  className?: string
}

export function AgentThinking({
  agentName,
  thoughts,
  confidence,
  color = '#a5b4fc',
  className,
}: AgentThinkingProps) {
  return (
    <div
      className={cn(
        'relative flex items-start gap-3 px-4 py-3 rounded-xl tape',
        className,
      )}
      style={{
        background: 'rgba(99,102,241,0.05)',
        border: '1px solid rgba(99,102,241,0.14)',
      }}
    >
      {/* Avatar */}
      <div
        className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center chrome-edge mt-0.5"
        style={{
          background: `${color}26`,
          border: `1px solid ${color}55`,
        }}
      >
        <Brain className="w-3.5 h-3.5" style={{ color }} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="eyebrow eyebrow-accent !text-[9px]">
            {agentName} · reasoning
          </span>
          {confidence != null && (
            <>
              <span className="text-zinc-700 text-[8px]">·</span>
              <span className="caption-mono text-[9.5px] text-zinc-500">
                {confidence}% conf
              </span>
            </>
          )}
        </div>
        <p className="text-[12.5px] text-zinc-200 tracking-tight">
          <StreamingText loop speed={40} hold={2200} cycle={thoughts} />
        </p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ConfidenceMeter · live-drifting bar with subtle motion
// ═══════════════════════════════════════════════════════════════════════════

interface ConfidenceMeterProps {
  value: number          // 0–100
  /** allow live drift around the value (subtle ±2%) */
  fluctuate?: boolean
  label?: string
  className?: string
}

export function ConfidenceMeter({
  value,
  fluctuate = true,
  label = 'Confidence',
  className,
}: ConfidenceMeterProps) {
  const [drift, setDrift] = useState(0)

  useEffect(() => {
    if (!fluctuate) return
    const tick = () => {
      setDrift((Math.random() - 0.5) * 4)  // ±2%
    }
    const id = setInterval(tick, 1800)
    return () => clearInterval(id)
  }, [fluctuate])

  const displayed = Math.max(0, Math.min(100, value + drift))

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="eyebrow !text-[9px]">{label}</span>
        <span className="caption-mono text-[10.5px] text-white/85 num">
          {Math.round(displayed)}%
        </span>
      </div>
      <div className="confidence-track">
        <div className="confidence-fill" style={{ width: `${displayed}%` }} />
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Recommendation · predictive suggestion from the system
// ═══════════════════════════════════════════════════════════════════════════

interface RecommendationProps {
  title: string
  rationale?: string
  /** subtle prediction tag (e.g. "+18% engagement model") */
  prediction?: string
  /** What the operator should do */
  action?: { label: string; onClick?: () => void; href?: string }
  /** lower-right confidence pill (0–100) */
  confidence?: number
  icon?: ReactNode
  className?: string
}

export function Recommendation({
  title,
  rationale,
  prediction,
  action,
  confidence,
  icon,
  className,
}: RecommendationProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl px-5 py-4',
        className,
      )}
      style={{
        background:
          'linear-gradient(135deg, rgba(99,102,241,0.10) 0%, rgba(212,165,116,0.05) 100%)',
        border: '1px solid rgba(99,102,241,0.20)',
        boxShadow: '0 16px 40px -16px rgba(99,102,241,0.30), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      <div
        className="absolute -top-10 -right-10 w-32 h-32 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(212,165,116,0.18) 0%, transparent 70%)',
          filter: 'blur(20px)',
        }}
      />

      <div className="relative flex items-start gap-4">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 chrome-edge"
          style={{
            background: 'linear-gradient(135deg, rgba(212,165,116,0.18), rgba(99,102,241,0.12))',
            border: '1px solid rgba(212,165,116,0.35)',
            boxShadow: '0 8px 18px -8px rgba(212,165,116,0.40)',
          }}
        >
          {icon ?? <Lightbulb className="w-4 h-4 text-[#e8c89a]" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="eyebrow eyebrow-gold !text-[9px]">Recommendation</span>
            {prediction && (
              <>
                <span className="text-zinc-700 text-[8px]">·</span>
                <span className="caption-mono text-[9.5px] text-emerald-300/85">
                  {prediction}
                </span>
              </>
            )}
          </div>
          <p className="text-[13px] text-white/95 font-medium tracking-tight leading-snug">
            {title}
          </p>
          {rationale && (
            <p className="text-[10.5px] text-zinc-500 mt-1.5 leading-relaxed line-clamp-2">
              {rationale}
            </p>
          )}

          {(action || confidence != null) && (
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              {action && (
                action.href
                  ? <a
                      href={action.href}
                      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] font-medium text-[#e8c89a] hover:text-white transition-colors ease-os"
                      style={{
                        background: 'rgba(212,165,116,0.10)',
                        border: '1px solid rgba(212,165,116,0.30)',
                      }}
                    >
                      {action.label} <ChevronRight className="w-3 h-3" />
                    </a>
                  : <button
                      onClick={action.onClick}
                      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] font-medium text-[#e8c89a] hover:text-white transition-colors ease-os press"
                      style={{
                        background: 'rgba(212,165,116,0.10)',
                        border: '1px solid rgba(212,165,116,0.30)',
                      }}
                    >
                      {action.label} <ChevronRight className="w-3 h-3" />
                    </button>
              )}
              {confidence != null && (
                <span className="caption-mono text-[9.5px] text-zinc-500 inline-flex items-center gap-1.5">
                  <Target className="w-2.5 h-2.5" />
                  Model · {confidence}%
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MemoryRecall · small pill showing what memory was just pulled
// ═══════════════════════════════════════════════════════════════════════════

interface MemoryRecallProps {
  source: string             // e.g. "Brand voice memory"
  /** the actual recalled fact */
  fact: string
  weight?: number            // 0–100 · how strongly it influenced
  className?: string
}

export function MemoryRecall({
  source,
  fact,
  weight,
  className,
}: MemoryRecallProps) {
  return (
    <div
      className={cn(
        'relative recall inline-flex items-start gap-2.5 px-3 py-2 rounded-lg max-w-md',
        className,
      )}
      style={{
        background: 'rgba(34,211,238,0.05)',
        border: '1px solid rgba(34,211,238,0.18)',
      }}
    >
      <div
        className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5"
        style={{
          background: 'rgba(34,211,238,0.10)',
          border: '1px solid rgba(34,211,238,0.30)',
        }}
      >
        <Database className="w-2.5 h-2.5 text-cyan-300" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="eyebrow !text-[8.5px] !tracking-[0.18em]" style={{ color: 'rgba(103,232,249,0.85)' }}>
            Recalled · {source}
          </span>
          {weight != null && (
            <>
              <span className="text-zinc-700 text-[8px]">·</span>
              <span className="caption-mono text-[8.5px] text-zinc-500">w{weight}</span>
            </>
          )}
        </div>
        <p className="text-[11.5px] text-zinc-200 leading-snug tracking-tight">
          {fact}
        </p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// AutonomousWarning · the system noticing something
// ═══════════════════════════════════════════════════════════════════════════

interface AutonomousWarningProps {
  title: string
  detail?: string
  action?: { label: string; href: string }
  className?: string
}

export function AutonomousWarning({ title, detail, action, className }: AutonomousWarningProps) {
  return (
    <div
      className={cn('relative px-4 py-3 rounded-xl flex items-start gap-3', className)}
      style={{
        background: 'rgba(212,165,116,0.06)',
        border: '1px solid rgba(212,165,116,0.22)',
      }}
    >
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 chrome-edge"
        style={{
          background: 'rgba(212,165,116,0.12)',
          border: '1px solid rgba(212,165,116,0.30)',
        }}
      >
        <AlertTriangle className="w-3.5 h-3.5 text-[#e8c89a]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="eyebrow eyebrow-gold !text-[9px] mb-1">System notice</p>
        <p className="text-[12px] text-white/90 leading-snug tracking-tight">{title}</p>
        {detail && <p className="text-[10.5px] text-zinc-500 mt-1 leading-relaxed">{detail}</p>}
      </div>
      {action && (
        <a
          href={action.href}
          className="caption-mono text-[10px] text-[#e8c89a] hover:text-white transition-colors flex items-center gap-1 shrink-0 self-center"
        >
          {action.label} <ChevronRight className="w-3 h-3" />
        </a>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// OrchestrationReasoning · why the orchestrator routed things this way
// ═══════════════════════════════════════════════════════════════════════════

export function OrchestrationReasoning({
  rationale,
  className,
}: {
  rationale: string
  className?: string
}) {
  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <Sparkles className="w-3 h-3 text-indigo-300 mt-0.5 shrink-0" />
      <p className="text-[10.5px] text-zinc-500 italic leading-relaxed">
        {rationale}
      </p>
    </div>
  )
}
