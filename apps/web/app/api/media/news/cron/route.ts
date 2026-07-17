/**
 * GET /api/media/news/cron
 *
 * Daily cron job that runs the News Hunter, picks the top story,
 * and saves it to media_news_items with status='new' (awaiting human approval).
 *
 * Triggered automatically by Vercel Cron at 06:30 UTC every morning.
 * Protected by CRON_SECRET env var.
 *
 * Optional query params:
 *   ?project_id=xxx   — run for a specific project only
 *   ?auto_pipeline=1  — deprecated; novelty-passed items still require editorial approval
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runNewsHunter } from '@/lib/media/news-hunter'
import { logRun } from '@/lib/media/run-log'
import { persistCandidateWithNoveltyReview } from '@/lib/media/novelty'

export const dynamic    = 'force-dynamic'
export const maxDuration = 120

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const projectIdFilter = searchParams.get('project_id')
  const autoPipeline    = searchParams.get('auto_pipeline') === '1'

  const db = createAdminClient()

  // Find all projects (or just the one specified)
  let projectsQuery = db
    .from('projects')
    .select('id, name, slug')

  if (projectIdFilter) {
    projectsQuery = projectsQuery.eq('id', projectIdFilter)
  } else {
    // AI-nyhetsjägaren körs bara för The Prompt (ai-media-automation).
    // Familje-Stunden (barninnehåll) och GainPilot (B2B-leads) är andra affärer
    // och ska inte få AI-nyhetsvideor.
    projectsQuery = projectsQuery.eq('slug', 'ai-media-automation')
  }

  const { data: projects } = await projectsQuery
  if (!projects || projects.length === 0) {
    return NextResponse.json({ message: 'No active projects found' })
  }

  const results: Record<string, unknown>[] = []

  for (const project of projects) {
    try {
      console.log(`[news/cron] Running hunter for project: ${project.slug}`)

      const result = await runNewsHunter(db, project.id, 3)

      if (result.candidates.length === 0) {
        results.push({ project: project.slug, status: 'no_new_stories' })
        continue
      }

      // Save top candidate for novelty review. The reviewer is the only path from
      // discovery into approval; News Hunter never approves directly.
      const top = result.candidates[0]
      let novelty
      try {
        novelty = await persistCandidateWithNoveltyReview(db, {
          project_id:     project.id,
          title:          top.story.title,
          summary:        top.story.summary || null,
          url:            top.story.url,
          source_name:    top.story.sourceLabel,
          virality_score: top.estimatedViralityScore,
          content_angle:  top.suggestedAngle,
          target_audience: 'intermediate',
          key_insight:    top.editorialNote,
          raw_output: {
            title:           top.story.title,
            summary:         top.story.summary,
            key_insight:     top.editorialNote,
            virality_score:  top.estimatedViralityScore,
            target_audience: 'intermediate',
            content_angle:   top.suggestedAngle,
            source_url:      top.story.url,
            source_name:     top.story.sourceLabel,
          },
        })
      } catch (saveError) {
        const msg = saveError instanceof Error ? saveError.message : 'media_news_items insert failed'
        console.error(`[news/cron] Failed to save news item for ${project.slug}:`, msg)
        results.push({
          project:      project.slug,
          status:       msg.includes('unique') ? 'duplicate_race_prevented' : 'error',
          error:        msg,
          title:           top.story.title,
          url:             top.story.url,
          totalFetched: result.totalFetched,
          afterDedup:   result.afterDedup,
          summary:      result.claudeSummary,
        })
        continue
      }

      if (novelty.status !== 'novelty_passed') {
        results.push({
          project:      project.slug,
          status:       novelty.status,
          title:        top.story.title,
          url:          top.story.url,
          newsItemId:   novelty.newsItemId,
          verdict:      novelty.verdict,
          totalFetched: result.totalFetched,
          afterDedup:   result.afterDedup,
          summary:      result.claudeSummary,
        })
        continue
      }

      const resultEntry: Record<string, unknown> = {
        project:      project.slug,
        status:       'awaiting_editorial_review',
        title:        top.story.title,
        newsItemId:   novelty.newsItemId,
        totalFetched: result.totalFetched,
        afterDedup:   result.afterDedup,
        summary:      result.claudeSummary,
      }

      // auto_pipeline is intentionally inert after the duplicate-guard hotfix:
      // novelty review may not grant production authority.
      if (autoPipeline && novelty.newsItemId) {
        resultEntry.pipelineStatus = 'blocked_pending_editorial_review'
      }

      results.push(resultEntry)

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error'
      console.error(`[news/cron] Failed for ${project.slug}:`, msg)
      results.push({ project: project.slug, status: 'error', error: msg })
    }
  }

  const savedCount = results.filter(r => r.status === 'awaiting_editorial_review' && typeof r.newsItemId === 'string').length
  const hadError   = results.some(r => r.status === 'error')
  const fetchRunId = await logRun({
    workflow: 'Fetch AI News',
    status:   hadError ? 'failed' : 'done',
    context:  { storiesSaved: savedCount },
  })
  // Spårbarhet: stämpla fetch-runens id på de news-items den skapade (fyller run_id
  // som tidigare var null → hela kedjan kan följas bakåt). Non-blocking.
  if (fetchRunId) {
    const savedIds = results.map(r => r.newsItemId).filter((id): id is string => typeof id === 'string')
    if (savedIds.length) {
      try { await db.from('media_news_items').update({ run_id: fetchRunId }).in('id', savedIds) } catch { /* non-blocking */ }
    }
  }

  return NextResponse.json({
    ranAt: new Date().toISOString(),
    projects: results,
  }, { status: hadError ? 500 : 200 })
}
