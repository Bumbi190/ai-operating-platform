/**
 * GET /api/content/articles/cron/recheck?articleId=<uuid>&execute=1
 *
 * One operator-invoked autonomous recheck on a NEW System A draft whose first
 * independent factual review returned the generic technical fallback.
 *
 * CRON_SECRET authorization. Exact UUID, project + source checks, fresh source
 * re-read, versioned CAS claim before one paid model call. NEVER PUBLISHES.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SYSTEM_A_PROJECT_SLUG } from '@/lib/article/store'
import { readDirectOfficialArticle } from '@/lib/article/primary-source-reader'
import { officialPrimarySourceUrl } from '@/lib/article/daily-editorial-policy'
import { eligibleForSingleArticleRecheck } from '@/lib/article/recheck-policy'
import { independentlyReviewPromptArticle } from '@/lib/article/independent-fact-review'
import { projectScope } from '@/lib/governance/execution-stop'
import { toJson } from '@/lib/supabase/json'
import type { PublishPayload } from '@/lib/publishing/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function reply(status: string, extra: Record<string, unknown> = {}, http = 200) {
  return NextResponse.json({ status, ...extra }, { status: http })
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== 'Bearer ' + secret) {
    return reply('unauthorized', {}, 401)
  }
  const url = new URL(request.url)
  const articleId = url.searchParams.get('articleId')
  if (!articleId || !UUID.test(articleId)) return reply('exact_article_id_required', {}, 400)
  const execute = url.searchParams.get('execute') === '1'

  const db = createAdminClient()
  const { data: project, error: projectError } = await db.from('projects')
    .select('id,execution_paused').eq('slug', SYSTEM_A_PROJECT_SLUG).maybeSingle()
  if (projectError || !project) return reply('project_unavailable', {}, 503)
  if (project.execution_paused) return reply('project_paused', {}, 423)

  const { data: row, error: readError } = await db.from('website_content')
    .select('id,project_id,news_item_id,external_id,source_kind,generated_by,status,version,qa,payload,created_at,reviewed_at,published_at,destination_url')
    .eq('id', articleId).eq('project_id', project.id).maybeSingle()
  if (readError) return reply('article_lookup_failed', {}, 503)
  if (!row || !eligibleForSingleArticleRecheck(row, project.id, Date.now())) {
    return reply('article_not_eligible')
  }

  const payload = row.payload as unknown as PublishPayload | null
  const canonicalUrl = payload?.source?.url
  if (!officialPrimarySourceUrl(canonicalUrl) ||
      typeof payload?.title !== 'string' || typeof payload?.body !== 'string' ||
      payload.body.length < 400 || !payload.body.trim() ||
      payload.external_id !== row.external_id) {
    return reply('source_or_payload_invalid', {}, 422)
  }

  // Use original source headline rather than the rewritten article headline
  // when checking the actual document, to prevent source redirection.
  const { data: news, error: newsError } = await db.from('media_news_items')
    .select('id,project_id,title,url')
    .eq('id', row.news_item_id).eq('project_id', project.id).maybeSingle()
  if (newsError || !news || typeof news.title !== 'string') {
    return reply('original_news_not_found', {}, 422)
  }

  // No vendor spend unless a full, canonical, headline-correlated official
  // article is currently retrievable.
  const verified = await readDirectOfficialArticle(canonicalUrl!, news.title)
  if (!verified || verified.canonicalUrl !== canonicalUrl ||
      verified.grounding.wordCount < 150) {
    return reply('primary_source_unverifiable')
  }

  if (!execute) return reply('safe_recheck_available_no_spend', {
    articleId, sourceWords: verified.grounding.wordCount,
  })

  // Claim the one allowed paid re-review. No automatic retry and no release.
  const { data: claimed, error: claimError } = await db.from('website_content')
    .update({
      version: row.version + 1,
      status_reason: 'Independent factual recheck claimed; public release disabled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', articleId).eq('project_id', project.id)
    .eq('status', 'pending_review').eq('version', row.version)
    .eq('generated_by', 'theprompt-website-daily-v1')
    .is('reviewed_at', null).is('published_at', null).is('destination_url', null)
    .select('id').maybeSingle()
  if (claimError) return reply('claim_unavailable', {}, 503)
  if (!claimed) return reply('already_claimed')

  const qa = row.qa && typeof row.qa === 'object' && !Array.isArray(row.qa)
    ? row.qa as Record<string, unknown> : {}
  try {
    const fact = await independentlyReviewPromptArticle({
      title: payload.title,
      summary: payload.summary ?? '',
      body: payload.body,
      source_url: canonicalUrl!,
    }, verified.grounding, canonicalUrl!, {
      context: 'AUTONOMOUS', scope: projectScope({ projectId: project.id }),
    })
    const { data: saved, error: saveError } = await db.from('website_content')
      .update({
        version: row.version + 2,
        qa: toJson({ ...qa, independent_fact_review: fact }),
        status_reason: fact.passed
          ? 'Independent factual review passed; awaiting operator release approval'
          : 'Independent factual review did not pass; operator review required',
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id).eq('project_id', project.id)
      .eq('version', row.version + 1).eq('status', 'pending_review')
      .is('reviewed_at', null).is('published_at', null).is('destination_url', null)
      .select('id').maybeSingle()
    if (saveError || !saved) return reply('review_record_conflict', { articleId }, 409)
    return reply(fact.passed ? 'editorially_verified_not_published' : 'editorial_review_blocked', {
      articleId, claimsChecked: fact.claims_checked, verdict: fact.verdict,
      unsupportedClaimCount: fact.unsupported_claims.length,
      published: false,
    })
  } catch (error) {
    console.error('[article/recheck] provider_error', {
      name: error instanceof Error ? error.name : 'unknown',
    })
    // A spent-but-unconfirmed outcome is NOT an authority to re-dispatch.
    await db.from('website_content').update({
      version: row.version + 2,
      status_reason: 'Independent factual recheck failed; operator review required',
      updated_at: new Date().toISOString(),
    }).eq('id', row.id).eq('project_id', project.id)
      .eq('version', row.version + 1).eq('status', 'pending_review')
    return reply('fact_review_unavailable_no_retry', { articleId }, 503)
  }
}
