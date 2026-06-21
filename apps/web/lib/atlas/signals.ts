/**
 * lib/atlas/signals.ts — Atlas Signal Platform read/write interface.
 *
 * Signals are append-only records stored in public.atlas_signals on Omnira.
 * Producers (Score Engine today, Opportunity Detector tomorrow) call
 * recordSignal to persist their output. Consumers (Atlas Brief assembly,
 * /atlas/score pages on The Prompt) call getLatestSignal or — coming in
 * Phase 4 — querySignals for richer filtering.
 *
 * Producers and consumers never touch the atlas_signals table directly.
 * This keeps the Platform contract stable as the underlying storage
 * evolves. See OMNIRA_ATLAS_BRIEF_ADR.md.
 */

import { createAdminClient } from '@/lib/supabase/admin'

/** A single signal record as exposed to producers and consumers. */
export interface SignalRecord<P = Record<string, unknown>> {
  id:         string
  contentId:  string | null
  kind:       string
  payload:    P
  version:    string
  producedAt: string                // ISO timestamp
}

export interface RecordSignalArgs<P = Record<string, unknown>> {
  /** Nullable for global signals (e.g. weekly_market_summary). */
  contentId: string | null
  kind:      string
  payload:   P
  /** Producer version, e.g. 'score-engine-1.0.0'. */
  version:   string
}

/** DB row shape — kept private; we map to/from SignalRecord at the boundary. */
interface DbRow {
  id:          string
  content_id:  string | null
  kind:        string
  payload:     unknown
  version:     string
  produced_at: string
}

function rowToRecord<P>(row: DbRow): SignalRecord<P> {
  return {
    id:         row.id,
    contentId:  row.content_id,
    kind:       row.kind,
    payload:    row.payload as P,
    version:    row.version,
    producedAt: row.produced_at,
  }
}

/**
 * Append a new signal. Never updates. Returns the persisted record
 * including the generated id and timestamp.
 */
export async function recordSignal<P = Record<string, unknown>>(
  args: RecordSignalArgs<P>,
): Promise<SignalRecord<P>> {
  const db = createAdminClient()
  const { data, error } = await db
    .from('atlas_signals')
    .insert({
      content_id: args.contentId,
      kind:       args.kind,
      payload:    args.payload as never,
      version:    args.version,
    })
    .select('id, content_id, kind, payload, version, produced_at')
    .single()

  if (error) throw new Error(`[atlas-signals] recordSignal failed: ${error.message}`)
  if (!data) throw new Error('[atlas-signals] recordSignal returned no row')
  return rowToRecord<P>(data as DbRow)
}

/**
 * Returns the most recently produced signal for the given (contentId, kind),
 * or null if none exists. Used by syncPublishedArticle and /atlas/score pages.
 */
export async function getLatestSignal<P = Record<string, unknown>>(args: {
  contentId: string
  kind:      string
}): Promise<SignalRecord<P> | null> {
  const db = createAdminClient()
  const { data, error } = await db
    .from('atlas_signals')
    .select('id, content_id, kind, payload, version, produced_at')
    .eq('content_id', args.contentId)
    .eq('kind', args.kind)
    .order('produced_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`[atlas-signals] getLatestSignal failed: ${error.message}`)
  if (!data) return null
  return rowToRecord<P>(data as DbRow)
}

/**
 * Returns the latest payload per kind for a single content row, shaped as
 * { [kind]: payload }. Matches the denormalized articles.atlas_signals jsonb
 * on The Prompt — used by syncPublishedArticle as a direct pass-through into
 * the publish payload.
 *
 * Empty object when the content has no signals (or content does not exist).
 *
 * Implementation: pull all rows for the content sorted DESC, group by kind
 * client-side, keep the first occurrence. At ~5 signal kinds per article
 * this is trivially fast; we avoid a Postgres window function for v1.
 */
export async function getLatestSignalsPerKindForContent(
  contentId: string,
): Promise<Record<string, unknown>> {
  const db = createAdminClient()
  const { data, error } = await db
    .from('atlas_signals')
    .select('kind, payload, produced_at')
    .eq('content_id', contentId)
    .order('produced_at', { ascending: false })

  if (error) throw new Error(`[atlas-signals] getLatestSignalsPerKindForContent failed: ${error.message}`)
  if (!data || data.length === 0) return {}

  const latestPerKind: Record<string, unknown> = {}
  for (const row of data as Array<{ kind: string; payload: unknown }>) {
    if (!(row.kind in latestPerKind)) latestPerKind[row.kind] = row.payload
  }
  return latestPerKind
}
