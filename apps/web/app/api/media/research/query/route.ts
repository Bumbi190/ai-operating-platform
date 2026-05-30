/**
 * POST /api/media/research/query
 *
 * On-demand: ask Hermes to do a deep-dive research session on a specific topic.
 * The result can be used to manually kick off a script-writing pipeline.
 *
 * Protected by: Authorization: Bearer {CRON_SECRET}
 *
 * Body:
 *   { topic: string, depth?: "quick" | "standard" | "deep" }
 */

import { NextResponse } from 'next/server'
import { callHermesResearch, isHermesConfigured } from '@/lib/media/hermes'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60   // Vercel Hobby cap — Hermes calls may time out on long research

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isHermesConfigured()) {
    return NextResponse.json(
      { error: 'Hermes is not configured. Set HERMES_URL in environment variables.' },
      { status: 503 },
    )
  }

  let topic: string
  let depth: 'quick' | 'standard' | 'deep' = 'standard'

  try {
    const body = await request.json() as { topic?: string; depth?: string }
    if (!body.topic) {
      return NextResponse.json({ error: 'topic is required' }, { status: 400 })
    }
    topic = body.topic
    if (body.depth === 'quick' || body.depth === 'standard' || body.depth === 'deep') {
      depth = body.depth
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const result = await callHermesResearch(topic, depth)

  if (!result) {
    return NextResponse.json(
      { error: 'Hermes research failed or returned no result' },
      { status: 500 },
    )
  }

  return NextResponse.json({ status: 'ok', data: result })
}
