/**
 * POST /api/media/news/hunt
 *
 * Runs the News Hunter — fetches AI stories from HN, Reddit, and RSS feeds,
 * deduplicates against already-seen stories, ranks by virality, and uses
 * Claude to pick the top candidates editorially.
 *
 * Streams progress as Server-Sent Events.
 *
 * Body: {
 *   project_id: string
 *   max_candidates?: number   // default 3
 *   auto_save?: boolean       // if true, saves top pick to media_news_items
 * }
 *
 * SSE events:
 *   { step: 'fetching',   label: '...', progress: 10 }
 *   { step: 'dedup',      label: '...', progress: 40, totalFetched: N }
 *   { step: 'ranking',    label: '...', progress: 55 }
 *   { step: 'editorial',  label: '...', progress: 70 }
 *   { step: 'done',       candidates: [...], claudeSummary: '...', progress: 100 }
 *   { step: 'error',      message: '...' }
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  fetchAllSources,
  deduplicateAgainstDB,
  scoreAndRank,
  claudeEditorialPick,
} from '@/lib/media/news-hunter'
import type { HunterCandidate } from '@/lib/media/news-hunter'
import { persistCandidateWithNoveltyReview } from '@/lib/media/novelty'

export const dynamic = 'force-dynamic'
export const maxDuration = 120  // RSS + HN + Reddit + Claude

function sseEvent(controller: ReadableStreamDefaultController, payload: Record<string, unknown>) {
  const line = `data: ${JSON.stringify(payload)}\n\n`
  controller.enqueue(new TextEncoder().encode(line))
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { project_id, max_candidates = 3, auto_save = false } = await request.json() as {
    project_id: string
    max_candidates?: number
    auto_save?: boolean
  }
  if (!project_id) return new Response('project_id required', { status: 400 })

  const db = createAdminClient()

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (payload: Record<string, unknown>) => sseEvent(controller, payload)

      try {
        // ── Step 1: Fetch all sources ─────────────────────────────────────────
        emit({ step: 'fetching', label: 'Fetching HN, Reddit, and RSS feeds...', progress: 5 })

        const allStories = await fetchAllSources()

        emit({
          step: 'fetched',
          label: `Found ${allStories.length} stories across all sources`,
          progress: 40,
          totalFetched: allStories.length,
        })

        // ── Step 2: Deduplicate against DB ────────────────────────────────────
        emit({ step: 'dedup', label: 'Removing already-seen stories...', progress: 50 })

        const fresh = await deduplicateAgainstDB(allStories, db, project_id)

        emit({
          step: 'dedup_done',
          label: `${fresh.length} fresh stories after deduplication`,
          progress: 58,
          afterDedup: fresh.length,
        })

        if (fresh.length === 0) {
          emit({
            step: 'done',
            label: 'No new stories today — all sources already covered',
            progress: 100,
            candidates: [],
            claudeSummary: 'All fetched stories have already been processed this week.',
          })
          return
        }

        // ── Step 3: Score and rank ────────────────────────────────────────────
        emit({ step: 'ranking', label: 'Ranking by virality score...', progress: 62 })
        const scored = scoreAndRank(fresh)

        // ── Step 4: Claude editorial pick ─────────────────────────────────────
        emit({ step: 'editorial', label: 'Claude is picking the best stories...', progress: 68 })

        const { candidates, summary } = await claudeEditorialPick(scored, max_candidates)

        // ── Step 5: Auto-save #1 if requested ────────────────────────────────
        let autoSaveResult: Record<string, unknown> | null = null
        if (auto_save && candidates.length > 0) {
          const top = candidates[0]
          const novelty = await persistCandidateWithNoveltyReview(db, {
            project_id,
            title:          top.story.title,
            summary:        top.story.summary || null,
            url:            top.story.url,
            source_name:    top.story.sourceLabel,
            virality_score: top.estimatedViralityScore,
            content_angle:  top.suggestedAngle,
            key_insight:    top.editorialNote,
            target_audience: 'intermediate',
            raw_output: {
              title:            top.story.title,
              summary:          top.story.summary,
              key_insight:      top.editorialNote,
              virality_score:   top.estimatedViralityScore,
              target_audience:  'intermediate',
              content_angle:    top.suggestedAngle,
              source_url:       top.story.url,
              source_name:      top.story.sourceLabel,
            },
          })
          autoSaveResult = {
            status: novelty.status,
            newsItemId: novelty.newsItemId,
            verdict: novelty.verdict,
          }
        }

        // Serialize candidates (strip circular refs, just what UI needs)
        const serialized = candidates.map((c: HunterCandidate) => ({
          rank:                   c.rank,
          editorialNote:          c.editorialNote,
          suggestedAngle:         c.suggestedAngle,
          estimatedViralityScore: c.estimatedViralityScore,
          story: {
            title:          c.story.title,
            url:            c.story.url,
            summary:        c.story.summary,
            sourceLabel:    c.story.sourceLabel,
            publishedAt:    c.story.publishedAt.toISOString(),
            viralityScore:  c.story.viralityScore,
            engagementScore: c.story.engagementScore,
          },
        }))

        emit({
          step:          'done',
          label:         `Found ${candidates.length} top stories for today`,
          progress:      100,
          candidates:    serialized,
          claudeSummary: summary,
          totalFetched:  allStories.length,
          afterDedup:    fresh.length,
          autoSaved:     auto_save,
          autoSaveResult,
        })

      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error in news hunter'
        console.error('[news/hunt]', message)
        sseEvent(controller, { step: 'error', message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
