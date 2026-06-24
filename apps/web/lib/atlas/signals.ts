/**
 * lib/atlas/signals.ts — Atlas Signal Platform read/write interface.
 *
 * Signals are append-only records stored in public.atlas_signals on Omnira.
 * Producers (Score Engine, Collectors) call recordSignal to persist output.
 * Consumers (Atlas Brief, opportunity engine, trend APIs) call the query
 * functions below.
 *
 * Producers and consumers never touch atlas_signals directly. This keeps the
 * Platform contract stable as storage evolves. See OMNIRA_ATLAS_BRIEF_ADR.md.
 *
 * Schema evolution (2026-06-23): atlas_signals now has project_id and source
 * columns. Both are optional in RecordSignalArgs for backward compatibility —
 * existing callers (impact score engine, backfill script) are unaffected.
 */

import { createAdminClient } from '@/lib/supabase/admin'

// ── Record types ──────────────────────────────────────────────────────────────

/** A single signal record as exposed to producers and consumers. */
export interface SignalRecord<P = Record<string, unknown>> {
  id:         string
  contentId:  string | null
  /** Project this signal belongs to. Null for platform-global signals. */
  projectId:  string | null
  /** External source: 'stripe', 'instagram', 'facebook', etc. Null for internal signals. */
  source:     string | null
  kind:       string
  payload:    P
  version:    string
  producedAt: string                // ISO timestamp
}

export interface RecordSignalArgs<P = Record<string, unknown>> {
  /** Nullable for project-scoped or global signals. */
  contentId:  string | null
  /** Project this signal belongs to. Optional for backward compat. */
  projectId?: string | null
  /** External source identifier. Optional for backward compat. */
  source?:    string | null
  kind:       string
  payload:    P
  /** Producer version, e.g. 'score-engine-1.0.0'. */
  version:    string
}

/** DB row shape — kept private; we map to/from SignalRecord at the boundary. */
interface DbRow {
  id:          string
  content_id:  string | null
  project_id:  string | null
  source:      string | null
  kind:        string
  payload:     unknown
  version:     string
  produced_at: string
}

const SELECT_COLS = 'id, content_id, project_id, source, kind, payload, version, produced_at'

function rowToRecord<P>(row: DbRow): SignalRecord<P> {
  return {
    id:         row.id,
    contentId:  row.content_id,
    projectId:  row.project_id,
    source:     row.source,
    kind:       row.kind,
    payload:    row.payload as P,
    version:    row.version,
    producedAt: row.produced_at,
  }
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Append a new signal. Never updates. Returns the persisted record including
 * the generated id and timestamp.
 */
export async function recordSignal<P = Record<string, unknown>>(
  args: RecordSignalArgs<P>,
): Promise<SignalRecord<P>> {
  const db = createAdminClient()
  // project_id and source added by migration 20260623_150100 — not yet in the
  // generated atlas_signals.Row/Insert types. Cast the query builder to any so:
  //   1. insert() accepts the new columns without excess-property errors
  //   2. select(SELECT_COLS) does not produce SelectQueryError for project_id/source
  //      (Supabase TypeScript validates select strings against the generated Row; unknown
  //       columns produce SelectQueryError which is incompatible with `as DbRow`)
  // Regenerate types post-migration: `supabase gen types typescript`.
  const { data, error } = await (db.from('atlas_signals') as any)
    .insert({
      content_id: args.contentId,
      project_id: args.projectId ?? null,
      source:     args.source     ?? null,
      kind:       args.kind,
      payload:    args.payload,
      version:    args.version,
    })
    .select(SELECT_COLS)
    .single()

  if (error) throw new Error(`[atlas-signals] recordSignal failed: ${error.message}`)
  if (!data) throw new Error('[atlas-signals] recordSignal returned no row')
  return rowToRecord<P>(data as unknown as DbRow)
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
  // SELECT_COLS includes project_id and source (added by migration 20260623_150100)
  // which are not yet in the generated atlas_signals.Row. Cast the query builder to
  // any so Supabase's TypeScript does not produce SelectQueryError for those columns.
  const { data, error } = await (db.from('atlas_signals') as any)
    .select(SELECT_COLS)
    .eq('content_id', args.contentId)
    .eq('kind', args.kind)
    .order('produced_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`[atlas-signals] getLatestSignal failed: ${error.message}`)
  if (!data) return null
  return rowToRecord<P>(data as unknown as DbRow)
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

// ── Project-scoped queries (added 2026-06-23, Collectors v1) ─────────────────

/**
 * Returns the latest signal per requested kind for a project.
 * Used by Atlas summaries and the opportunity engine to read collector output.
 *
 * Example:
 *   getLatestProjectSignals({ projectId, kinds: ['stripe.mrr_snapshot', 'social.account_snapshot'] })
 *   → { 'stripe.mrr_snapshot': SignalRecord, 'social.account_snapshot': SignalRecord }
 */
export async function getLatestProjectSignals(args: {
  projectId: string
  kinds:     string[]
}): Promise<Record<string, SignalRecord>> {
  if (args.kinds.length === 0) return {}
  const db = createAdminClient()
  // project_id added by migration 20260623_150100 — not in generated atlas_signals.Row.
  // Cast via established project pattern; result cast to DbRow[] at boundary.
  const { data, error } = await (db.from('atlas_signals') as any)
    .select(SELECT_COLS)
    .eq('project_id', args.projectId)
    .in('kind', args.kinds)
    .order('produced_at', { ascending: false })

  if (error) throw new Error(`[atlas-signals] getLatestProjectSignals failed: ${error.message}`)
  if (!data || data.length === 0) return {}

  const latest: Record<string, SignalRecord> = {}
  for (const row of (data as DbRow[])) {
    if (!(row.kind in latest)) latest[row.kind] = rowToRecord(row)
  }
  return latest
}

/**
 * Returns an ordered time-series of signals for a single project + kind.
 * Used by trend APIs and the opportunity engine for delta detection.
 *
 * @param limit  Maximum number of rows to return (default 90 — ~3 months of daily snapshots)
 */
export async function getSignalTimeSeries<P = Record<string, unknown>>(args: {
  projectId: string
  kind:      string
  limit?:    number
  since?:    string   // ISO timestamp — filter produced_at >= this value
}): Promise<SignalRecord<P>[]> {
  const db    = createAdminClient()
  const limit = args.limit ?? 90

  // project_id added by migration 20260623_150100 — not in generated atlas_signals.Row.
  // Cast via established project pattern; result cast to DbRow[] at boundary.
  let query = (db.from('atlas_signals') as any)
    .select(SELECT_COLS)
    .eq('project_id', args.projectId)
    .eq('kind', args.kind)
    .order('produced_at', { ascending: true })
    .limit(limit)

  if (args.since) query = query.gte('produced_at', args.since)

  const { data, error } = await query
  if (error) throw new Error(`[atlas-signals] getSignalTimeSeries failed: ${error.message}`)
  return ((data ?? []) as DbRow[]).map(row => rowToRecord<P>(row))
}

/**
 * Flexible signal query for cross-project analytics. Phase 3 — used by
 * the Supabase platform collector and the trend dashboard.
 */
export async function querySignals<P = Record<string, unknown>>(args: {
  kind:        string
  projectIds?: string[]
  source?:     string
  since?:      string   // ISO timestamp
  until?:      string   // ISO timestamp
  limit?:      number
}): Promise<SignalRecord<P>[]> {
  const db    = createAdminClient()
  const limit = args.limit ?? 500

  // project_id and source added by migration 20260623_150100 — not in generated
  // atlas_signals.Row. Cast via established project pattern; result cast at boundary.
  let query = (db.from('atlas_signals') as any)
    .select(SELECT_COLS)
    .eq('kind', args.kind)
    .order('produced_at', { ascending: false })
    .limit(limit)

  if (args.projectIds && args.projectIds.length > 0) {
    query = query.in('project_id', args.projectIds)
  }
  if (args.source) query = query.eq('source', args.source)
  if (args.since)  query = query.gte('produced_at', args.since)
  if (args.until)  query = query.lte('produced_at', args.until)

  const { data, error } = await query
  if (error) throw new Error(`[atlas-signals] querySignals failed: ${error.message}`)
  return ((data ?? []) as DbRow[]).map(row => rowToRecord<P>(row))
}
