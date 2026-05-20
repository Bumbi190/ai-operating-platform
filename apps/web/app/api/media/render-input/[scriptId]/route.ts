/**
 * GET /api/media/render-input/[scriptId]
 *
 * Returns a render-input.json ready for apps/remotion/
 * Usage: npm run render -- --config=./render-input.json
 *
 * If images have been generated (POST /api/media/images/generate),
 * they are included in the images[] field.
 * Otherwise images is an empty array (falls back to gradient background).
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ scriptId: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { scriptId } = await params
  const db = createAdminClient()

  const { data: script } = await db
    .from('media_scripts')
    .select('id, project_id, hook, script, captions, audio_url, timing_url, duration_ms, images')
    .eq('id', scriptId)
    .single()

  if (!script) return NextResponse.json({ error: 'Script not found' }, { status: 404 })
  if (!script.audio_url) return NextResponse.json(
    { error: 'Voice not generated yet — run POST /api/media/voice first' },
    { status: 400 },
  )

  const images: string[] = Array.isArray(script.images) ? script.images : []

  const renderInput = {
    scriptId: script.id,
    hook: script.hook ?? '',
    audioUrl: script.audio_url,
    timingUrl: script.timing_url ?? '',
    durationMs: script.duration_ms ?? 45000,
    images,
    accentColor: '#6366f1',
  }

  return NextResponse.json(renderInput)
}
