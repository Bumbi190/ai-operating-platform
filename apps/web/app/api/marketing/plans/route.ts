/**
 * GET /api/marketing/plans — läs kampanjplaner (Familje-Stunden).
 *
 * Query:
 *   ?month=YYYY-MM   → en plan + dess briefs
 *   ?plan_id=<uuid>  → en plan + dess briefs
 *   (inget)          → lista senaste planer (utan briefs)
 *
 * Read-only inspektion (Fas 2). ⛔ Endast Familje-Stunden.
 */
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

const FAMILJE_SLUG = 'familje-stunden'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const month = url.searchParams.get('month')
  const planId = url.searchParams.get('plan_id')

  const db = createAdminClient()
  const { data: project } = await db.from('projects').select('id').eq('slug', FAMILJE_SLUG).maybeSingle()
  const projectId = (project as { id?: string } | null)?.id
  if (!projectId) return NextResponse.json({ error: `Projekt ${FAMILJE_SLUG} saknas` }, { status: 404 })

  // Lista-läge.
  if (!month && !planId) {
    const { data: plans } = await db
      .from('campaign_plans')
      .select('id, plan_key, target_month, theme_key, theme_name, status, generated_at')
      .eq('project_id', projectId)
      .order('target_month', { ascending: false })
      .limit(24)
    return NextResponse.json({ plans: plans ?? [] })
  }

  // Detalj-läge.
  let q = db.from('campaign_plans').select('*').eq('project_id', projectId)
  q = planId ? q.eq('id', planId) : q.eq('plan_key', `fs-${month}`)
  const { data: plan } = await q.order('generated_at', { ascending: false }).limit(1).maybeSingle()
  if (!plan) return NextResponse.json({ error: 'Plan hittades inte' }, { status: 404 })

  const { data: briefs } = await db
    .from('campaign_briefs')
    .select('*')
    .eq('plan_id', (plan as { id: string }).id)
    .order('brief_key', { ascending: true })

  return NextResponse.json({ plan, briefs: briefs ?? [] })
}
