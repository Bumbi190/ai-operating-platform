import type { ElementType } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import {
  Brain,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ShieldAlert,
  TrendingDown,
  Lightbulb,
  BarChart2,
} from 'lucide-react'
import { getProjectMemorySummary } from '@/lib/ai/memory/memory-store'
import { getRecentFeedback, getPatternStats } from '@/lib/ai/memory/feedback-store'
import {
  STAGE1_THE_PROMPT_SEED_ACTION,
  isThePromptSeedProject,
} from '@/lib/ai/memory/stage1-foundation'

export const dynamic = 'force-dynamic'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color =
    pct >= 70 ? 'bg-green-500' :
    pct >= 45 ? 'bg-amber-500' :
               'bg-red-500/60'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground w-8">{pct}%</span>
    </div>
  )
}

function DecisionBadge({ decision }: { decision: string }) {
  const cfg = {
    approved: { label: 'Approved',  color: 'text-green-400 bg-green-400/10 border-green-400/20', icon: CheckCircle2 },
    rejected: { label: 'Rejected',  color: 'text-red-400 bg-red-400/10 border-red-400/20',       icon: XCircle },
    revised:  { label: 'Revised',   color: 'text-blue-400 bg-blue-400/10 border-blue-400/20',    icon: RefreshCw },
  }[decision] ?? { label: decision, color: 'text-muted-foreground', icon: CheckCircle2 }

  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium ${cfg.color}`}>
      <Icon className="w-2.5 h-2.5" />
      {cfg.label}
    </span>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function MemoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get the user's projects to pick the first one (simple approach)
  const db = createAdminClient()
  const { data: projects } = await db
    .from('projects')
    .select('id, name, slug')
    .eq('owner_id', user.id)
    .limit(1)

  const project = projects?.[0]
  const canSeedThePromptMemory = project ? isThePromptSeedProject(project) : false

  // If no project, show empty state
  if (!project) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Brain className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No project found</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Create a project to start building memory</p>
        </div>
      </div>
    )
  }

  // Load all memory data in parallel
  const [memorySummary, recentFeedback, patternStats] = await Promise.all([
    getProjectMemorySummary(project.id),
    getRecentFeedback(project.id, 15),
    getPatternStats(project.id),
  ])

  const totalFeedback = recentFeedback.length
  const approvedCount = recentFeedback.filter(f => f.decision === 'approved').length
  const rejectedCount = recentFeedback.filter(f => f.decision === 'rejected').length
  const revisedCount  = recentFeedback.filter(f => f.decision === 'revised').length

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center shrink-0 mt-0.5">
            <Brain className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Platform Memory</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Operational knowledge built from human feedback · {project.name}
            </p>
          </div>
        </div>
        {canSeedThePromptMemory && (
          <form action={`/api/memory/patterns`} method="POST">
            <input type="hidden" name="action" value={STAGE1_THE_PROMPT_SEED_ACTION} />
            <input type="hidden" name="projectId" value={project.id} />
            <button
              type="submit"
              className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-3 py-1.5 transition-colors"
            >
              Seed The Prompt rules
            </button>
          </form>
        )}
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={Brain}
          iconColor="text-violet-400"
          bg="bg-violet-400/10 border-violet-400/20"
          label="Memory items"
          value={memorySummary.totalItems}
        />
        <StatCard
          icon={CheckCircle2}
          iconColor="text-green-400"
          bg="bg-green-400/10 border-green-400/20"
          label="Approvals"
          value={approvedCount}
        />
        <StatCard
          icon={XCircle}
          iconColor="text-red-400"
          bg="bg-red-400/10 border-red-400/20"
          label="Rejections"
          value={rejectedCount}
        />
        <StatCard
          icon={RefreshCw}
          iconColor="text-blue-400"
          bg="bg-blue-400/10 border-blue-400/20"
          label="Revisions"
          value={revisedCount}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Rejection triggers ── */}
        <section className="rounded-xl border border-border bg-card/50 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-400" />
            <h2 className="text-sm font-semibold">Rejection Triggers</h2>
            <span className="text-[10px] text-muted-foreground ml-auto">
              {memorySummary.byCategory.rejection_triggers} patterns
            </span>
          </div>
          {memorySummary.topRejectionTriggers.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 italic">
              No patterns yet — reject some content to build memory
            </p>
          ) : (
            <div className="space-y-3">
              {memorySummary.topRejectionTriggers.map(item => (
                <div key={item.id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium font-mono text-red-300/80">{item.key}</span>
                    <span className="text-[10px] text-muted-foreground">{item.evidenceCount} events</span>
                  </div>
                  <ConfidenceBar value={item.confidence} />
                  {typeof item.value.note === 'string' && (
                    <p className="text-[10px] text-muted-foreground/60 mt-1">{item.value.note}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Avoided phrases ── */}
        <section className="rounded-xl border border-border bg-card/50 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-semibold">Avoided Phrases</h2>
            <span className="text-[10px] text-muted-foreground ml-auto">
              {memorySummary.byCategory.avoided_phrases} patterns
            </span>
          </div>
          {memorySummary.topAvoidedPhrases.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 italic">
              No avoided phrases yet — revise some content to build memory
            </p>
          ) : (
            <div className="space-y-3">
              {memorySummary.topAvoidedPhrases.map(item => (
                <div key={item.id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium font-mono text-amber-300/80">"{item.key}"</span>
                    <span className="text-[10px] text-muted-foreground">{item.evidenceCount} events</span>
                  </div>
                  <ConfidenceBar value={item.confidence} />
                  {typeof item.value.note === 'string' && (
                    <p className="text-[10px] text-muted-foreground/60 mt-1">{item.value.note}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Pattern frequency stats ── */}
        <section className="rounded-xl border border-border bg-card/50 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold">Pattern Frequency</h2>
            <span className="text-[10px] text-muted-foreground ml-auto">from feedback</span>
          </div>
          {patternStats.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 italic">
              No patterns detected yet
            </p>
          ) : (
            <div className="space-y-2">
              {patternStats.slice(0, 8).map(stat => (
                <div key={stat.pattern} className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground w-36 truncate">{stat.pattern}</span>
                  <div className="flex gap-1 flex-1">
                    {stat.rejections > 0 && (
                      <span className="text-[10px] text-red-400 bg-red-400/10 border border-red-400/20 px-1.5 rounded">
                        {stat.rejections} rej
                      </span>
                    )}
                    {stat.revisions > 0 && (
                      <span className="text-[10px] text-blue-400 bg-blue-400/10 border border-blue-400/20 px-1.5 rounded">
                        {stat.revisions} rev
                      </span>
                    )}
                    {stat.approvals > 0 && (
                      <span className="text-[10px] text-green-400 bg-green-400/10 border border-green-400/20 px-1.5 rounded">
                        {stat.approvals} ok
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── High-confidence items ── */}
        <section className="rounded-xl border border-border bg-card/50 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-yellow-400" />
            <h2 className="text-sm font-semibold">High-Confidence Patterns</h2>
            <span className="text-[10px] text-muted-foreground ml-auto">≥ 65%</span>
          </div>
          {memorySummary.highConfidenceItems.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 italic">
              Patterns grow stronger with more feedback — keep reviewing
            </p>
          ) : (
            <div className="space-y-3">
              {memorySummary.highConfidenceItems.map(item => (
                <div key={item.id} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground/50 uppercase font-medium">
                        {item.category.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-xs font-medium truncate">{item.key}</p>
                    {typeof item.value.note === 'string' && (
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5 line-clamp-2">
                        {item.value.note}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] text-green-400 shrink-0 font-mono tabular-nums">
                    {Math.round(item.confidence * 100)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── Recent feedback log ── */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
          Recent Feedback Log
        </h2>
        {recentFeedback.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <Brain className="w-6 h-6 text-muted-foreground/20 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground/60">
              No feedback yet. Approve or reject content in the Approvals page to start building memory.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentFeedback.map(fb => (
              <div
                key={fb.id}
                className="rounded-lg border border-border bg-card/30 px-4 py-3 flex items-start gap-3"
              >
                <DecisionBadge decision={fb.decision} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground/70">{fb.outputType}</span>
                    {fb.evalScore !== null && (
                      <span className="text-[10px] text-muted-foreground/50">
                        score {fb.evalScore}/10
                      </span>
                    )}
                    {fb.qualityPatterns.length > 0 && (
                      <div className="flex gap-1">
                        {fb.qualityPatterns.slice(0, 2).map(p => (
                          <span key={p} className="text-[10px] bg-muted/40 border border-border px-1.5 py-0.5 rounded font-mono">
                            {p}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {fb.rejectionReason && (
                    <p className="text-xs text-muted-foreground/70 mt-0.5 line-clamp-2">
                      {fb.rejectionReason}
                    </p>
                  )}
                  {fb.contentExcerpt && (
                    <p className="text-[10px] text-muted-foreground/40 mt-0.5 line-clamp-1 italic">
                      &ldquo;{fb.contentExcerpt.slice(0, 100)}…&rdquo;
                    </p>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground/40 shrink-0">
                  {new Date(fb.createdAt).toLocaleDateString('en', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

    </div>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  iconColor,
  bg,
  label,
  value,
}: {
  icon: ElementType
  iconColor: string
  bg: string
  label: string
  value: number
}) {
  return (
    <div className={`rounded-xl border p-4 ${bg}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${iconColor}`} />
        <span className={`text-xs font-medium ${iconColor}`}>{label}</span>
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
    </div>
  )
}
