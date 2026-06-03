/**
 * POST /api/marketing/plans/generate — köa en Campaign Planner-körning.
 *
 * Skapar en durable run (kind=marketing_campaign_planner, status=pending) för
 * Familje-Stunden. pg_cron-drainern (/api/runs/drain) claimar och kör handlern,
 * som bygger campaign_plans (draft) + campaign_briefs. Inget fire-and-forget.
 *
 * Body: { target_month: "YYYY-MM" }   ⛔ Endast Familje-Stunden.
 */
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

const FAMILJE_SLUG = 'familje-stunden'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as { target_month?: string }
  const targetMonth = (body.target_month ?? '').trim()
  if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
    return NextResponse.json({ error: 'target_month krävs i formatet YYYY-MM' }, { status: 400 })
  }

  const db = createAdminClient()
  const { data: project } = await db.from('projects').select('id').eq('slug', FAMILJE_SLUG).maybeSingle()
  const projectId = (project as { id?: string } | null)?.id
  if (!projectId) return NextResponse.json({ error: `Projekt ${FAMILJE_SLUG} saknas` }, { status: 404 })

  const { data: run, error } = await (db.from('runs') as any).insert({
    project_id: projectId,
    workflow_id: null,
    kind: 'marketing_campaign_planner',
    status: 'pending',
    input: { target_month: targetMonth },
    context: {},
  }).select('id').single()

  if (error || !run) {
    return NextResponse.json({ error: `Kunde inte köa planner: ${error?.message ?? 'okänt fel'}` }, { status: 500 })
  }
  return NextResponse.json({ run_id: (run as { id: string }).id, status: 'pending', target_month: targetMonth }, { status: 202 })
}
