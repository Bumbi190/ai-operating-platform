/**
 * GET /api/media/cron/insights
 *
 * Uppdaterar Instagram-engagemang för alla publicerade inlägg.
 * Skyddad med: Authorization: Bearer {CRON_SECRET}
 *
 * Schemalägg via Supabase pg_cron (se 20260601_insights_cron.sql) — dagligen räcker.
 */
import { NextResponse } from 'next/server'
import { refreshAllInsights } from '@/lib/media/insights'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await refreshAllInsights()
  return NextResponse.json({ ok: true, ...result })
}
