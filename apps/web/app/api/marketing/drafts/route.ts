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
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { resolveProjectAccess, assertProjectAllowed, projectForbidden } from '@/lib/auth/project-access'

const FAMILJE_SLUG = 'familje-stunden'

export async function GET(request: Request) {
  const access = await resolveProjectAccess()
  if (!access.ok) return access.response

  const url = new URL(request.url)
  const draftId = url.searchParams.get('draft_id')
  const planId = url.searchParams.get('plan_id')
  const briefId = url.searchParams.get('brief_id')

  const db = createAdminClient()

  if (draftId) {
    const { data: draft } = await db.from('draft_posts').select('*').eq('id', draftId).maybeSingle()
    // ISOLATION (C-1): only return a draft the caller owns. Missing and foreign
    // drafts both return 404 so the by-id path can't probe other tenants' drafts.
    if (!draft || !assertProjectAllowed((draft as { project_id?: string }).project_id, access.allowedProjectIds)) {
      return NextResponse.json({ error: 'Utkast hittades inte' }, { status: 404 })
    }
    return NextResponse.json({ draft })
  }

  const { data: project } = await db.from('projects').select('id').eq('slug', FAMILJE_SLUG).maybeSingle()
  const projectId = (project as { id?: string } | null)?.id
  if (!projectId) return NextResponse.json({ error: `Projekt ${FAMILJE_SLUG} saknas` }, { status: 404 })

  // ISOLATION (C-1): the fixed-slug list branches are only visible to an owner of
  // that project. A caller who does not own Familje-Stunden gets a 403, not its drafts.
  if (!assertProjectAllowed(projectId, access.allowedProjectIds)) return projectForbidden()

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
