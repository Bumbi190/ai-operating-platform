/**
 * Brand / Canon Guard — workflow-handler (Fas 3, WF3).
 *
 * Läser ett draft_post (run.input.draft_id) + plan-kontext, kör den rena
 * evaluateGuard() och persisterar en guard_reports-rad. Guard MODIFIERAR ALDRIG
 * draft_payload (copy) — den uppdaterar endast lifecycle-status (guard_passed /
 * guard_failed) enligt implementationsplanen, och skriver sin rapport.
 *
 * Kastar vid fel → drainern äger retry/failed. ⛔ The Prompt = CRITICAL.
 */
import 'server-only'
import type { AdminClient, MarketingHandler } from './index'
import type { Run } from '@/lib/supabase/types'
import { evaluateGuard } from '@/lib/marketing/guard'

export const brandGuardHandler: MarketingHandler = async (db: AdminClient, run: Run) => {
  const draftId = String((run.input as Record<string, unknown>)?.draft_id ?? '').trim()
  if (!draftId) throw new Error('Brand Guard: saknar input.draft_id')

  const { data: draft } = await db
    .from('draft_posts')
    .select('id, project_id, draft_key, brief_id, draft_payload')
    .eq('id', draftId)
    .maybeSingle()
  const d = draft as { id?: string; project_id?: string; draft_key?: string; brief_id?: string; draft_payload?: Record<string, unknown> } | null
  if (!d?.id) throw new Error(`Brand Guard: draft ${draftId} saknas`)

  // Plan-kontext (tema + förväntad beat/kanal/format) via brief → plan.
  const { data: brief } = await db
    .from('campaign_briefs')
    .select('plan_id, channel, format, beat')
    .eq('id', d.brief_id as string)
    .maybeSingle()
  const b = brief as { plan_id?: string; channel?: string; format?: string; beat?: string } | null
  let themeKey: string | null = null
  if (b?.plan_id) {
    const { data: plan } = await db.from('campaign_plans').select('theme_key').eq('id', b.plan_id).maybeSingle()
    themeKey = (plan as { theme_key?: string } | null)?.theme_key ?? null
  }

  const result = evaluateGuard((d.draft_payload ?? {}) as Record<string, unknown>, {
    theme_key: themeKey,
    expected: { beat: b?.beat, channel: b?.channel, format: b?.format },
  })

  // Persistera rapport (upsert på draft_id — senaste rapporten gäller).
  const reportRow = {
    project_id: d.project_id,
    run_id: run.id,
    draft_id: d.id,
    report_key: `guard-${d.draft_key}`,
    verdict: result.verdict,
    score: result.score,
    score_breakdown: result.score_breakdown,
    violations: result.violations,
    warnings: result.warnings,
    gap_flags: result.gap_flags,
    checks: result.checks,
    recommendation: result.recommendation,
    evaluated_at: new Date().toISOString(),
  }
  const { error: repErr } = await (db.from('guard_reports') as any).upsert(reportRow, { onConflict: 'draft_id' })
  if (repErr) throw new Error(`Brand Guard: kunde inte spara rapport: ${repErr.message}`)

  // Endast lifecycle-status uppdateras (ALDRIG copy/draft_payload).
  const newStatus = result.verdict === 'rejected' ? 'guard_failed' : 'guard_passed'
  await db.from('draft_posts').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', d.id)

  await db.from('run_logs').insert({
    run_id: run.id, role: 'system',
    content: `🛡️ Guard ${d.draft_key}: ${result.verdict} (score ${result.score}), ${result.violations.length} violations, ${result.warnings.length} warnings → draft.status=${newStatus}.`,
  })
}
