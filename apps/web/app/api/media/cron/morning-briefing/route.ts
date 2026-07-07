/**
 * GET /api/media/cron/morning-briefing
 *
 * Genererar daglig VD-briefing med Claude och sparar i morning_briefings.
 * Schema: 06:00 UTC varje dag (06:30 morgon-news kör 30 min senare).
 *
 * Samlar:
 *   - Intäkter senaste 24h (revenue_events)
 *   - AI-kostnader senaste 24h (beräknat från run_logs)
 *   - Misslyckade körningar senaste 24h
 *   - Väntande godkännanden
 *   - Aktiva leads (GainPilot)
 *
 * Protected by: Authorization: Bearer {CRON_SECRET}
 */

import { NextResponse }   from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Anthropic }      from '@anthropic-ai/sdk'
import { calculateCost }  from '@/lib/ai/pricing'
import { logLlmCost }     from '@/lib/cost/track'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db     = createAdminClient()
  const claude = new Anthropic()
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // ── Hämta data parallellt ─────────────────────────────────────────────────
  const [
    projectsRes,
    revenueRes,
    logsRes,
    failedRunsRes,
    approvalsRes,
    leadsRes,
  ] = await Promise.allSettled([
    db.from('projects').select('id, name, color'),
    db.from('revenue_events')
      .select('amount_sek, currency, project_id')
      .gte('occurred_at', since24h),
    db.from('run_logs')
      .select('tokens_in, tokens_out, runs!inner(project_id, status)')
      .gte('created_at', since24h)
      .eq('role', 'assistant'),
    db.from('runs')
      .select('id, project_id, workflows(name)')
      .eq('status', 'failed')
      .gte('created_at', since24h),
    db.from('approvals' as any)
      .select('id')
      .eq('status', 'pending'),
    db.from('leads')
      .select('status, estimated_value, project_id')
      .in('status', ['new', 'qualified', 'warm']),
  ])

  const projects    = projectsRes.status    === 'fulfilled' ? (projectsRes.value.data ?? [])    : []
  const revenue24h  = revenueRes.status     === 'fulfilled' ? (revenueRes.value.data ?? [])     : []
  const logs24h     = logsRes.status        === 'fulfilled' ? (logsRes.value.data ?? [])        : []
  const failedRuns  = failedRunsRes.status  === 'fulfilled' ? (failedRunsRes.value.data ?? [])  : []
  const approvals   = approvalsRes.status   === 'fulfilled' ? (approvalsRes.value.data ?? [])   : []
  const activeLeads = leadsRes.status       === 'fulfilled' ? (leadsRes.value.data ?? [])       : []

  // ── Beräkna nyckeltal ─────────────────────────────────────────────────────
  const totalRevenue24h = revenue24h.reduce((s: number, e: any) => s + Number(e.amount_sek ?? 0), 0)

  const totalCost24h = (logs24h as any[]).reduce((s, log) => {
    const runs = Array.isArray(log.runs) ? log.runs[0] : log.runs
    const model = 'claude-sonnet-4-6' // default
    const cost = calculateCost(model, log.tokens_in ?? 0, log.tokens_out ?? 0)
    return s + cost
  }, 0)

  const net24h = totalRevenue24h - totalCost24h * 10.5 // USD → SEK (approx)

  // Bästa verksamhet (mest intäkt 24h)
  const revenueByProject: Record<string, number> = {}
  for (const e of revenue24h as any[]) {
    revenueByProject[e.project_id] = (revenueByProject[e.project_id] ?? 0) + Number(e.amount)
  }
  const topProjectId  = Object.entries(revenueByProject).sort(([,a],[,b]) => b - a)[0]?.[0]
  const topProjectName = projects.find((p: any) => p.id === topProjectId)?.name ?? null

  const pipelineValue = (activeLeads as any[]).reduce((s, l) => s + Number(l.estimated_value ?? 0), 0)

  // ── Bygg datakontext för Claude ───────────────────────────────────────────
  const context = [
    `Intäkter senaste 24h: ${totalRevenue24h.toFixed(0)} SEK`,
    `AI-kostnad senaste 24h: ${(totalCost24h * 10.5).toFixed(2)} SEK (${totalCost24h.toFixed(4)} USD)`,
    `Netto senaste 24h: ${net24h.toFixed(0)} SEK`,
    topProjectName ? `Bäst presterande verksamhet: ${topProjectName}` : 'Ingen intäkt registrerad senaste 24h',
    `Misslyckade körningar: ${failedRuns.length}`,
    `Väntande godkännanden: ${approvals.length}`,
    `Aktiva leads (GainPilot): ${(activeLeads as any[]).length} (pipeline-värde: ${pipelineValue.toFixed(0)} SEK)`,
  ].join('\n')

  // ── Generera briefing med Claude ──────────────────────────────────────────
  const msg = await claude.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Du är en VD-assistent för André som driver autonoma AI-företag via Omnira.
Skriv en KORT daglig briefing på svenska (max 120 ord). Direkt, konkret, inga floskler.
Format:
- Rad 1: "God morgon André. [1 mening om status]"
- Intäkter igår: X kr
- AI-kostnad igår: X kr
- Netto: X kr
- Prioritet: [viktigaste åtgärden idag baserat på data]
- Bäst: [vad som gick bra]

Data:
${context}`,
    }],
  })

  void logLlmCost('claude-haiku-4-5-20251001', msg.usage, { projectId: null, agent: 'CFO Briefing', operation: 'Morning Briefing' })

  const summary = msg.content[0].type === 'text' ? msg.content[0].text : ''

  // ── Spara briefing ────────────────────────────────────────────────────────
  await db.from('morning_briefings').insert({
    summary,
    revenue_24h:  totalRevenue24h,
    cost_24h:     totalCost24h * 10.5,
    net_24h:      net24h,
    top_business: topProjectName,
    top_action:   `${approvals.length} godkännanden väntande · ${failedRuns.length} fel · ${(activeLeads as any[]).length} leads`,
    data_json:    { revenue24h, failedRuns, approvals: approvals.length, activeLeads: (activeLeads as any[]).length, pipelineValue },
    generated_at: new Date().toISOString(),
  })

  console.log(`[cron/morning-briefing] Genererad: ${totalRevenue24h} SEK intäkt, ${totalCost24h.toFixed(4)} USD kostnad`)

  return NextResponse.json({
    status:   'ok',
    summary:  summary.slice(0, 100) + '...',
    revenue:  totalRevenue24h,
    cost_usd: totalCost24h,
    net_sek:  net24h,
  })
}
