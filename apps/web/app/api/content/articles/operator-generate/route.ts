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
import { getAllowedProjectIds, scopeProjectFilter } from '@/lib/atlas/isolation'
import { generateArticle } from '@/lib/article'
import { saveGeneratedArticle, type WebsiteContentType } from '@/lib/article/store'
import type { LengthTier, NewsItemInput } from '@/lib/article/types'
import { GLOBAL_ONLY, projectScope } from '@/lib/governance/execution-stop'
import { MEDIA_PIPELINE_PROJECT } from '@/lib/cost/governed-spend'

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

  // OWNERSHIP BEFORE SPEND.
  //
  // `news_item_id` comes from the request body and proves nothing. `db` is a
  // service-role client and bypasses RLS, so an unscoped lookup answered for
  // every news item in the database — and the answer is then fed straight into
  // a paid model call. That made this route three problems at once: it read
  // another project's headline, summary, key insight, URL and content angle;
  // it spent real money on them; and it wrote the result into an article row.
  //
  // The scope goes IN THE QUERY, not after it. Loading the row first and
  // judging it afterwards would still pull the foreign content into this
  // process, which is precisely the exfiltration being closed.
  const allowedProjectIds = await getAllowedProjectIds(db, user.id)
  const { data: newsRow, error: loadErr } = await db
    .from('media_news_items')
    .select('id, title, summary, key_insight, url, source_name, content_angle, project_id')
    .eq('id', body.news_item_id)
    .in('project_id', scopeProjectFilter(allowedProjectIds))
    .maybeSingle()
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 })
  // The SAME body a missing id returns. A distinct message or a 403 would
  // confirm that a news item exists in someone else's project — the sibling
  // /review route settled this policy and this matches it.
  //
  // ONE guard, deliberately. A second `assertProjectAllowed` on the loaded row
  // would read as defence in depth but is not: it would consult the SAME
  // allow-list, so it can never fail once the scoped query returned a row. It
  // adds no security and it makes the real guard untestable — removing the
  // `.in(...)` above would leave every ownership test still passing. The scoped
  // query is also the stronger of the two, because a foreign row never enters
  // this process at all rather than being loaded and then judged.
  if (!newsRow) return NextResponse.json({ error: 'news_item not found' }, { status: 404 })

  // `project_id` was selected only to authorise the read; it is not part of the
  // generation input, so the model sees exactly what it saw before.
  const { project_id: _sourceProjectId, ...newsFields } = newsRow as Record<string, unknown>
  const newsItem = newsFields as unknown as NewsItemInput

  try {
    const generated = await generateArticle(newsItem, {
      execution: { context: 'OPERATOR_EXECUTION' as const, scope: projectScope(MEDIA_PIPELINE_PROJECT) },
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
