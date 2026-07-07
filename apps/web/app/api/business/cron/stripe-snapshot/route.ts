/**
 * GET /api/business/cron/stripe-snapshot
 *
 * Del 1: daglig Stripe-BI-snapshot för Familje-Stunden → revenue_snapshots.
 * Läser Stripe (restricted read-only key), beräknar aktiva/nya/trialing/churn/MRR/
 * intäkt och upsertar EN aggregat-rad per dag. Stripe = source of truth.
 *
 * INAKTIV tills STRIPE_RESTRICTED_KEY finns → returnerar 'stripe_not_configured'.
 * Aktivering: sätt env + schemalägg via pg_cron (dagligen). Inget mer.
 *
 * Skyddad med: Authorization: Bearer {CRON_SECRET}
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeStripeMetrics, stripeConfigured } from '@/lib/stripe/metrics'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

// Familje-Stunden äger Stripe-kontot i nuläget.
const STRIPE_PROJECT_SLUG = 'familje-stunden'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!stripeConfigured()) {
    return NextResponse.json({ status: 'stripe_not_configured', note: 'Sätt STRIPE_RESTRICTED_KEY för att aktivera.' })
  }

  const db = createAdminClient()
  const { data: project } = await db.from('projects').select('id').eq('slug', STRIPE_PROJECT_SLUG).maybeSingle()
  if (!project) return NextResponse.json({ error: `Projekt ${STRIPE_PROJECT_SLUG} saknas` }, { status: 404 })

  let metrics
  try {
    metrics = await computeStripeMetrics()
  } catch (e) {
    return NextResponse.json({ status: 'stripe_error', error: e instanceof Error ? e.message : 'okänt fel' }, { status: 502 })
  }
  if (!metrics) return NextResponse.json({ status: 'stripe_not_configured' })

  const today = new Date().toISOString().slice(0, 10)
  const { error } = await (db.from('revenue_snapshots') as any).upsert({
    project_id:         project.id,
    snapshot_date:      today,
    captured_at:        new Date().toISOString(),
    active_subscribers: metrics.activeSubscribers,
    new_subscribers:    metrics.newSubscribers,
    trialing:           metrics.trialing,
    churned_this_month: metrics.churnedThisMonth,
    mrr_sek:            metrics.mrrSek,
    revenue_month_sek:  metrics.revenueMonthSek,
    currency:           metrics.currency,
    raw:                metrics,
  }, { onConflict: 'project_id,snapshot_date' })

  if (error) return NextResponse.json({ status: 'db_error', error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, date: today, metrics })
}
