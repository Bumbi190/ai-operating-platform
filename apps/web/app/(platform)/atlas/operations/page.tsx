/**
 * Atlas Operations Center — EN operativ vy över hela verksamheten.
 *
 * Aggregerar befintlig data (media-pipeline, runs, leads, kostnader, insights) till
 * en ledningscentral. Duplicerar inte Dashboard (exekutiv briefing) eller Activity
 * Center (körningsflöde) — detta är den operativa helhetsbilden per verksamhet.
 * Read-only, auto-uppdaterande.
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { OSPage, OSLayer } from '@/components/platform/os'
import { getOperations } from '@/lib/atlas/operations'
import { LiveRefresh } from '../activity/LiveRefresh'
import {
  Clapperboard, Clock, Loader2, Send, CheckCircle2, XCircle, Eye,
  Users, Sparkles, AlertTriangle, DollarSign, Activity, ExternalLink, Archive, KeyRound,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

function rel(iso: string | null): string {
  if (!iso) return '—'
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'nyss'
  if (m < 60) return `${m} min sedan`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h sedan`
  return `${Math.floor(h / 24)} d sedan`
}
const nf = (n: number) => new Intl.NumberFormat('sv-SE').format(Math.round(n))

export default async function AtlasOperations() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()
  const o = await getOperations(db)

  const promptAttention = o.prompt.failed24h > 0
  const sysAttention    = o.system.stuckWorkflows > 0 || o.system.failedWorkflows > 0

  return (
    <OSPage className="animate-fade-in">
      <LiveRefresh seconds={20} />

      <OSLayer layer="hero">
        <div>
          <p className="eyebrow eyebrow-accent mb-3">Atlas · Ledningscentral</p>
          <h1 className="text-2xl 2xl:text-3xl font-bold tracking-tight">Operations Center</h1>
          <p className="text-sm text-zinc-400 mt-2">Hela verksamheten på ett ställe — vad som hänt, vad som pågår, vad som väntar och vad som behöver din uppmärksamhet. Uppdateras live.</p>
        </div>
      </OSLayer>

      {/* ── THE PROMPT ─────────────────────────────────────────────────────── */}
      <OSLayer layer="operational" className="space-y-3">
        <SectionHeader eyebrow="The Prompt" title="AI-nyhetsvideor" flag={promptAttention ? `${o.prompt.failed24h} fel 24h` : undefined} />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <Metric icon={CheckCircle2} color="text-emerald-400" label="Publicerade idag" value={nf(o.prompt.publishedToday)} />
          <Metric icon={Clock}        color="text-zinc-300"   label="Väntar på render" value={nf(o.prompt.waitingRender)} />
          <Metric icon={Loader2}      color="text-indigo-300" label="Rendering pågår" value={nf(o.prompt.rendering)} />
          <Metric icon={Send}         color="text-amber-300"  label="Väntar publicering" value={nf(o.prompt.waitingPublish)} hint="färska ≤4 dagar" />
          <Metric icon={XCircle}      color={o.prompt.failed24h ? 'text-red-400' : 'text-zinc-500'} label="Misslyckade 24h" value={nf(o.prompt.failed24h)} />
          <Metric icon={Archive}      color="text-zinc-400"   label="Arkiverade (gammal news)" value={nf(o.prompt.archived)} hint=">4 dagar — publiceras ej" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Metric icon={Eye} color="text-pink-400"  label="Instagram-visningar" value={nf(o.prompt.views.instagram)} />
          <Metric icon={Eye} color="text-red-400"   label="YouTube-visningar"   value={nf(o.prompt.views.youtube)} />
          <Metric icon={Eye} color="text-blue-400"  label="Facebook-visningar"  value={nf(o.prompt.views.facebook)} />
        </div>
        {o.prompt.latestPublished && (
          <div className="rounded-xl border border-border bg-card p-4 flex items-start gap-3">
            <Clapperboard className="w-4 h-4 text-indigo-300 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-muted-foreground">Senaste publicerade video · {rel(o.prompt.latestPublished.at)}</p>
              <p className="text-sm font-medium truncate">{o.prompt.latestPublished.hook}</p>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {o.prompt.latestPublished.instagram && <PostLink href={o.prompt.latestPublished.instagram} label="Instagram" />}
                {o.prompt.latestPublished.youtube   && <PostLink href={o.prompt.latestPublished.youtube}   label="YouTube" />}
                {o.prompt.latestPublished.facebook  && <PostLink href={o.prompt.latestPublished.facebook}  label="Facebook" />}
              </div>
            </div>
          </div>
        )}
      </OSLayer>

      {/* ── FAMILJE-STUNDEN ────────────────────────────────────────────────── */}
      <OSLayer layer="intelligence" className="space-y-3">
        <SectionHeader eyebrow="Familje-Stunden" title="Barninnehåll & prenumeration" flag={o.familje.failed24h > 0 ? `${o.familje.failed24h} fel 24h` : undefined} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric icon={Users}    color="text-emerald-400" label="Aktiva prenumeranter" value={o.familje.activeSubscribers === null ? '—' : nf(o.familje.activeSubscribers)} hint={o.familje.activeSubscribers === null ? 'Stripe ej inkopplat' : undefined} />
          <Metric icon={Sparkles} color="text-yellow-400"  label="Leads" value={nf(o.familje.leads)} />
          <Metric icon={Send}     color="text-blue-400"    label="Sociala poster" value={nf(o.familje.socialPosts)} />
          <Metric icon={XCircle}  color={o.familje.failed24h ? 'text-red-400' : 'text-zinc-500'} label="Misslyckade 24h" value={nf(o.familje.failed24h)} />
        </div>
      </OSLayer>

      {/* ── GAINPILOT ──────────────────────────────────────────────────────── */}
      <OSLayer layer="intelligence" className="space-y-3">
        <SectionHeader eyebrow="GainPilot" title="B2B-leads & produkt" flag={o.gainpilot.failed24h > 0 ? `${o.gainpilot.failed24h} fel 24h` : undefined} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric icon={Users}    color="text-indigo-300" label="Beta-användare" value={o.gainpilot.betaUsers === null ? '—' : nf(o.gainpilot.betaUsers)} hint={o.gainpilot.betaUsers === null ? 'Ingen datakälla ännu' : undefined} />
          <Metric icon={Activity} color="text-emerald-400" label="Aktiva användare" value={o.gainpilot.activeUsers === null ? '—' : nf(o.gainpilot.activeUsers)} hint={o.gainpilot.activeUsers === null ? 'Ingen datakälla ännu' : undefined} />
          <Metric icon={Sparkles} color="text-yellow-400" label="Leads" value={nf(o.gainpilot.leads)} />
          <Metric icon={XCircle}  color={o.gainpilot.failed24h ? 'text-red-400' : 'text-zinc-500'} label="Misslyckade 24h" value={nf(o.gainpilot.failed24h)} />
        </div>
      </OSLayer>

      {/* ── ATLAS SYSTEM HEALTH ────────────────────────────────────────────── */}
      <OSLayer layer="intelligence" className="space-y-3">
        <SectionHeader eyebrow="Atlas System Health" title="Drift & kostnad" flag={sysAttention ? 'Behöver uppmärksamhet' : undefined} />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <Metric icon={DollarSign} color="text-emerald-400" label="API-kostnad idag" value={`${nf(o.system.costTodaySek)} kr`} />
          <Metric icon={DollarSign} color="text-emerald-400" label="API-kostnad månad" value={`${nf(o.system.costMonthSek)} kr`} />
          <Metric icon={Loader2}    color="text-indigo-300"  label="Aktiva workflows" value={nf(o.system.activeWorkflows)} />
          <Metric icon={AlertTriangle} color={o.system.stuckWorkflows ? 'text-amber-400' : 'text-zinc-500'} label="Fastnade workflows" value={nf(o.system.stuckWorkflows)} />
          <Metric icon={XCircle}    color={o.system.failedWorkflows ? 'text-red-400' : 'text-zinc-500'} label="Misslyckade 24h" value={nf(o.system.failedWorkflows)} />
        </div>
        <div className="rounded-xl border border-border bg-card p-4 flex items-start gap-3">
          <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${o.system.lastError ? 'text-red-400' : 'text-zinc-500'}`} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted-foreground">Senaste fel</p>
            {o.system.lastError ? (
              <p className="text-sm">
                <span className="font-medium">{o.system.lastError.workflow ?? 'Okänt workflow'}</span>
                <span className="text-muted-foreground"> · {rel(o.system.lastError.at)}</span>
                <br /><span className="text-red-300/90">{o.system.lastError.message}</span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Inga fel registrerade senaste 24h.</p>
            )}
          </div>
        </div>
      </OSLayer>

      {/* ── INTEGRATIONER & TOKENS ──────────────────────────────────────────── */}
      <OSLayer layer="intelligence" className="space-y-3">
        <SectionHeader eyebrow="Integrationer & Tokens" title="Publiceringskanaler"
          flag={o.tokens.some(t => t.status === 'expired' || t.status === 'error') ? 'Token-problem'
            : o.tokens.some(t => t.status === 'warning') ? 'Token nära utgång' : undefined} />
        <div className="rounded-xl border border-border bg-card divide-y divide-border/50">
          {o.tokens.length === 0 ? (
            <div className="px-4 py-4 text-sm text-muted-foreground">Ingen token-data än — körs dagligen 06:15 UTC.</div>
          ) : o.tokens.map(t => {
            const dot = t.status === 'ok' ? 'bg-emerald-400'
              : t.status === 'warning' ? 'bg-amber-400'
              : t.status === 'unknown' ? 'bg-zinc-500' : 'bg-red-400'
            const expiry = t.daysLeft !== null ? `utgång om ${t.daysLeft} dagar`
              : t.status === 'ok' ? 'långlivat / utgång okänd' : t.status
            return (
              <div key={t.platform} className="flex items-center gap-3 px-4 py-3">
                <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                <KeyRound className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium capitalize w-24 shrink-0">{t.platform}</span>
                <span className="text-[12px] text-muted-foreground flex-1 truncate">
                  {expiry}
                  {t.lastRefreshedAt ? ` · refresh ${rel(t.lastRefreshedAt)}` : ''}
                  {t.lastVerifiedAt ? ` · verifierad ${rel(t.lastVerifiedAt)}` : ''}
                  {t.lastError ? ` · ${t.lastError.slice(0, 50)}` : ''}
                </span>
                <span className={`text-[10px] uppercase tracking-wide shrink-0 ${
                  t.status === 'ok' ? 'text-emerald-400' : t.status === 'warning' ? 'text-amber-300' : t.status === 'unknown' ? 'text-zinc-500' : 'text-red-400'
                }`}>{t.status}</span>
              </div>
            )
          })}
        </div>
      </OSLayer>
    </OSPage>
  )
}

function SectionHeader({ eyebrow, title, flag }: { eyebrow: string; title: string; flag?: string }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <p className="eyebrow eyebrow-accent mb-1">{eyebrow}</p>
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      </div>
      {flag && (
        <span className="text-[10px] uppercase tracking-wide text-amber-300 border border-amber-500/30 rounded-full px-2 py-0.5 shrink-0">{flag}</span>
      )}
    </div>
  )
}

function Metric({ icon: Icon, color, label, value, hint }: {
  icon: React.ElementType; color: string; label: string; value: string; hint?: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 shrink-0 ${color}`} />
        <span className="text-[11px] text-muted-foreground leading-tight">{label}</span>
      </div>
      <p className="text-2xl font-bold tracking-tight tabular-nums">{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  )
}

function PostLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 hover:underline">
      {label} <ExternalLink className="w-2.5 h-2.5 opacity-60" />
    </a>
  )
}
