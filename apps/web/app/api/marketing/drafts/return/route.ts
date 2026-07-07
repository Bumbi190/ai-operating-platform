/**
 * POST /api/marketing/drafts/return — återlämna ett utkast till Channel Drafter.
 *
 * Markerar utkastet 'returned' och köar en ny Channel Drafter-run för samma brief
 * (handlern skapar version+1). Används när Guard/operatör underkänner. Detta är
 * den enda "Return to Drafter"-mekaniken i Fas 3 (Action Center-UI = Fas 4).
 *
 * Body: { draft_id, note? }   ⛔ Endast Familje-Stunden.
 */
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as { draft_id?: string; note?: string }
  const draftId = (body.draft_id ?? '').trim()
  if (!draftId) return NextResponse.json({ error: 'draft_id krävs' }, { status: 400 })

  const db = createAdminClient()
  const { data: draft } = await db.from('draft_posts').select('id, project_id, brief_id').eq('id', draftId).maybeSingle()
  const d = draft as { id?: string; project_id?: string; brief_id?: string } | null
  if (!d?.id) return NextResponse.json({ error: 'Utkast hittades inte' }, { status: 404 })

  await db.from('draft_posts').update({ status: 'returned', updated_at: new Date().toISOString() }).eq('id', d.id)
  const { data: run, error } = await (db.from('runs') as any).insert({
    project_id: d.project_id, workflow_id: null, kind: 'marketing_channel_drafter',
    status: 'pending', input: { brief_id: d.brief_id, returned_from: d.id, note: body.note ?? null }, context: {},
  }).select('id').single()

  if (error || !run) return NextResponse.json({ error: `Kunde inte köa omkörning: ${error?.message ?? 'okänt'}` }, { status: 500 })
  return NextResponse.json({ run_id: (run as { id: string }).id, status: 'pending', returned: d.id }, { status: 202 })
}
