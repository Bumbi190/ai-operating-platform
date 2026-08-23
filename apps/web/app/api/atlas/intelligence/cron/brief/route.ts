/**
 * GET /api/atlas/intelligence/cron/brief
 *
 * Atlas EI daily brief cron — Epic 1.
 *
 * Wires the conformant EI producer chain to a live cron trigger. Each run:
 *   1. Global scope: brief → trend → insight → assessment → executive_brief
 *   2. Per active project: brief → trend → insight → assessment → executive_brief
 *
 * The apex executive_brief runs LAST in each scope: it synthesises the
 * artifacts the four steps above have just persisted (§13.1), so it must not
 * move earlier in the chain.
 *
 * Entirely deterministic — no LLM calls. Idempotent: re-running produces
 * a new artifact and supersedes the prior one (append-only store).
 *
 * Protected with: Authorization: Bearer {CRON_SECRET} (established pattern).
 * Scheduled by: pg_cron job 'omnira_atlas_intelligence_brief' (06:00 UTC).
 * See: supabase/migrations/20260629_200000_atlas_intelligence_cron.sql
 *
 * NOTE: Uses GET to match the omnira_cron.call_vercel infrastructure which
 * issues HTTP GET requests. The plan specifies POST but the existing call_vercel
 * helper uses net.http_get — GET is the correct choice for this infrastructure.
 *
 * Canonical refs: §5 (cognitive cycle trigger), §3 (Memory write cycle).
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runBriefProducer } from '@/lib/atlas/intelligence/producers/brief-orchestrator'
import { runTrendProducer } from '@/lib/atlas/intelligence/producers/trend-orchestrator'
import { runInsightProducer } from '@/lib/atlas/intelligence/producers/insight-orchestrator'
import { runAssessmentProducer } from '@/lib/atlas/intelligence/producers/assessment-orchestrator'
import { runExecutiveBriefProducer } from '@/lib/atlas/intelligence/producers/executive-brief-orchestrator'
import { createIntelligenceStore } from '@/lib/atlas/intelligence/postgres-store'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  // ── Authorization ─────────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const produced: string[] = []
  const errors:   string[] = []

  // Shared store instance for the whole run (single connection pool slot)
  const store = createIntelligenceStore()

  // ── Helper: run the full producer chain for one scope ─────────────────────
  async function runChain(projectId: string | null): Promise<void> {
    const scope = projectId ?? 'global'
    try {
      const brief = await runBriefProducer({ projectId, store })
      produced.push(`brief:${scope}:${brief.id}`)

      const trends = await runTrendProducer({ projectId, store })
      for (const t of trends) produced.push(`trend:${scope}:${t.body.metric}:${t.id}`)

      const insight = await runInsightProducer({ projectId, store })
      produced.push(`insight:${scope}:${insight.body.pattern}:${insight.id}`)

      const { risk, opportunity } = await runAssessmentProducer({ projectId, store })
      if (risk)        produced.push(`risk:${scope}:${risk.id}`)
      if (opportunity) produced.push(`opportunity:${scope}:${opportunity.id}`)

      // Apex last: reads what this run just persisted (EI-S1.2).
      const executiveBrief = await runExecutiveBriefProducer({ projectId, store })
      produced.push(`executive_brief:${scope}:${executiveBrief.id}`)

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[ei-cron] chain failed for scope=${scope}: ${msg}`)
      errors.push(`${scope}: ${msg}`)
    }
  }

  // ── 1. Global scope ───────────────────────────────────────────────────────
  await runChain(null)

  // ── 2. Per-project scope ──────────────────────────────────────────────────
  try {
    const db = createAdminClient()
    const { data: projects } = await db
      .from('projects')
      .select('id')
      .order('created_at', { ascending: true })

    for (const project of projects ?? []) {
      await runChain(project.id)
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[ei-cron] project list failed: ${msg}`)
    errors.push(`project-list: ${msg}`)
  }

  console.log(
    `[ei-cron] complete. produced=${produced.length} errors=${errors.length}`,
  )

  return NextResponse.json({
    ok:       errors.length === 0,
    produced,
    errors,
    producedAt: new Date().toISOString(),
  })
}
