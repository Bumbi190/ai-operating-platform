import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getModelPricing, formatCost, calculateCost } from '@/lib/ai/pricing'
import { DollarSign, Cpu, TrendingUp, Zap } from 'lucide-react'
import { OSPage, OSLayer } from '@/components/platform/os'

interface AgentCost {
  agent: string
  model: string
  workflow: string
  tokensIn: number
  tokensOut: number
  cost: number
  runs: number
}

export default async function CostsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()

  const now = new Date()
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
  const thisMonth = now.toISOString().slice(0, 7)
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1).toISOString().slice(0, 7)

  // 1. Fetch run_logs (assistant logs with tokens) joined with runs + workflows
  //    Note: run_logs has no agent_id — we resolve model via workflow.steps[].agent_id
  const { data: logs } = await db
    .from('run_logs')
    .select(`
      step_name,
      step_order,
      tokens_in,
      tokens_out,
      created_at,
      runs (
        id,
        workflow_id,
        workflows ( name, steps )
      )
    `)
    .gte('created_at', lastMonthStart)
    .eq('role', 'assistant')
    .not('tokens_in', 'is', null)
    .order('created_at', { ascending: false })

  // 2. Fetch all agents once (for model lookup)
  const { data: allAgents } = await db
    .from('agents')
    .select('id, name, model')

  const agentById = new Map((allAgents ?? []).map((a: { id: string; name: string; model: string }) => [a.id, a]))

  // 3. Aggregate
  const agentMap = new Map<string, AgentCost>()
  let totalCostThisMonth = 0
  let totalCostLastMonth = 0
  let totalTokensIn = 0
  let totalTokensOut = 0

  for (const log of (logs ?? []) as any[]) {
    const run = Array.isArray(log.runs) ? log.runs[0] : log.runs
    if (!run) continue

    const workflow = Array.isArray(run.workflows) ? run.workflows[0] : run.workflows
    const steps: any[] = workflow?.steps ?? []

    // Find which agent ran this step
    const step = steps.find((s: any) => s.order === log.step_order)
    const agent = step ? agentById.get(step.agent_id) : null

    const tokensIn = log.tokens_in ?? 0
    const tokensOut = log.tokens_out ?? 0
    const model = (agent as any)?.model ?? 'claude-sonnet-4-6'
    const cost = calculateCost(model, tokensIn, tokensOut)
    const month = log.created_at.slice(0, 7)

    if (month === thisMonth) {
      totalCostThisMonth += cost
      totalTokensIn += tokensIn
      totalTokensOut += tokensOut

      const agentName = (agent as any)?.name ?? log.step_name ?? 'Okänd agent'
      const key = agentName
      const existing = agentMap.get(key)
      if (existing) {
        existing.tokensIn += tokensIn
        existing.tokensOut += tokensOut
        existing.cost += cost
        existing.runs += 1
      } else {
        agentMap.set(key, {
          agent: agentName,
          model,
          workflow: workflow?.name ?? '—',
          tokensIn,
          tokensOut,
          cost,
          runs: 1,
        })
      }
    } else if (month === lastMonth) {
      totalCostLastMonth += calculateCost(model, tokensIn, tokensOut)
    }
  }

  const agentCosts = Array.from(agentMap.values()).sort((a, b) => b.cost - a.cost)
  const costDiff = totalCostLastMonth > 0
    ? ((totalCostThisMonth - totalCostLastMonth) / totalCostLastMonth) * 100
    : 0

  const monthLabel = now.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' })

  return (
    <OSPage className="animate-fade-in">
      <OSLayer layer="hero">
        <div>
          <p className="eyebrow eyebrow-accent mb-3">Telemetry · cost intelligence</p>
          <h1 className="text-3xl 2xl:text-4xl font-bold tracking-tight">Kostnadsöversikt</h1>
          <p className="text-sm 2xl:text-base text-zinc-400 mt-2 max-w-2xl">
            {monthLabel} — token-användning och API-kostnader
          </p>
        </div>
      </OSLayer>

      {/* Stat cards — horizontal 4-up cluster, expands to 5 on ultrawide   */}
      <OSLayer layer="operational" className="grid grid-cols-2 lg:grid-cols-4 3xl:grid-cols-5 gap-4 lg:gap-5">
        <StatCard
          icon={<DollarSign className="w-4 h-4" />}
          label="Kostnad denna månad"
          value={formatCost(totalCostThisMonth)}
          sub={costDiff !== 0 ? `${costDiff > 0 ? '+' : ''}${costDiff.toFixed(0)}% vs förra månaden` : 'Förra månaden: —'}
          trend={costDiff}
        />
        <StatCard
          icon={<Cpu className="w-4 h-4" />}
          label="Input-tokens"
          value={formatTokens(totalTokensIn)}
          sub="Denna månad"
        />
        <StatCard
          icon={<Zap className="w-4 h-4" />}
          label="Output-tokens"
          value={formatTokens(totalTokensOut)}
          sub="Denna månad"
        />
        <StatCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Förra månaden"
          value={formatCost(totalCostLastMonth)}
          sub="Total kostnad"
        />
      </OSLayer>

      {/* Per-agent breakdown — intelligence layer                          */}
      <OSLayer layer="intelligence" className="space-y-5">
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold">Kostnad per agent — {monthLabel}</h2>
          <span className="text-xs text-muted-foreground">{agentCosts.length} agenter aktiva</span>
        </div>

        {agentCosts.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Inga körningar denna månad ännu
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
                  <th className="text-left px-5 py-3">Agent</th>
                  <th className="text-left px-4 py-3">Modell</th>
                  <th className="text-right px-4 py-3">Körningar</th>
                  <th className="text-right px-4 py-3">Input-tokens</th>
                  <th className="text-right px-4 py-3">Output-tokens</th>
                  <th className="text-right px-5 py-3">Kostnad</th>
                </tr>
              </thead>
              <tbody>
                {agentCosts.map((row, i) => {
                  const maxCost = agentCosts[0].cost
                  const pct = maxCost > 0 ? (row.cost / maxCost) * 100 : 0
                  const pricing = getModelPricing(row.model)
                  return (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3">
                        <div className="font-medium">{row.agent}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-48">{row.workflow}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-xs rounded-full px-2 py-0.5 bg-muted border border-border">
                          {pricing.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{row.runs}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatTokens(row.tokensIn)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatTokens(row.tokensOut)}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="font-mono text-xs font-medium w-16 text-right">{formatCost(row.cost)}</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/20 text-xs font-medium">
                  <td className="px-5 py-3 text-muted-foreground" colSpan={2}>Totalt</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{agentCosts.reduce((s, r) => s + r.runs, 0)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{formatTokens(totalTokensIn)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{formatTokens(totalTokensOut)}</td>
                  <td className="px-5 py-3 text-right font-mono">{formatCost(totalCostThisMonth)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Pricing reference */}
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">Prisreferens</h2>
        </div>
        <div className="p-5 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
          {[
            ['Claude Sonnet 4.6', '$3 / 1M input · $15 / 1M output'],
            ['Claude Haiku 4.5',  '$0.80 / 1M input · $4 / 1M output'],
            ['Claude Opus 4.6',   '$15 / 1M input · $75 / 1M output'],
            ['GPT-4o',            '$2.50 / 1M input · $10 / 1M output'],
            ['GPT Image 1',       '$0.042 / bild (1024×1024, medium)'],
            ['DALL-E 2',          '$0.020 / bild (1024×1024)'],
          ].map(([model, price]) => (
            <div key={model} className="flex justify-between gap-4 py-1.5 border-b border-border/40 last:border-0">
              <span className="font-medium text-foreground/70">{model}</span>
              <span className="text-right">{price}</span>
            </div>
          ))}
        </div>
      </section>
      </OSLayer>
    </OSPage>
  )
}

function StatCard({ icon, label, value, sub, trend }: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  trend?: number
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className="text-2xl font-bold tracking-tight">{value}</div>
      {sub && (
        <p className={`text-xs ${trend !== undefined && trend > 0 ? 'text-amber-500' : trend !== undefined && trend < 0 ? 'text-green-500' : 'text-muted-foreground'}`}>
          {sub}
        </p>
      )}
    </div>
  )
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}
