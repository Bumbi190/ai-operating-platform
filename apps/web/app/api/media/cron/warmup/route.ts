/**
 * GET /api/media/cron/warmup
 *
 * Pings Hermes /health to wake up the Render free-tier instance
 * before step1 runs. Render spins down after 15 min inactivity
 * and may take ~50s to cold-start. Make one bounded attempt before step1;
 * a successful health response does not guarantee later browser readiness.
 *
 * Schedule: 07:10 and 17:10 UTC (10 min before step1 at 07:20/17:20)
 *
 * Protected by: Authorization: Bearer {CRON_SECRET}
 */

import { NextResponse } from 'next/server'
import { checkHermesHealth, isHermesConfigured } from '@/lib/media/hermes'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isHermesConfigured()) {
    return NextResponse.json({ status: 'skipped', reason: 'HERMES_URL not set' })
  }

  // Allow a cold start, then abort with five seconds left to return a result.
  // One health request only: no browser work, generation or automatic retries.
  const healthy = await checkHermesHealth(55_000)

  console.log(`[cron/warmup] Hermes health: ${healthy ? 'OK — warm' : 'cold or unreachable'}`)

  return NextResponse.json({
    status:    healthy ? 'warm' : 'cold',
    hermes:    healthy,
    ranAt:     new Date().toISOString(),
  })
}
