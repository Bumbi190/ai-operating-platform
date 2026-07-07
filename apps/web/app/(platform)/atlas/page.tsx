/**
 * Atlas Home — voice-first entry point for Omnira.
 *
 * Above the fold: Atlas orb, greeting, conversation.
 * Below the fold: platform pulse, attention items, businesses.
 * No big dashboard cards visible without scrolling.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { gatherAtlasContext } from '@/lib/atlas/context'
import { atlasExecutiveSummary } from '@/lib/atlas/executive'
import { OPERATOR_NAME } from '@/lib/atlas/identity'
import { collectAttentionItems } from '@/lib/os/attention'
import { formatEta } from '@/lib/os/priority'
import type { Project } from '@/lib/supabase/types'
import { AtlasVoiceHome } from './AtlasVoiceHome'
import { NightlyFindings } from '@/components/platform/os/NightlyFindings'
import { AgenticButton } from '@/components/platform/os'
import { getMorningBugDigest } from '@/lib/bugs/digest'
import { AlertTriangle, ArrowRight, Clock } from 'lucide-react'

export const dynamic = 'force-dynamic'

function fmtSEK(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(Math.round(n)) + ' kr'
}

export default async function AtlasHome() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db        = createAdminClient()
  const ctx       = await gatherAtlasContext(db)
  const bugDigest = await getMorningBugDigest(db)

  // Executive summary
  const exec = await atlasExecutiveSummary(db)

  // Attention items
  const { data: projectsRaw } = await supabase
    .from('projects')
    .select('id, owner_id, name, slug, color, settings, created_at')
    .order('created_at', { ascending: true })
  const attention  = await collectAttentionItems(db, (projectsRaw ?? []) as Project[])
  const topActions = [...attention.urgent, ...attention.important].slice(0, 5)

  return (
    <div className="min-h-screen">

      {/* ══ VOICE HERO — above the fold ═══════════════════════════════════ */}
      <AtlasVoiceHome operatorName={OPERATOR_NAME} />

      {/* ══ SECONDARY DATA — scroll to see ═══════════════════════════════ */}
      <div className="relative z-10 px-4 lg:px-8 pb-16 space-y-6 max-w-3xl mx-auto">

        {/* Divider */}
        <div className="flex items-center gap-4">
          <div className="h-px flex-1 bg-white/[0.05]" />
          <span className="text-[10px] uppercase tracking-[0.15em] text-zinc-700 font-mono">
            Plattformsöversikt
          </span>
          <div className="h-px flex-1 bg-white/[0.05]" />
        </div>

        {/* ── Platform Pulse ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <PulseStat label="Intäkt (mån)"     value={fmtSEK(ctx.totals.revenueMonthSek)} accent="emerald" />
          <PulseStat label="AI-kostnad (mån)" value={fmtSEK(ctx.totals.costMonthSek)}    accent="indigo" />
          <PulseStat
            label="Väntar godkännande"
            value={String(ctx.totals.pendingApprovals)}
            accent={ctx.totals.pendingApprovals > 0 ? 'amber' : 'muted'}
          />
          <PulseStat
            label="Fel senaste 24h"
            value={String(ctx.totals.failedRuns24h)}
            accent={ctx.totals.failedRuns24h > 0 ? 'red' : 'muted'}
            icon={ctx.totals.failedRuns24h > 0 ? <AlertTriangle className="w-3 h-3" /> : undefined}
          />
        </div>

        {/* ── Prioriterade åtgärder ────────────────────────────────────── */}
        {topActions.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-[0.15em] text-zinc-600 font-mono">
              Kräver uppmärksamhet · {attention.actionable}
            </p>
            {topActions.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 hover:border-white/[0.10] transition-colors"
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  a.severity === 'urgent'    ? 'bg-red-400' :
                  a.severity === 'important' ? 'bg-amber-400' : 'bg-indigo-400'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-zinc-200 truncate">{a.title}</p>
                  <p className="text-[11px] text-zinc-600 truncate">
                    {a.reason}
                    {a.etaMin != null && (
                      <span className="inline-flex items-center gap-1 ml-2 text-zinc-600">
                        <Clock className="w-2.5 h-2.5" /> {formatEta(a.etaMin)}
                      </span>
                    )}
                  </p>
                </div>
                {a.agentic && (
                  <AgenticButton
                    endpoint={a.agentic.endpoint}
                    body={a.agentic.body}
                    label={a.agentic.label}
                  />
                )}
                {a.action && (
                  <Link
                    href={a.action.href}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-400 hover:text-indigo-300 shrink-0"
                  >
                    {a.action.label} <ArrowRight className="w-3 h-3" />
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Nattens systemfynd ───────────────────────────────────────── */}
        <NightlyFindings findings={bugDigest.findings} reports={bugDigest.reports} />

        {/* ── Verksamheter ─────────────────────────────────────────────── */}
        <div className="space-y-3">
          <p className="text-[10px] uppercase tracking-[0.15em] text-zinc-600 font-mono">
            Verksamheter
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {ctx.businesses.map((b) => (
              <div
                key={b.id}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3 hover:border-white/[0.10] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: b.color }}
                  />
                  <h3 className="text-[13px] font-medium text-zinc-200 truncate">{b.name}</h3>
                </div>
                {b.focus && (
                  <p className="text-[11px] text-zinc-600 leading-relaxed">{b.focus}</p>
                )}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-1">
                  <BizMetric label="Intäkt (mån)"  value={fmtSEK(b.revenueMonthSek)} />
                  <BizMetric label="Kostnad (mån)" value={fmtSEK(b.costMonthSek)} />
                  <BizMetric label="Leads"         value={String(b.qualifiedLeads)} />
                  <BizMetric label="Publicerat (v)" value={String(b.publishedThisWeek)} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Briefing-kolumner ────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {([
            { title: 'Vad funkade',          items: exec.whatWorked,     dot: 'bg-emerald-400' },
            { title: 'Vad föll',             items: exec.whatFailed,     dot: 'bg-red-400'     },
            { title: 'Kräver uppmärksamhet', items: exec.needsAttention, dot: 'bg-amber-400'   },
          ] as const).map((col) => (
            <div
              key={col.title}
              className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2"
            >
              <p className="text-[10px] uppercase tracking-[0.15em] text-zinc-600 font-mono">
                {col.title}
              </p>
              {col.items.slice(0, 4).map((t, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className={`mt-1.5 w-1 h-1 rounded-full shrink-0 ${col.dot}`} />
                  <p className="text-[12px] text-zinc-400 leading-relaxed">{t}</p>
                </div>
              ))}
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}

// ── Hjälpkomponenter ──────────────────────────────────────────────────────────

function PulseStat({
  label, value, accent = 'muted', icon,
}: {
  label: string
  value: string
  accent?: 'emerald' | 'indigo' | 'amber' | 'red' | 'muted'
  icon?: React.ReactNode
}) {
  const color =
    accent === 'emerald' ? 'text-emerald-400' :
    accent === 'indigo'  ? 'text-indigo-400'  :
    accent === 'amber'   ? 'text-amber-400'   :
    accent === 'red'     ? 'text-red-400'     : 'text-zinc-300'

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-600 font-mono">{label}</span>
        {icon && <span className={color}>{icon}</span>}
      </div>
      <div className={`text-xl font-bold tracking-tight font-mono ${color}`}>{value}</div>
    </div>
  )
}

function BizMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-700 font-mono">{label}</p>
      <p className="text-[12px] font-semibold font-mono text-zinc-300">{value}</p>
    </div>
  )
}
