/**
 * apps/web/scripts/backfill-impact-scores.ts
 *
 * One-shot operational script — NOT deployed code. Run locally with
 * service-role credentials to populate Atlas Impact Score signals for
 * already-published articles + propagate via syncPublishedArticle to
 * The Prompt's articles.atlas_signals column.
 *
 * This script exists because Phase 1 (Signal Platform) and Phase 2 (sync
 * extension) shipped without auto-computing scores for the 5 articles that
 * were already published. We need a one-time backfill so Phase 3 (Brief
 * as web product) has real data to render. Going forward, future article
 * generations will compute scores in the publish pipeline.
 *
 * Idempotent at the signal-record level: re-running adds new rows
 * (atlas_signals is append-only), but getLatestSignalsPerKindForContent
 * still resolves to the same value because inputs are deterministic.
 * Safe to retry on transient failure.
 *
 * Usage:
 *   pnpm tsx apps/web/scripts/backfill-impact-scores.ts             # writes
 *   pnpm tsx apps/web/scripts/backfill-impact-scores.ts --dry-run   # computes only, no writes
 *
 * Env: requires the same Supabase service-role credentials the Atlas
 * backend uses (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
 */

import 'dotenv/config'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeScore, SCORE_ENGINE_VERSION, type ScoreInput, type SourceObservation } from '@/lib/atlas/impact-score'
import { loadAuthorityMap } from '@/lib/atlas/source-authority'
import { recordSignal } from '@/lib/atlas/signals'
import { syncPublishedArticle } from '@/lib/publishing/sync'

interface ArticleRow {
  id:           string
  title:        string | null
  published_at: string | null
  payload:      Record<string, unknown> | null
}

interface ArticleSource {
  url?:  string | null
  name?: string | null
}

const isDryRun = process.argv.includes('--dry-run')

async function main() {
  console.log(`[backfill] mode=${isDryRun ? 'DRY-RUN' : 'WRITE'}  engine=${SCORE_ENGINE_VERSION}`)
  console.log(`[backfill] reading published articles from Omnira...`)

  const db = createAdminClient()
  const { data, error } = await db
    .from('website_content')
    .select('id, title, published_at, payload')
    .eq('status', 'published')
    .order('published_at', { ascending: false })

  if (error) {
    console.error(`[backfill] FAILED to read articles: ${error.message}`)
    process.exit(1)
  }
  if (!data || data.length === 0) {
    console.log(`[backfill] no published articles found. nothing to do.`)
    return
  }

  const rows = data as ArticleRow[]
  console.log(`[backfill] found ${rows.length} published articles.\n`)

  let successCount = 0
  let failCount    = 0
  const summary: Array<{ title: string; score: number | null; status: string }> = []

  for (let i = 0; i < rows.length; i++) {
    const row    = rows[i]
    const label  = `(${i + 1}/${rows.length})`
    const title  = row.title ?? '(untitled)'
    const titleShort = title.length > 60 ? title.slice(0, 57) + '...' : title

    // Build ScoreInput from payload.source. We have ONE source per article today
    // (1:1 news_item → article pipeline). source_count will saturate at value=10.
    // Documented in OMNIRA_ATLAS_BRIEF_ADR.md as a Phase 3 CHECKPOINT concern,
    // not a Phase 2 blocker.
    const payload     = (row.payload ?? {}) as Record<string, unknown>
    const sourceField = (payload.source ?? null) as ArticleSource | null
    const sourceName  = (typeof sourceField?.name === 'string' && sourceField.name.trim()) || null
    const sourceUrl   = (typeof sourceField?.url  === 'string' && sourceField.url.trim())  || null
    const category    = (typeof payload.category === 'object' && payload.category && 'slug' in (payload.category as Record<string, unknown>))
      ? String((payload.category as { slug: unknown }).slug)
      : (typeof payload.category === 'string' ? payload.category : null)

    if (!sourceName || !sourceUrl) {
      console.log(`[backfill] ${label} ${titleShort}`)
      console.log(`[backfill]    SKIP — missing source.name or source.url in payload`)
      summary.push({ title: titleShort, score: null, status: 'skipped:no_source' })
      continue
    }

    const sources: SourceObservation[] = [{
      name:       sourceName,
      url:        sourceUrl,
      observedAt: new Date().toISOString(),
    }]
    const sourceAuthority = await loadAuthorityMap([sourceName])

    const scoreInput: ScoreInput = {
      contentId:       row.id,
      publishedAt:     row.published_at ?? new Date().toISOString(),
      sources,
      category,
      sourceAuthority,
    }

    const score = computeScore(scoreInput)

    console.log(`[backfill] ${label} ${titleShort}`)
    console.log(`[backfill]    source=${sourceName} authority=${sourceAuthority[sourceName]} category=${category ?? 'n/a'}`)
    const dimStr = score.dimensions
      .map((d) => `${d.name}=${d.value} ×${d.weight.toFixed(2)}`)
      .join(', ')
    console.log(`[backfill]    score=${score.value}  dims=[${dimStr}]  excluded=[${score.excluded.join(',') || '-'}]`)

    if (isDryRun) {
      console.log(`[backfill]    (dry-run — no signal recorded, no sync triggered)\n`)
      summary.push({ title: titleShort, score: score.value, status: 'dry-run' })
      successCount++
      continue
    }

    try {
      const signal = await recordSignal({
        contentId: row.id,
        kind:      'impact_score',
        payload:   score as unknown as Record<string, unknown>,
        version:   SCORE_ENGINE_VERSION,
      })
      console.log(`[backfill]    recordSignal → ${signal.id}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[backfill]    recordSignal FAILED: ${msg}`)
      summary.push({ title: titleShort, score: score.value, status: `failed:recordSignal:${msg}` })
      failCount++
      continue
    }

    const syncResult = await syncPublishedArticle(row.id)
    if (syncResult.ok) {
      const statusLabel = syncResult.status === 'synced' ? 'synced'
                       : `skipped:${(syncResult as { reason: string }).reason ?? 'unknown'}`
      console.log(`[backfill]    syncPublishedArticle → ${statusLabel}\n`)
      summary.push({ title: titleShort, score: score.value, status: statusLabel })
      successCount++
    } else {
      console.error(`[backfill]    syncPublishedArticle FAILED: ${syncResult.reason}\n`)
      summary.push({ title: titleShort, score: score.value, status: `failed:sync:${syncResult.reason}` })
      failCount++
    }
  }

  console.log(`\n[backfill] ──────────────── SUMMARY ────────────────`)
  console.log(`[backfill] mode:    ${isDryRun ? 'DRY-RUN (no writes)' : 'WRITE'}`)
  console.log(`[backfill] total:   ${rows.length}`)
  console.log(`[backfill] success: ${successCount}`)
  console.log(`[backfill] failed:  ${failCount}`)
  for (const s of summary) {
    const scoreLabel = s.score === null ? '   -' : s.score.toString().padStart(4)
    console.log(`[backfill]   ${scoreLabel}  ${s.status.padEnd(20)}  ${s.title}`)
  }
  if (failCount > 0) process.exit(1)
}

main().catch((err) => {
  console.error(`[backfill] UNCAUGHT: ${err instanceof Error ? err.stack ?? err.message : String(err)}`)
  process.exit(1)
})
