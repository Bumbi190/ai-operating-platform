/**
 * POST /api/media/scripts/[id]/recheck-quality
 * Owner-scoped, single-script editorial recheck. No voice/render/publish here.
 * Body: { expectedVersion, hook, script }; CAS prevents stale approvals.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProjectAccess, assertProjectAllowed, projectForbidden } from '@/lib/auth/project-access'
import { scoreScript, failedQualityScore, shouldRegenerate } from '@/lib/media/quality'
import { eligibleForRecheck, validateRecheckInput } from '@/lib/media/recheck-quality-policy'
import { MEDIA_PIPELINE_PROJECT } from '@/lib/cost/governed-spend'
import { projectScope } from '@/lib/governance/execution-stop'
import { toJson } from '@/lib/supabase/json'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await resolveProjectAccess()
  if (!access.ok) return access.response

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const input = validateRecheckInput(body)
  if (!input) return NextResponse.json({ error: 'Invalid recheck input' }, { status: 400 })

  const { id } = await params
  const db = createAdminClient()
  const { data: row, error: readError } = await db.from('media_scripts')
    .select('id,project_id,status,version,hook,script,voice_status,video_status,audio_url,video_url,published_at,media_news_items(title,summary,key_insight)')
    .eq('id', id).maybeSingle()
  if (readError) return NextResponse.json({ error: 'Script lookup failed' }, { status: 503 })
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!assertProjectAllowed(row.project_id, access.allowedProjectIds)) return projectForbidden()
  if (!eligibleForRecheck(row, input)) {
    return NextResponse.json({ error: 'Draft is not eligible or version changed' }, { status: 409 })
  }

  const source = Array.isArray(row.media_news_items)
    ? row.media_news_items[0] : row.media_news_items
  if (!source?.title || !source?.summary) {
    return NextResponse.json({ error: 'Original source is unavailable' }, { status: 422 })
  }
  const sourceContext = [source.title, source.summary, source.key_insight ?? ''].join('\n')
  const timeoutScore = failedQualityScore('Editorial recheck timed out; manual review required.')
  let timer: ReturnType<typeof setTimeout> | undefined
  const score = await Promise.race([
    scoreScript(
      { context: 'OPERATOR_EXECUTION', scope: projectScope({ projectId: row.project_id! }) },
      input.hook, input.script, sourceContext,
    ).catch(() => failedQualityScore('Editorial recheck failed; manual review required.')),
    new Promise<typeof timeoutScore>(resolve => {
      timer = setTimeout(() => resolve(timeoutScore), 15_000)
    }),
  ]).finally(() => { if (timer) clearTimeout(timer) })

  // Keep the moderation gate closed unless the NEW script independently passes.
  const approved = !shouldRegenerate(score)
  let claim = db.from('media_scripts')
    .update({
      hook: input.hook, script: input.script, captions: toJson(input.captions), cta: input.cta,
      quality_score: toJson(score),
      status: approved ? 'approved' : 'pending_review',
      version: input.expectedVersion + 1,
      reviewed_at: approved ? new Date().toISOString() : null,
    })
    .eq('id', id).eq('project_id', row.project_id!)
    .eq('status', 'pending_review').eq('version', input.expectedVersion)
    .eq('hook', row.hook).eq('script', row.script)
    .is('published_at', null).is('audio_url', null).is('video_url', null)
  claim = row.voice_status === null ? claim.is('voice_status', null) : claim.eq('voice_status', 'none')
  claim = row.video_status === null ? claim.is('video_status', null) : claim.eq('video_status', 'none')
  const { data: updated, error: writeError } = await claim
    .select('id,status,version,quality_score').maybeSingle()
  if (writeError) return NextResponse.json({ error: 'Recheck save failed' }, { status: 503 })
  if (!updated) return NextResponse.json({ error: 'Draft changed during recheck' }, { status: 409 })

  return NextResponse.json({
    scriptId: updated.id, status: updated.status, version: updated.version,
    passed: approved, verdict: score.verdict,
    next: approved ? 'Operator may start the existing scriptId-specific media pipeline' : 'Manual editorial review required',
  })
}
