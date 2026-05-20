'use client'

import { useState } from 'react'
import { CheckCircle2, XCircle, Clock, RefreshCw, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'

interface Approval {
  id: string
  output_key: string
  content: string
  status: 'pending' | 'approved' | 'rejected' | 'revised'
  reviewer_notes: string | null
  created_at: string
  reviewed_at: string | null
  runs: {
    id: string
    status: string
    created_at: string
    workflows: { name: string } | null
    agents: { name: string } | null
  } | null
}

const STATUS_CONFIG = {
  pending:  { label: 'Väntar',     color: 'text-amber-400',  bg: 'border-amber-400/20 bg-amber-400/5',  icon: Clock },
  approved: { label: 'Godkänd',    color: 'text-green-400',  bg: 'border-green-400/20 bg-green-400/5',  icon: CheckCircle2 },
  rejected: { label: 'Avslagen',   color: 'text-red-400',    bg: 'border-red-400/20 bg-red-400/5',      icon: XCircle },
  revised:  { label: 'Reviderad',  color: 'text-blue-400',   bg: 'border-blue-400/20 bg-blue-400/5',    icon: RefreshCw },
}

export function ApprovalCard({ approval }: { approval: Approval }) {
  const [expanded, setExpanded] = useState(approval.status === 'pending')
  const [notes, setNotes] = useState(approval.reviewer_notes ?? '')
  const [loading, setLoading] = useState<string | null>(null)
  const router = useRouter()

  const cfg = STATUS_CONFIG[approval.status]
  const Icon = cfg.icon
  const isPending = approval.status === 'pending'

  const workflowName = approval.runs?.workflows?.name ?? 'Okänt workflow'
  const date = new Date(approval.created_at).toLocaleDateString('sv-SE', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  })
  const reviewedDate = approval.reviewed_at
    ? new Date(approval.reviewed_at).toLocaleDateString('sv-SE', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
      })
    : null

  // Preview: first 200 chars, strip markdown
  const preview = approval.content
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*/g, '')
    .replace(/\n+/g, ' ')
    .slice(0, 200)

  async function act(action: 'approved' | 'rejected' | 'revised') {
    setLoading(action)
    try {
      await fetch(`/api/approvals/${approval.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reviewer_notes: notes || undefined }),
      })
      router.refresh()
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className={cn('rounded-xl border overflow-hidden transition-all', cfg.bg)}>
      {/* Card header */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <Icon className={cn('w-4 h-4 shrink-0', cfg.color)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{workflowName}</span>
            <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full border', cfg.color, cfg.bg)}>
              {cfg.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {date} · nyckel: <code className="font-mono">{approval.output_key}</code>
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {/* Collapsed preview */}
      {!expanded && (
        <p className="px-4 pb-3 text-xs text-muted-foreground/70 line-clamp-2">
          {preview}…
        </p>
      )}

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border/50">
          {/* Content */}
          <div className="px-4 py-3 max-h-80 overflow-y-auto">
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed font-sans">
              {approval.content}
            </pre>
          </div>

          {/* Reviewer notes (existing) */}
          {approval.reviewer_notes && !isPending && (
            <div className="px-4 py-2 border-t border-border/50 bg-muted/20">
              <p className="text-[10px] text-muted-foreground/60 uppercase font-medium mb-1">Granskningsnotering</p>
              <p className="text-xs text-muted-foreground">{approval.reviewer_notes}</p>
              {reviewedDate && (
                <p className="text-[10px] text-muted-foreground/40 mt-1">Granskad {reviewedDate}</p>
              )}
            </div>
          )}

          {/* Action area — only for pending */}
          {isPending && (
            <div className="px-4 py-3 border-t border-border/50 bg-card/50 space-y-3">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Granskningsnotering (valfri) — t.ex. förslag på revision…"
                rows={2}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
              />
              <div className="flex gap-2">
                <ActionButton
                  onClick={() => act('approved')}
                  loading={loading === 'approved'}
                  variant="approve"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Godkänn
                </ActionButton>
                <ActionButton
                  onClick={() => act('revised')}
                  loading={loading === 'revised'}
                  variant="revise"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Begär revision
                </ActionButton>
                <ActionButton
                  onClick={() => act('rejected')}
                  loading={loading === 'rejected'}
                  variant="reject"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Avslå
                </ActionButton>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ActionButton({
  onClick,
  loading,
  variant,
  children,
}: {
  onClick: () => void
  loading: boolean
  variant: 'approve' | 'reject' | 'revise'
  children: React.ReactNode
}) {
  const styles = {
    approve: 'bg-green-500 hover:bg-green-600 text-white',
    reject:  'bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30',
    revise:  'bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30',
  }

  return (
    <button
      onClick={onClick}
      disabled={!!loading}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50',
        styles[variant],
      )}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : children}
    </button>
  )
}
