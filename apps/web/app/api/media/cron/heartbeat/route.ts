/**
 * GET /api/media/cron/heartbeat
 *
 * Cron Heartbeat — upptäcker om automationen slutar köra. Körs var 10:e minut
 * av BÅDE pg_cron (omnira_heartbeat) OCH Vercel-native cron (vercel.json) → de
 * två oberoende schemaläggarna korskontrollerar varandra, så även total
 * pg_cron-död upptäcks.
 *
 * Två lager: (1) fyrade schemaläggaren? via public.cron_job_status() →
 * cron.job_run_details. (2) gjorde jobbet faktiskt jobbet? via domän-bevis
 * (senaste nyhet / publicering / token-verifiering). Skriver public.cron_heartbeat
 * (läses av Operations Center, Action Center, Atlas). Larmar deduperat.
 *
 * Skyddad med: Authorization: Bearer {CRON_SECRET}  (sätts av både pg_cron och Vercel).
 *
 * Deploy-not: tvingar fram en Vercel-build (tomma commits hoppas över).
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPipelineAlert } from '@/lib/media/alert'

export const dynamic     = 'force-dynamic'
export const maxDuration = 30

const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000

type Cad = 'interval' | 'daily' | 'weekly'
interface Check {
  key: string; label: string; jobs: string[]; cadence: string; type: Cad
  intervalMin?: number; slotsUtc?: string[]; graceMin: number
  evidence?: 'news' | 'token'   // domän-bevis (konservativt: bara där arbete väntas varje gång)
}

const CHECKS: Check[] = [
  { key: 'runs_drain',     label: 'Runs drain',     jobs: ['omnira_runs_drain'],     cadence: 'varje minut', type: 'interval', intervalMin: 1, graceMin: 5 },
  { key: 'runs_reaper',    label: 'Runs reaper',    jobs: ['omnira_runs_reaper'],    cadence: 'varje minut', type: 'interval', intervalMin: 1, graceMin: 5 },
  { key: 'pipeline_retry', label: 'Pipeline retry', jobs: ['omnira_pipeline_retry'], cadence: 'var 5:e min', type: 'interval', intervalMin: 5, graceMin: 10 },
  { key: 'news',           label: 'News Hunter',    jobs: ['omnira_news_morning'],   cadence: 'dagligen 06:30', type: 'daily', slotsUtc: ['06:30'], graceMin: 90, evidence: 'news' },
  { key: 'token_health',   label: 'Token Health',   jobs: ['omnira_token_health'],   cadence: 'dagligen 06:15', type: 'daily', slotsUtc: ['06:15'], graceMin: 90, evidence: 'token' },
  { key: 'publish',        label: 'Publish',        jobs: ['omnira_publish_morning', 'omnira_publish_evening'], cadence: '08:00 + 18:00', type: 'daily', slotsUtc: ['08:00', '18:00'], graceMin: 90 },
  { key: 'youtube',        label: 'Publish YouTube',jobs: ['omnira_youtube_morning', 'omnira_youtube_evening'], cadence: '08:05 + 18:05', type: 'daily', slotsUtc: ['08:05', '18:05'], graceMin: 90 },
  { key: 'refresh_tokens', label: 'Refresh tokens', jobs: ['omnira_refresh_tokens'], cadence: 'veckovis (mån)', type: 'weekly', graceMin: 24 * 60 },
]

function slotToday(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(); d.setUTCHours(h, m, 0, 0); return d.getTime()
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db  = createAdminClient()
  const now = Date.now()
  const nowIso = new Date().toISOString()

  // Lager 1: fyrade schemaläggaren?
  const { data: jobs, error } = await db.rpc('cron_job_status')
  if (error) return NextResponse.json({ status: 'cron_status_error', error: error.message }, { status: 500 })
  const firedAt = new Map<string, number>()
  for (const j of (jobs ?? []) as any[]) if (j.last_run) firedAt.set(j.jobname, new Date(j.last_run).getTime())

  // Lager 2: domän-bevis
  const ev = async (p: Promise<{ data: any }>) => { try { const { data } = await p; return data?.[0]?.t ? new Date(data[0].t).getTime() : null } catch { return null } }
  const [newsEv, tokenEv] = await Promise.all([
    ev(db.from('media_news_items').select('t:fetched_at').order('fetched_at', { ascending: false }).limit(1) as any),
    ev(db.from('token_health').select('t:last_verified_at').order('last_verified_at', { ascending: false }).limit(1) as any),
  ])
  const evidenceFor = (c: Check): number | null => c.evidence === 'news' ? newsEv : c.evidence === 'token' ? tokenEv : null

  const { data: prev } = await db.from('cron_heartbeat').select('jobname, last_warned_at, status')
  const prevBy = new Map<string, { last_warned_at: string | null; status: string }>((prev ?? []).map((r: any) => [r.jobname, r]))

  const summary: Record<string, string> = {}

  for (const c of CHECKS) {
    const lastFired = c.jobs.map(j => firedAt.get(j) ?? 0).reduce((a, b) => Math.max(a, b), 0) || null
    const evAt = evidenceFor(c)
    let status = 'ok'
    let detail = ''

    if (!lastFired) {
      // Intervalljobb borde ha kört inom minuter → dött. Dagliga/veckovisa utan
      // körning ännu = nytt jobb → pending (inget larm).
      status = c.type === 'interval' ? 'dead' : 'pending_first_run'
      detail = c.type === 'interval' ? 'Ingen körning registrerad' : 'Väntar på första körningen'
    } else if (c.type === 'interval') {
      const ageMin = (now - lastFired) / MIN
      const late = (c.intervalMin ?? 1) + c.graceMin
      const dead = Math.max((c.intervalMin ?? 1) * 6, late * 3)
      status = ageMin > dead ? 'dead' : ageMin > late ? 'late' : 'ok'
      detail = `Senast ${Math.round(ageMin)} min sedan`
    } else if (c.type === 'daily') {
      const passed = (c.slotsUtc ?? []).map(slotToday).filter(t => t <= now)
      if (passed.length === 0) {
        status = 'ok'; detail = 'Inte schemalagd ännu idag'
      } else {
        const expected = Math.max(...passed)
        if (now < expected + c.graceMin * MIN) { status = 'ok'; detail = 'Inom grace-fönster' }
        else if (lastFired >= expected)        { status = 'ok'; detail = 'Kört enligt schema' }
        else if (now - lastFired > 26 * HOUR)  { status = 'dead'; detail = 'Missade hela dygnet' }
        else                                    { status = 'late'; detail = `Missade ${new Date(expected).toISOString().slice(11, 16)} UTC` }
      }
    } else { // weekly
      const ageDays = (now - lastFired) / DAY
      status = ageDays > 9 ? 'dead' : ageDays > 7 + c.graceMin / (24 * 60) ? 'late' : 'ok'
      detail = `Senast ${Math.round(ageDays)} dygn sedan`
    }

    // Endpoint-fel: schemaläggaren fyrade nyligen men inget arbete syns på 2 cykler.
    if (status === 'ok' && c.evidence && lastFired) {
      const cycleMs = c.type === 'interval' ? (c.intervalMin ?? 1) * MIN : DAY
      if (!evAt || now - evAt > 2 * cycleMs) { status = 'endpoint_failing'; detail = 'Fyrade men inget arbete registrerat' }
    }

    summary[c.key] = status

    // Larm (deduperat: ett per jobb per 6h om problemstatus kvarstår/försämras).
    const problem = ['late', 'dead', 'endpoint_failing'].includes(status)
    const prevRow = prevBy.get(c.key)
    const lastWarned = prevRow?.last_warned_at ? new Date(prevRow.last_warned_at).getTime() : 0
    const changed = prevRow?.status !== status
    let warnAt = prevRow?.last_warned_at ?? null
    if (problem && (changed || now - lastWarned > 6 * HOUR)) {
      try {
        await sendPipelineAlert({
          cronRoute: 'cron/heartbeat', step: c.key,
          error: `${c.label}: ${status} — ${detail}`,
          severity: status === 'late' ? 'warning' : undefined,
          context: { job: c.label, cadence: c.cadence, status, detail },
        })
      } catch { /* non-blocking */ }
      warnAt = nowIso
    }

    await db.from('cron_heartbeat').upsert({
      jobname: c.key, label: c.label, cadence: c.cadence,
      last_fired_at: lastFired ? new Date(lastFired).toISOString() : null,
      last_evidence_at: evAt ? new Date(evAt).toISOString() : null,
      status, detail, checked_at: nowIso, last_warned_at: warnAt, updated_at: nowIso,
    }, { onConflict: 'jobname' })
  }

  return NextResponse.json({ ranAt: nowIso, summary })
}
