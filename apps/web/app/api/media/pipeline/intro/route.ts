/**
 * POST /api/media/pipeline/intro
 *
 * Disabled by the media duplicate-guard hotfix. The old endpoint created an
 * approved script and generated assets without a reviewed news item or editorial
 * approval path, so it cannot participate in the gated publication pipeline.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  return NextResponse.json({
    status: 'intro_pipeline_disabled',
    message: 'Intro media generation is disabled until it has a reviewed content item and editorial approval path.',
  }, { status: 409 })
}