'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, RefreshCw, Eye, Loader2, RotateCcw, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Approval Banner ────────────────────────────────────────────────────────

interface PendingApproval {
  id: string
  output_key: string
  created_at: string
  run_id: string | null
  workflow_name: string | null
  project_name: string | null
  project_color: string | null
  project_slug: string | null
}

export function ApprovalsBanner({ approvals }: { approvals: PendingApproval[] }) {
  if (approvals.length === 0) {
    return (
      <div
        className="flex items-center gap-3 px-5 py-3 rounded-xl text-[12px]"
        style={{
          background: 'rgba(52,211,153,0.06)',
          border: '1px solid rgba(52,211,153,0.18)',
        }}
      >
        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
        <span className="text-emerald-300 font-medium">Alla godkännanden hanterade ✓</span>
      </div>
    )
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'rgba(251,191,36,0.05)',
        border: '1px solid rgba(251,191,36,0.22)',
      }}
    >
      {/* Banner header */}
      <div
        className="flex items-center justify-between px-5 py-3.5"
        style={{ borderBottom: '1px solid rgba(251,191,36,0.12)' }}
      >
        <div className="flex items-center gap-2.5">
          <span className="relative flex w-2 h-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full w-2 h-2 bg-amber-400" />
          </span>
          <span className="text-[12px] font-semibold text-amber-300">
            {approvals.length} objekt väntar på godkännande
          </span>
        </div>
        <a
          href="/approvals"
          className="text-[10.5px] text-amber-300/70 hover:text-amber-300 transition-colors font-medium uppercase tracking-wider"
        >
          Visa alla →
        </a>
      </div>

      {/* Approval rows */}
      <div className="divide-y" style={{ borderColor: 'rgba(251,191,36,0.07)' }}>
        {approvals.map((approval) => (
          <ApprovalRow key={approval.id} approval={approval} />
        ))}
      </div>
    </div>
  )
}

function ApprovalRow({ approval }: { approval: PendingApproval }) {
  const [loading, setLoading] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const router = useRouter()

  async function act(action: 'approved' | 'rejected' | 'revised') {
    setLoading(action)
    try {
      await fetch(`/api/approvals/${approval.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      setDone(true)
      router.refresh()
    } finally {
      setLoading(null)
    }
  }

  if (done) {
    return (
      <div className="px-5 py-3 flex items-center gap-2 text-[11px] text-zinc-500">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
        <span>{approval.output_key} — hanterad</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-4 px-5 py-3 flex-wrap">
      {/* Color dot + info */}
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        {approval.project_color && (
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: approval.project_color, boxShadow: `0 0 6px ${approval.project_color}88` }}
          />
        )}
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-white/90 truncate">
            {approval.workflow_name ?? 'Arbetsflöde'} — <span className="text-amber-300/80 font-mono">{approval.output_key}</span>
          </p>
          {approval.project_name && (
            <p className="text-[10px] text-zinc-500 truncate">{approval.project_name}</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        <ActionBtn
          onClick={() => act('approved')}
          loading={loading === 'approved'}
          color="emerald"
          icon={<CheckCircle2 className="w-3 h-3" />}
          label="Godkänn"
        />
        <ActionBtn
          onClick={() => act('revised')}
          loading={loading === 'revised'}
          color="indigo"
          icon={<RefreshCw className="w-3 h-3" />}
          label="Revidera"
        />
        <a
          href={`/approvals`}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10.5px] font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <Eye className="w-3 h-3" />
          Visa
        </a>
      </div>
    </div>
  )
}

function ActionBtn({
  onClick,
  loading,
  color,
  icon,
  label,
}: {
  onClick: () => void
  loading: boolean
  color: 'emerald' | 'indigo' | 'rose'
  icon: React.ReactNode
  label: string
}) {
  const colorStyles = {
    emerald: {
      bg:        'rgba(52,211,153,0.12)',
      border:    '1px solid rgba(52,211,153,0.25)',
      textClass: 'text-emerald-300',
    },
    indigo: {
      bg:        'rgba(99,102,241,0.12)',
      border:    '1px solid rgba(99,102,241,0.25)',
      textClass: 'text-indigo-300',
    },
    rose: {
      bg:        'rgba(248,113,113,0.12)',
      border:    '1px solid rgba(248,113,113,0.25)',
      textClass: 'text-rose-300',
    },
  }
  const s = colorStyles[color]

  return (
    <button
      onClick={onClick}
      disabled={!!loading}
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10.5px] font-medium transition-all disabled:opacity-50',
        s.textClass,
      )}
      style={{ background: s.bg, border: s.border }}
    >
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : icon}
      {label}
    </button>
  )
}

// ─── Failed Run Warning ──────────────────────────────────────────────────────

export interface FailedRunInfo {
  id: string
  workflow_name: string | null
  project_name: string | null
  project_slug: string | null
  project_color: string | null
  failed_at: string | null
}

export function FailedRunBanner({ runs }: { runs: FailedRunInfo[] }) {
  if (runs.length === 0) return null

  return (
    <div className="space-y-2">
      {runs.map((run) => (
        <FailedRunRow key={run.id} run={run} />
      ))}
    </div>
  )
}

function FailedRunRow({ run }: { run: FailedRunInfo }) {
  const [retrying, startTransition] = useTransition()
  const router = useRouter()

  function handleRetry() {
    startTransition(async () => {
      try {
        await fetch(`/api/runs/${run.id}/resume`, { method: 'POST' })
        router.refresh()
      } catch {
        // Silently fail — the run list will still refresh
      }
    })
  }

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl flex-wrap"
      style={{
        background: 'rgba(248,113,113,0.06)',
        border: '1px solid rgba(248,113,113,0.2)',
      }}
    >
      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {run.project_color && (
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: run.project_color }}
          />
        )}
        <span className="text-[12px] font-medium text-rose-200 truncate">
          {run.project_name && <span className="text-rose-300">{run.project_name}</span>}
          {run.project_name && run.workflow_name && <span className="text-rose-400/60"> — </span>}
          {run.workflow_name && <span>{run.workflow_name}</span>}
          {!run.project_name && !run.workflow_name && 'Okänd körning'}
          <span className="text-rose-400/60"> misslyckades</span>
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleRetry}
          disabled={retrying}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10.5px] font-semibold text-rose-200 transition-all disabled:opacity-50 hover:bg-rose-500/15"
          style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)' }}
        >
          {retrying
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <RotateCcw className="w-3 h-3" />
          }
          {retrying ? 'Försöker…' : 'Försök igen'}
        </button>
        {run.project_slug && (
          <a
            href={`/manager`}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10.5px] font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <Eye className="w-3 h-3" />
            Visa logg
          </a>
        )}
      </div>
    </div>
  )
}
