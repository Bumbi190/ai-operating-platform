/**
 * POST /api/article/generate
 *
 * M1 generation test surface — generates an article and returns the draft, QA report,
 * and the would-be publish payload. Does NOT publish (M1 is generation only).
 *
 * Body (one of):
 *   { "news_item_id": "<uuid>", "tier"?: "breaking|standard|deep" }
 *   { "news_item": { id, title, summary?, key_insight?, url?, source_name?, content_angle? }, "tier"? }
 *
 * Protected by: Authorization: Bearer {CRON_SECRET}
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateArticle } from '@/lib/article'
import type { LengthTier, NewsItemInput } from '@/lib/article/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    news_item_id?: string
    news_item?: NewsItemInput
    tier?: LengthTier
    trending_topics?: string[]
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Resolve the news item: inline, or fetched from media_news_items by id.
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
    const result = await generateArticle(newsItem, {
      tier: body.tier,
      trendingTopics: body.trending_topics,
      publishedAt: null, // generation only — payload is a draft; nothing is published
    })

    return NextResponse.json({
      ok: true,
      qa: result.qa,
      meta: result.draft._meta,
      draft: {
        title: result.draft.title,
        summary: result.draft.summary,
        category: result.draft.category,
        tags: result.draft.tags,
        hero_image_prompt: result.draft.hero_image_prompt,
        body: result.draft.body,
      },
      payload: result.payload, // ready for publishArticle('the-prompt', payload) once QA-approved
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) },
      { status: 500 },
    )
  }
}
