/**
 * GET /api/collectors/social/account
 *
 * Atlas Collector — Social Account. Fetches follower counts and account-level
 * metrics (Instagram, Facebook, YouTube) for every project with atlas_mode IN
 * ('active', 'observer'). Upserts per-platform rows to account_snapshots and
 * emits one "social.account_snapshot" Atlas signal per project.
 *
 * Scheduled daily at 06:50 UTC via pg_cron (omnira_social_account).
 * Protected: Authorization: Bearer {CRON_SECRET}
 *
 * Query params:
 *   ?dry_run=1  — fetch + validate + normalize only. No DB writes: skips
 *                 account_snapshots upsert, signal emit, and collector_run log.
 *   ?project=slug — run for a single project only (manual trigger / debug).
 *
 * Historical note: the old /api/media/cron/account-snapshot route was never
 * scheduled via pg_cron — social account history had never started collecting.
 * This route fixes that gap. The old route is superseded but left intact.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SocialAccountCollector } from '@/lib/atlas/collectors/social-account'
import { writeCollectorRun, type CollectorResult } from '@/lib/atlas/collectors/types'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

const collector = new SocialAccountCollector()

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url          = new URL(request.url)
  const dryRun       = url.searchParams.get('dry_run') === '1'
  const filterSlug   = url.searchParams.get('project') ?? null
  const snapshotDate = new Date().toISOString().slice(0, 10)
  const db           = createAdminClient()

  // atlas_mode added by migration 20260623_150000 — not in generated types yet.
  // Cast via established project pattern; typed explicitly below.
  // ?project=slug narrows to a single project for manual triggers.
  let query = (db.from('projects') as any)
    .select('id, slug, atlas_mode')
    .in('atlas_mode', ['active', 'observer'])

  if (filterSlug) query = query.eq('slug', filterSlug)

  const { data: rawProjects, error: projErr } = await query
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

  const hasError = runs.some(r => r.status === 'error')
  return NextResponse.json(
    {
      ok:       !hasError,
      date:     snapshotDate,
      dryRun,
      projects: (projects ?? []).length,
      runs:     runs.map(r => ({
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
