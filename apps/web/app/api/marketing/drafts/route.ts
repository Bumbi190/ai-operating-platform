/**
 * GET /api/marketing/drafts — läs utkast (Familje-Stunden).
 *
 * Query:
 *   ?draft_id=<uuid>  → ett utkast (full draft_payload)
 *   ?plan_id=<uuid>   → alla utkast för en plan
 *   ?brief_id=<uuid>  → utkast för en brief (alla versioner)
 *   (inget)           → senaste utkasten
 *
 * Read-only. ⛔ Endast Familje-Stunden.
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
  const draftId = url.searchParams.get('draft_id')
  const planId = url.searchParams.get('plan_id')
  const briefId = url.searchParams.get('brief_id')

  const db = createAdminClient()

  if (draftId) {
    const { data: draft } = await db.from('draft_posts').select('*').eq('id', draftId).maybeSingle()
    if (!draft) return NextResponse.json({ error: 'Utkast hittades inte' }, { status: 404 })
    return NextResponse.json({ draft })
  }

  const { data: project } = await db.from('projects').select('id').eq('slug', FAMILJE_SLUG).maybeSingle()
  const projectId = (project as { id?: string } | null)?.id
  if (!projectId) return NextResponse.json({ error: `Projekt ${FAMILJE_SLUG} saknas` }, { status: 404 })

  let q = db.from('draft_posts')
    .select('id, draft_key, brief_id, channel, format, beat, status, version, created_at')
    .eq('project_id', projectId)
  if (planId) {
    const { data: briefs } = await db.from('campaign_briefs').select('id').eq('plan_id', planId)
    const ids = (briefs ?? []).map((x: { id: string }) => x.id)
    q = q.in('brief_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
  }
  if (briefId) q = q.eq('brief_id', briefId)
  const { data: drafts } = await q.order('created_at', { ascending: false }).limit(50)
  return NextResponse.json({ drafts: drafts ?? [] })
}
