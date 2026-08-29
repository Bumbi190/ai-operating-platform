/**
 * GET /api/workflows/tick — the scheduled-continuation driver.
 *
 * Called by pg_cron (`omnira_workflow_tick`) every minute through
 * omnira_cron.call_vercel, and protected exactly like /api/runs/drain: a shared
 * CRON_SECRET bearer token. It is not reachable from a browser session and
 * grants nothing to one.
 *
 * The tick EVALUATES. It does not advance states, execute actions, call
 * providers, or reach Familje-Stunden — and it cannot author authority, because
 * the only ledger capability it holds is a read-only reader.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { tickDueWorkflows } from '@/lib/workflows/tick'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await tickDueWorkflows(createAdminClient())
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    // A dead scheduler must look different from a quiet one, so surface the
    // failure as a 500 the heartbeat can see rather than an empty success.
    const message = e instanceof Error ? e.message : 'unknown error'
    console.error('[workflow-tick] tick failed:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
