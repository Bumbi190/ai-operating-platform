/**
 * Marketing Review — datalager för Action Center (Fas 4).
 *
 * Bygger granskningsköer (Väntar / Godkända / Avvisade / Behöver underlag) för
 * Familje-Stunden, fokuserat på AKTIV månad + NÄSTA månad. Härleder allt ur
 * draft_posts + guard_reports + campaign_briefs/plans + runs (audit). Read-only.
 *
 * ⛔ Endast Familje-Stunden. Ingen publicering/scheduling/Meta här.
 */
import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>
const FAMILJE_SLUG = 'familje-stunden'

const MONTH_SV = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december']
const FORMAT_LABEL: Record<string, string> = { reel: 'Reel', carousel: 'Karusell', story: 'Story', fb_post: 'Inlägg', single_post: 'Inlägg', fb_event: 'Event' }
const CHANNEL_LABEL: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook' }

export type ReviewQueue = 'pending' | 'approved' | 'rejected' | 'needs_input'

export interface ReviewViolation { severity: string; explanation: string }
export interface AuditStep { label: string; run_id: string | null; at: string | null; status: string | null }

export interface ReviewCard {
  draft_id: string
  draft_key: string
  channel: string
  channel_label: string
  format: string
  format_label: string
  beat: string | null
  status: string
  version: number
  queue: ReviewQueue
  month_label: string
  theme_name: string | null
  plan_key: string | null
  score: number | null
  verdict: string | null
  critical: boolean
  can_approve: boolean
  caption_preview: string
  caption_full: string
  cta: { label: string | null; type: string | null; landing_url_slot: string | null }
  asset_refs: Array<{ ref: string | null; status: string }>
  violations: ReviewViolation[]
  warnings: ReviewViolation[]
  blocking_gaps: string[]
  audit: AuditStep[]
  created_at: string
}

export interface ReviewData {
  months: Array<{ label: string; plan_key: string; theme_name: string | null; plan_status: string | null }>
  counts: { pending: number; approved: number; rejected: number; needs_input: number }
  cards: ReviewCard[]
}

function monthKeys(now: Date): { active: string; next: string } {
  const y = now.getUTCFullYear(); const m = now.getUTCMonth() // 0-11
  const active = `fs-${y}-${String(m + 1).padStart(2, '0')}`
  const nd = new Date(Date.UTC(y, m + 1, 1))
  const next = `fs-${nd.getUTCFullYear()}-${String(nd.getUTCMonth() + 1).padStart(2, '0')}`
  return { active, next }
}

function monthLabelFromPlanKey(planKey: string): string {
  const m = /^fs-\d{4}-(\d{2})$/.exec(planKey)
  if (!m) return planKey
  const name = MONTH_SV[Number(m[1]) - 1] ?? ''
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : planKey
}

function classifyQueue(status: string): ReviewQueue {
  if (status === 'approved') return 'approved'
  if (['rejected', 'guard_failed', 'returned'].includes(status)) return 'rejected'
  if (status === 'needs_input') return 'needs_input'
  return 'pending' // drafted, guard_passed
}

export async function getMarketingReview(db: AdminClient, now: Date = new Date()): Promise<ReviewData> {
  const { data: project } = await db.from('projects').select('id').eq('slug', FAMILJE_SLUG).maybeSingle()
  const projectId = (project as { id?: string } | null)?.id
  if (!projectId) return { months: [], counts: { pending: 0, approved: 0, rejected: 0, needs_input: 0 }, cards: [] }

  const { active, next } = monthKeys(now)
  const { data: plansRaw } = await db
    .from('campaign_plans')
    .select('id, plan_key, theme_name, status, run_id, target_month')
    .eq('project_id', projectId)
    .in('plan_key', [active, next])
  const plans = (plansRaw ?? []) as Array<{ id: string; plan_key: string; theme_name: string | null; status: string | null; run_id: string | null }>

  const months = [active, next].map((pk) => {
    const p = plans.find((x) => x.plan_key === pk)
    return { label: monthLabelFromPlanKey(pk), plan_key: pk, theme_name: p?.theme_name ?? null, plan_status: p?.status ?? null }
  })

  if (plans.length === 0) return { months, counts: { pending: 0, approved: 0, rejected: 0, needs_input: 0 }, cards: [] }

  const planById = new Map(plans.map((p) => [p.id, p]))
  const planIds = plans.map((p) => p.id)

  const { data: briefsRaw } = await db
    .from('campaign_briefs').select('id, plan_id, brief_key').in('plan_id', planIds)
  const briefs = (briefsRaw ?? []) as Array<{ id: string; plan_id: string; brief_key: string }>
  const briefById = new Map(briefs.map((b) => [b.id, b]))
  const briefIds = briefs.map((b) => b.id)
  if (briefIds.length === 0) return { months, counts: { pending: 0, approved: 0, rejected: 0, needs_input: 0 }, cards: [] }

  const { data: draftsRaw } = await db
    .from('draft_posts')
    .select('id, brief_id, draft_key, channel, format, beat, status, version, draft_payload, run_id, created_at')
    .in('brief_id', briefIds)
    .order('version', { ascending: false })
  const allDrafts = (draftsRaw ?? []) as Array<any>
  // Senaste versionen per brief.
  const latestByBrief = new Map<string, any>()
  for (const d of allDrafts) if (!latestByBrief.has(d.brief_id)) latestByBrief.set(d.brief_id, d)
  const drafts = [...latestByBrief.values()]
  const draftIds = drafts.map((d) => d.id)

  const reportByDraft = new Map<string, any>()
  if (draftIds.length) {
    const { data: reportsRaw } = await db
      .from('guard_reports')
      .select('draft_id, run_id, verdict, score, score_breakdown, violations, warnings, gap_flags, evaluated_at')
      .in('draft_id', draftIds)
    for (const r of (reportsRaw ?? []) as Array<any>) reportByDraft.set(r.draft_id, r)
  }

  // Runs för audit-tidslinje.
  const runIds = new Set<string>()
  for (const p of plans) if (p.run_id) runIds.add(p.run_id)
  for (const d of drafts) if (d.run_id) runIds.add(d.run_id)
  for (const r of reportByDraft.values()) if (r.run_id) runIds.add(r.run_id)
  const runMeta = new Map<string, { created_at: string | null; finished_at: string | null; status: string | null }>()
  if (runIds.size) {
    const { data: runsRaw } = await db.from('runs').select('id, created_at, finished_at, status').in('id', [...runIds])
    for (const r of (runsRaw ?? []) as Array<any>) runMeta.set(r.id, { created_at: r.created_at, finished_at: r.finished_at, status: r.status })
  }

  const counts = { pending: 0, approved: 0, rejected: 0, needs_input: 0 }
  const cards: ReviewCard[] = drafts.map((d) => {
    const brief = briefById.get(d.brief_id)
    const plan = brief ? planById.get(brief.plan_id) : undefined
    const rep = reportByDraft.get(d.id)
    const payload = (d.draft_payload ?? {}) as any
    const queue = classifyQueue(d.status)
    counts[queue]++

    const critical = Boolean(rep?.score_breakdown?.critical) || (Array.isArray(rep?.violations) && rep.violations.some((v: any) => v.severity === 'CRITICAL'))
    const captionFull = String(payload.caption_rendered ?? payload.caption?.hook ?? '')
    const planRunId = plan?.run_id ?? null

    return {
      draft_id: d.id,
      draft_key: d.draft_key,
      channel: d.channel,
      channel_label: CHANNEL_LABEL[d.channel] ?? d.channel,
      format: d.format,
      format_label: FORMAT_LABEL[d.format] ?? d.format,
      beat: d.beat,
      status: d.status,
      version: d.version,
      queue,
      month_label: plan ? monthLabelFromPlanKey(plan.plan_key) : '',
      theme_name: plan?.theme_name ?? null,
      plan_key: plan?.plan_key ?? null,
      score: rep?.score ?? null,
      verdict: rep?.verdict ?? null,
      critical,
      can_approve: Boolean(rep) && rep.verdict !== 'rejected' && !critical && queue === 'pending' && d.status === 'guard_passed',
      caption_preview: captionFull.slice(0, 100),
      caption_full: captionFull,
      cta: { label: payload.cta?.label ?? null, type: payload.cta?.type ?? null, landing_url_slot: payload.landing_url_slot ?? payload.cta?.landing_url_slot ?? null },
      asset_refs: Array.isArray(payload.asset_plan) ? payload.asset_plan.map((a: any) => ({ ref: a.asset_ref ?? null, status: a.status ?? 'okänd' })) : [],
      violations: Array.isArray(rep?.violations) ? rep.violations.map((v: any) => ({ severity: v.severity, explanation: v.explanation })) : [],
      warnings: Array.isArray(rep?.warnings) ? rep.warnings.map((w: any) => ({ severity: w.severity, explanation: w.explanation })) : [],
      blocking_gaps: Array.isArray(rep?.gap_flags) ? rep.gap_flags.filter((g: any) => g.blocking).map((g: any) => g.field) : [],
      audit: [
        { label: 'Planner', run_id: planRunId, at: planRunId ? runMeta.get(planRunId)?.finished_at ?? runMeta.get(planRunId)?.created_at ?? null : null, status: planRunId ? runMeta.get(planRunId)?.status ?? null : null },
        { label: 'Drafter', run_id: d.run_id, at: d.run_id ? runMeta.get(d.run_id)?.finished_at ?? runMeta.get(d.run_id)?.created_at ?? null : null, status: d.run_id ? runMeta.get(d.run_id)?.status ?? null : null },
        { label: 'Guard', run_id: rep?.run_id ?? null, at: rep?.run_id ? runMeta.get(rep.run_id)?.finished_at ?? runMeta.get(rep.run_id)?.created_at ?? null : rep?.evaluated_at ?? null, status: rep?.run_id ? runMeta.get(rep.run_id)?.status ?? null : null },
      ],
      created_at: d.created_at,
    }
  })

  // Sortera: Väntar först, sedan Behöver underlag, Avvisade, Godkända; nyast först inom grupp.
  const order: Record<ReviewQueue, number> = { pending: 0, needs_input: 1, rejected: 2, approved: 3 }
  cards.sort((a, b) => order[a.queue] - order[b.queue] || (b.created_at ?? '').localeCompare(a.created_at ?? ''))

  return { months, counts, cards }
}
