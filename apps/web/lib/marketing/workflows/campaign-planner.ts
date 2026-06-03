/**
 * Campaign Planner — workflow-handler (Fas 2).
 *
 * Läser run.input.target_month + senaste revenue_snapshot, bygger en
 * deterministisk KB-driven kampanjplan (buildCampaignPlan) och persisterar
 * campaign_plans (draft) + campaign_briefs. Idempotent per (project, plan_key):
 * en befintlig DRAFT regenereras (gamla briefs ersätts); en APPROVED plan rörs ej.
 *
 * Kastar vid fel → drainern äger retry/failed. ⛔ The Prompt berörs aldrig.
 */
import 'server-only'
import type { AdminClient, MarketingHandler } from './index'
import type { Run } from '@/lib/supabase/types'
import { buildCampaignPlan, type RevenueSignals } from '@/lib/marketing/planner'

const FAMILJE_SLUG = 'familje-stunden'

async function readRevenueSignals(db: AdminClient, projectId: string): Promise<RevenueSignals> {
  const { data } = await db
    .from('revenue_snapshots')
    .select('active_subscribers, trialing, mrr_sek, churned_this_month, raw')
    .eq('project_id', projectId)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) {
    return { available: false, active_subscribers: null, trialing: null, mrr_sek: null, trial_to_paid_rate: null, churn_rate: null }
  }
  const raw = (data.raw ?? {}) as Record<string, unknown>
  const trialToPaid = typeof raw.trialToPaidRate === 'number' ? (raw.trialToPaidRate as number) : null
  const churned = (data as { churned_this_month?: number | null }).churned_this_month ?? 0
  const active = (data as { active_subscribers?: number | null }).active_subscribers ?? 0
  return {
    available: true,
    active_subscribers: active,
    trialing: (data as { trialing?: number | null }).trialing ?? 0,
    mrr_sek: (data as { mrr_sek?: number | null }).mrr_sek ?? null,
    trial_to_paid_rate: trialToPaid,
    churn_rate: active > 0 ? churned / active : 0,
  }
}

export const campaignPlannerHandler: MarketingHandler = async (db: AdminClient, run: Run) => {
  const targetMonth = String((run.input as Record<string, unknown>)?.target_month ?? '').trim()
  if (!targetMonth) throw new Error('Campaign Planner: saknar input.target_month (YYYY-MM)')

  // Projekt-scope (familje-stunden).
  const { data: project } = await db.from('projects').select('id').eq('slug', FAMILJE_SLUG).maybeSingle()
  const projectId = (project as { id?: string } | null)?.id
  if (!projectId) throw new Error(`Campaign Planner: projekt ${FAMILJE_SLUG} saknas`)

  const rev = await readRevenueSignals(db, projectId)
  const built = buildCampaignPlan(targetMonth, rev)

  // Idempotens: hantera befintlig plan för plan_key.
  const { data: existing } = await db
    .from('campaign_plans')
    .select('id, status')
    .eq('project_id', projectId)
    .eq('plan_key', built.plan_key)
    .maybeSingle()

  const ex = existing as { id?: string; status?: string } | null
  if (ex?.id && ex.status === 'approved') {
    await db.from('run_logs').insert({
      run_id: run.id, role: 'system',
      content: `⏭️ Plan ${built.plan_key} är redan APPROVED — regenererar inte (skydd).`,
    })
    return
  }
  if (ex?.id) {
    // Ersätt befintlig draft: ta bort (briefs cascade) och bygg om.
    await db.from('campaign_plans').delete().eq('id', ex.id)
  }

  // Skapa planraden.
  const { data: planRow, error: planErr } = await (db.from('campaign_plans') as any).insert({
    project_id: projectId,
    run_id: run.id,
    plan_key: built.plan_key,
    target_month: built.target_month,
    theme_key: built.theme_key,
    theme_name: built.theme_name,
    next_theme_key: built.next_theme_key,
    status: 'draft',
    campaign_angle: built.campaign_angle,
    revenue_strategy: built.revenue_strategy,
    gaps: built.gaps,
    human_input_needed: built.human_input_needed,
    canon_level: built.canon_level,
    generated_at: new Date().toISOString(),
  }).select('id').single()
  if (planErr) throw new Error(`Campaign Planner: kunde inte spara plan: ${planErr.message}`)
  const planId = (planRow as { id: string }).id

  // Skapa briefs.
  const briefRows = built.briefs.map((b) => ({
    project_id: projectId,
    plan_id: planId,
    brief_key: b.brief_key,
    post_key: b.post_key,
    channel: b.channel,
    format: b.format,
    beat: b.beat,
    scheduled_week: b.scheduled_week,
    scheduled_date: b.scheduled_date,
    objective: b.objective,
    brief_payload: b.brief_payload,
    canon_level: b.canon_level,
    status: 'planned' as const,
  }))
  const { error: briefErr } = await (db.from('campaign_briefs') as any).insert(briefRows)
  if (briefErr) throw new Error(`Campaign Planner: kunde inte spara briefs: ${briefErr.message}`)

  const blocking = built.gaps.filter((g) => g.blocking).length
  await db.from('run_logs').insert({
    run_id: run.id, role: 'system',
    content: `✅ Plan ${built.plan_key} (${built.theme_name}) sparad: ${briefRows.length} briefs, ${built.gaps.length} gaps (${blocking} blockerande). status=draft.`,
  })
}
