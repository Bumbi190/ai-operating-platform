/**
 * POST /api/marketing/plans/[id]/generate-drafts — fan-out till Channel Drafter.
 *
 * Köar EN durable Channel Drafter-run (kind=marketing_channel_drafter) per brief
 * i planen. Varje Drafter-run skriver ett draft_post och auto-kedjar en Brand
 * Guard-run. Ett anrop → alla utkast + guard-rapporter → Action Center.
 *
 * Body (valfritt): { all?: boolean }  — true = köa om ALLA briefs (annars bara
 * de som inte redan har ett utkast, status 'planned'/'needs_input').
 * ⛔ Endast Familje-Stunden. Inget fire-and-forget (allt går via runs/drain).
 */
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as { all?: boolean }
  const planId = params.id

  const db = createAdminClient()
  const { data: plan } = await db
    .from('campaign_plans')
    .select('id, project_id, plan_key')
    .eq('id', planId)
    .maybeSingle()
  const p = plan as { id?: string; project_id?: string; plan_key?: string } | null
  if (!p?.id) return NextResponse.json({ error: 'Plan hittades inte' }, { status: 404 })

  // Briefs att köa: alla, eller bara de som inte redan draftats.
  let q = db.from('campaign_briefs').select('id, status').eq('plan_id', p.id)
  if (!body.all) q = q.in('status', ['planned', 'needs_input'])
  const { data: briefsRaw } = await q
  const briefs = (briefsRaw ?? []) as Array<{ id: string; status: string }>

  if (briefs.length === 0) {
    return NextResponse.json({ ok: true, queued: 0, note: 'Inga briefs att köa (alla är redan draftade — använd { "all": true } för att köra om).' })
  }

  // Markera och köa en Drafter-run per brief.
  const runRows = briefs.map((b) => ({
    project_id: p.project_id,
    workflow_id: null,
    kind: 'marketing_channel_drafter' as const,
    status: 'pending' as const,
    input: { brief_id: b.id },
    context: {},
  }))

  await db.from('campaign_briefs').update({ status: 'drafting' }).in('id', briefs.map((b) => b.id))
  const { error } = await (db.from('runs') as any).insert(runRows)
  if (error) return NextResponse.json({ error: `Kunde inte köa drafters: ${error.message}` }, { status: 500 })

  return NextResponse.json({ ok: true, plan_key: p.plan_key, queued: briefs.length, status: 'pending' }, { status: 202 })
}
