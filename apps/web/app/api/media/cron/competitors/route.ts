/**
 * GET /api/media/cron/competitors
 *
 * Weekly cron — refresh competitor intelligence cache.
 * Schedule: Mondays at 06:00 UTC (before the daily step1 runs at 07:20)
 *
 * Scrapes YouTube AI news + TLDR AI + The Rundown AI + Ben's Bites via Hermes,
 * then stores the result in the memories table (key: 'competitor_intelligence').
 * step1 reads from this cache — it never fetches competitors directly, protecting
 * its 60s Vercel budget.
 *
 * Protected by: Authorization: Bearer {CRON_SECRET}
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callHermesCompetitors, isHermesConfigured } from '@/lib/media/hermes'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60   // Hermes does the scraping (~30s) — Vercel just calls + saves

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isHermesConfigured()) {
    return NextResponse.json({ status: 'skipped', reason: 'HERMES_URL not configured' })
  }

  const db = createAdminClient()

  // Find project
  const { searchParams } = new URL(request.url)
  const projectIdParam   = searchParams.get('project_id')
  let q = db.from('projects').select('id, slug')
  if (projectIdParam) q = q.eq('id', projectIdParam)
  const { data: project } = await (q as ReturnType<typeof db.from>).limit(1).single()
  if (!project) return NextResponse.json({ error: 'No project found' }, { status: 404 })

  console.log('[cron/competitors] Fetching competitor intelligence...')
  const ci = await callHermesCompetitors()

  if (!ci) {
    return NextResponse.json({ status: 'error', reason: 'Hermes /competitors returned null' }, { status: 502 })
  }

  // Upsert into memories (value is TEXT column — must JSON.stringify)
  const { error } = await db.from('memories').upsert(
    {
      project_id: project.id,
      key:        'competitor_intelligence',
      value:      JSON.stringify(ci),
      source:     'hermes',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'project_id, key' },
  )

  if (error) {
    console.error('[cron/competitors] Failed to upsert:', error)
    return NextResponse.json({ status: 'error', reason: error.message }, { status: 500 })
  }

  console.log(`[cron/competitors] Cached ${ci.posts.length} posts. Pattern: "${ci.pattern_summary}"`)

  return NextResponse.json({
    status:          'ok',
    posts_scraped:   ci.posts.length,
    top_hooks:       ci.top_hooks.length,
    trending_topics: ci.trending_topics,
    pattern_summary: ci.pattern_summary,
    fetched_at:      ci.fetched_at,
  })
}
