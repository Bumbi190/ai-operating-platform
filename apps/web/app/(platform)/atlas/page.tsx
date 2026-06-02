/**
 * Atlas Home — the primary entry point of Omnira.
 *
 * Not a dashboard: the operator opens Omnira and meets Atlas, their Executive
 * Chief of Staff. Atlas greets them, reports across all businesses from one
 * live snapshot, names the single highest-leverage action, and offers quick
 * actions into the supporting surfaces.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { gatherAtlasContext } from '@/lib/atlas/context'
import { OPERATOR_NAME } from '@/lib/atlas/identity'
import { OSPage, OSLayer } from '@/components/platform/os'
import {
  Sparkles, ArrowRight, ShieldCheck, TrendingUp, DollarSign, ListChecks, MessageSquare, AlertTriangle,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

function fmtSEK(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(Math.round(n)) + ' kr'
}

function greeting(d: Date): string {
  const h = d.getHours()
  if (h < 10) return 'God morgon'
  if (h < 18) return 'God eftermiddag'
  return 'God kväll'
}

export default async function AtlasHome() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()
  const ctx = await gatherAtlasContext(db)
  const now = new Date()

  // Build the per-business briefing lines (only what's worth reporting).
  const lines: string[] = []
  for (const b of ctx.businesses) {
    if (b.pendingReview > 0)        lines.push(`${b.name}: ${b.pendingReview} att granska.`)
    else if (b.qualifiedLeads > 0)  lines.push(`${b.name}: ${b.qualifiedLeads} kvalificerade leads kräver uppmärksamhet.`)
    else if (b.publishedThisWeek > 0) lines.push(`${b.name}: ${b.publishedThisWeek} publicerade den här veckan.`)
    else                            lines.push(`${b.name}: lugnt, inget kräver dig just nu.`)
  }

  const quickActions = [
    { label: 'Visa prioriteringar', href: '/manager',   icon: ListChecks },
    { label: 'Granska godkännanden', href: '/approvals', icon: ShieldCheck },
    { label: 'Affärsöversikt',       href: '/revenue',   icon: TrendingUp },
    { label: 'Kostnader',            href: '/costs',     icon: DollarSign },
    { label: 'Prata med Atlas',      href: '/chat',      icon: MessageSquare },
  ]

  return (
    <OSPage className="animate-fade-in">

      {/* ── ATLAS GREETING ───────────────────────────────────────────────── */}
      <OSLayer layer="hero">
        <div className="rounded-2xl border border-indigo-500/25 bg-gradient-to-b from-indigo-500/[0.07] to-transparent p-6 lg:p-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-indigo-300" />
            </span>
            <span className="eyebrow eyebrow-accent">Atlas · Executive Chief of Staff</span>
          </div>

          <h1 className="text-2xl 2xl:text-3xl font-bold tracking-tight">
            {greeting(now)} {OPERATOR_NAME}.
          </h1>

          <p className="text-sm text-zinc-400 mt-2">Jag har gått igenom läget över alla verksamheter.</p>

          <div className="mt-5 space-y-1.5">
            {lines.map((l, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="mt-2 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                <p className="text-sm text-foreground/90">{l}</p>
              </div>
            ))}
            <div className="flex items-start gap-2.5">
              <span className="mt-2 w-1.5 h-1.5 rounded-full bg-zinc-500 shrink-0" />
              <p className="text-sm text-foreground/90">AI-kostnad idag: <span className="font-semibold">{fmtSEK(ctx.totals.costTodaySek)}</span> · prognos månad {fmtSEK(ctx.totals.forecastMonthSek)}.</p>
            </div>
          </div>

          {/* Recommended action */}
          {ctx.topPriority && (
            <Link href={ctx.topPriority.href}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 transition-colors px-4 py-2.5 text-sm font-semibold text-white">
              <span className="text-indigo-100/90 font-normal">Rekommenderad åtgärd:</span>
              {ctx.topPriority.label}
              <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </OSLayer>

      {/* ── QUICK ACTIONS ────────────────────────────────────────────────── */}
      <OSLayer layer="operational" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {quickActions.map(a => (
          <Link key={a.href} href={a.href}
            className="rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors p-4 flex items-center gap-2.5">
            <a.icon className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="text-sm font-medium">{a.label}</span>
          </Link>
        ))}
      </OSLayer>

      {/* ── PLATFORM PULSE ───────────────────────────────────────────────── */}
      <OSLayer layer="operational" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Intäkt denna månad" value={fmtSEK(ctx.totals.revenueMonthSek)} accent="emerald" />
        <Stat label="AI-kostnad denna månad" value={fmtSEK(ctx.totals.costMonthSek)} accent="indigo" />
        <Stat label="Väntande godkännanden" value={String(ctx.totals.pendingApprovals)} accent={ctx.totals.pendingApprovals > 0 ? 'amber' : 'default'} />
        <Stat label="Fallerade körningar (24h)" value={String(ctx.totals.failedRuns24h)} accent={ctx.totals.failedRuns24h > 0 ? 'red' : 'default'}
              icon={ctx.totals.failedRuns24h > 0 ? <AlertTriangle className="w-3.5 h-3.5" /> : undefined} />
      </OSLayer>

      {/* ── BUSINESSES ───────────────────────────────────────────────────── */}
      <OSLayer layer="intelligence" className="space-y-4">
        <div>
          <p className="eyebrow eyebrow-accent mb-1">Verksamheter</p>
          <h2 className="text-base font-semibold tracking-tight">Vad Atlas bevakar</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {ctx.businesses.map(b => (
            <div key={b.id} className="rounded-xl border border-border bg-card p-5 space-y-3">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
                <h3 className="text-sm font-semibold truncate">{b.name}</h3>
              </div>
              {b.focus && <p className="text-[11px] text-muted-foreground leading-relaxed">{b.focus}</p>}
              <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                <Metric label="Intäkt (mån)" value={fmtSEK(b.revenueMonthSek)} />
                <Metric label="Kostnad (mån)" value={fmtSEK(b.costMonthSek)} />
                <Metric label="Leads" value={String(b.qualifiedLeads)} />
                <Metric label="Publicerat (v)" value={String(b.publishedThisWeek)} />
              </div>
            </div>
          ))}
        </div>
      </OSLayer>
    </OSPage>
  )
}

function Stat({ label, value, accent = 'default', icon }: {
  label: string; value: string; accent?: 'emerald' | 'indigo' | 'amber' | 'red' | 'default'; icon?: React.ReactNode
}) {
  const color =
    accent === 'emerald' ? 'text-emerald-400' :
    accent === 'indigo'  ? 'text-indigo-400' :
    accent === 'amber'   ? 'text-amber-400' :
    accent === 'red'     ? 'text-red-400' : 'text-foreground'
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-2">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span className="text-xs">{label}</span>
        {icon && <span className={color}>{icon}</span>}
      </div>
      <div className={`text-2xl font-bold tracking-tight ${color}`}>{value}</div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{label}</p>
      <p className="text-sm font-semibold font-mono">{value}</p>
    </div>
  )
}
