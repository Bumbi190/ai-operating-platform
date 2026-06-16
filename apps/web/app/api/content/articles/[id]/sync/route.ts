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
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncPublishedArticle } from '@/lib/publishing/sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
