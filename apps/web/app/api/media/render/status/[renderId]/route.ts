/**
 * GET /api/media/render/status/[renderId]?scriptId=xxx&bucketName=yyy
 *
 * Polls Lambda render progress.
 * When done: stores video_url in DB, sets video_status = 'ready'.
 *
 * Returns:
 *   { progress: 0–100, done: false }
 *   { progress: 100, done: true, videoUrl: "https://..." }
 *   { progress: 0, done: true, error: "..." }
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAllowedProjectIds, scopeProjectFilter } from '@/lib/atlas/isolation'
import { getLambdaRenderProgress } from '@/lib/media/lambda-render'

export const dynamic = 'force-dynamic'

/**
 * AUTHORIZATION.
 *
 * This route previously carried the note "no auth required — renderId is a
 * secure random UUID that acts as the access token". That reasoning holds for
 * the RESPONSE, which is only progress numbers. It does not hold for the WRITE,
 * because the write is not keyed by the token: `scriptId` arrived as a separate
 * query parameter with nothing tying it to `renderId`. Anyone could pair a
 * renderId from their own render with somebody else's scriptId and flip that
 * script to `ready` (with a URL of their choosing) or to `failed` — with no
 * session at all, through the service-role client.
 *
 * Both production callers are authenticated browser pages under `(platform)`
 * (projects/[slug]/scripts and projects/[slug]/generate), so this is a USER
 * poll, not a machine callback. The sibling `render/complete` route IS a
 * machine boundary — service-key Bearer — and its model is deliberately NOT
 * copied here; a shared secret in the browser would protect nothing.
 *
 * `render/start` already persists `render_id` and `render_bucket` onto the
 * script row, so the server owns the whole mapping. The request's `renderId`
 * and `bucketName` are therefore treated as URL decoration and NOT trusted:
 * the provider is polled with the STORED values, and the update targets the
 * row's own id. That removes the client-controlled provider parameters from
 * the trust path entirely rather than merely validating them.
 *
 * Ordering is authenticate → authorize → provider poll → write, so an
 * unauthorized caller costs no provider call and writes nothing. A foreign
 * script and a missing script both fall into the same 404.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ renderId: string }> },
) {
  await params            // the path segment is not authority; see above

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url      = new URL(request.url)
  const scriptId = url.searchParams.get('scriptId')

  if (!scriptId) {
    return NextResponse.json({ error: 'scriptId required' }, { status: 400 })
  }

  const db = createAdminClient()

  // One query does selection AND authorization, so a foreign id cannot be
  // distinguished from a missing one by response or by timing of a later check.
  const allowedProjectIds = await getAllowedProjectIds(db, user.id)
  const { data: script } = await db
    .from('media_scripts')
    .select('id, render_id, render_bucket')
    .eq('id', scriptId)
    .in('project_id', scopeProjectFilter(allowedProjectIds))
    .maybeSingle()

  const owned = script as { id: string; render_id: string | null; render_bucket: string | null } | null
  if (!owned?.render_id || !owned.render_bucket) {
    // Not yours, does not exist, or never started rendering — one answer for all
    // three, so the endpoint cannot be used to probe which script ids exist.
    return NextResponse.json({ error: 'Render hittades inte' }, { status: 404 })
  }

  try {
    const result = await getLambdaRenderProgress(owned.render_id, owned.render_bucket)

    if (result.done && result.videoUrl) {
      // Render complete — persist to DB
      await db
        .from('media_scripts')
        .update({ video_url: result.videoUrl, video_status: 'ready' })
        .eq('id', owned.id)
    } else if (result.done && result.error) {
      await db
        .from('media_scripts')
        .update({ video_status: 'failed' })
        .eq('id', owned.id)
    }

    return NextResponse.json({
      progress: Math.round(result.progress * 100),
      done:     result.done,
      videoUrl: result.videoUrl,
      error:    result.error,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to poll render status'
    console.error('[render/status]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
