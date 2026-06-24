/**
 * lib/atlas/collectors/stripe-revenue.ts — Stripe Revenue Collector.
 *
 * Reads Stripe via computeStripeMetrics(), upserts to revenue_snapshots, and
 * emits a "stripe.mrr_snapshot" Atlas signal.
 *
 * INACTIVE until STRIPE_RESTRICTED_KEY is set in env. validate() returns null
 * and the run logs status = 'skipped'. Zero errors, zero noise.
 *
 * Signal kind:  stripe.mrr_snapshot
 * Version:      stripe-collector-1.0.0
 * Cadence:      daily 06:45 UTC (pg_cron: omnira_stripe_revenue)
 * Projects:     observer + active with Stripe configured
 */

import { BaseCollector, type CollectorContext } from './types'
import { computeStripeMetrics, stripeConfigured, type StripeMetrics } from '@/lib/stripe/metrics'

export const STRIPE_COLLECTOR_VERSION = 'stripe-collector-1.0.0'

export class StripeRevenueCollector extends BaseCollector {
  readonly id          = 'stripe.revenue'
  readonly signalKind  = 'stripe.mrr_snapshot'
  readonly version     = STRIPE_COLLECTOR_VERSION
  readonly source      = 'stripe'

  async fetch(_ctx: CollectorContext): Promise<StripeMetrics | null> {
    return computeStripeMetrics()
  }

  validate(raw: unknown): StripeMetrics | null {
    if (!stripeConfigured()) return null   // env var not set → skip cleanly
    if (raw === null || raw === undefined) return null
    const m = raw as StripeMetrics
    // Sanity check: at minimum we expect numeric MRR (can be 0)
    if (typeof m.mrrSek !== 'number') return null
    return m
  }

  normalize(valid: unknown, ctx: CollectorContext): Record<string, unknown> {
    const m = valid as StripeMetrics
    return {
      mrr_sek:             m.mrrSek,
      revenue_month_sek:   m.revenueMonthSek,
      active_subscribers:  m.activeSubscribers,
      new_subscribers:     m.newSubscribers,
      trialing:            m.trialing,
      churned_this_month:  m.churnedThisMonth,
      currency:            m.currency,
      snapshot_date:       ctx.snapshotDate,
      project_id:          ctx.projectId,
    }
  }

  async store(payload: Record<string, unknown>, ctx: CollectorContext): Promise<void> {
    if (!ctx.projectId) return
    const { error } = await (ctx.db.from('revenue_snapshots') as any).upsert(
      {
        project_id:         ctx.projectId,
        snapshot_date:      ctx.snapshotDate,
        captured_at:        new Date().toISOString(),
        active_subscribers: payload.active_subscribers,
        new_subscribers:    payload.new_subscribers,
        trialing:           payload.trialing,
        churned_this_month: payload.churned_this_month,
        mrr_sek:            payload.mrr_sek,
        revenue_month_sek:  payload.revenue_month_sek,
        currency:           payload.currency,
        raw:                payload,
      },
      { onConflict: 'project_id,snapshot_date' },
    )
    if (error) throw new Error(`revenue_snapshots upsert failed: ${error.message}`)
  }
}
