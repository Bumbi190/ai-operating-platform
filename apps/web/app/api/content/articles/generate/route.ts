/**
 * POST /api/content/articles/generate   (System A — Website Content Engine)
 *
 * Generate → QA → PERSIST to website_content (status 'pending_review').
 * Does NOT publish; the website is reached later via Atlas approval. Atlas is the
 * authoritative editorial record. Completely separate from System B (social/media).
 *
 * Body (one of):
 *   { "news_item_id": "<uuid>", "tier"?: "breaking|standard|deep", "content_type"?: "article|news|blog|guide|evergreen" }
 *   { "news_item": { id, title, summary?, key_insight?, url?, source_name?, content_angle? }, "tier"?, "content_type"? }
 *
 * Protected by: Authorization: Bearer {CRON_SECRET}
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateArticle } from '@/lib/article'
import { saveGeneratedArticle, type WebsiteContentType } from '@/lib/article/store'
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
    content_type?: WebsiteContentType
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
    // Generate + QA (M1). Payload defaults to draft (published_at = null).
    const generated = await generateArticle(newsItem, {
      tier: body.tier,
      trendingTopics: body.trending_topics,
      publishedAt: null,
    })

    // Persist to System A record as pending_review. No website publish here.
    const saved = await saveGeneratedArticle({
      generated,
      newsItemId: newsItem.id,
      contentType: body.content_type ?? 'article',
      sourceKind: 'news_item',
    })

    return NextResponse.json({
      ok: true,
      id: saved.id,
      external_id: saved.externalId,
      status: saved.status, // 'pending_review' — NOT published; awaits Atlas approval
      qa: generated.qa,
      meta: generated.draft._meta,
    })
  } catch (e) {
    // ── TEMPORARY INSTRUMENTATION (revert after the diagnosis) ──────────────
    // The recurring `SyntaxError: Unexpected token 'T', "The source"...`
    // persisted after lib/article/writer.ts swapped to extractJsonObject in
    // commit a66de97. The route's prior response shape only included
    // `${name}: ${message}`, so we cannot tell WHICH JSON.parse is throwing —
    // ours, the Anthropic SDK's response.json(), Hermes', or something else.
    // This block expands the failure payload (and stderr) with the constructor
    // name, full stack, and (if a wrapped error chain exists) the cause chain.
    // No success path is touched.
    if (e instanceof Error) {
      console.error('[debug:articles-generate] full error:', e)
      if (e.cause) console.error('[debug:articles-generate] cause:', e.cause)
    }
    const causeChain: string[] = []
    let cur: unknown = e instanceof Error ? e.cause : undefined
    while (cur instanceof Error && causeChain.length < 5) {
      causeChain.push(`${cur.name}: ${cur.message}`)
      cur = (cur as { cause?: unknown }).cause
    }
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
        _debug: {
          ctor: e?.constructor?.name ?? null,
          stack: e instanceof Error ? e.stack : null,
          causeChain: causeChain.length ? causeChain : null,
        },
      },
      { status: 500 },
    )
  }
}
