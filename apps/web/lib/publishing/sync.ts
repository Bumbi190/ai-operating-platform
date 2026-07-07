/**
 * lib/publishing/sync.ts
 *
 * Post-publish state sync: push the *current* state of an already-published
 * website_content row to its destination (e.g. The Prompt).
 *
 * Background — the original publish flow (lib/article/approval.ts) freezes a
 * PublishPayload in approvals.content at approval-creation time. Any later
 * mutation on the website_content row (hero regeneration, title fix, summary
 * tweak) never reaches the destination because no code path re-emits the
 * payload. This primitive is that missing piece.
 *
 * Shape: spread the frozen payload as the base, then overlay the four
 * denormalized columns that can drift post-publish — title, summary, slug,
 * hero_image_url — plus the real published_at (the frozen value is null
 * because the review route stamps the timestamp on the row, not the jsonb)
 * and external_id (defensive re-assertion from the row).
 *
 * Atlas Signals overlay (Phase 2): also fetches the latest-per-kind signal
 * map from Omnira's atlas_signals table and includes it as the
 * `atlas_signals` payload key. This is a FAST-READ CACHE for the
 * destination's frontend rendering — the authoritative signal history lives
 * in atlas_signals on Omnira, not in the destination column. Signal-platform
 * failures NEVER block publishing: a defensive try/catch around the signal
 * fetch swallows errors, logs a warning, and lets sync continue without
 * the atlas_signals key (which preserves whatever value the destination
 * column already had — see the RPC's "else atlas_signals" branch).
 *
 * Idempotent on the destination side: publish_article(jsonb) is PATCH and
 * keyed on external_id. Calling sync with no drift is a safe no-op.
 *
 * Never throws. Returns a discriminated result so callers (hero-image.ts,
 * the manual /sync route) can surface the outcome without try/catch glue.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { publishArticle } from '@/lib/publishing/publish'
import { getLatestSignalsPerKindForContent } from '@/lib/atlas/signals'
import type { PublishPayload } from '@/lib/publishing/types'

export type SyncResult =
  | { ok: true;  status: 'synced'  }
  | { ok: true;  status: 'skipped'; reason: SyncSkipReason }
  | { ok: false; status: 'failed';  reason: string }

export type SyncSkipReason =
  | 'not_found'
  | 'not_published'
  | 'missing_external_id'
  | 'missing_destination_key'

interface ContentRow {
  id: string
  status: string | null
  external_id: string | null
  destination_key: string | null
  title: string | null
  summary: string | null
  slug: string | null
  hero_image_url: string | null
  published_at: string | null
  payload: Record<string, unknown> | null
}

export async function syncPublishedArticle(articleId: string): Promise<SyncResult> {
  const db = createAdminClient()

  const { data, error } = await db
    .from('website_content')
    .select('id, status, external_id, destination_key, title, summary, slug, hero_image_url, published_at, payload')
    .eq('id', articleId)
    .maybeSingle()

  if (error) {
    return { ok: false, status: 'failed', reason: `load failed: ${error.message}` }
  }
  if (!data) {
    return { ok: true, status: 'skipped', reason: 'not_found' }
  }

  const row = data as ContentRow

  if (row.status !== 'published') {
    return { ok: true, status: 'skipped', reason: 'not_published' }
  }
  if (!row.external_id || !row.external_id.trim()) {
    return { ok: true, status: 'skipped', reason: 'missing_external_id' }
  }
  if (!row.destination_key || !row.destination_key.trim()) {
    return { ok: true, status: 'skipped', reason: 'missing_destination_key' }
  }

  // Atlas Signals overlay (Phase 2) — latest-per-kind cache for destination
  // rendering. Defensive try/catch: a signal-platform failure must NEVER
  // block publishing. On any error we omit the atlas_signals key entirely,
  // which makes the destination RPC preserve its existing column value
  // (per the "else atlas_signals" branch in publish_article).
  let atlasSignals: Record<string, unknown> = {}
  try {
    atlasSignals = await getLatestSignalsPerKindForContent(articleId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(
      `[publish-sync] getLatestSignalsPerKindForContent failed for article=${articleId}: ${msg}. Continuing without atlas_signals overlay.`,
    )
    atlasSignals = {}
  }
  const hasSignals = Object.keys(atlasSignals).length > 0

  const frozen = (row.payload ?? {}) as Partial<PublishPayload>
  const syncPayload: PublishPayload = {
    ...frozen,
    version: 1,
    external_id: row.external_id,
    title: row.title ?? frozen.title,
    summary: row.summary,
    slug: row.slug,
    hero_image_url: row.hero_image_url,
    published_at: row.published_at,
    // Include atlas_signals only when we actually have data. An empty {} would
    // still trip the RPC's `payload ? 'atlas_signals'` check and overwrite the
    // destination column with {} — by omitting the key we preserve whatever
    // value the destination already holds.
    ...(hasSignals ? { atlas_signals: atlasSignals } : {}),
  }

  try {
    await publishArticle(row.destination_key, syncPayload)
    return { ok: true, status: 'synced' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, status: 'failed', reason: msg }
  }
}
