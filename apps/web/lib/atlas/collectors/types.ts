/**
 * lib/atlas/collectors/types.ts — BaseCollector framework.
 *
 * Every Atlas data collector extends BaseCollector and implements four methods:
 *   fetch()     — retrieve raw data from the external source
 *   validate()  — return null to skip (e.g. source not configured, no tokens)
 *   normalize() — shape raw data into a signal payload
 *   store()     — (optional) persist to a snapshot table BEFORE signal emission
 *
 * The base class handles the run lifecycle: fetch → validate → normalize →
 * store → emit signal → write audit log. All paths produce a CollectorResult
 * that is persisted to collector_runs regardless of outcome.
 *
 * Collector IDs follow the convention: "{source}.{metric_type}"
 *   e.g. "stripe.revenue", "social.account", "supabase.platform"
 *
 * Signal kinds follow the same convention:
 *   e.g. "stripe.mrr_snapshot", "social.account_snapshot"
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { recordSignal } from '@/lib/atlas/signals'

// ── Context passed to every collector method ──────────────────────────────────

export interface CollectorContext {
  /**
   * Service-role Supabase client typed against the generated Database schema.
   * For tables/columns not yet in generated types (added by pending migrations),
   * use `(ctx.db.from('table') as any)` — the established project pattern.
   * Regenerate types after applying migrations: `supabase gen types typescript`.
   */
  db:          SupabaseClient<Database>
  projectId:   string | null
  projectSlug: string | null
  /** UTC date string YYYY-MM-DD — the snapshot date for idempotent upserts. */
  snapshotDate: string
  /**
   * When true: fetch + validate + normalize only.
   * Skips store(), recordSignal(), and writeCollectorRun() — no DB writes of any kind.
   * Safe for integration testing and manual verification.
   */
  dryRun?: boolean
}

// ── Run result ────────────────────────────────────────────────────────────────

export interface CollectorResult {
  collectorId:  string
  projectId:    string | null
  projectSlug:  string | null
  status:       'ok' | 'skipped' | 'error'
  signalKind:   string | null
  signalId:     string | null
  snapshotDate: string
  durationMs:   number
  error:        string | null
  /** Additional context for the audit log — e.g. metric values, platform counts. */
  metadata:     Record<string, unknown>
}

// ── BaseCollector abstract class ──────────────────────────────────────────────

export abstract class BaseCollector {
  /** Unique collector ID, e.g. "stripe.revenue". Stored in collector_runs. */
  abstract readonly id: string
  /** Signal kind emitted on success, e.g. "stripe.mrr_snapshot". */
  abstract readonly signalKind: string
  /** Producer version string, e.g. "stripe-collector-1.0.0". */
  abstract readonly version: string
  /** Source label, e.g. "stripe", "instagram". Stored in atlas_signals.source. */
  abstract readonly source: string

  /** Fetch raw data from the external source. May throw — caught by run(). */
  abstract fetch(ctx: CollectorContext): Promise<unknown>

  /**
   * Validate raw data. Return null to skip this run cleanly (not an error):
   * e.g. Stripe not configured, no tokens for this project, empty response.
   */
  abstract validate(raw: unknown): unknown | null

  /** Shape validated data into the signal payload object. */
  abstract normalize(valid: unknown, ctx: CollectorContext): Record<string, unknown>

  /**
   * (Optional) Persist to a snapshot table. Called AFTER normalize(), BEFORE
   * signal emission. A store() failure is non-fatal — the signal still emits.
   */
  store?(payload: Record<string, unknown>, ctx: CollectorContext): Promise<void>

  /** Run the full collector lifecycle. Never throws. */
  async run(ctx: CollectorContext): Promise<CollectorResult> {
    const t0 = Date.now()
    try {
      const raw = await this.fetch(ctx)

      const valid = this.validate(raw)
      if (valid === null) {
        return this._result(ctx, 'skipped', null, null, Date.now() - t0,
          'validate() returned null — source not configured or no data', {})
      }

      const payload = this.normalize(valid, ctx)

      // store() is skipped entirely during dry runs — no DB writes of any kind.
      if (this.store && !ctx.dryRun) {
        try {
          await this.store(payload, ctx)
        } catch (storeErr) {
          // store() failure is non-fatal: signal is the Atlas source of truth;
          // snapshot tables are secondary derived storage. The run is recorded as
          // status='ok' (signal emitted). The store error is captured in
          // payload.__store_error → written to collector_runs.metadata so operators
          // can detect snapshot write failures without a status='error' false alarm.
          console.error(
            `[${this.id}] store() failed (non-fatal): ` +
            (storeErr instanceof Error ? storeErr.message : String(storeErr))
          )
          payload.__store_error = storeErr instanceof Error ? storeErr.message : String(storeErr)
        }
      }

      let signalId: string | null = null
      if (!ctx.dryRun) {
        const sig = await recordSignal({
          contentId: null,
          projectId: ctx.projectId,
          source:    this.source,
          kind:      this.signalKind,
          payload,
          version:   this.version,
        })
        signalId = sig.id
      }

      return this._result(ctx, 'ok', this.signalKind, signalId, Date.now() - t0, null, payload)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[${this.id}] run() failed: ${msg}`)
      return this._result(ctx, 'error', null, null, Date.now() - t0, msg, {})
    }
  }

  private _result(
    ctx:         CollectorContext,
    status:      'ok' | 'skipped' | 'error',
    signalKind:  string | null,
    signalId:    string | null,
    durationMs:  number,
    error:       string | null,
    metadata:    Record<string, unknown>,
  ): CollectorResult {
    return {
      collectorId:  this.id,
      projectId:    ctx.projectId,
      projectSlug:  ctx.projectSlug,
      status,
      signalKind,
      signalId,
      snapshotDate: ctx.snapshotDate,
      durationMs,
      error,
      metadata,
    }
  }
}

// ── Audit log writer ──────────────────────────────────────────────────────────

/**
 * Persists a CollectorResult to collector_runs. Non-throwing — an audit log
 * failure must never surface to the caller or break the cron route response.
 */
export async function writeCollectorRun(
  db:     SupabaseClient<Database>,
  result: CollectorResult,
): Promise<void> {
  try {
    // collector_runs added by migration 20260623_150200 — not in generated types yet.
    // Cast db itself (not the result) so 'collector_runs' is not validated against
    // Database['public']['Tables'] at the from() call site. The prior pattern
    // (db.from('collector_runs') as any) still type-checks the argument before casting.
    // Regenerate types post-migration: `supabase gen types typescript`.
    const { error } = await (db as any).from('collector_runs').insert({
      collector_id:  result.collectorId,
      project_id:    result.projectId,
      snapshot_date: result.snapshotDate,
      status:        result.status,
      signal_id:     result.signalId,
      signal_kind:   result.signalKind,
      duration_ms:   result.durationMs,
      error_message: result.error?.slice(0, 1000) ?? null,
      metadata:      result.metadata,
    })
    if (error) {
      console.error(`[collector-run] DB insert failed: ${error.message}`)
    }
  } catch (err) {
    console.error(
      `[collector-run] writeCollectorRun threw: ` +
      (err instanceof Error ? err.message : String(err))
    )
  }
}
