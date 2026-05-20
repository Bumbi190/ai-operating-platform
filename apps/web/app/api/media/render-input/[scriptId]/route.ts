/**
 * GET /api/media/render-input/[scriptId]
 *
 * Returns a render-input.json ready to drop into apps/remotion/
 * and run: npm run render -- --config=./render-input.json
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
    .select('id, project_id, hook, script, captions, audio_url, timing_url, duration_ms')
    .eq('id', scriptId)
    .single()

  if (!script) return NextResponse.json({ error: 'Script not found' }, { status: 404 })
  if (!script.audio_url) return NextResponse.json({ error: 'Voice not generated yet — run POST /api/media/voice first' }, { status: 400 })

  const captions = Array.isArray(script.captions) ? script.captions : []
  const caption = captions[0] ?? ''

  const renderInput = {
    scriptId: script.id,
    hook: script.hook ?? '',
    script: script.script ?? '',
    caption,
    audioUrl: script.audio_url,
    timingUrl: script.timing_url ?? '',
    durationMs: script.duration_ms ?? 45000,
    accentColor: '#6366f1',
  }

  return NextResponse.json(renderInput)
}
