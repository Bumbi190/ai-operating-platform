/**
 * GET /api/media/cron/insights
 *
 * Uppdaterar engagemang för publicerade inlägg — varje projekt med sin egen
 * verifierade credential (lib/media/insights.ts). Svaret innehåller aldrig någon del
 * av en credential: den tidigare diagnostiken med tokenets prefix och längd är borta.
 * Skyddad med: Authorization: Bearer {CRON_SECRET}
 *
 * Schemalägg via Supabase pg_cron (se 20260601_insights_cron.sql) — dagligen räcker.
 *
 * RUNTIME CONTRACT (insights recovery, 2026-09-15). pg_cron calls this through pg_net,
 * which gives up after 5 s; the function keeps running until it returns or Vercel stops
 * it at maxDuration — which it did every day at 60 s. Now:
 *   · the refresh starts no post after INSIGHTS_WORK_BUDGET_MS, and the slowest post
 *     (INSIGHTS_MAX_CALLS_PER_POST × INSIGHTS_REQUEST_TIMEOUT_MS) ends well before
 *     maxDuration;
 *   · the opportunity pass runs only before INSIGHTS_OPPORTUNITIES_BUDGET_MS;
 *   · HTTP 200 only when every selected post was fetched and written and the
 *     opportunity pass ran; otherwise 503;
 *   · one log line per run records every section's outcome — statuses, counts and
 *     project ids only, never provider text.
 */
import { NextResponse } from 'next/server'
import {
  INSIGHTS_OPPORTUNITIES_BUDGET_MS,
  INSIGHTS_WORK_BUDGET_MS,
  refreshAllInsights,
} from '@/lib/media/insights'
import { createAdminClient } from '@/lib/supabase/admin'
import { detectAndStoreOpportunities } from '@/lib/atlas/opportunities'
import { redactSecrets } from '@/lib/media/meta-errors'

export const dynamic     = 'force-dynamic'
export const maxDuration = 300

type OpportunitiesOutcome =
  | { detected: number; stored: number }
  | { error: string }
  | { skipped: 'time_budget_exhausted' }

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  const result = await refreshAllInsights({ deadlineAt: startedAt + INSIGHTS_WORK_BUDGET_MS })

  // Fas 4: efter att insights uppdaterats, låt Atlas samla möjligheter (best-effort).
  let opportunities: OpportunitiesOutcome
  if (Date.now() - startedAt >= INSIGHTS_OPPORTUNITIES_BUDGET_MS) {
    opportunities = { skipped: 'time_budget_exhausted' }
  } else {
    try {
      const db = createAdminClient()
      const { data: project } = await db.from('projects').select('id').eq('slug', 'ai-media-automation').maybeSingle()
      opportunities = await detectAndStoreOpportunities(db, project?.id)
    } catch (e) {
      opportunities = { error: e instanceof Error ? redactSecrets(e.message) : 'okänt fel' }
    }
  }

  const opportunitiesRan = 'detected' in opportunities
  const ok = result.complete && opportunitiesRan
  const sections = result.sections
    .map(s => `${s.platform}:${s.projectId ?? 'all'}:${s.status}${s.refusal ? `:${s.refusal}` : ''}:${s.written}/${s.planned ?? '-'}`)
    .join(',')
  console.log(
    `[cron/insights] ok=${ok} complete=${result.complete} seconds=${Math.round((Date.now() - startedAt) / 1000)}`
    + ` sections=${sections || 'none'}`
    + ` opportunities=${opportunitiesRan ? 'ran' : Object.keys(opportunities)[0]}`
    + (result.bindingsUnreadable ? ' bindings=unreadable' : ''),
  )

  return NextResponse.json(
    { ...result, firstError: result.firstError ? redactSecrets(result.firstError) : undefined, ok, opportunities },
    { status: ok ? 200 : 503 },
  )
}
