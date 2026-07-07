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
 *   400 { error:'Invalid JSON' }  (not currently produced; reserved for future body shape)
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateHeroImage } from '@/lib/article/hero-image'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await generateHeroImage(params.id)

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
