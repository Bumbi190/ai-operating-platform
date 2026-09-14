/**
 * GET /api/media/cron/insights
 *
 * Uppdaterar engagemang för alla publicerade inlägg — varje projekt med sin egen
 * verifierade credential (lib/media/insights.ts). Svaret innehåller aldrig någon del
 * av en credential: den tidigare diagnostiken med tokenets prefix och längd är borta.
 * Skyddad med: Authorization: Bearer {CRON_SECRET}
 *
 * Schemalägg via Supabase pg_cron (se 20260601_insights_cron.sql) — dagligen räcker.
 */
import { NextResponse } from 'next/server'
import { refreshAllInsights } from '@/lib/media/insights'
import { createAdminClient } from '@/lib/supabase/admin'
import { detectAndStoreOpportunities } from '@/lib/atlas/opportunities'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await refreshAllInsights()

  // Fas 4: efter att insights uppdaterats, låt Atlas samla möjligheter (best-effort).
  let opportunities: { detected: number; stored: number } | { error: string } = { detected: 0, stored: 0 }
  try {
    const db = createAdminClient()
    const { data: project } = await db.from('projects').select('id').eq('slug', 'ai-media-automation').maybeSingle()
    opportunities = await detectAndStoreOpportunities(db, project?.id)
  } catch (e) {
    opportunities = { error: e instanceof Error ? e.message : 'okänt fel' }
  }

  return NextResponse.json({ ok: true, ...result, opportunities })
}
