/**
 * GET /api/collectors/handlarborsen/marketplace
 *
 * Atlas Collector — Handlarbörsen marketplace aggregates (read-only).
 * Runs for exactly one project (the verified Handlarbörsen id + slug) and only while
 * its atlas_mode is 'observer' or 'active'. Accepts no URL, host or project input.
 *
 * NOT scheduled: no pg_cron entry exists for this route yet.
 * Protected: Authorization: Bearer {CRON_SECRET} (constant-time compare).
 *
 * Query params:
 *   ?dry_run=1  — fetch + validate + normalize only. Writes nothing: no snapshot,
 *                 no atlas_signals row, no collector_runs row.
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  HANDLARBORSEN_PROJECT_ID,
  HANDLARBORSEN_PROJECT_SLUG,
  HandlarborsenMarketplaceCollector,
  isEligibleHandlarborsenProject,
  resolveMetricsCredential,
} from '@/lib/atlas/collectors/handlarborsen-marketplace'
import { writeCollectorRun } from '@/lib/atlas/collectors/types'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

const collector = new HandlarborsenMarketplaceCollector()

function bearerMatches(header: string | null, secret: string): boolean {
  if (header === null) return false
  const a = createHash('sha256').update(header).digest()
  const b = createHash('sha256').update(`Bearer ${secret}`).digest()
  return timingSafeEqual(a, b)
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || !bearerMatches(request.headers.get('authorization'), cronSecret)) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const dryRun       = new URL(request.url).searchParams.get('dry_run') === '1'
  const snapshotDate = new Date().toISOString().slice(0, 10)
  const db           = createAdminClient()

  // atlas_mode is not in generated types — established cast.
  const { data: rawProject, error: projErr } = await (db.from('projects') as any)
    .select('id, slug, atlas_mode')
    .eq('id', HANDLARBORSEN_PROJECT_ID)
    .eq('slug', HANDLARBORSEN_PROJECT_SLUG)
    .in('atlas_mode', ['active', 'observer'])
    .maybeSingle()

  if (projErr) return json({ error: 'projects query failed' }, 500)

  const project = rawProject as { id: string; slug: string; atlas_mode: string } | null
  if (!isEligibleHandlarborsenProject(project)) {
    return json({ ok: true, date: snapshotDate, dryRun, note: 'Handlarborsen project not collectable', runs: [] })
  }

  const result = await collector.run({
    db,
    projectId:   project!.id,
    projectSlug: project!.slug,
    snapshotDate,
    dryRun,
  })

  if (!dryRun) await writeCollectorRun(db, result)

  const credential = resolveMetricsCredential()
  const meta = result.metadata as { completeness?: string; unavailable?: unknown; metrics?: unknown }

  return json(
    {
      ok:     result.status !== 'error',
      date:   snapshotDate,
      dryRun,
      runs: [{
        collectorId:  result.collectorId,
        projectSlug:  result.projectSlug,
        status:       result.status,
        reason:       result.status === 'skipped' && !credential.ok ? credential.reason : undefined,
        completeness: result.status === 'ok' ? meta.completeness : undefined,
        unavailable:  result.status === 'ok' ? meta.unavailable : undefined,
        // Aggregate counts only; returned on dry runs so the payload can be reviewed.
        metrics:      dryRun && result.status === 'ok' ? meta.metrics : undefined,
        signalId:     result.signalId,
        durationMs:   result.durationMs,
        error:        result.error,
      }],
    },
    result.status === 'error' ? 500 : 200,
  )
}
