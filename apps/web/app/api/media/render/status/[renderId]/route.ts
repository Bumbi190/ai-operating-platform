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
import { createAdminClient } from '@/lib/supabase/admin'
import { getLambdaRenderProgress } from '@/lib/media/lambda-render'
import { assertMediaProductionEligible } from '@/lib/media/eligibility'

export const dynamic = 'force-dynamic'

// No auth required — renderId is a secure random UUID that acts as the access token.
// The render status itself contains no sensitive user data.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ renderId: string }> },
) {

  const { renderId } = await params
  const url          = new URL(request.url)
  const scriptId     = url.searchParams.get('scriptId')
  const bucketName   = url.searchParams.get('bucketName')

  if (!scriptId || !bucketName) {
    return NextResponse.json({ error: 'scriptId and bucketName required' }, { status: 400 })
  }

  const db = createAdminClient()

  try {
    const result = await getLambdaRenderProgress(renderId, bucketName)

    if (result.done && result.videoUrl) {
      const { data: script } = await db.from('media_scripts').select('id, project_id').eq('id', scriptId).single()
      if (!script) return NextResponse.json({ error: 'Script not found' }, { status: 404 })
      await assertMediaProductionEligible(db, { projectId: script.project_id, scriptId, stage: 'render' })
      // Render complete — persist to DB
      await db
        .from('media_scripts')
        .update({ video_url: result.videoUrl, video_status: 'ready' })
        .eq('id', scriptId)
    } else if (result.done && result.error) {
      await db
        .from('media_scripts')
        .update({ video_status: 'failed' })
        .eq('id', scriptId)
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
