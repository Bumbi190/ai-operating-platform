/**
 * GET /api/media/cron/autonomous
 *
 * Compatibility endpoint for the removed one-shot autonomous media pipeline.
 * The old implementation bypassed novelty review, editorial approval, stage
 * claims, and the publication ledger. It is intentionally disabled; operators
 * should use the gated cron steps instead.
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json({
    status: 'autonomous_pipeline_disabled',
    message: 'The inline autonomous pipeline is disabled. Use /api/media/cron/step1 after novelty review, editorial approval, and the gated production steps.',
  }, { status: 409 })
}