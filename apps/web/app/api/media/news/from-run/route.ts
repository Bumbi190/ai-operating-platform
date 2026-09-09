/**
 * POST /api/media/news/from-run
 *
 * After a "Fetch AI News" workflow run completes, call this endpoint
 * to parse the JSON output and save it as a structured media_news_items row.
 *
 * Body: { run_id: string, project_id: string }
 *   run_id     — SELECTOR. Authority is the run's own project_id.
 *   project_id — NOT authority. Required (unchanged), but validated against the
 *                server-proven run rather than trusted.
 * The run must have context.news_json set by the News Hunter agent.
 */
import { getAllowedProjectIds, scopeProjectFilter } from '@/lib/atlas/isolation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import type { NewsHunterOutput } from '@/lib/media/types'
import { toJson } from '@/lib/supabase/json'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { run_id, project_id } = await request.json() as { run_id: string; project_id: string }
  if (!run_id || !project_id) {
    return NextResponse.json({ error: 'run_id and project_id are required' }, { status: 400 })
  }

  const db = createAdminClient()

  // ISOLATION. Two separate things were wrong here, and they need two guards.
  //
  // 1. The run was fetched by id alone through the service-role client, so any
  //    signed-in operator could read ANY tenant's run — and this route does not
  //    merely read it, it parses `run.context.news_json` and persists that
  //    content. `runs.project_id` is NOT NULL in production, so the run row is
  //    its own authority: no join, no nullable-ownership policy needed.
  //    Selection and authorization are the SAME query, so a foreign run and a
  //    missing one are indistinguishable and the check cannot drift out of order.
  //
  // 2. `project_id` arrived in the request body and was written straight into
  //    media_news_items. A selector is not a permission and a caller-supplied
  //    foreign key is not attribution: the body value is now VALIDATED against
  //    the server-proven run, and the row is written from the run either way.
  const allowedProjectIds = await getAllowedProjectIds(db, user.id)

  const { data: run } = await db
    .from('runs')
    .select('id, status, context, project_id')
    .eq('id', run_id)
    .in('project_id', scopeProjectFilter(allowedProjectIds))
    .maybeSingle()

  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  // Caller integrity. Reaching this line means the run is already authorized, so
  // this is NOT a tenant boundary and deliberately uses a different status: 404
  // means "no such run for you", 400 means "your body contradicts a run you own".
  // The response never echoes the run's real project_id — a caller who guessed
  // wrong learns only that they guessed wrong.
  //
  // Rejecting rather than repairing is the point. Silently substituting
  // run.project_id would let a caller believe it wrote somewhere it did not.
  if (project_id !== run.project_id) {
    return NextResponse.json(
      { error: 'project_id does not match the run' },
      { status: 400 },
    )
  }
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

  const { data: newsItem, error } = await db
    .from('media_news_items')
    .insert({
      // Server-proven, not the body value — even though they were just checked
      // to be equal. The validated request is a precondition; the run is the
      // source of truth, and only one of those two survives a future refactor.
      project_id: run.project_id,
      run_id: run.id,
      title: parsed.title,
      summary: parsed.summary,
      key_insight: parsed.key_insight,
      url: parsed.source_url ?? null,
      source_name: parsed.source_name ?? null,
      target_audience: parsed.target_audience,
      content_angle: parsed.content_angle,
      virality_score: parsed.virality_score ?? 0,
      status: 'new',
      raw_output: toJson(parsed),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, news_item: newsItem }, { status: 201 })
}
