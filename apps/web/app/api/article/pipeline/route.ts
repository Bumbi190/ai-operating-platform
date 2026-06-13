/**
 * POST /api/article/pipeline
 *
 * M2 chain validator: News Hunter (media_news_items) → Writer → QA → Approval → Publish.
 * Runs generation + QA, then routes by confidence under the autoPublish policy
 * (default 'none' = everything becomes a pending approval; nothing publishes until a
 * human approves it via /api/approvals/[id]).
 *
 * Body:
 *   { "news_item_id": "<uuid>", "tier"?: "...", "auto_publish"?: "none"|"high" }
 *   { "news_item": { id, title, ... }, ... }   // inline, for testing without the DB
 *
 * Protected by: Authorization: Bearer {CRON_SECRET}
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runPublishPipeline, type AutoPublishPolicy } from '@/lib/article/pipeline'
import type { LengthTier, NewsItemInput } from '@/lib/article/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    news_item_id?: string
    news_item?: NewsItemInput
    tier?: LengthTier
    trending_topics?: string[]
    auto_publish?: AutoPublishPolicy
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  let newsItem: NewsItemInput | null = body.news_item ?? null
  if (!newsItem && body.news_item_id) {
    const db = createAdminClient()
    const { data, error } = await db
      .from('media_news_items')
      .select('id, title, summary, key_insight, url, source_name, content_angle')
      .eq('id', body.news_item_id)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'news_item not found' }, { status: 404 })
    newsItem = data as NewsItemInput
  }

  if (!newsItem || !newsItem.id || !newsItem.title) {
    return NextResponse.json(
      { error: 'Provide news_item_id or a news_item with at least { id, title }' },
      { status: 400 },
    )
  }

  try {
    const decision = await runPublishPipeline(newsItem, {
      tier: body.tier,
      trendingTopics: body.trending_topics,
      autoPublish: body.auto_publish, // omit → env/default 'none'
    })
    return NextResponse.json({ ok: true, ...decision })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) },
      { status: 500 },
    )
  }
}
