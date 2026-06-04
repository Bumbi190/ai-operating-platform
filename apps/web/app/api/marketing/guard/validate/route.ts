/**
 * POST /api/marketing/guard/validate — köa en Brand/Canon Guard-körning.
 *
 * Skapar en durable run (kind=marketing_brand_guard) för ett utkast. Drainern
 * kör handlern som skriver en guard_reports-rad. (Normalt köas detta automatiskt
 * av Channel Drafter när ett utkast skapats — denna endpoint är för omkörning.)
 *
 * Body: { draft_id }   ⛔ Endast Familje-Stunden.
 */
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as { draft_id?: string }
  const draftId = (body.draft_id ?? '').trim()
  if (!draftId) return NextResponse.json({ error: 'draft_id krävs' }, { status: 400 })

  const db = createAdminClient()
  const { data: draft } = await db.from('draft_posts').select('id, project_id').eq('id', draftId).maybeSingle()
  const d = draft as { id?: string; project_id?: string } | null
  if (!d?.id) return NextResponse.json({ error: 'draft hittades inte' }, { status: 404 })

  const { data: run, error } = await (db.from('runs') as any).insert({
    project_id: d.project_id,
    workflow_id: null,
    kind: 'marketing_brand_guard',
    status: 'pending',
    input: { draft_id: d.id },
    context: {},
  }).select('id').single()

  if (error || !run) return NextResponse.json({ error: `Kunde inte köa guard: ${error?.message ?? 'okänt'}` }, { status: 500 })
  return NextResponse.json({ run_id: (run as { id: string }).id, status: 'pending' }, { status: 202 })
}
