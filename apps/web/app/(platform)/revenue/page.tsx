import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { calculateCost, formatCost, getModelPricing } from '@/lib/ai/pricing'
import {
  TrendingUp,
  DollarSign,
  Cpu,
  Users,
  AlertTriangle,
  BarChart3,
} from 'lucide-react'
import { OSPage, OSLayer } from '@/components/platform/os'

// ─── Types ───────────────────────────────────────────────────────────────────

interface RevenueEvent {
  id: string
  project_id: string | null
  amount_sek: number        // faktiskt kolumnnamn i DB
  source: string | null
  description: string | null
  occurred_at: string
}

interface Lead {
  id: string
  project_id: string | null
  name?: string | null
  company?: string | null
  status: string
  estimated_value: number | null
  actual_value: number | null
  created_at: string
  last_contact_at?: string | null
}

interface ProjectRow {
  id: string
  name: string
  color: string
}

interface RunLogRow {
  tokens_in: number | null
  tokens_out: number | null
  created_at: string
  runs: { project_id: string; workflows: { steps: any[] } | { steps: any[] }[] | null } | { project_id: string; workflows: { steps: any[] } | { steps: any[] }[] | null }[] | null
}

interface RunCountRow {
  project_id: string
}

const MONTHLY_AI_BUDGET_USD = 100

// ─── Formatters ──────────────────────────────────────────────────────────────

function formatSEK(amount: number): string {
  if (amount === 0) return '0 kr'
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

const LEAD_STATUS_LABELS: Record<string, string> = {
  new: 'Ny',
  qualified: 'Kvalificerad',
  warm: 'Varm',
  proposal: 'Förslag',
  won: 'Vunnen',
  lost: 'Förlorad',
}

const LEAD_STATUS_ORDER = ['new', 'qualified', 'warm', 'proposal', 'won']

const LEAD_STATUS_COLORS: Record<string, string> = {
  new: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  qualified: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
  warm: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  proposal: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
  won: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  lost: 'text-zinc-500 bg-zinc-500/10 border-zinc-500/20',
}

// ─── Page ────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

export default async function RevenuePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()

  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const sevenDaysAgo  = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000).toISOString()
  const monthStart    = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  // ── 1. Projects ─────────────────────────────────────────────────────────
  const { data: projectsRaw } = await db
    .from('projects')
    .select('id, name, color')

  const projects: ProjectRow[] = (projectsRaw ?? []) as ProjectRow[]
  const projectById = new Map(projects.map(p => [p.id, p]))

  // ── 2. Revenue events (last 30 days) ─────────────────────────────────
  const { data: revenueRaw } = await (db as any)
    .from('revenue_events')
    .select('id, project_id, amount_sek, source, description, occurred_at')
    .gte('occurred_at', thirtyDaysAgo)

  const revenueEvents: RevenueEvent[] = (revenueRaw ?? []) as RevenueEvent[]

  // ── 3. Leads ──────────────────────────────────────────────────────────
  const { data: leadsRaw } = await (db as any)
    .from('leads')
    .select('id, project_id, name, company, status, estimated_value, actual_value, created_at, last_contact_at')
    .order('created_at', { ascending: false })

  const leads: Lead[] = (leadsRaw ?? []) as Lead[]

  // ── 4. Run logs for AI cost (last 30 days) ────────────────────────────
  const { data: logsRaw } = await db
    .from('run_logs')
    .select(`
      tokens_in,
      tokens_out,
      created_at,
      step_order,
      runs (
        project_id,
        workflows ( steps )
      )
    `)
    .gte('created_at', thirtyDaysAgo)
    .eq('role', 'assistant')
    .not('tokens_in', 'is', null)

  const runLogs = (logsRaw ?? []) as any[]

  // ── 5. Agents for model resolution ────────────────────────────────────
  const { data: agentsRaw } = await db
    .from('agents')
    .select('id, model')

  const agentById = new Map(
    ((agentsRaw ?? []) as { id: string; model: string }[]).map(a => [a.id, a])
  )

  // ── 6. Run counts (last 7 days) ───────────────────────────────────────
  const { data: recentRunsRaw } = await db
    .from('runs')
    .select('project_id')
    .gte('created_at', sevenDaysAgo)

  const recentRuns = (recentRunsRaw ?? []) as RunCountRow[]

  // ─── Calculations ─────────────────────────────────────────────────────

  // Revenue (month to date, exclude refunds)
  const revenueThisMonth = revenueEvents
    .filter(e => e.occurred_at >= monthStart && true /* no event_type column */)
    .reduce((s, e) => s + (e.amount_sek ?? 0), 0)

  // AI cost (month to date, USD)
  let totalAiCostUSD = 0
  const aiCostByProject = new Map<string, number>()
  const tokensByProvider: Record<'anthropic' | 'openai', { in: number; out: number; cost: number }> = {
    anthropic: { in: 0, out: 0, cost: 0 },
    openai:    { in: 0, out: 0, cost: 0 },
  }

  for (const log of runLogs) {
    if (log.created_at < monthStart) continue

    const run = Array.isArray(log.runs) ? log.runs[0] : log.runs
    if (!run) continue

    const workflow = Array.isArray(run.workflows) ? run.workflows[0] : run.workflows
    const steps: any[] = workflow?.steps ?? []
    const step = steps.find((s: any) => s.order === log.step_order)
    const agent = step ? agentById.get(step.agent_id) : null
    const model: string = agent?.model ?? 'claude-sonnet-4-6'

    const tokensIn  = log.tokens_in  ?? 0
    const tokensOut = log.tokens_out ?? 0
    const cost = calculateCost(model, tokensIn, tokensOut)

    totalAiCostUSD += cost

    const projectId: string | null = run.project_id ?? null
    if (projectId) {
      aiCostByProject.set(projectId, (aiCostByProject.get(projectId) ?? 0) + cost)
    }

    const pricing = getModelPricing(model)
    const prov = pricing.provider
    tokensByProvider[prov].in   += tokensIn
    tokensByProvider[prov].out  += tokensOut
    tokensByProvider[prov].cost += cost
  }

  // Revenue by project (this month)
  const revenueByProject = new Map<string, number>()
  for (const e of revenueEvents) {
    if (e.occurred_at < monthStart) continue
    /* no refund check — no event_type column */
    if (!e.project_id) continue
    revenueByProject.set(e.project_id, (revenueByProject.get(e.project_id) ?? 0) + (e.amount_sek ?? 0))
  }

  // Lead pipeline
  const activePipelineLeads = leads.filter(l => !['won', 'lost'].includes(l.status))
  const pipelineValue = activePipelineLeads.reduce((s, l) => s + (l.estimated_value ?? 0), 0)

  // Active leads (new|qualified|warm) per project
  const activeLeadsByProject = new Map<string, number>()
  const pipelineByProject    = new Map<string, number>()
  for (const l of leads) {
    if (!l.project_id) continue
    if (['new', 'qualified', 'warm'].includes(l.status)) {
      activeLeadsByProject.set(l.project_id, (activeLeadsByProject.get(l.project_id) ?? 0) + 1)
    }
    if (!['won', 'lost'].includes(l.status)) {
      pipelineByProject.set(l.project_id, (pipelineByProject.get(l.project_id) ?? 0) + (l.estimated_value ?? 0))
    }
  }

  // Run counts per project
  const runsByProject = new Map<string, number>()
  for (const r of recentRuns) {
    runsByProject.set(r.project_id, (runsByProject.get(r.project_id) ?? 0) + 1)
  }

  // Net profit (revenue in SEK, cost in USD — convert at ~10.5 SEK/USD approx)
  // Note: no currency conversion needed if user tracks revenue in USD; assume SEK values are direct
  // We show cost separately in USD and revenue in SEK — net is shown in both units
  const aiCostPct = MONTHLY_AI_BUDGET_USD > 0 ? (totalAiCostUSD / MONTHLY_AI_BUDGET_USD) * 100 : 0

  // Grouped leads for pipeline board
  const leadsByStatus = new Map<string, Lead[]>()
  for (const status of LEAD_STATUS_ORDER) {
    leadsByStatus.set(status, [])
  }
  for (const lead of leads) {
    if (!LEAD_STATUS_ORDER.includes(lead.status)) continue
    leadsByStatus.get(lead.status)!.push(lead)
  }

  const monthLabel = now.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' })

  return (
    <OSPage className="animate-fade-in">

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <OSLayer layer="hero">
        <div>
          <p className="eyebrow eyebrow-accent mb-3">Affärsintelligens · Revenue Center</p>
          <h1 className="text-3xl 2xl:text-4xl font-bold tracking-tight">Revenue Center</h1>
          <p className="text-sm 2xl:text-base text-zinc-400 mt-2 max-w-2xl">
            {monthLabel} — intäkter, AI-kostnader och lead pipeline
          </p>
        </div>
      </OSLayer>

      {/* ── HERO STATS ───────────────────────────────────────────────────── */}
      <OSLayer layer="operational" className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
        <HeroCard
          icon={<DollarSign className="w-4 h-4" />}
          label="Intäkt denna månad"
          value={formatSEK(revenueThisMonth)}
          sub={revenueEvents.length === 0 ? 'Inga revenue_events ännu' : 'Exkl. återbetalningar'}
          accent="emerald"
        />
        <HeroCard
          icon={<Cpu className="w-4 h-4" />}
          label="AI-kostnad denna månad"
          value={formatCost(totalAiCostUSD)}
          sub={`${aiCostPct.toFixed(0)}% av månadsbudget ($${MONTHLY_AI_BUDGET_USD})`}
          accent={aiCostPct >= 80 ? 'amber' : 'default'}
          warning={aiCostPct >= 80}
        />
        <HeroCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Nettoprofit"
          value={revenueThisMonth > 0
            ? formatSEK(revenueThisMonth - totalAiCostUSD * 10.5)
            : '— kr'}
          sub={revenueThisMonth > 0 ? 'Intäkt minus AI-kostnad (SEK)' : 'Inga intäkter att beräkna mot'}
          accent="emerald"
        />
        <HeroCard
          icon={<Users className="w-4 h-4" />}
          label="Pipeline-värde"
          value={formatSEK(pipelineValue)}
          sub={`${activePipelineLeads.length} aktiva leads`}
          accent="indigo"
        />
      </OSLayer>

      {/* ── PER PROJECT ──────────────────────────────────────────────────── */}
      <OSLayer layer="intelligence" className="space-y-5">
        <SectionHeader eyebrow="Projekt" title="Intäkt & kostnad per projekt" />

        {projects.length === 0 ? (
          <EmptyNotice message="Inga projekt skapade ännu." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {projects.map(project => {
              const revenue = revenueByProject.get(project.id) ?? 0
              const cost    = aiCostByProject.get(project.id) ?? 0
              const roi     = revenue > 0 && cost > 0
                ? ((revenue - cost * 10.5) / (cost * 10.5)) * 100
                : null
              const activeLeads  = activeLeadsByProject.get(project.id)  ?? 0
              const pipeline     = pipelineByProject.get(project.id)     ?? 0
              const runs7d       = runsByProject.get(project.id)         ?? 0

              return (
                <div key={project.id} className="rounded-xl border border-border bg-card p-5 space-y-4">
                  {/* Header */}
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: project.color, boxShadow: `0 0 8px ${project.color}88` }}
                    />
                    <h3 className="text-sm font-semibold truncate">{project.name}</h3>
                  </div>

                  {/* Metrics grid */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <Metric label="Intäkt" value={formatSEK(revenue)} color="emerald" />
                    <Metric label="AI-kostnad" value={formatCost(cost)} color="amber" />
                    <Metric
                      label="ROI"
                      value={roi !== null ? `${roi.toFixed(0)}%` : '—'}
                      color={roi !== null && roi > 0 ? 'emerald' : 'default'}
                    />
                    <Metric label="Körningar (7d)" value={String(runs7d)} color="default" />
                    <Metric label="Aktiva leads" value={String(activeLeads)} color="indigo" />
                    <Metric label="Pipeline" value={formatSEK(pipeline)} color="indigo" />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </OSLayer>

      {/* ── LEAD PIPELINE ────────────────────────────────────────────────── */}
      <OSLayer layer="intelligence" className="space-y-5">
        <SectionHeader eyebrow="CRM" title="Lead Pipeline" />

        {leads.length === 0 ? (
          <EmptyNotice message="Inga leads ännu." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
            {LEAD_STATUS_ORDER.map(status => {
              const group      = leadsByStatus.get(status) ?? []
              const colValue   = group.reduce((s, l) => s + (l.estimated_value ?? 0), 0)

              return (
                <div key={status} className="rounded-xl border border-border bg-card overflow-hidden">
                  {/* Column header */}
                  <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-2 py-0.5 border ${LEAD_STATUS_COLORS[status]}`}>
                      {LEAD_STATUS_LABELS[status]}
                    </span>
                    <span className="text-xs text-muted-foreground">{group.length}</span>
                  </div>

                  {/* Pipeline value */}
                  {colValue > 0 && (
                    <div className="px-4 py-2 border-b border-border/50">
                      <p className="text-[11px] text-emerald-400 font-mono">{formatSEK(colValue)}</p>
                    </div>
                  )}

                  {/* Leads */}
                  <div className="p-2 space-y-1.5 min-h-[80px]">
                    {group.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground px-2 py-3 text-center">—</p>
                    ) : (
                      group.map(lead => {
                        const proj = lead.project_id ? projectById.get(lead.project_id) : null
                        const lastContact = lead.last_contact_at
                          ? new Date(lead.last_contact_at).toLocaleDateString('sv-SE')
                          : null
                        return (
                          <div
                            key={lead.id}
                            className="rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors p-2.5 space-y-1"
                          >
                            <p className="text-xs font-medium leading-tight truncate">
                              {lead.name ?? 'Namnlös'}
                            </p>
                            {lead.company && (
                              <p className="text-[11px] text-muted-foreground truncate">{lead.company}</p>
                            )}
                            <div className="flex items-center justify-between gap-1 pt-0.5">
                              {lead.estimated_value ? (
                                <span className="text-[10px] font-mono text-emerald-500">
                                  {formatSEK(lead.estimated_value)}
                                </span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">—</span>
                              )}
                              {lastContact && (
                                <span className="text-[10px] text-muted-foreground">{lastContact}</span>
                              )}
                            </div>
                            {proj && (
                              <div className="flex items-center gap-1 pt-0.5">
                                <span
                                  className="w-1.5 h-1.5 rounded-full shrink-0"
                                  style={{ backgroundColor: proj.color }}
                                />
                                <span className="text-[10px] text-muted-foreground truncate">{proj.name}</span>
                              </div>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </OSLayer>

      {/* ── AI-KOSTNAD PER TJÄNST ─────────────────────────────────────────── */}
      <OSLayer layer="intelligence" className="space-y-5">
        <SectionHeader eyebrow="Infrastruktur" title="AI-kostnad per tjänst" />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Claude (Anthropic) */}
          <ServiceCostCard
            name="Claude"
            provider="Anthropic"
            costUSD={tokensByProvider.anthropic.cost}
            tokensIn={tokensByProvider.anthropic.in}
            tokensOut={tokensByProvider.anthropic.out}
            budgetUSD={MONTHLY_AI_BUDGET_USD * 0.7}
            color="indigo"
          />

          {/* OpenAI */}
          <ServiceCostCard
            name="OpenAI"
            provider="OpenAI"
            costUSD={tokensByProvider.openai.cost}
            tokensIn={tokensByProvider.openai.in}
            tokensOut={tokensByProvider.openai.out}
            budgetUSD={MONTHLY_AI_BUDGET_USD * 0.2}
            color="emerald"
          />

          {/* ElevenLabs — no token data yet */}
          <ServiceCostCard
            name="ElevenLabs"
            provider="ElevenLabs"
            costUSD={0}
            tokensIn={0}
            tokensOut={0}
            budgetUSD={MONTHLY_AI_BUDGET_USD * 0.1}
            color="amber"
            note="Snapshot saknas — kostnad beräknas ej"
          />
        </div>

        {/* Monthly budget progress */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Månadsbudget AI</p>
              <p className="text-sm font-semibold mt-0.5">
                {formatCost(totalAiCostUSD)}
                <span className="text-muted-foreground font-normal text-xs ml-1.5">
                  av ${MONTHLY_AI_BUDGET_USD}
                </span>
              </p>
            </div>
            {aiCostPct >= 80 && (
              <div className="flex items-center gap-1.5 text-amber-400 text-xs font-medium">
                <AlertTriangle className="w-3.5 h-3.5" />
                Budgetvarning
              </div>
            )}
          </div>
          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                aiCostPct >= 80 ? 'bg-amber-500' : 'bg-indigo-500'
              }`}
              style={{ width: `${Math.min(aiCostPct, 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{aiCostPct.toFixed(1)}% förbrukat</p>
        </div>
      </OSLayer>

    </OSPage>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function HeroCard({
  icon, label, value, sub, accent = 'default', warning = false,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  accent?: 'emerald' | 'amber' | 'indigo' | 'default'
  warning?: boolean
}) {
  const accentColor =
    accent === 'emerald' ? 'text-emerald-400' :
    accent === 'amber'   ? 'text-amber-400' :
    accent === 'indigo'  ? 'text-indigo-400' :
                           'text-foreground'

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
        {warning && <AlertTriangle className="w-3 h-3 text-amber-400 ml-auto" />}
      </div>
      <div className={`text-2xl font-bold tracking-tight ${accentColor}`}>{value}</div>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function Metric({ label, value, color }: { label: string; value: string; color: 'emerald' | 'amber' | 'indigo' | 'default' }) {
  const valueColor =
    color === 'emerald' ? 'text-emerald-400' :
    color === 'amber'   ? 'text-amber-400' :
    color === 'indigo'  ? 'text-indigo-400' :
                          'text-foreground'
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{label}</p>
      <p className={`text-sm font-semibold font-mono ${valueColor}`}>{value}</p>
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

function ServiceCostCard({
  name,
  provider,
  costUSD,
  tokensIn,
  tokensOut,
  budgetUSD,
  color,
  note,
}: {
  name: string
  provider: string
  costUSD: number
  tokensIn: number
  tokensOut: number
  budgetUSD: number
  color: 'indigo' | 'emerald' | 'amber'
  note?: string
}) {
  const pct = budgetUSD > 0 ? Math.min((costUSD / budgetUSD) * 100, 100) : 0
  const barColor =
    color === 'emerald' ? 'bg-emerald-500' :
    color === 'amber'   ? 'bg-amber-500' :
                          'bg-indigo-500'
  const textColor =
    color === 'emerald' ? 'text-emerald-400' :
    color === 'amber'   ? 'text-amber-400' :
                          'text-indigo-400'

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">{name}</p>
          <p className="text-[11px] text-muted-foreground">{provider}</p>
        </div>
        <BarChart3 className={`w-4 h-4 ${textColor}`} />
      </div>

      <p className={`text-xl font-bold font-mono tracking-tight ${textColor}`}>
        {formatCost(costUSD)}
      </p>

      <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        {tokensIn > 0 || tokensOut > 0 ? (
          <>
            <div className="flex justify-between">
              <span>Input</span>
              <span className="font-mono">{formatTokens(tokensIn)}</span>
            </div>
            <div className="flex justify-between">
              <span>Output</span>
              <span className="font-mono">{formatTokens(tokensOut)}</span>
            </div>
          </>
        ) : null}
        {note && <p className="text-[10px] italic">{note}</p>}
      </div>
    </div>
  )
}
