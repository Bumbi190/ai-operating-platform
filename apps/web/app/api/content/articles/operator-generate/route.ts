/**
 * POST /api/content/articles/operator-generate   (System A — operator entrypoint)
 *
 * Operator-triggered wrapper over the SAME generateArticle + saveGeneratedArticle
 * pipeline that the cron-protected /generate endpoint runs. No logic duplicated:
 * imports the same library functions and writes to the same website_content row
 * shape that the rest of Atlas already reviews and publishes.
 *
 * The only difference from /generate is the auth: session cookie (operator)
 * instead of Bearer CRON_SECRET (machine). That separation keeps the cron
 * surface narrow and prevents accidental CRON_SECRET exposure from the
 * Atlas UI.
 *
 * Output row always lands in `pending_review` per saveGeneratedArticle's
 * contract — no autonomous publish.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateArticle } from '@/lib/article'
import { saveGeneratedArticle, type WebsiteContentType } from '@/lib/article/store'
import type { LengthTier, NewsItemInput } from '@/lib/article/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(request: Request) {
  // Session auth — mirrors /api/content/articles/[id]/review.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { news_item_id?: string; tier?: LengthTier; content_type?: WebsiteContentType }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.news_item_id) {
    return NextResponse.json({ error: 'news_item_id is required' }, { status: 400 })
  }

  // Resolve the same fields the cron path resolves — identical input to generateArticle.
  const db = createAdminClient()
  const { data: newsRow, error: loadErr } = await db
    .from('media_news_items')
    .select('id, title, summary, key_insight, url, source_name, content_angle')
    .eq('id', body.news_item_id)
    .maybeSingle()
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 })
  if (!newsRow) return NextResponse.json({ error: 'news_item not found' }, { status: 404 })

  const newsItem = newsRow as NewsItemInput

  try {
    const generated = await generateArticle(newsItem, {
      tier: body.tier,
      publishedAt: null, // saved as draft → status='pending_review'
    })
    const saved = await saveGeneratedArticle({
      generated,
      newsItemId: newsItem.id,
      contentType: body.content_type ?? 'article',
      sourceKind: 'news_item',
      generatedBy: `atlas:${user.email ?? user.id}`,
    })
    return NextResponse.json({
      ok: true,
      id: saved.id,
      external_id: saved.externalId,
      status: saved.status,
      qa: generated.qa,
      meta: generated.draft._meta,
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) },
      { status: 500 },
    )
  }
}
