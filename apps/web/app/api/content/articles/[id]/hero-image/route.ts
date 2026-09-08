/**
 * POST /api/content/articles/[id]/hero-image  (System A — operator-triggered)
 *
 * Thin endpoint over generateHeroImage(articleId) from lib/article/hero-image.ts,
 * which holds all the orchestration + reuse of the social-media image pipeline.
 *
 * Mirrors the /review route's auth posture: requires an authenticated operator
 * session (Supabase auth). Not a cron endpoint.
 *
 * Response shape:
 *   200 { ok:true,  status:'ready',   url:string }                  — generation succeeded
 *   200 { ok:false, status:'skipped', url:null, reason:string }     — paused, already generating, etc.
 *   502 { ok:false, status:'failed',  url:null, reason:string }     — Ideogram/upload/db error
 *   401 { error:'Unauthorized' }
 *   404 { error:'Not found' }  — no such article, OR not in the caller's projects
 *   400 { error:'Invalid JSON' }  (not currently produced; reserved for future body shape)
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAllowedProjectIds, assertProjectAllowed } from '@/lib/atlas/isolation'
import { generateHeroImage } from '@/lib/article/hero-image'
import { GLOBAL_ONLY, projectScope } from '@/lib/governance/execution-stop'
import { MEDIA_PIPELINE_PROJECT } from '@/lib/cost/governed-spend'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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

  const result = await generateHeroImage('OPERATOR_EXECUTION', params.id)

  if (result.ok) {
    return NextResponse.json({ ok: true, status: result.status, url: result.url })
  }

  // Skipped is an expected outcome (paused, already-generating) — 200 with detail.
  // Failed is an error — 502 so fetch().ok flips false on the client.
  const httpStatus = result.status === 'skipped' ? 200 : 502
  return NextResponse.json(
    { ok: false, status: result.status, url: null, reason: result.reason },
    { status: httpStatus },
  )
}
