/**
 * POST /api/media/pipeline/daily
 *
 * One-click daily publishing flow.
 * Selects the highest-scoring approved news story and runs the full pipeline.
 *
 * Selection criteria (in order):
 * 1. Status = 'approved' (not yet scripted)
 * 2. Sorted by virality_score DESC
 * 3. Not older than 48h (fresh news only)
 *
 * Streams SSE progress identical to /api/media/pipeline/full.
 * Body: { project_id: string }
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { project_id } = await request.json() as { project_id: string }
  if (!project_id) return new Response('project_id required', { status: 400 })

  const db = createAdminClient()

  // Find the best approved story from the last 48h
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const { data: story } = await db
    .from('media_news_items')
    .select('title, summary, key_insight, content_angle, virality_score')
    .eq('project_id', project_id)
    .eq('status', 'approved')
    .gte('created_at', cutoff)
    .order('virality_score', { ascending: false })
    .limit(1)
    .single()

  if (!story) {
    return NextResponse.json(
      { error: 'No approved stories found. Run News Hunter first.' },
      { status: 404 },
    )
  }

  // Build article text from news item fields and forward to the full pipeline
  const articleText = [
    story.title,
    story.summary,
    story.key_insight ? `Key insight: ${story.key_insight}` : '',
  ].filter(Boolean).join('\n\n')

  // Forward to the full pipeline with the selected story as text
  const origin = new URL(request.url).origin
  const pipelineRes = await fetch(`${origin}/api/media/pipeline/full`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Forward auth cookie
      Cookie: request.headers.get('cookie') ?? '',
    },
    body: JSON.stringify({
      text: articleText,
      project_id,
      mode: 'lite',
    }),
  })

  // Stream the SSE response through
  return new Response(pipelineRes.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
