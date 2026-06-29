/**
 * GET /api/collectors/stripe/revenue
 *
 * Atlas Collector — Stripe Revenue. Fetches Stripe metrics for each project
 * with atlas_mode IN ('active', 'observer') and Stripe configured, upserts
 * to revenue_snapshots, and emits a "stripe.mrr_snapshot" Atlas signal.
 *
 * Scheduled daily at 06:45 UTC via pg_cron (omnira_stripe_revenue).
 * Protected: Authorization: Bearer {CRON_SECRET}
 *
 * Query params:
 *   ?dry_run=1  — fetch + validate + normalize only. No DB writes: skips
 *                 revenue_snapshots upsert, signal emit, and collector_run log.
 *
 * Currently Stripe is only configured for Familje-Stunden. The route is
 * multi-project-ready: it will run for any collectable project where
 * STRIPE_RESTRICTED_KEY resolves (single key, multiple projects possible
 * in future once per-project Stripe accounts are supported).
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { StripeRevenueCollector } from '@/lib/atlas/collectors/stripe-revenue'
import { writeCollectorRun, type CollectorResult } from '@/lib/atlas/collectors/types'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

// Projects eligible for Stripe collection.
// Today: a single restricted key covers Familje-Stunden's Stripe account.
// Future: expand to per-project Stripe config when multi-account billing ships.
const STRIPE_PROJECT_SLUGS = ['familje-stunden']

const collector = new StripeRevenueCollector()

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dryRun      = new URL(request.url).searchParams.get('dry_run') === '1'
  const snapshotDate = new Date().toISOString().slice(0, 10)
  const db           = createAdminClient()

  // atlas_mode added by migration 20260623_150000 — not in generated types yet.
  // Cast via established project pattern; typed explicitly below.
  const { data: rawProjects, error: projErr } = await (db.from('projects') as any)
    .select('id, slug, atlas_mode')
    .in('slug', STRIPE_PROJECT_SLUGS)
    .in('atlas_mode', ['active', 'observer'])
  const projects = rawProjects as Array<{ id: string; slug: string; atlas_mode: string }> | null

  if (projErr) {
    return NextResponse.json({ error: `projects query failed: ${projErr.message}` }, { status: 500 })
  }

  const runs: CollectorResult[] = []

  for (const project of projects ?? []) {
    const result = await collector.run({
      db,
      projectId:    project.id,
      projectSlug:  project.slug,
      snapshotDate,
      dryRun,
    })

    if (!dryRun) await writeCollectorRun(db, result)
    runs.push(result)
  }

  if ((projects ?? []).length === 0) {
    return NextResponse.json({
      ok:      true,
      date:    snapshotDate,
      dryRun,
      note:    'No collectable projects matched STRIPE_PROJECT_SLUGS',
      runs:    [],
    })
  }

  const hasError = runs.some(r => r.status === 'error')
  return NextResponse.json(
    {
      ok:     !hasError,
      date:   snapshotDate,
      dryRun,
      runs:   runs.map(r => ({
        collectorId:  r.collectorId,
        projectSlug:  r.projectSlug,
        status:       r.status,
        signalId:     r.signalId,
        durationMs:   r.durationMs,
        error:        r.error,
      })),
    },
    { status: hasError ? 500 : 200 },
  )
}
