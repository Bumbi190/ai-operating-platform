/**
 * GET /api/media/cron/step1
 *
 * Autonomous pipeline — Step 1 of 3 (< 60s, runs on Vercel Hobby)
 * Schedule: 07:20 UTC and 17:20 UTC
 *
 * Does: News hunt → article analysis → script writing → quality gate → save to DB
 * Next: /api/media/cron/step2 picks up 5 min later
 *
 * Protected by: Authorization: Bearer {CRON_SECRET}
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runNewsHunter, type HunterCandidate } from '@/lib/media/news-hunter'
import { callHermesScrape, callHermesTrends, isHermesConfigured } from '@/lib/media/hermes'
import { persistCandidateWithNoveltyReview } from '@/lib/media/novelty'

export const dynamic    = 'force-dynamic'
export const maxDuration = 60

/** Race a promise against a timeout; resolve to `fallback` if it doesn't finish in time. */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms)),
  ])
}

type SaveNewsItemResult =
  | { status: 'awaiting_editorial_review'; id: string }
  | { status: 'blocked'; outcome: string; id: string; message: string }
  | { status: 'duplicate'; message: string }
  | { status: 'error'; message: string }

function isDuplicateNewsUrlError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as { code?: string; message?: string; details?: string; hint?: string }
  const text = `${err.message ?? ''} ${err.details ?? ''} ${err.hint ?? ''}`.toLowerCase()
  return err.code === '23505' && (
    text.includes('unique_project_news_url') ||
    text.includes('unique_project_active_news_url') ||
    text.includes('unique_project_active_canonical_news_url') ||
    text.includes('media_news_items') ||
    text.includes('duplicate key')
  )
}

async function saveNewsItem(db: ReturnType<typeof createAdminClient>, row: Record<string, unknown>): Promise<SaveNewsItemResult> {
  try {
    const result = await persistCandidateWithNoveltyReview(db, {
      project_id: row.project_id as string,
      run_id: row.run_id as string | null | undefined,
      title: row.title as string,
      summary: row.summary as string | null | undefined,
      url: row.url as string | null | undefined,
      source_name: row.source_name as string | null | undefined,
      virality_score: row.virality_score as number | null | undefined,
      content_angle: row.content_angle as string | null | undefined,
      target_audience: row.target_audience as string | null | undefined,
      key_insight: row.key_insight as string | null | undefined,
      raw_output: row.raw_output as Record<string, unknown> | null | undefined,
    })
    if (result.status === 'novelty_passed') return { status: 'awaiting_editorial_review', id: result.newsItemId }
    return { status: 'blocked', outcome: result.status, id: result.newsItemId, message: result.verdict.reasoning }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'media_news_items insert failed'
    if (isDuplicateNewsUrlError(error) || message.toLowerCase().includes('duplicate') || message.toLowerCase().includes('unique')) {
      return { status: 'duplicate', message }
    }
    return { status: 'error', message }
  }
}

async function saveFirstHunterCandidate(
  db: ReturnType<typeof createAdminClient>,
  projectId: string,
  candidates: HunterCandidate[],
): Promise<
  | { status: 'awaiting_editorial_review'; newsItemId: string; candidate: HunterCandidate; duplicateCount: number }
  | { status: 'duplicates_only'; duplicateCount: number }
  | { status: 'no_candidates'; duplicateCount: number }
  | { status: 'error'; message: string; duplicateCount: number }
> {
  let duplicateCount = 0

  for (const candidate of candidates) {
    const top = candidate
    const save = await saveNewsItem(db, {
      project_id: projectId,
      title: top.story.title,
      summary: top.story.summary ?? null,
      url: top.story.url,
      source_name: top.story.sourceLabel,
      virality_score: top.estimatedViralityScore,
      content_angle: top.suggestedAngle,
      key_insight: top.editorialNote ?? null,
      raw_output: {
        title: top.story.title,
        summary: top.story.summary,
        key_insight: top.editorialNote,
        virality_score: top.estimatedViralityScore,
        target_audience: 'intermediate',
        content_angle: top.suggestedAngle,
        source_url: top.story.url,
        source_name: top.story.sourceLabel,
      },
    })

    if (save.status === 'awaiting_editorial_review') {
      return { status: 'awaiting_editorial_review', newsItemId: save.id, candidate: top, duplicateCount }
    }
    if (save.status === 'blocked') {
      duplicateCount += 1
      console.log(`[cron/step1] Novelty reviewer blocked candidate: ${save.outcome} (${top.story.url})`)
      continue
    }
    if (save.status === 'duplicate') {
      duplicateCount += 1
      console.log(`[cron/step1] Skipping duplicate news URL: ${top.story.url}`)
      continue
    }
    return { status: 'error', message: save.message, duplicateCount }
  }

  return {
    status: candidates.length > 0 && duplicateCount === candidates.length ? 'duplicates_only' : 'no_candidates',
    duplicateCount,
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()

  const { searchParams } = new URL(request.url)
  const projectIdParam = searchParams.get('project_id')

  // Find project — AI-nyhetspipen tillhör The Prompt (ai-media-automation).
  // Utan explicit project_id pinnar vi till The Prompt istället för att ta
  // "första projektet" (vilket var Familje-Stunden och felattribuerade allt).
  let q = db.from('projects').select('id, slug')
  if (projectIdParam) q = q.eq('id', projectIdParam)
  else q = q.eq('slug', 'ai-media-automation')
  const { data: project } = await (q as ReturnType<typeof db.from>).limit(1).single()
  if (!project) return NextResponse.json({ error: 'No project found' }, { status: 404 })

  // ── Fetch trends + hunt news in parallel ─────────────────────────────────
  // Trends run alongside the news hunt — no extra time cost.
  // If Hermes isn't configured, trends silently returns null.
  let trendingTopics: string[] = []
  let hunterResult

  const [trendsResult, hunterRes] = await Promise.allSettled([
    callHermesTrends(7_000),               // hard 7s cap (was 25s default)
    runNewsHunter(db, project.id, 5, []),
  ])

  if (trendsResult.status === 'fulfilled' && trendsResult.value) {
    trendingTopics = trendsResult.value.topics.map(t => t.topic)
    console.log(`[cron/step1] Trends: ${trendingTopics.slice(0, 5).join(', ')}...`)
  }

  if (hunterRes.status === 'rejected') {
    return NextResponse.json({ status: 'hunt_failed', error: String(hunterRes.reason) }, { status: 500 })
  }

  // NOTE: we used to re-run runNewsHunter a second time with trend context.
  // That doubled the hunt cost and pushed step1 past Vercel's 60s limit (→ 504,
  // script never saved). We now use the single parallel hunt result directly.
  hunterResult = hunterRes.value

  // ── Hermes fallback ──────────────────────────────────────────────────────
  // If the API hunt found nothing (or everything was low-virality), ask Hermes
  // to autonomously browse news sites with Playwright + Gemini Computer Use.
  // Hermes is optional — gracefully skipped if HERMES_URL is not set.
  const VIRALITY_THRESHOLD = 60
  const topCandidate       = hunterResult.candidates[0]
  const shouldUseHermes    = isHermesConfigured() && (
    !hunterResult.candidates.length ||
    (topCandidate && topCandidate.estimatedViralityScore < VIRALITY_THRESHOLD)
  )

  let duplicateCount = 0

  if (shouldUseHermes) {
    console.log('[cron/step1] Calling Hermes for web-scraped news...')
    const { data: existingUrls } = await db
      .from('media_news_items')
      .select('url')
      .not('url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50)

    const excludeUrls = (existingUrls ?? []).map(r => r.url).filter(Boolean) as string[]
    // Time-boxed: callHermesScrape has a 3-min internal timeout — far over our 60s
    // budget. Cap it externally at 18s and fall back to the API hunt if it stalls.
    const hermesResult = await withTimeout(callHermesScrape(excludeUrls), 18_000, null)

    if (hermesResult) {
      console.log(`[cron/step1] Hermes found: "${hermesResult.title}" (virality: ${hermesResult.virality_score})`)
      // Save news item from Hermes — capture ID directly to avoid race conditions
      const hermesSave = await saveNewsItem(db, {
        project_id: project.id,
        title:          hermesResult.title,
        summary:        hermesResult.summary,
        url:            hermesResult.url,
        source_name:    hermesResult.source_name,
        virality_score: hermesResult.virality_score,
        content_angle:  hermesResult.content_angle,
        key_insight:    hermesResult.key_insight,
        raw_output:     { ...hermesResult, source: 'hermes' },
      })

      if (hermesSave.status === 'awaiting_editorial_review') {
        return NextResponse.json({
          status: 'awaiting_editorial_review',
          newsItemId: hermesSave.id,
          message: 'Novelty passed. Editorial approval is required before script generation.',
        })
      } else if (hermesSave.status === 'duplicate') {
        duplicateCount += 1
        console.log(`[cron/step1] Hermes returned duplicate news URL: ${hermesResult.url}`)
      } else {
        return NextResponse.json({ status: 'news_persistence_failed', error: hermesSave.message }, { status: 500 })
      }
    }

    // Hermes failed, stalled, or returned a duplicate. Fall back to API candidates.
    const candidateSave = await saveFirstHunterCandidate(db, project.id, hunterResult.candidates)
    duplicateCount += candidateSave.duplicateCount

    if (candidateSave.status === 'error') {
      return NextResponse.json({ status: 'news_persistence_failed', error: candidateSave.message }, { status: 500 })
    }
    if (candidateSave.status === 'awaiting_editorial_review') {
      return NextResponse.json({
        status: 'awaiting_editorial_review',
        newsItemId: candidateSave.newsItemId,
        duplicateCount,
        message: 'Novelty passed. Editorial approval is required before script generation.',
      })
    }
    return NextResponse.json({
      status: duplicateCount > 0 ? 'duplicate_existing_story' : 'no_news',
      duplicateCount,
    })
  } else {
    // Standard path: use the first API candidate that actually persists.
    const candidateSave = await saveFirstHunterCandidate(db, project.id, hunterResult.candidates)
    duplicateCount += candidateSave.duplicateCount

    if (candidateSave.status === 'error') {
      return NextResponse.json({ status: 'news_persistence_failed', error: candidateSave.message }, { status: 500 })
    }
    if (candidateSave.status === 'awaiting_editorial_review') {
      return NextResponse.json({
        status: 'awaiting_editorial_review',
        newsItemId: candidateSave.newsItemId,
        duplicateCount,
        message: 'Novelty passed. Editorial approval is required before script generation.',
      })
    }
    return NextResponse.json({
      status: duplicateCount > 0 ? 'duplicate_existing_story' : 'no_news',
      duplicateCount,
    })
  }
  return NextResponse.json({ status: 'no_news', duplicateCount })
}
