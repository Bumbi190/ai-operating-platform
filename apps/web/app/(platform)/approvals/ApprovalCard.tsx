'use client'

import { useState, useEffect } from 'react'
import {
  CheckCircle2, XCircle, Clock, RefreshCw, ChevronDown, ChevronUp, Loader2,
  ShieldAlert, Sparkles, Eye, Brain, Activity,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { ScoreBar, ReasoningTrace, type ReasoningStep, RadialDial, PulseDot } from '@/components/platform/os'
import { setViewSelection } from '@/lib/atlas/view-client'

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

interface EvalResult {
  overallScore: number
  slopScore: number
  brandAlignment: number | null
  specificity: number
  pacingQuality: number
  hookStrength: number | null
  passed: boolean
  slopPhrases: string[]
  hardFails: string[]
  issues: { dimension: string; detail: string }[]
  suggestion: string | null
}

const STATUS_META = {
  pending:  { label: 'Väntar på granskning', tone: 'amber',   color: '#fbbf24', icon: Clock,       glow: 'glow-amber' },
  approved: { label: 'Godkänd',              tone: 'emerald', color: '#34d399', icon: CheckCircle2, glow: '' },
  rejected: { label: 'Avvisad',              tone: 'rose',    color: '#f87171', icon: XCircle,     glow: '' },
  revised:  { label: 'Revidering',           tone: 'indigo',  color: '#60a5fa', icon: RefreshCw,   glow: '' },
} as const

export function ApprovalCard({ approval, delay = 0 }: { approval: Approval; delay?: number }) {
  const [expanded, setExpanded] = useState(approval.status === 'pending')
  const [notes, setNotes] = useState(approval.reviewer_notes ?? '')
  const [loading, setLoading] = useState<string | null>(null)
  const [evalResult, setEvalResult] = useState<EvalResult | null>(null)
  const [evalLoading, setEvalLoading] = useState(false)
  const router = useRouter()

  const meta = STATUS_META[approval.status]
  const isPending = approval.status === 'pending'

  // Atlas selection awareness — an expanded card IS the operator's selection.
  useEffect(() => {
    if (!expanded) return
    setViewSelection([{ domain: 'approvals', id: approval.id, label: `${approval.output_key} (${approval.status})` }])
    return () => setViewSelection([])
  }, [expanded, approval.id, approval.output_key, approval.status])

  const workflowName = approval.runs?.workflows?.name ?? 'Okänt arbetsflöde'
  const agentName    = approval.runs?.agents?.name ?? 'Autonom agent'
  const date = new Date(approval.created_at).toLocaleDateString('sv-SE', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })

  // Auto-evaluate text content
  useEffect(() => {
    if (!expanded || evalResult || evalLoading) return
    const textTypes = ['script', 'hook', 'caption', 'text']
    const isTextContent = textTypes.some(t => approval.output_key?.includes(t)) ||
      (approval.content && approval.content.length > 50 && !approval.content.startsWith('{'))
    if (!isTextContent) return

    setEvalLoading(true)
    fetch('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: approval.content,
        contentType: approval.output_key?.includes('hook') ? 'hook'
          : approval.output_key?.includes('caption') ? 'caption'
          : 'text',
        deepScore: false,
      }),
    })
      .then(r => r.json())
      .then(data => { if (data.result) setEvalResult(data.result) })
      .catch(() => { /* additive */ })
      .finally(() => setEvalLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded])

  const preview = approval.content
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*/g, '')
    .replace(/\n+/g, ' ')
    .slice(0, 240)

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

  // Engagement prediction & risk — derived from eval signal
  const aiScore = evalResult ? Math.round(evalResult.overallScore * 10) : null
  const engagementPrediction = evalResult
    ? Math.round(50 + (evalResult.overallScore - 5) * 8)
    : null
  const riskScore = evalResult
    ? Math.round(evalResult.slopScore * 10 + (evalResult.hardFails.length * 12))
    : null

  // Synthesize a reasoning trace from eval issues (when present)
  const reasoning: ReasoningStep[] = []
  if (evalResult) {
    reasoning.push({
      id: 'goal',
      type: 'goal',
      title: `Output matches "${approval.output_key}" target schema`,
      detail: `Generated by ${agentName} as part of ${workflowName}`,
      confidence: 95,
    })
    if (evalResult.brandAlignment !== null) {
      reasoning.push({
        id: 'mem',
        type: 'memory',
        title: 'Korsrefererade varumärkesröstminne',
        detail: `Inriktningspoäng ${evalResult.brandAlignment.toFixed(1)}/10 mot kanonisk varumärkeskorpus`,
        confidence: Math.round(evalResult.brandAlignment * 10),
      })
    }
    reasoning.push({
      id: 'eval',
      type: 'evaluation',
      title: `Kvalitetsutvärdering · ${evalResult.passed ? 'GODKÄND' : 'FLAGGAD'}`,
      detail: evalResult.issues.length > 0
        ? `Primärt problem · ${evalResult.issues[0].dimension}: ${evalResult.issues[0].detail}`
        : 'Alla kvalitetsdimensioner klarade automatiserade trösklar',
      confidence: Math.round(evalResult.overallScore * 10),
    })
    if (evalResult.suggestion) {
      reasoning.push({
        id: 'dec',
        type: 'decision',
        title: 'Föreslagen justering',
        detail: evalResult.suggestion,
      })
    }
    if (evalResult.hardFails.length > 0) {
      reasoning.push({
        id: 'fail',
        type: 'branch',
        title: 'Hårt fel detekterat',
        detail: evalResult.hardFails.slice(0, 2).join(' · '),
      })
    }
  }

  return (
    <div
      className={cn(
        'panel relative overflow-hidden animate-fade-in-up',
        isPending && 'glow-amber',
      )}
      style={{
        animationDelay: `${delay}ms`,
        animationFillMode: 'both',
      }}
    >
      {/* Top accent */}
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${meta.color}, transparent)`,
          opacity: isPending ? 0.8 : 0.3,
        }}
      />
      {/* Ambient corner glow */}
      <div
        className="absolute -top-16 -right-16 w-48 h-48 rounded-full pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${meta.color}22 0%, transparent 70%)`,
          filter: 'blur(28px)',
          opacity: isPending ? 0.8 : 0.3,
        }}
      />

      {/* ── Card header (clickable) ──────────────────────────────────────── */}
      <button
        className="w-full relative flex items-center gap-4 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Status icon */}
        <div
          className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center chrome-edge"
          style={{
            background: `linear-gradient(135deg, ${meta.color}22, ${meta.color}08)`,
            border: `1px solid ${meta.color}44`,
            boxShadow: isPending ? `0 0 16px ${meta.color}44` : 'none',
          }}
        >
          <meta.icon className="w-4 h-4" style={{ color: meta.color }} />
        </div>

        {/* Title block */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-1">
            <span className="text-[13px] font-semibold text-white/95 truncate tracking-tight">
              {workflowName}
            </span>
            <span
              className="shrink-0 text-[9px] font-bold uppercase tracking-[0.18em] px-1.5 py-0.5 rounded"
              style={{ color: meta.color, background: `${meta.color}1a`, border: `1px solid ${meta.color}33` }}
            >
              {meta.label}
            </span>
            {isPending && <PulseDot tone="amber" size={5} />}
          </div>
          <p className="text-[10.5px] text-secondary flex items-center gap-2 flex-wrap">
            <span>{date}</span>
            <span className="text-faint">·</span>
            <span className="font-mono text-indigo-300/70">{approval.output_key}</span>
            <span className="text-faint">·</span>
            <span>av {agentName}</span>
          </p>
        </div>

        {/* AI score peek (when available + collapsed) */}
        {!expanded && aiScore !== null && (
          <div className="hidden md:flex items-center gap-2 mr-3">
            <RadialDial value={aiScore} color={evalResult!.passed ? '#34d399' : '#fbbf24'} size={44} thickness={3} label="AI" />
          </div>
        )}

        {expanded
          ? <ChevronUp className="w-4 h-4 text-secondary shrink-0" />
          : <ChevronDown className="w-4 h-4 text-secondary shrink-0" />
        }
      </button>

      {/* Collapsed preview line */}
      {!expanded && (
        <div className="px-5 pb-3 pt-0 relative">
          <p className="text-[11.5px] text-secondary line-clamp-2 leading-relaxed">{preview}…</p>
        </div>
      )}

      {/* ── Expanded ─────────────────────────────────────────────────────── */}
      {expanded && (
        <div className="relative" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          {/* Top split: preview | scores */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
            {/* Output preview */}
            <div className="lg:col-span-7 p-5 lg:border-r" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <div className="flex items-center gap-2 mb-3">
                <Eye className="w-3 h-3 text-indigo-300" />
                <span className="text-[9.5px] font-bold uppercase tracking-[0.22em] text-indigo-300/80">
                  Utdataförhandsvisning
                </span>
              </div>
              <div
                className="rounded-xl p-4 max-h-80 overflow-y-auto scrollbar-thin"
                style={{
                  background: 'rgba(255,255,255,0.015)',
                  border: '1px solid rgba(255,255,255,0.04)',
                }}
              >
                <pre className="text-[11.5px] text-zinc-300 whitespace-pre-wrap leading-relaxed font-sans">
                  {approval.content}
                </pre>
              </div>
            </div>

            {/* AI Analysis panel */}
            <div className="lg:col-span-5 p-5 space-y-5 bg-gradient-to-b from-transparent to-indigo-500/[0.03]">
              <div className="flex items-center gap-2">
                <Brain className="w-3.5 h-3.5 text-indigo-300" />
                <span className="text-[9.5px] font-bold uppercase tracking-[0.22em] text-indigo-300/80">
                  AI-exekutiv analys
                </span>
                {evalLoading && <Loader2 className="w-3 h-3 animate-spin text-secondary" />}
              </div>

              {evalResult ? (
                <>
                  {/* Three big dials */}
                  <div className="flex items-center justify-around">
                    <DialBlock label="AI-poäng" value={aiScore ?? 0} color={evalResult.passed ? '#34d399' : '#fbbf24'} sub={evalResult.passed ? 'GODKÄND' : 'FLAGGAD'} />
                    {engagementPrediction !== null && (
                      <DialBlock label="Engagemang" value={Math.max(0, engagementPrediction)} color="#818cf8" sub="förutsett" />
                    )}
                    {riskScore !== null && (
                      <DialBlock label="Risk" value={Math.min(100, riskScore)} color="#f87171" sub="lägre = säkrare" />
                    )}
                  </div>

                  {/* Score breakdown */}
                  <div className="space-y-3">
                    <ScoreBar label="Originalitet"   score={Math.round((10 - evalResult.slopScore) * 10)} color="#818cf8" />
                    {evalResult.brandAlignment !== null && (
                      <ScoreBar label="Varumärkesröst" score={Math.round(evalResult.brandAlignment * 10)} color="#a78bfa" />
                    )}
                    <ScoreBar label="Specificitet"   score={Math.round(evalResult.specificity * 10)} color="#67e8f9" />
                    <ScoreBar label="Tempo"          score={Math.round(evalResult.pacingQuality * 10)} color="#34d399" />
                    {evalResult.hookStrength !== null && (
                      <ScoreBar label="Krokstyrka" score={Math.round(evalResult.hookStrength * 10)} color="#fbbf24" />
                    )}
                  </div>

                  {/* Hard fails callout */}
                  {evalResult.hardFails.length > 0 && (
                    <div
                      className="rounded-lg px-3 py-2.5 flex items-start gap-2"
                      style={{
                        background: 'rgba(248,113,113,0.08)',
                        border: '1px solid rgba(248,113,113,0.25)',
                      }}
                    >
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-300 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-rose-300 mb-0.5">
                          Hårda fel
                        </p>
                        <p className="text-[10.5px] text-rose-200/90 leading-relaxed">
                          {evalResult.hardFails.slice(0, 3).join(' · ')}
                        </p>
                      </div>
                    </div>
                  )}
                </>
              ) : evalLoading ? (
                <div className="space-y-3">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="h-3 rounded shimmer" style={{ background: 'rgba(255,255,255,0.04)' }} />
                  ))}
                </div>
              ) : (
                <div className="rounded-lg px-3 py-3 text-center"
                  style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)' }}
                >
                  <Activity className="w-3.5 h-3.5 text-indigo-300 mx-auto mb-1.5" />
                  <p className="text-[10.5px] text-secondary">Ingen utvärdering tillgänglig för denna utdatatyp</p>
                </div>
              )}
            </div>
          </div>

          {/* Reasoning trace — full-width */}
          {reasoning.length > 0 && (
            <div
              className="px-5 py-5"
              style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
            >
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-3.5 h-3.5 text-violet-300" />
                <span className="text-[9.5px] font-bold uppercase tracking-[0.22em] text-violet-300/80">
                  Resonemangskedja
                </span>
                <span className="text-[9.5px] text-meta font-mono ml-1">
                  · {reasoning.length} steg · varför detta beslutades
                </span>
              </div>
              <ReasoningTrace steps={reasoning} />
            </div>
          )}

          {/* Reviewer notes (read-only) */}
          {approval.reviewer_notes && !isPending && (
            <div
              className="px-5 py-3"
              style={{
                borderTop: '1px solid rgba(255,255,255,0.05)',
                background: 'rgba(255,255,255,0.015)',
              }}
            >
              <p className="text-[9.5px] uppercase font-bold tracking-[0.2em] text-secondary mb-1.5">
                Granskarnotering
              </p>
              <p className="text-[11.5px] text-zinc-300 italic">{approval.reviewer_notes}</p>
            </div>
          )}

          {/* Action area */}
          {isPending && (
            <div
              className="px-5 py-4 space-y-3"
              style={{
                borderTop: '1px solid rgba(255,255,255,0.05)',
                background:
                  'linear-gradient(180deg, rgba(255,255,255,0.015), rgba(99,102,241,0.05))',
              }}
            >
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Operatörnotering (valfri) · revisionsinstruktioner, åsidosättningslogik…"
                rows={2}
                className="w-full rounded-lg px-3 py-2.5 text-[11.5px] focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.025)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  color: 'rgba(255,255,255,0.92)',
                }}
              />
              <div className="flex gap-2 flex-wrap">
                <ActionButton
                  onClick={() => act('approved')}
                  loading={loading === 'approved'}
                  variant="approve"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Godkänn & skicka
                </ActionButton>
                <ActionButton
                  onClick={() => act('revised')}
                  loading={loading === 'revised'}
                  variant="revise"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Begär revidering
                </ActionButton>
                <ActionButton
                  onClick={() => act('rejected')}
                  loading={loading === 'rejected'}
                  variant="reject"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Avvisa
                </ActionButton>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DialBlock({
  label, value, color, sub,
}: { label: string; value: number; color: string; sub: string }) {
  return (
    <div className="flex flex-col items-center">
      <RadialDial value={value} color={color} size={62} thickness={4} />
      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-secondary mt-1.5">{label}</p>
      <p className="text-[8.5px] text-meta font-mono mt-0.5">{sub}</p>
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
    approve:
      'text-white bg-gradient-to-r from-emerald-500 to-emerald-600 hover:brightness-110 shadow-[0_4px_16px_rgba(52,211,153,0.35)]',
    reject:
      'text-rose-200 bg-rose-500/15 hover:bg-rose-500/22 border border-rose-500/30',
    revise:
      'text-indigo-200 bg-indigo-500/15 hover:bg-indigo-500/22 border border-indigo-500/30',
  }

  return (
    <button
      onClick={onClick}
      disabled={!!loading}
      className={cn(
        'flex items-center gap-1.5 px-4 py-2 rounded-lg text-[11.5px] font-semibold transition-all disabled:opacity-50',
        styles[variant],
      )}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : children}
    </button>
  )
}
