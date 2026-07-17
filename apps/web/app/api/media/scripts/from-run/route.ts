/**
 * POST /api/media/scripts/from-run
 *
 * After a "Generate Script" workflow run completes, call this endpoint
 * to parse the JSON output and save it as a structured media_scripts row.
 *
 * Body: { run_id: string, project_id: string, news_item_id?: string }
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import type { ScriptWriterOutput } from '@/lib/media/types'
import { toJson } from '@/lib/supabase/json'
import { resolveProjectAccess, assertProjectAllowed, projectForbidden } from '@/lib/auth/project-access'
import { assertMediaProductionEligible, eligibilityResponse } from '@/lib/media/eligibility'
import { transitionNewsItemStatus } from '@/lib/media/news-state'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const access = await resolveProjectAccess()
  if (!access.ok) return access.response

  const { run_id, project_id, news_item_id } = await request.json() as {
    run_id: string
    project_id: string
    news_item_id?: string
  }

  if (!run_id || !project_id) {
    return NextResponse.json({ error: 'run_id and project_id are required' }, { status: 400 })
  }
  if (!news_item_id) {
    return NextResponse.json({ error: 'news_item_id is required for media script creation' }, { status: 400 })
  }
  // ISOLATION (C-1): the caller-supplied target project must be owned by the caller,
  // otherwise a media_scripts row could be written into another tenant's project.
  if (!assertProjectAllowed(project_id, access.allowedProjectIds)) return projectForbidden()

  const db = createAdminClient()

  const { data: run } = await db
    .from('runs')
    .select('id, project_id, status, context')
    .eq('id', run_id)
    .single()

  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  // ISOLATION (C-1): the source run must belong to one of the caller's projects
  // (404, no existence probing) AND to the caller-specified target project.
  if (!assertProjectAllowed(run.project_id, access.allowedProjectIds)) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  }
  if (run.project_id !== project_id) {
    return NextResponse.json({ error: 'Run does not belong to project' }, { status: 403 })
  }
  if (run.status !== 'done') {
    return NextResponse.json({ error: `Run not done (status: ${run.status})` }, { status: 400 })
  }

  try {
    await assertMediaProductionEligible(db, { projectId: project_id, newsItemId: news_item_id, stage: 'script' })
  } catch (guardError) {
    const res = eligibilityResponse(guardError)
    return NextResponse.json(res.body, { status: res.status })
  }

  const context = (run.context as Record<string, string>) ?? {}
  const rawJson = context['script_json']
  if (!rawJson) {
    return NextResponse.json({ error: 'Run context has no script_json key' }, { status: 400 })
  }

  let parsed: ScriptWriterOutput
  try {
    const clean = rawJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    parsed = JSON.parse(clean) as ScriptWriterOutput
  } catch {
    return NextResponse.json({ error: 'Failed to parse script_json as JSON', raw: rawJson }, { status: 422 })
  }

  const { data: existingScript } = await db
    .from('media_scripts')
    .select()
    .eq('project_id', project_id)
    .eq('news_item_id', news_item_id)
    .in('status', ['pending_review', 'approved', 'publishing', 'published'])
    .limit(1)
    .maybeSingle()

  if (existingScript) {
    return NextResponse.json({ ok: true, script: existingScript, reused: true })
  }

  const { data: script, error } = await db
    .from('media_scripts')
    .insert({
      project_id,
      run_id,
      news_item_id,
      hook: parsed.hook,
      script: parsed.script,
      captions: parsed.captions,
      hashtags: parsed.hashtags,
      cta: parsed.cta,
      tone: parsed.tone,
      estimated_duration: parsed.estimated_duration,
      raw_output: toJson(parsed),
      status: 'pending_review',
      voice_status: 'none',
      video_status: 'none',
      version: 1,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  try {
    await transitionNewsItemStatus(db, {
      projectId: project_id,
      newsItemId: news_item_id,
      toStatus: 'scripted',
      actor: { id: access.userId, kind: 'user' },
      reason: `Script created from completed run ${run_id}`,
    })
  } catch (transitionError) {
    const res = eligibilityResponse(transitionError)
    return NextResponse.json(res.body, { status: res.status })
  }

  return NextResponse.json({ ok: true, script }, { status: 201 })
}
