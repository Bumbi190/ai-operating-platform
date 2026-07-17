/**
 * POST /api/media/breaking
 *
 * Fast-track intake for breaking AI news. This endpoint may create a
 * novelty-reviewed candidate, but it must not create scripts, assets, renders,
 * or publications. Production starts only after editorial approval and the
 * canonical media eligibility guard.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Anthropic } from '@anthropic-ai/sdk'
import { runNewsHunter } from '@/lib/media/news-hunter'
import { callHermesRead, isHermesConfigured } from '@/lib/media/hermes'
import { NEWS_SYSTEM } from '@/lib/media/script-prompt'
import type { NewsHunterOutput } from '@/lib/media/types'
import { persistCandidateWithNoveltyReview } from '@/lib/media/novelty'
import { resolveProjectAccess, assertProjectAllowed, projectForbidden } from '@/lib/auth/project-access'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const DEFAULT_PROJECT_SLUG = 'ai-media-automation'

function parseJson<T>(raw: string): T {
  return JSON.parse(raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()) as T
}

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const cronAuthed = !!cronSecret && authHeader === `Bearer ${cronSecret}`
  let userAuthed = false
  let allowedProjectIds: string[] | null = null

  if (!cronAuthed) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    userAuthed = !!user
    if (userAuthed) {
      const access = await resolveProjectAccess()
      if (!access.ok) return access.response
      allowedProjectIds = access.allowedProjectIds
    }
  }
  if (!cronAuthed && !userAuthed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { project_id?: string; url?: string; text?: string }
  const db = createAdminClient()
  const steps: Record<string, unknown> = {}

  let projectQuery = db.from('projects').select('id, slug')
  projectQuery = body.project_id ? projectQuery.eq('id', body.project_id) : projectQuery.eq('slug', DEFAULT_PROJECT_SLUG)
  const { data: project } = await projectQuery.limit(1).single()
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  if (allowedProjectIds && !assertProjectAllowed(project.id, allowedProjectIds)) return projectForbidden()

  try {
    let articleText: string | null = body.text?.trim() || null
    let sourceUrl: string | null = body.url?.trim() || null

    if (!articleText && sourceUrl && isHermesConfigured()) {
      const read = await callHermesRead(sourceUrl)
      if (read?.success && read.text) articleText = `${read.title}\n\n${read.text}`
    }
    if (!articleText && sourceUrl) articleText = `Article URL: ${sourceUrl}`

    if (!articleText) {
      const hunt = await runNewsHunter(db, project.id, 5, [])
      const top = hunt.candidates?.[0]
      if (!top) return NextResponse.json({ error: 'No breaking story found' }, { status: 404 })
      articleText = [top.story.title, top.story.summary ?? '', top.editorialNote ? `Key insight: ${top.editorialNote}` : '', `Source: ${top.story.sourceLabel}`].filter(Boolean).join('\n\n')
      sourceUrl = top.story.url ?? null
      steps.source = 'auto-hunt'
    } else {
      steps.source = body.text ? 'text' : 'url'
    }

    const claude = new Anthropic()
    const newsRes = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: NEWS_SYSTEM,
      messages: [{ role: 'user', content: `Analyze this article for short-form video:\n\n${articleText}` }],
    })
    const news = parseJson<NewsHunterOutput>(newsRes.content[0].type === 'text' ? newsRes.content[0].text : '')
    steps.news = news.title

    const novelty = await persistCandidateWithNoveltyReview(db, {
      project_id: project.id,
      title: news.title,
      summary: news.summary,
      key_insight: news.key_insight,
      url: news.source_url ?? sourceUrl,
      source_name: news.source_name ?? null,
      target_audience: news.target_audience,
      content_angle: news.content_angle,
      virality_score: news.virality_score ?? 0,
      raw_output: { ...news, breaking: true },
    })

    return NextResponse.json({
      ok: true,
      breaking: true,
      status: novelty.status === 'novelty_passed' ? 'awaiting_editorial_review' : novelty.status,
      newsItemId: novelty.newsItemId,
      verdict: novelty.verdict,
      workflowRunId: novelty.workflowRunId,
      message: novelty.status === 'novelty_passed'
        ? 'Novelty passed. Editorial approval is required before production.'
        : 'Breaking candidate did not enter production.',
      steps,
    }, { status: novelty.status === 'novelty_passed' ? 201 : 409 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[breaking]', message)
    return NextResponse.json({ ok: false, error: message, steps }, { status: 500 })
  }
}