/**
 * POST /api/marketing/drafts/generate — köa en Channel Drafter-körning för en brief.
 *
 * Skapar en durable run (kind=marketing_channel_drafter). Drainern kör handlern
 * som skriver draft_posts och köar Brand Guard. Inget fire-and-forget.
 *
 * Body: { brief_id }   ⛔ Endast Familje-Stunden.
 */
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as { brief_id?: string }
  const briefId = (body.brief_id ?? '').trim()
  if (!briefId) return NextResponse.json({ error: 'brief_id krävs' }, { status: 400 })

  const db = createAdminClient()
  const { data: brief } = await db.from('campaign_briefs').select('id, project_id').eq('id', briefId).maybeSingle()
  const b = brief as { id?: string; project_id?: string } | null
  if (!b?.id) return NextResponse.json({ error: 'brief hittades inte' }, { status: 404 })

  await db.from('campaign_briefs').update({ status: 'drafting' }).eq('id', b.id)
  const { data: run, error } = await (db.from('runs') as any).insert({
    project_id: b.project_id, workflow_id: null, kind: 'marketing_channel_drafter',
    status: 'pending', input: { brief_id: b.id }, context: {},
  }).select('id').single()

  if (error || !run) return NextResponse.json({ error: `Kunde inte köa drafter: ${error?.message ?? 'okänt'}` }, { status: 500 })
  return NextResponse.json({ run_id: (run as { id: string }).id, status: 'pending' }, { status: 202 })
}
