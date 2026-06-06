/**
 * GET /api/media/cron/dream
 *
 * Nattlig dream cycle (självförbättring). Schemalagt via pg_cron (omnira_dream)
 * ~02:00 svensk tid. Kör dream-analysen för VARJE projekt; projekt utan körningar
 * de senaste 24h hoppas tyst över (billigt — bara en DB-fråga, inget Claude-anrop).
 *
 * Skyddat av: Authorization: Bearer {CRON_SECRET}  (samma mönster som övriga cron-routes).
 * Per-projekt-fel isoleras: ett projekt som fallerar stoppar inte de andra.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runDreamCycleForProject } from '@/lib/ai/dream'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const { data: projects } = await db.from('projects').select('id, name, slug')

  // Parallellt per projekt → total tid begränsas av det långsammaste anropet,
  // inte summan (håller oss under maxDuration även med fler projekt).
  const settled = await Promise.allSettled(
    (projects ?? []).map(p => runDreamCycleForProject({ id: p.id, name: p.name })),
  )

  const results = (projects ?? []).map((p, i) => {
    const s = settled[i]
    if (s.status === 'fulfilled') {
      return { project: p.slug, ran: s.value.ran, insights_saved: s.value.insights_saved, summary: s.value.summary }
    }
    const msg = s.reason instanceof Error ? s.reason.message : String(s.reason)
    console.error(`[cron/dream] ${p.slug} misslyckades: ${msg}`)
    return { project: p.slug, ran: false, error: msg }
  })

  return NextResponse.json({ ran_at: new Date().toISOString(), projects: results })
}
