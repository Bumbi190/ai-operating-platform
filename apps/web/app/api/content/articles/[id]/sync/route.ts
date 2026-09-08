/**
 * POST /api/content/articles/[id]/sync  (operator-triggered)
 *
 * Manual re-sync of a published website_content row to its destination.
 * Useful for backfilling articles that drifted before the auto-sync landed
 * in lib/article/hero-image.ts, without re-paying the Ideogram regen cost.
 *
 * Auth mirrors the sibling /hero-image route — authenticated operator only.
 *
 * Response shape:
 *   200 { ok:true,  status:'synced' }
 *   200 { ok:true,  status:'skipped', reason:string }    — guard hit (not published, etc.)
 *   502 { ok:false, status:'failed',  reason:string }    — destination publish failed
 *   401 { error:'Unauthorized' }
 *   404 { error:'Not found' }  — no such article, OR not in the caller's projects
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAllowedProjectIds, assertProjectAllowed } from '@/lib/atlas/isolation'
import { syncPublishedArticle } from '@/lib/publishing/sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // OWNERSHIP IS ENFORCED HERE, NOT BY THE UI.
  //
  // This endpoint is addressable directly by article id. The detail page only
  // renders its button for an article the operator owns, but a hidden control
  // is not an authorization — the request can be made without the page. The
  // sibling /review route already establishes this exact contract; this one
  // was missing it, so any signed-in operator could act on any article.
  const db = createAdminClient()
  const { data: row } = await db
    .from('website_content')
    .select('id, project_id')
    .eq('id', params.id)
    .maybeSingle()

  // 404 for both "no such article" and "not yours": the two must be
  // indistinguishable, or the response confirms a foreign article exists.
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const allowedProjectIds = await getAllowedProjectIds(db, user.id)
  if (!assertProjectAllowed(row.project_id, allowedProjectIds)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const result = await syncPublishedArticle(params.id)

  if (result.ok) {
    if (result.status === 'synced') {
      return NextResponse.json({ ok: true, status: 'synced' })
    }
    return NextResponse.json({ ok: true, status: 'skipped', reason: result.reason })
  }

  return NextResponse.json(
    { ok: false, status: 'failed', reason: result.reason },
    { status: 502 },
  )
}
