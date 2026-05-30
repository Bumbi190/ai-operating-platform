/**
 * POST /api/media/research/scrape
 *
 * Manually trigger Hermes to autonomously browse the web and find
 * the best AI news story. Returns the result for use in the UI.
 *
 * Protected by: Authorization: Bearer {CRON_SECRET}
 *
 * Body (optional):
 *   { exclude_urls?: string[] }
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callHermesScrape, isHermesConfigured } from '@/lib/media/hermes'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60   // Vercel Hobby cap — Hermes calls may time out on long scrape

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

  const db = createAdminClient()
  let excludeUrls: string[] = []

  // Parse body if provided
  try {
    const body = await request.json() as { exclude_urls?: string[] }
    excludeUrls = body.exclude_urls ?? []
  } catch {
    // no body — use DB lookupinstead
  }

  // Default: exclude recently-seen URLs from DB
  if (!excludeUrls.length) {
    const { data: recent } = await db
      .from('media_news_items')
      .select('url')
      .not('url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50)
    excludeUrls = (recent ?? []).map(r => r.url).filter(Boolean) as string[]
  }

  const result = await callHermesScrape(excludeUrls)

  if (!result) {
    return NextResponse.json(
      { error: 'Hermes scrape failed or returned no result' },
      { status: 500 },
    )
  }

  return NextResponse.json({ status: 'ok', data: result })
}
