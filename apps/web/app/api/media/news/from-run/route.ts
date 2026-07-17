/**
 * POST /api/media/news/from-run
 *
 * After a "Fetch AI News" workflow run completes, call this endpoint
 * to parse the JSON output and save it as a structured media_news_items row.
 *
 * Body: { run_id: string, project_id: string }
 * The run must have context.news_json set by the News Hunter agent.
 */
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import type { NewsHunterOutput } from '@/lib/media/types'
import { toJson } from '@/lib/supabase/json'
import { persistCandidateWithNoveltyReview } from '@/lib/media/novelty'
import { resolveProjectAccess, assertProjectAllowed, projectForbidden } from '@/lib/auth/project-access'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await resolveProjectAccess()
  if (!access.ok) return access.response

  const { run_id, project_id } = await request.json() as { run_id: string; project_id: string }
  if (!run_id || !project_id) {
    return NextResponse.json({ error: 'run_id and project_id are required' }, { status: 400 })
  }
  if (!assertProjectAllowed(project_id, access.allowedProjectIds)) return projectForbidden()

  const db = createAdminClient()

  const { data: run } = await db
    .from('runs')
    .select('id, status, context, project_id')
    .eq('id', run_id)
    .single()

  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  if (run.project_id !== project_id) return NextResponse.json({ error: 'Run does not belong to project' }, { status: 403 })
  if (run.status !== 'done') {
    return NextResponse.json({ error: `Run is not done yet (status: ${run.status})` }, { status: 400 })
  }

  const context = (run.context as Record<string, string>) ?? {}
  const rawJson = context['news_json']
  if (!rawJson) {
    return NextResponse.json({ error: 'Run context has no news_json key' }, { status: 400 })
  }

  let parsed: NewsHunterOutput
  try {
    // Strip markdown code fences if present
    const clean = rawJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    parsed = JSON.parse(clean) as NewsHunterOutput
  } catch {
    return NextResponse.json({ error: 'Failed to parse news_json as JSON', raw: rawJson }, { status: 422 })
  }

  try {
    const novelty = await persistCandidateWithNoveltyReview(db, {
      project_id,
      run_id,
      title: parsed.title,
      summary: parsed.summary,
      key_insight: parsed.key_insight,
      url: parsed.source_url ?? null,
      source_name: parsed.source_name ?? null,
      target_audience: parsed.target_audience,
      content_angle: parsed.content_angle,
      virality_score: parsed.virality_score ?? 0,
      raw_output: toJson(parsed) as Record<string, unknown>,
    })
    const { data: newsItem } = await db.from('media_news_items').select('*').eq('id', novelty.newsItemId).single()
    return NextResponse.json({ ok: true, status: novelty.status, verdict: novelty.verdict, news_item: newsItem }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to save news item' }, { status: 500 })
  }
}
