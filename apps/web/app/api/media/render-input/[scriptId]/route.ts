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

import { createAdminClient } from '@/lib/supabase/admin'
import { jsonStringArray } from '@/lib/supabase/json'
import { NextResponse } from 'next/server'
import { resolveProjectAccess, assertProjectAllowed } from '@/lib/auth/project-access'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ scriptId: string }> },
) {
  const access = await resolveProjectAccess()
  if (!access.ok) return access.response

  const { scriptId } = await params
  const db = createAdminClient()

  const { data: script } = await db
    .from('media_scripts')
    .select('id, project_id, hook, script, captions, audio_url, timing_url, duration_ms, images, background_music_url')
    .eq('id', scriptId)
    .single()

  // ISOLATION (C-1): only expose a script that belongs to one of the caller's
  // projects. Missing and foreign scripts both return 404 (no existence probing).
  if (!script || !assertProjectAllowed(script.project_id, access.allowedProjectIds)) {
    return NextResponse.json({ error: 'Script not found' }, { status: 404 })
  }
  if (!script.audio_url) return NextResponse.json(
    { error: 'Voice not generated yet — run POST /api/media/voice first' },
    { status: 400 },
  )

  const images: string[] = jsonStringArray(script.images)

  const renderInput = {
    scriptId: script.id,
    projectId: script.project_id,   // used by apps/remotion/src/upload.ts
    hook: script.hook ?? '',
    audioUrl: script.audio_url,
    timingUrl: script.timing_url ?? '',
    durationMs: script.duration_ms ?? 45000,
    images,
    accentColor: '#6366f1',
    backgroundMusicUrl: script.background_music_url ?? null,
  }

  return NextResponse.json(renderInput)
}
