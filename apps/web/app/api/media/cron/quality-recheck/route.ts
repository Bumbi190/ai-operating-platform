/**
 * Independently recheck one fresh The Prompt draft blocked by TECHNICAL QA failure.
 * One CAS-claimed paid evaluation; factually rejected or human-quarantined drafts stay blocked.
 * GET /api/media/cron/quality-recheck?scriptId=<uuid> — CRON_SECRET required.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { scoreScript, failedQualityScore, shouldRegenerate, type QualityScore } from '@/lib/media/quality'
import { eligibleForTechnicalQualityRetry, sufficientSourceForRetry } from '@/lib/media/quality-retry-policy'
import { projectScope } from '@/lib/governance/execution-stop'
import { toJson } from '@/lib/supabase/json'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const PROJECT_ID = 'a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
const CLAIM_VERDICT = 'Independent quality recheck claimed; awaiting final editorial decision.'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function evaluateWithDeadline(
  projectId: string, hook: string, script: string, source: string,
): Promise<QualityScore> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeoutScore = failedQualityScore('Independent quality recheck timed out; manual review required.')
  try {
    return await Promise.race([
      scoreScript({ context: 'AUTONOMOUS', scope: projectScope({ projectId }) }, hook, script, source)
        .catch(() => failedQualityScore('Independent quality recheck failed; manual review required.')),
      new Promise<QualityScore>(resolve => {
        timer = setTimeout(() => resolve(timeoutScore), 35_000)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== 'Bearer ' + secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const id = new URL(request.url).searchParams.get('scriptId')
  if (!id || !UUID.test(id)) return NextResponse.json({ error: 'Exact scriptId required' }, { status: 400 })

  const db = createAdminClient()
  const { data: row, error: readError } = await db.from('media_scripts')
    .select('id,project_id,news_item_id,status,version,hook,script,quality_score,generated_at,published_at,voice_status,video_status,audio_url,video_url')
    .eq('id', id).maybeSingle()
  if (readError) return NextResponse.json({ error: 'Script lookup failed' }, { status: 503 })
  if (!row || !eligibleForTechnicalQualityRetry(row, PROJECT_ID, Date.now())) {
    return NextResponse.json({ status: 'not_eligible', scriptId: id })
  }
  if (!row.hook || !row.script || !row.news_item_id || typeof row.version !== 'number') {
    return NextResponse.json({ status: 'missing_content', scriptId: id }, { status: 422 })
  }
  const observedVersion = row.version

  // Consume the one automatic attempt BEFORE any paid evaluation.
  let claim = db.from('media_scripts')
    .update({ version: observedVersion + 1, quality_score: toJson(failedQualityScore(CLAIM_VERDICT)) })
    .eq('id', id).eq('project_id', PROJECT_ID).eq('version', observedVersion).eq('status', 'pending_review')
    .eq('hook', row.hook).eq('script', row.script)
    .is('published_at', null).is('audio_url', null).is('video_url', null)
  claim = row.voice_status === null ? claim.is('voice_status', null) : claim.eq('voice_status', 'none')
  claim = row.video_status === null ? claim.is('video_status', null) : claim.eq('video_status', 'none')
  const { data: claimed, error: claimError } = await claim.select('id').maybeSingle()
  if (claimError) return NextResponse.json({ error: 'Quality claim unavailable' }, { status: 503 })
  if (!claimed) return NextResponse.json({ status: 'already_claimed', scriptId: id })

  const { data: source, error: sourceError } = await db.from('media_news_items')
    .select('title,summary,key_insight,url').eq('id', row.news_item_id).eq('project_id', PROJECT_ID).maybeSingle()

  let score: QualityScore
  if (sourceError || !sufficientSourceForRetry(source)) {
    score = failedQualityScore('Independent quality recheck blocked: source context insufficient.')
  } else {
    const sourceContext = [source!.title, source!.summary, source!.key_insight ?? ''].join('\n')
    score = await evaluateWithDeadline(PROJECT_ID, row.hook, row.script, sourceContext)
  }

  const approved = !shouldRegenerate(score)
  const { data: saved, error: saveError } = await db.from('media_scripts')
    .update({
      quality_score: toJson(score),
      status: approved ? 'approved' : 'pending_review',
      version: observedVersion + 2,
      reviewed_at: approved ? new Date().toISOString() : null,
    })
    .eq('id', id).eq('project_id', PROJECT_ID)
    .eq('version', observedVersion + 1).eq('status', 'pending_review')
    .eq('hook', row.hook).eq('script', row.script)
    .is('published_at', null).is('audio_url', null).is('video_url', null)
    .select('id,status,quality_score').maybeSingle()
  if (saveError || !saved) return NextResponse.json({
    status: 'quality_save_conflict', scriptId: id, error: 'Operator review required',
  }, { status: 409 })

  console.log('[cron/quality-recheck] Decision', { scriptId: id, approved, overall: score.overall })
  return NextResponse.json({
    scriptId: id, status: saved.status, approved, overall: score.overall, verdict: score.verdict,
  })
}
