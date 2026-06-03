/**
 * GET /api/media/cron/pipeline-retry
 *
 * Lager B — durabel steg-retry för media-pipelinen. Körs var 5:e minut
 * (cron: omnira_pipeline_retry). Ersätter den smala reset_stuck_images.
 *
 * Gör tre saker så inget innehåll kan utebli tyst:
 *   1. STUCK: steg som fastnat i 'generating'/'generating_images' >8 min → markeras
 *      failed (med attempts++) så de retrias.
 *   2. RETRY: steg i 'failed' med attempts<3 och förfallen next_retry_at → körs om
 *      via step2/step3 (?scriptId kringgår tidsfönstret). Färska (≤4 dagar) endast.
 *   3. STEP1-VAKT: om inget script genererats idag (vid checkpoints) → kör om step1.
 *
 * Max attempts (3) nådda → ingen mer auto-retry; ytas i Operations Center + Action
 * Center (steget förblir 'failed' med next_retry_at = null).
 *
 * Skyddad med: Authorization: Bearer {CRON_SECRET}
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPipelineAlert } from '@/lib/media/alert'

export const dynamic     = 'force-dynamic'
export const maxDuration = 300

const PROMPT_SLUG = 'ai-media-automation'
const MAX_ATTEMPTS = 3
const FRESH_DAYS   = 4
const PER_TICK     = 2   // max omkörningar per steg-typ per tick (skyddar budgeten)

function log(msg: string) { console.log(`[cron/pipeline-retry] ${msg}`) }

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db   = createAdminClient()
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ai-operating-platform-web.vercel.app'
  const nowIso       = new Date().toISOString()
  const eightMinAgo  = new Date(Date.now() - 8 * 60_000).toISOString()
  const freshCutoff  = new Date(Date.now() - FRESH_DAYS * 86_400_000).toISOString()
  const results: Record<string, unknown> = {}

  const callStep = async (path: string, scriptId: string) => {
    try {
      const res = await fetch(`${base}${path}?scriptId=${scriptId}`, {
        method: 'GET',
        headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
        signal: AbortSignal.timeout(90_000),
      })
      return { scriptId, ok: res.ok, status: res.status }
    } catch (e) {
      return { scriptId, ok: false, error: e instanceof Error ? e.message : 'fel' }
    }
  }

  // ── 1. STUCK → failed (med attempts++) ────────────────────────────────────────
  await db.from('media_scripts')
    .update({ voice_status: 'failed', pipeline_next_retry_at: nowIso, pipeline_failed_reason: 'Fastnade i voice-generering (>8 min)' })
    .eq('voice_status', 'generating').eq('status', 'approved').lt('updated_at', eightMinAgo)
  await db.from('media_scripts')
    .update({ video_status: 'failed', pipeline_next_retry_at: nowIso, pipeline_failed_reason: 'Fastnade i bild-/render-start (>8 min)' })
    .eq('video_status', 'generating_images').eq('status', 'approved').lt('updated_at', eightMinAgo)

  // ── 2a. RETRY step2 (voice 'failed', attempts kvar, förfallen) ────────────────
  const { data: voiceDue } = await db.from('media_scripts')
    .select('id')
    .eq('voice_status', 'failed').eq('status', 'approved')
    .lt('voice_attempts', MAX_ATTEMPTS)
    .gte('generated_at', freshCutoff)
    .or(`pipeline_next_retry_at.is.null,pipeline_next_retry_at.lte.${nowIso}`)
    .order('generated_at', { ascending: true })
    .limit(PER_TICK)
  results.voiceRetried = []
  for (const s of (voiceDue ?? [])) {
    log(`Retry step2 för ${s.id}`)
    ;(results.voiceRetried as unknown[]).push(await callStep('/api/media/cron/step2', s.id))
  }

  // ── 2b. RETRY step3 (video 'failed', voice klar, attempts kvar, förfallen) ────
  const { data: renderDue } = await db.from('media_scripts')
    .select('id')
    .eq('video_status', 'failed').eq('voice_status', 'ready').eq('status', 'approved')
    .lt('render_attempts', MAX_ATTEMPTS)
    .gte('generated_at', freshCutoff)
    .or(`pipeline_next_retry_at.is.null,pipeline_next_retry_at.lte.${nowIso}`)
    .order('generated_at', { ascending: true })
    .limit(PER_TICK)
  results.renderRetried = []
  for (const s of (renderDue ?? [])) {
    log(`Retry step3 för ${s.id}`)
    ;(results.renderRetried as unknown[]).push(await callStep('/api/media/cron/step3', s.id))
  }

  // ── 3. STEP1-VAKT: inget script idag vid checkpoints (09/12/15 UTC) ───────────
  const hour = new Date().getUTCHours()
  if ([9, 12, 15].includes(hour)) {
    const { data: project } = await db.from('projects').select('id').eq('slug', PROMPT_SLUG).maybeSingle()
    if (project?.id) {
      const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0)
      const { count } = await db.from('media_scripts')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', project.id)
        .gte('generated_at', todayStart.toISOString())
      if ((count ?? 0) === 0) {
        log('Inget script genererat idag — kör om step1')
        const r = await callStep('/api/media/cron/step1', '')   // step1 ignorerar scriptId, kör hela hunten
        results.step1Guard = r
        if (!r.ok) {
          await sendPipelineAlert({
            cronRoute: 'cron/pipeline-retry', step: 'step1_guard',
            error: `step1 producerade inget innehåll idag och omkörning misslyckades (HTTP ${r.status ?? '?'})`,
            context: { hour, note: 'Inget innehåll idag — kräver åtgärd' },
          })
        }
      } else {
        results.step1Guard = { ok: true, scriptsToday: count }
      }
    }
  }

  return NextResponse.json({ ranAt: nowIso, ...results })
}
