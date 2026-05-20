/**
 * WorkflowStepGraph
 *
 * Renders a horizontal node-graph of workflow steps derived from run_logs.
 * Each node shows: step name, status dot, token count, duration.
 * Pure server component — no client state needed.
 */

import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

interface RawLog {
  step_order: number | null
  step_name: string | null
  role: string
  tokens_in: number | null
  tokens_out: number | null
  duration_ms: number | null
}

interface Step {
  order: number
  name: string
  status: 'done' | 'running' | 'failed' | 'pending'
  tokensIn: number
  tokensOut: number
  durationMs: number | null
  isImage: boolean
}

// ── Data transform ────────────────────────────────────────────────────────────

function buildSteps(logs: RawLog[], runStatus: string): Step[] {
  const stepMap = new Map<number, Step>()

  for (const log of logs) {
    if (log.step_order == null) continue

    if (!stepMap.has(log.step_order)) {
      stepMap.set(log.step_order, {
        order:     log.step_order,
        name:      log.step_name ?? `Steg ${log.step_order}`,
        status:    'pending',
        tokensIn:  0,
        tokensOut: 0,
        durationMs: null,
        isImage:   false,
      })
    }

    const step = stepMap.get(log.step_order)!
    step.tokensIn  += log.tokens_in  ?? 0
    step.tokensOut += log.tokens_out ?? 0

    // Detect image-generation steps by name
    if (/bild|image|illustration/i.test(step.name)) {
      step.isImage = true
    }

    if (log.role === 'assistant') {
      step.status = 'done'
      if (log.duration_ms != null) step.durationMs = log.duration_ms
    } else if (log.role === 'user' && step.status === 'pending') {
      step.status = runStatus === 'failed' ? 'failed' : 'running'
    }
  }

  // Steps in running run whose last log is 'user' are 'running'; update
  // completed steps that previously got 'running' but actually have an assistant
  // response → already set to 'done' above, so this loop is a safety pass.
  return Array.from(stepMap.values()).sort((a, b) => a.order - b.order)
}

// ── Sub-components ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  done:    { dot: 'bg-emerald-400',            ring: 'ring-emerald-400/20', border: 'border-emerald-500/20', bg: 'bg-emerald-500/5',  text: 'text-emerald-400', label: 'Klar'    },
  running: { dot: 'bg-blue-400 animate-pulse', ring: 'ring-blue-400/20',   border: 'border-blue-500/30',    bg: 'bg-blue-500/[0.07]', text: 'text-blue-400',    label: 'Kör…'   },
  failed:  { dot: 'bg-red-400',                ring: 'ring-red-400/20',    border: 'border-red-500/20',     bg: 'bg-red-500/5',       text: 'text-red-400',     label: 'Fel'     },
  pending: { dot: 'bg-zinc-700',               ring: 'ring-zinc-700/20',   border: 'border-white/[0.06]',   bg: 'bg-white/[0.02]',    text: 'text-zinc-600',    label: 'Väntar'  },
} as const

function StepNode({ step, index }: { step: Step; index: number }) {
  const cfg = STATUS_CONFIG[step.status]
  const totalTokens = step.tokensIn + step.tokensOut
  const durationSec = step.durationMs != null ? (step.durationMs / 1000).toFixed(1) : null

  // Shorten long step names
  const displayName = step.name.length > 28
    ? step.name.slice(0, 26) + '…'
    : step.name

  return (
    <div
      className={cn(
        'relative flex-shrink-0 w-44 rounded-xl border p-3.5 transition-all',
        cfg.border, cfg.bg,
      )}
    >
      {/* Step order badge */}
      <div className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-zinc-900 border border-white/[0.12] flex items-center justify-center">
        <span className="text-[9px] font-bold font-mono text-zinc-500">{index + 1}</span>
      </div>

      {/* Status dot + name */}
      <div className="flex items-start gap-2 mb-2.5">
        <span className={cn('w-2 h-2 rounded-full mt-0.5 shrink-0', cfg.dot)} />
        <span className="text-[11px] font-semibold text-zinc-200 leading-snug break-words">
          {displayName}
        </span>
      </div>

      {/* Metrics row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Status label */}
        <span className={cn('text-[9px] font-mono', cfg.text)}>
          {cfg.label}
        </span>

        {totalTokens > 0 && (
          <>
            <span className="text-zinc-800">·</span>
            <span className="text-[9px] font-mono text-zinc-600">
              {totalTokens.toLocaleString('sv')} tok
            </span>
          </>
        )}

        {durationSec && (
          <>
            <span className="text-zinc-800">·</span>
            <span className="text-[9px] font-mono text-zinc-600">
              {durationSec}s
            </span>
          </>
        )}

        {step.isImage && (
          <>
            <span className="text-zinc-800">·</span>
            <span className="text-[9px] text-purple-400">🖼</span>
          </>
        )}
      </div>
    </div>
  )
}

function ArrowConnector({ active }: { active: boolean }) {
  return (
    <div className="flex items-center flex-shrink-0 px-1">
      <svg width="28" height="16" viewBox="0 0 28 16" fill="none" className="overflow-visible">
        <line
          x1="0" y1="8" x2="22" y2="8"
          stroke={active ? '#6366f1' : '#27272a'}
          strokeWidth="1.5"
          strokeDasharray={active ? undefined : '3 3'}
        />
        <polygon
          points="22,4 28,8 22,12"
          fill={active ? '#6366f1' : '#27272a'}
        />
      </svg>
    </div>
  )
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="flex items-center gap-4 text-[9px] font-mono text-zinc-700">
      {(Object.entries(STATUS_CONFIG) as [keyof typeof STATUS_CONFIG, typeof STATUS_CONFIG[keyof typeof STATUS_CONFIG]][]).map(([key, cfg]) => (
        <span key={key} className="flex items-center gap-1">
          <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
          {cfg.label}
        </span>
      ))}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export function WorkflowStepGraph({
  logs,
  runStatus,
}: {
  logs: RawLog[]
  runStatus: string
}) {
  const steps = buildSteps(logs, runStatus)
  if (steps.length === 0) return null

  const doneCount    = steps.filter(s => s.status === 'done').length
  const failedCount  = steps.filter(s => s.status === 'failed').length
  const runningCount = steps.filter(s => s.status === 'running').length
  const totalTokens  = steps.reduce((s, st) => s + st.tokensIn + st.tokensOut, 0)
  const totalDurationMs = steps.reduce((s, st) => s + (st.durationMs ?? 0), 0)

  return (
    <div className="mb-6 rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-zinc-600">
            Workflow Graph
          </span>
          {/* Progress bar */}
          <div className="w-24 h-1 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                failedCount > 0 ? 'bg-red-500' : 'bg-indigo-500',
              )}
              style={{ width: `${steps.length > 0 ? (doneCount / steps.length) * 100 : 0}%` }}
            />
          </div>
          <span className="text-[10px] font-mono text-zinc-600">
            {doneCount}/{steps.length} klar{doneCount !== 1 ? 'a' : ''}
            {runningCount > 0 && <span className="text-blue-400 ml-1">· kör…</span>}
            {failedCount > 0 && <span className="text-red-400 ml-1">· {failedCount} fel</span>}
          </span>
        </div>

        <div className="flex items-center gap-4 text-[9px] font-mono text-zinc-700">
          {totalTokens > 0 && <span>{totalTokens.toLocaleString('sv')} tokens totalt</span>}
          {totalDurationMs > 0 && <span>{(totalDurationMs / 1000).toFixed(0)}s AI-tid</span>}
        </div>
      </div>

      {/* Graph canvas */}
      <div className="px-5 py-5 overflow-x-auto scrollbar-thin">
        <div className="flex items-center min-w-max">
          {steps.map((step, i) => (
            <div key={step.order} className="flex items-center">
              <StepNode step={step} index={i} />
              {i < steps.length - 1 && (
                <ArrowConnector active={step.status === 'done'} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Footer legend */}
      <div className="px-5 pb-3">
        <Legend />
      </div>
    </div>
  )
}
