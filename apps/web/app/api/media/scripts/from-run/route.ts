/**
 * POST /api/media/scripts/from-run
 *
 * After a "Generate Script" workflow run completes, call this endpoint
 * to parse the JSON output and save it as a structured media_scripts row.
 *
 * Body: { run_id: string, project_id: string, news_item_id?: string }
 */
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import type { ScriptWriterOutput } from '@/lib/media/types'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { run_id, project_id, news_item_id } = await request.json() as {
    run_id: string
    project_id: string
    news_item_id?: string
  }

  if (!run_id || !project_id) {
    return NextResponse.json({ error: 'run_id and project_id are required' }, { status: 400 })
  }

  const db = createAdminClient()

  const { data: run } = await db
    .from('runs')
    .select('id, status, context')
    .eq('id', run_id)
    .single()

  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  if (run.status !== 'done') {
    return NextResponse.json({ error: `Run not done (status: ${run.status})` }, { status: 400 })
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

  const { data: script, error } = await db
    .from('media_scripts')
    .insert({
      project_id,
      run_id,
      news_item_id: news_item_id ?? null,
      hook: parsed.hook,
      script: parsed.script,
      captions: parsed.captions,
      hashtags: parsed.hashtags,
      cta: parsed.cta,
      tone: parsed.tone,
      estimated_duration: parsed.estimated_duration,
      raw_output: parsed,
      status: 'pending_review',
      voice_status: 'none',
      video_status: 'none',
      version: 1,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Mark news item as scripted
  if (news_item_id) {
    await db
      .from('media_news_items')
      .update({ status: 'scripted' })
      .eq('id', news_item_id)
  }

  return NextResponse.json({ ok: true, script }, { status: 201 })
}
