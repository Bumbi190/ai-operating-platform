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
 *   ?auto_pipeline=1  — also kick off the full pipeline for the top pick
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runNewsHunter } from '@/lib/media/news-hunter'
import { logRun } from '@/lib/media/run-log'

export const dynamic    = 'force-dynamic'
export const maxDuration = 120

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
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

      // Save top candidate as 'new' (needs human approval before pipeline runs)
      const top = result.candidates[0]
      const { data: savedItem } = await db.from('media_news_items').insert({
        project_id:     project.id,
        title:          top.story.title,
        summary:        top.story.summary || null,
        url:            top.story.url,
        source_name:    top.story.sourceLabel,
        virality_score: top.estimatedViralityScore,
        content_angle:  top.suggestedAngle,
        key_insight:    top.editorialNote,
        status:         'new',   // Waits for human approval in the UI
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
      }).select('id').single()

      const resultEntry: Record<string, unknown> = {
        project:      project.slug,
        status:       'saved',
        title:        top.story.title,
        newsItemId:   savedItem?.id,
        totalFetched: result.totalFetched,
        afterDedup:   result.afterDedup,
        summary:      result.claudeSummary,
      }

      // Optional: kick off full pipeline automatically (no human approval gate)
      if (autoPipeline && savedItem?.id) {
        try {
          const pipelineRes = await fetch(
            `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/api/media/pipeline/full`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: `${top.story.title}\n\n${top.story.summary}\n\nSource: ${top.story.sourceLabel}`, project_id: project.id, mode: 'lite' }),
            },
          )

          if (pipelineRes.ok) {
            // Consume the SSE stream to get scriptId
            const reader = pipelineRes.body?.getReader()
            let scriptId: string | null = null
            if (reader) {
              const decoder = new TextDecoder()
              let buf = ''
              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                buf += decoder.decode(value, { stream: true })
                const lines = buf.split('\n')
                buf = lines.pop() ?? ''
                for (const line of lines) {
                  if (!line.startsWith('data:')) continue
                  try {
                    const ev = JSON.parse(line.slice(5).trim())
                    if (ev.step === 'done' && ev.scriptId) scriptId = ev.scriptId
                  } catch { /* skip */ }
                }
              }
            }
            resultEntry.pipelineScriptId = scriptId
            resultEntry.pipelineStatus = 'kicked_off'
          }
        } catch (pErr) {
          resultEntry.pipelineError = pErr instanceof Error ? pErr.message : 'unknown'
        }
      }

      results.push(resultEntry)

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error'
      console.error(`[news/cron] Failed for ${project.slug}:`, msg)
      results.push({ project: project.slug, status: 'error', error: msg })
    }
  }

  const savedCount = results.filter(r => r.status === 'saved').length
  const hadError   = results.some(r => r.status === 'error')
  await logRun({
    workflow: 'Fetch AI News',
    status:   hadError ? 'failed' : 'done',
    context:  { storiesSaved: savedCount },
  })

  return NextResponse.json({
    ranAt: new Date().toISOString(),
    projects: results,
  })
}
