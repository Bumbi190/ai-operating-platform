/**
 * Cost Intelligence Center — Omnira
 *
 * Ekonomisk kontrollpanel för hela plattformen. Läser GRANULÄRA kostnader från
 * cost_events (en rad per API-anrop), aldrig hårdkodade värden.
 *
 * Operatören ska på 5 sekunder se: vad kostar idag/månaden, vilket projekt /
 * leverantör / agent kostar mest, vad spenderas just nu, och om budgeten spräcks.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Activity, TrendingUp, CalendarDays, CalendarClock, Cpu, AlertTriangle } from 'lucide-react'
import { OSPage, OSLayer } from '@/components/platform/os'
import { LiveRefresh } from './LiveRefresh'

export const dynamic = 'force-dynamic'

// ─── Formatters ────────────────────────────────────────────────────────────────

function fmtSEK(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(Math.round(n)) + ' kr'
}
function fmtSEKprecise(n: number): string {
  if (n === 0) return '0 kr'
  if (n < 1) return n.toFixed(2).replace('.', ',') + ' kr'
  return n.toFixed(2).replace('.', ',') + ' kr'
}
function fmtUnits(unitType: string, units: number): string {
  if (unitType === 'tokens') {
    if (units >= 1_000_000) return `${(units / 1_000_000).toFixed(1)} M tokens`
    if (units >= 1_000) return `${(units / 1_000).toFixed(0)}k tokens`
    return `${units} tokens`
  }
  if (unitType === 'characters') return `${Math.round(units)} tecken`
  if (unitType === 'images') return `${Math.round(units)} bild${units === 1 ? '' : 'er'}`
  if (unitType === 'seconds') return `${Math.round(units)} s`
  return `${Math.round(units)}`
}
function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'nyss'
  if (m < 60) return `${m} min sedan`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h sedan`
  return `${Math.floor(h / 24)} d sedan`
}
function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
}

// ─── Provider presentation ──────────────────────────────────────────────────────

const PROVIDER_META: Record<string, { label: string; dot: string; text: string }> = {
  anthropic:  { label: 'Claude',     dot: 'bg-indigo-500',  text: 'text-indigo-400' },
  openai:     { label: 'OpenAI',     dot: 'bg-emerald-500', text: 'text-emerald-400' },
  elevenlabs: { label: 'ElevenLabs', dot: 'bg-amber-500',   text: 'text-amber-400' },
  ideogram:   { label: 'Ideogram',   dot: 'bg-fuchsia-500', text: 'text-fuchsia-400' },
  meta:       { label: 'Meta',       dot: 'bg-sky-500',     text: 'text-sky-400' },
  google:     { label: 'Google',     dot: 'bg-rose-500',    text: 'text-rose-400' },
}
function provMeta(p: string) {
  return PROVIDER_META[p] ?? { label: p, dot: 'bg-zinc-500', text: 'text-zinc-300' }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CostRow {
  project_id: string | null
  provider: string
  model: string | null
  agent: string | null
  operation: string | null
  unit_type: string
  units: number
  tokens_in: number
  tokens_out: number
  cost_sek: number
  created_at: string
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function CostsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart  = new Date(now.getTime() - 7 * 864e5)
  const prevWeekStart = new Date(now.getTime() - 14 * 864e5)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  // Pull everything since last month (covers month, week & trends at this volume)
  const { data: rowsRaw } = await (db as any)
    .from('cost_events')
    .select('project_id, provider, model, agent, operation, unit_type, units, tokens_in, tokens_out, cost_sek, created_at')
    .gte('created_at', lastMonthStart.toISOString())
    .order('created_at', { ascending: false })

  const rows: CostRow[] = ((rowsRaw ?? []) as any[]).map(r => ({
    ...r,
    units: Number(r.units ?? 0),
    tokens_in: Number(r.tokens_in ?? 0),
    tokens_out: Number(r.tokens_out ?? 0),
    cost_sek: Number(r.cost_sek ?? 0),
  }))

  const { data: projectsRaw } = await db.from('projects').select('id, name, color')
  const projects = (projectsRaw ?? []) as { id: string; name: string; color: string }[]
  const projectById = new Map(projects.map(p => [p.id, p]))

  const { data: budgetsRaw } = await (db as any).from('project_budgets').select('project_id, monthly_sek')
  const budgetByProject = new Map<string, number>(
    ((budgetsRaw ?? []) as any[]).map(b => [b.project_id as string, Number(b.monthly_sek ?? 0)]),
  )

  // ── Aggregations ──────────────────────────────────────────────────────────
  const inMonth = (r: CostRow) => new Date(r.created_at) >= monthStart
  const monthRows = rows.filter(inMonth)

  const sumOf = (pred: (r: CostRow) => boolean) =>
    rows.filter(pred).reduce((s, r) => s + r.cost_sek, 0)

  const todaySek = sumOf(r => new Date(r.created_at) >= todayStart)
  const weekSek  = sumOf(r => new Date(r.created_at) >= weekStart)
  const prevWeekSek = sumOf(r => new Date(r.created_at) >= prevWeekStart && new Date(r.created_at) < weekStart)
  const monthSek = monthRows.reduce((s, r) => s + r.cost_sek, 0)
  const lastMonthSek = sumOf(r => new Date(r.created_at) >= lastMonthStart && new Date(r.created_at) < monthStart)

  // Forecast: month-to-date run rate × days in month
  const dayOfMonth = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const forecastSek = dayOfMonth > 0 ? (monthSek / dayOfMonth) * daysInMonth : 0

  // Per provider (this month)
  const provAgg = new Map<string, { sek: number; calls: number; tokens: number; chars: number; images: number; last: string }>()
  for (const r of monthRows) {
    const a = provAgg.get(r.provider) ?? { sek: 0, calls: 0, tokens: 0, chars: 0, images: 0, last: r.created_at }
    a.sek += r.cost_sek
    a.calls += 1
    if (r.unit_type === 'tokens') a.tokens += r.units
    else if (r.unit_type === 'characters') a.chars += r.units
    else if (r.unit_type === 'images') a.images += r.units
    if (new Date(r.created_at) > new Date(a.last)) a.last = r.created_at
    provAgg.set(r.provider, a)
  }
  const providers = [...provAgg.entries()].sort((a, b) => b[1].sek - a[1].sek)

  // Per project (this month) + provider breakdown
  const projAgg = new Map<string, { total: number; byProv: Map<string, number> }>()
  for (const r of monthRows) {
    const key = r.project_id ?? '__global__'
    const a = projAgg.get(key) ?? { total: 0, byProv: new Map<string, number>() }
    a.total += r.cost_sek
    a.byProv.set(r.provider, (a.byProv.get(r.provider) ?? 0) + r.cost_sek)
    projAgg.set(key, a)
  }
  const projectRank = [...projAgg.entries()].sort((a, b) => b[1].total - a[1].total)

  // Per agent (this month)
  const agentAgg = new Map<string, number>()
  for (const r of monthRows) {
    const key = r.agent ?? r.operation ?? 'Okänd'
    agentAgg.set(key, (agentAgg.get(key) ?? 0) + r.cost_sek)
  }
  const agentRank = [...agentAgg.entries()].sort((a, b) => b[1] - a[1])

  // Budget watch (this month spend vs budget)
  const budgetRows = projects
    .map(p => ({ project: p, spent: projAgg.get(p.id)?.total ?? 0, budget: budgetByProject.get(p.id) ?? 0 }))
    .filter(b => b.budget > 0)
    .sort((a, b) => (b.spent / b.budget) - (a.spent / a.budget))

  // Live stream — latest events
  const stream = rows.slice(0, 22)

  // ── AI-CFO insights (deterministisk analys, ingen extra AI-kostnad) ────────
  const insights: string[] = []
  if (monthSek > 0 && providers.length) {
    const [tp, ta] = providers[0]
    insights.push(`${provMeta(tp).label} står för ${Math.round((ta.sek / monthSek) * 100)}% av kostnaderna denna månad.`)
  }
  if (monthSek > 0 && projectRank.length) {
    const [pid, pa] = projectRank[0]
    const name = pid === '__global__' ? 'Plattformsglobalt' : (projectById.get(pid)?.name ?? 'Okänt projekt')
    insights.push(`${name} genererar ${Math.round((pa.total / monthSek) * 100)}% av kostnaderna.`)
  }
  if (prevWeekSek > 0) {
    const chg = Math.round(((weekSek - prevWeekSek) / prevWeekSek) * 100)
    insights.push(`Kostnaderna ${chg >= 0 ? 'ökade' : 'minskade'} ${Math.abs(chg)}% mot förra veckan.`)
  }
  if (monthSek > 0) {
    insights.push(`Nuvarande förbrukning ger en uppskattad månadskostnad på ${fmtSEK(forecastSek)}.`)
  }

  const monthLabel = now.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' })
  const hasData = rows.length > 0

  return (
    <OSPage className="animate-fade-in">
      <LiveRefresh seconds={20} />

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <OSLayer layer="hero">
        <div>
          <p className="eyebrow eyebrow-accent mb-3">Mission Control · Cost Intelligence</p>
          <h1 className="text-3xl 2xl:text-4xl font-bold tracking-tight">Cost Intelligence Center</h1>
          <p className="text-sm 2xl:text-base text-zinc-400 mt-2 max-w-2xl">
            {monthLabel} — varje krona spårad per projekt, leverantör och agent
          </p>
        </div>
      </OSLayer>

      {/* ── KPI ROW ──────────────────────────────────────────────────────── */}
      <OSLayer layer="operational" className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
        <Kpi icon={<Activity className="w-4 h-4" />}      label="Idag"          value={fmtSEK(todaySek)} accent="default" />
        <Kpi icon={<CalendarDays className="w-4 h-4" />}  label="Denna vecka"   value={fmtSEK(weekSek)}  accent="default" />
        <Kpi icon={<CalendarClock className="w-4 h-4" />} label="Denna månad"   value={fmtSEK(monthSek)} accent="indigo"
             sub={lastMonthSek > 0 ? `Förra månaden ${fmtSEK(lastMonthSek)}` : undefined} />
        <Kpi icon={<TrendingUp className="w-4 h-4" />}    label="Prognos månadsslut" value={fmtSEK(forecastSek)} accent="amber"
             sub={`Dag ${dayOfMonth}/${daysInMonth}`} />
      </OSLayer>

      {!hasData && (
        <OSLayer layer="operational">
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Inga kostnadshändelser loggade ännu. Nästa pipeline-körning fyller på automatiskt —
            sidan uppdateras live var 20:e sekund.
          </div>
        </OSLayer>
      )}

      {/* ── AI CFO INSIGHTS ──────────────────────────────────────────────── */}
      {insights.length > 0 && (
        <OSLayer layer="intelligence" className="space-y-3">
          <SectionHeader eyebrow="AI CFO" title="Automatisk kostnadsanalys" />
          <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-5 space-y-2.5">
            {insights.map((line, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                <p className="text-sm text-foreground/90 leading-relaxed">{line}</p>
              </div>
            ))}
          </div>
        </OSLayer>
      )}

      {/* ── PROVIDERS + LIVE STREAM ──────────────────────────────────────── */}
      <OSLayer layer="intelligence" className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Providers */}
        <div className="space-y-4">
          <SectionHeader eyebrow="Leverantörer" title="API-kostnad per leverantör" />
          {providers.length === 0 ? (
            <EmptyNotice message="Ingen leverantörskostnad denna månad." />
          ) : (
            <div className="space-y-2.5">
              {providers.map(([prov, a]) => {
                const meta = provMeta(prov)
                const pct = monthSek > 0 ? (a.sek / monthSek) * 100 : 0
                const usage = a.tokens > 0 ? fmtUnits('tokens', a.tokens)
                  : a.chars > 0 ? fmtUnits('characters', a.chars)
                  : a.images > 0 ? fmtUnits('images', a.images)
                  : `${a.calls} anrop`
                return (
                  <div key={prov} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-2 h-2 rounded-full ${meta.dot} shrink-0`} />
                        <span className="text-sm font-semibold truncate">{meta.label}</span>
                        <span className="text-[10px] uppercase tracking-wide text-emerald-400/80 border border-emerald-500/20 bg-emerald-500/10 rounded-full px-1.5 py-0.5">Aktiv</span>
                      </div>
                      <span className={`text-sm font-bold font-mono ${meta.text}`}>{fmtSEK(a.sek)}</span>
                    </div>
                    <div className="mt-3 w-full h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full ${meta.dot}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{usage} · {a.calls} anrop</span>
                      <span>{relTime(a.last)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Live cost stream */}
        <div className="space-y-4">
          <SectionHeader eyebrow="Realtid" title="Live Cost Stream" />
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {stream.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Inga händelser ännu.</div>
            ) : (
              <div className="divide-y divide-border/50 max-h-[460px] overflow-y-auto">
                {stream.map((r, i) => {
                  const meta = provMeta(r.provider)
                  return (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="text-[11px] font-mono text-muted-foreground w-11 shrink-0">{clockTime(r.created_at)}</span>
                      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot} shrink-0`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">{r.operation ?? r.agent ?? 'Anrop'}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {meta.label}{r.project_id && projectById.get(r.project_id) ? ` · ${projectById.get(r.project_id)!.name}` : ''}
                        </p>
                      </div>
                      <span className="text-[11px] font-mono text-foreground/80 shrink-0">{fmtSEKprecise(r.cost_sek)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </OSLayer>

      {/* ── COST PER PROJECT ─────────────────────────────────────────────── */}
      <OSLayer layer="intelligence" className="space-y-4">
        <SectionHeader eyebrow="Projekt" title="Kostnad per projekt" />
        {projectRank.length === 0 ? (
          <EmptyNotice message="Ingen projektkostnad denna månad." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {projectRank.map(([pid, a]) => {
              const proj = pid === '__global__' ? null : projectById.get(pid)
              const topPct = projectRank[0][1].total > 0 ? (a.total / projectRank[0][1].total) * 100 : 0
              const provLines = [...a.byProv.entries()].sort((x, y) => y[1] - x[1])
              return (
                <div key={pid} className="rounded-xl border border-border bg-card p-5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: proj?.color ?? '#71717a' }} />
                      <h3 className="text-sm font-semibold truncate">{proj?.name ?? 'Plattformsglobalt'}</h3>
                    </div>
                    <span className="text-base font-bold font-mono">{fmtSEK(a.total)}</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min(topPct, 100)}%` }} />
                  </div>
                  <div className="space-y-1 pt-1">
                    {provLines.map(([prov, sek]) => (
                      <div key={prov} className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">{provMeta(prov).label}</span>
                        <span className="font-mono text-foreground/70">{fmtSEKprecise(sek)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </OSLayer>

      {/* ── COST PER AGENT + BUDGET WATCH ────────────────────────────────── */}
      <OSLayer layer="intelligence" className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Agents */}
        <div className="space-y-4">
          <SectionHeader eyebrow="Agenter" title="Kostnad per agent" />
          {agentRank.length === 0 ? (
            <EmptyNotice message="Ingen agentkostnad denna månad." />
          ) : (
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              {agentRank.map(([agent, sek]) => {
                const pct = agentRank[0][1] > 0 ? (sek / agentRank[0][1]) * 100 : 0
                return (
                  <div key={agent} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium flex items-center gap-2"><Cpu className="w-3.5 h-3.5 text-muted-foreground" />{agent}</span>
                      <span className="font-mono font-semibold">{fmtSEK(sek)}</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-fuchsia-500" style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Budget watch */}
        <div className="space-y-4">
          <SectionHeader eyebrow="Budgetvakt" title="Budget per projekt" />
          {budgetRows.length === 0 ? (
            <EmptyNotice message="Inga budgetar satta." />
          ) : (
            <div className="space-y-3">
              {budgetRows.map(({ project, spent, budget }) => {
                const pct = budget > 0 ? (spent / budget) * 100 : 0
                const critical = pct >= 95
                const warn = pct >= 80 && !critical
                const bar = critical ? 'bg-red-500' : warn ? 'bg-amber-500' : 'bg-emerald-500'
                return (
                  <div key={project.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: project.color }} />
                        <span className="text-sm font-semibold truncate">{project.name}</span>
                        {critical && <span className="inline-flex items-center gap-1 text-[10px] text-red-400"><AlertTriangle className="w-3 h-3" />Kritisk</span>}
                        {warn && <span className="inline-flex items-center gap-1 text-[10px] text-amber-400"><AlertTriangle className="w-3 h-3" />Varning</span>}
                      </div>
                      <span className="text-xs font-mono">
                        <span className="font-semibold">{fmtSEK(spent)}</span>
                        <span className="text-muted-foreground"> / {fmtSEK(budget)}</span>
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full ${bar} transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <p className="text-[11px] text-muted-foreground">{pct.toFixed(0)}% förbrukat</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </OSLayer>
    </OSPage>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function Kpi({ icon, label, value, sub, accent = 'default' }: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  accent?: 'indigo' | 'amber' | 'default'
}) {
  const color = accent === 'indigo' ? 'text-indigo-400' : accent === 'amber' ? 'text-amber-400' : 'text-foreground'
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className={`text-2xl font-bold tracking-tight ${color}`}>{value}</div>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="eyebrow eyebrow-accent mb-1">{eyebrow}</p>
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
    </div>
  )
}

function EmptyNotice({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}
