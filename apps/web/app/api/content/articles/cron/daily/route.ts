/**
 * GET /api/content/articles/cron/daily
 *
 * Separate System-A (theprompt.nu) daily article lane.
 * Production-only CRON_SECRET. One fresh official-source story, one
 * deterministic DB claim BEFORE any paid generation, no historic backfill.
 * The independent reviewer can veto any publication; rejected or uncertain
 * content remains in Atlas review. No social-media work or media-script replay.
 *
 * Activation: schedule in Supabase pg_cron ONLY after CI, verified dry run,
 * credential checks and explicit editorial release. Env flag controls publish:
 * THE_PROMPT_ARTICLE_AUTOPUBLISH_ENABLED=true.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildGroundingFromSource } from '@/lib/article/ground'
import { readDirectOfficialArticle } from '@/lib/article/primary-source-reader'
import { writeArticle } from '@/lib/article/writer'
import { reviewArticle } from '@/lib/article/qa'
import { toPublishPayload, externalIdForNewsItem } from '@/lib/article/to-contract'
import { saveGeneratedArticle, SYSTEM_A_PROJECT_SLUG } from '@/lib/article/store'
import { independentlyReviewPromptArticle } from '@/lib/article/independent-fact-review'
import {
  selectFreshDailyOfficialNews, eligibleForWebsiteAutopublish,
  confirmedPromptArticleUrl, BLOCKED_FACT_REVIEW,
  type DailyNewsCandidate,
} from '@/lib/article/daily-editorial-policy'
import { publishArticle } from '@/lib/publishing/publish'
import { MEDIA_PIPELINE_PROJECT } from '@/lib/cost/governed-spend'
import { projectScope } from '@/lib/governance/execution-stop'
import { toJson } from '@/lib/supabase/json'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const PRODUCER = 'theprompt-website-daily-v1'
const SAFE_PENDING_REASON = 'Awaiting Atlas editorial review. Not yet published.'
const MAX_PER_RUN = 1

function message(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 300) : 'unknown'
}
function response(status: string, other: Record<string, unknown> = {}, http = 200) {
  return NextResponse.json({ status, ...other }, { status: http })
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== 'Bearer ' + secret) {
    return response('unauthorized', {}, 401)
  }
  const db = createAdminClient()
  const { data: project, error: projectError } = await db.from('projects')
    .select('id,execution_paused').eq('slug', SYSTEM_A_PROJECT_SLUG).maybeSingle()
  if (projectError || !project) return response('project_unavailable', {}, 503)
  if (project.execution_paused) return response('project_paused', {}, 423)

  const nowMs = Date.now()
  const todayUtc = new Date(nowMs)
  todayUtc.setUTCHours(0, 0, 0, 0)
  const { data: today, error: todayErr } = await db.from('website_content')
    .select('id,status')
    .eq('project_id', project.id)
    .eq('content_type', 'article')
    .gte('created_at', todayUtc.toISOString()).limit(MAX_PER_RUN)
  if (todayErr) return response('article_lookup_unavailable', {}, 503)
  if ((today?.length ?? 0) > 0) return response('article_already_attempted_today', { count: today?.length })

  // Only fetch recent candidate metadata from this one project. URL is further
  // restricted to publicly known primary-source hosts BEFORE any Hermes call.
  const { data: news, error: newsErr } = await db.from('media_news_items')
    .select('id,project_id,title,summary,key_insight,url,source_name,content_angle,status,fetched_at')
    .eq('project_id', project.id)
    .in('status', ['new', 'approved'])
    .gte('fetched_at', new Date(nowMs - 36 * 60 * 60 * 1000).toISOString())
    .order('fetched_at', { ascending: false }).limit(30)
  if (newsErr) return response('news_lookup_unavailable', {}, 503)
  const candidates = ((news ?? []) as DailyNewsCandidate[])
    .filter(row => selectFreshDailyOfficialNews([row], project.id, nowMs) !== null)
  if (candidates.length === 0) return response('no_fresh_official_source')

  // Skip sources with a prior article. A broken/404 source must NOT starve the
  // entire daily website lane indefinitely; check at most three distinct
  // official sources for full grounding without paying a model to guess.
  const dryRun = new URL(request.url).searchParams.get('dry_run') === '1'
  const sourceProbe = new URL(request.url).searchParams.get('source_probe') === '1'
  let selected: DailyNewsCandidate | null = null
  let grounding: Awaited<ReturnType<typeof buildGroundingFromSource>> | null = null
  let verifiedUrl: string | null = null
  let sourcesChecked = 0
  let alreadyUsed = 0
  for (const candidate of candidates) {
    if (!candidate.url) continue
    const { data: prior, error: priorErr } = await db.from('website_content')
      .select('id,status').eq('external_id', externalIdForNewsItem(candidate.id)).maybeSingle()
    if (priorErr) return response('duplicate_lookup_unavailable', {}, 503)
    if (prior) { alreadyUsed++; continue }

    if (dryRun) return response('candidate_preflight_only_source_not_yet_verified', {
      sourceId: candidate.id, sourceHost: new URL(candidate.url).hostname,
      autoPublishEnabled: process.env.THE_PROMPT_ARTICLE_AUTOPUBLISH_ENABLED === 'true',
    })

    if (sourcesChecked >= 3) break
    sourcesChecked++
    // Prefer bounded first-party HTTP reading (some Hermes DOM visits time out).
    // All URLs and redirects are restricted to the official HTTPS allowlist.
    const direct = await readDirectOfficialArticle(candidate.url, candidate.title)
    const source = direct?.grounding ?? await buildGroundingFromSource({
      id: candidate.id, title: candidate.title, summary: candidate.summary,
      key_insight: candidate.key_insight, url: candidate.url,
      source_name: candidate.source_name, content_angle: candidate.content_angle,
    })
    if (source.mode === 'strong' &&
        (source.source === 'hermes' || source.source === 'primary_fetch') &&
        source.wordCount >= 150) {
      selected = candidate
      grounding = source
      verifiedUrl = direct?.canonicalUrl ?? candidate.url
      break
    }
  }
  if (!selected || !selected.url || !grounding || !verifiedUrl) {
    return response(alreadyUsed === candidates.length ? 'all_official_sources_already_used'
      : 'source_not_verifiable', { sourcesChecked, alreadyUsed })
  }
  // Probe makes one bounded source request but NEVER triggers model spend,
  // article creation or public publishing.
  if (sourceProbe) return response('verified_primary_source_available', {
    sourceId: selected.id, canonicalHost: new URL(verifiedUrl).hostname,
    wordCount: grounding.wordCount, groundingSource: grounding.source,
  })

  const externalId = externalIdForNewsItem(selected.id)
  const item = {
    id: selected.id, title: selected.title, summary: selected.summary,
    key_insight: selected.key_insight, url: verifiedUrl,
    source_name: selected.source_name, content_angle: selected.content_angle,
  }

  // Unique external_id is the durable one-shot CAS lock. Insert BEFORE paid
  // article/QA calls. Status FAILED keeps this placeholder OUT of an editor's
  // approvable queue until saveGeneratedArticle replaces it with real content.
  const { data: claimed, error: claimErr } = await db.from('website_content')
    .insert({
      project_id: project.id, news_item_id: selected.id,
      external_id: externalId, content_type: 'article',
      source_kind: 'news_item', title: selected.title,
      summary: selected.summary ?? null, generated_by: PRODUCER,
      destination_key: 'the-prompt', status: 'failed',
      status_reason: 'Autonomous editorial claim; generation incomplete, not publishable',
      payload: toJson({}), qa: toJson({}),
      meta: toJson({producer: PRODUCER, stage: 'claimed'}),
    })
    .select('id').maybeSingle()
  if (claimErr?.code === '23505') return response('already_claimed', { sourceId: selected.id })
  if (claimErr || !claimed) return response('claim_unavailable', {}, 503)

  const execution = { context: 'AUTONOMOUS' as const, scope: projectScope({ projectId: project.id }) }
  let generatedArticleId: string | null = null
  try {
    const { draft } = await writeArticle({
      execution, newsItem: item, groundingText: grounding.text, tier: 'standard',
    })
    const qa = reviewArticle(draft, grounding)
    const payload = toPublishPayload(draft, { newsItemId: item.id, publishedAt: null })
    const saved = await saveGeneratedArticle({
      generated: { draft, qa, payload },
      newsItemId: item.id, contentType: 'article',
      sourceKind: 'news_item', generatedBy: PRODUCER,
    })
    generatedArticleId = saved.id
    if (saved.id !== claimed.id) {
      return response('reservation_conflict', { sourceId: item.id }, 409)
    }

    // The second reviewer is paid only if the deterministic gate passed.
    const factual = qa.pass
      ? await independentlyReviewPromptArticle(draft, grounding, item.url!, execution)
      : BLOCKED_FACT_REVIEW
    const publishAllowed = eligibleForWebsiteAutopublish(
      selected, grounding, qa, factual,
      process.env.THE_PROMPT_ARTICLE_AUTOPUBLISH_ENABLED === 'true',
    )

    const { data: recorded, error: recordErr } = await db.from('website_content')
      .update({
        qa: toJson({ ...qa, independent_fact_review: factual }),
        status_reason: publishAllowed
          ? 'Independent factual and structural QA passed; release pending receipt'
          : SAFE_PENDING_REASON,
        updated_at: new Date().toISOString(),
      })
      .eq('id', claimed.id).eq('project_id', project.id)
      .eq('status', 'pending_review').select('id').maybeSingle()
    if (recordErr || !recorded) return response('editorial_record_conflict', { articleId: claimed.id }, 409)
    if (!publishAllowed) return response('pending_review', {
      articleId: claimed.id, sourceId: item.id,
      structuralPass: qa.pass, confidence: qa.confidence,
      independentFactPass: factual.passed,
    })

    // Recheck project stop immediately before the irreversible public publish.
    const { data: freshProject, error: stoppedErr } = await db.from('projects')
      .select('execution_paused').eq('id', project.id).maybeSingle()
    if (stoppedErr || !freshProject || freshProject.execution_paused) {
      return response('publication_stopped', { articleId: claimed.id }, 423)
    }

    // Destination RPC is idempotent on source external_id. Never auto-repeat an
    // ambiguous external result; preserve the Atlas row for reconciliation.
    const published = await publishArticle('the-prompt', {
      ...payload, published_at: new Date().toISOString(),
    })
    if (!published.ok || published.external_id !== externalId ||
        published.status !== 'published' ||
        !confirmedPromptArticleUrl(published.published_url)) {
      await db.from('website_content').update({
        status_reason: 'Publication response ambiguous; manual reconciliation required',
        publish_error: 'Publication receipt could not be verified',
      }).eq('id', claimed.id).eq('status', 'pending_review')
      return response('publication_receipt_unverified', { articleId: claimed.id }, 409)
    }
    const now = new Date().toISOString()
    const { data: confirmed, error: confirmErr } = await db.from('website_content')
      .update({
        status: 'published', reviewed_at: now, reviewed_by: PRODUCER,
        published_at: published.published_at ?? now,
        destination_url: published.published_url,
        publish_operation: published.operation, publish_error: null,
        status_reason: 'Independent source fact QA approved; published via destination RPC',
        updated_at: now,
      })
      .eq('id', claimed.id).eq('project_id', project.id)
      .eq('status', 'pending_review')
      .select('id').maybeSingle()
    if (confirmErr || !confirmed) return response('destination_published_needs_reconciliation', {
      articleId: claimed.id, url: published.published_url,
    }, 409)
    return response('published', { articleId: claimed.id, url: published.published_url })

  } catch (error) {
    // Fail closed: no automatic re-dispatch or conversion of historical drafts.
    const reason = message(error)
    console.error('[article/daily] blocked', {
      sourceId: selected.id, stage: generatedArticleId ? 'review_or_publish' : 'generation',
      reason,
    })
    await db.from('website_content').update({
      status_reason: 'Daily article pipeline stopped; operator investigation required',
      publish_error: reason,
      updated_at: new Date().toISOString(),
    }).eq('id', claimed.id).in('status', ['failed', 'pending_review'])
    return response('editorial_pipeline_failed', { articleId: claimed.id }, 503)
  }
}
