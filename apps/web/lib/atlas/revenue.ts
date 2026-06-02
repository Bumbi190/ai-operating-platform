/**
 * lib/atlas/revenue.ts — Revenue Intelligence (Del 1, läs-sidan för Atlas).
 *
 * Läser den dagliga `revenue_snapshots` (beräknad från Stripe) så Atlas kan svara
 * naturligt: aktiva prenumeranter, nya, trialing, churn, MRR, intäkt/mån — med
 * MRR-delta mot föregående snapshot. Degraderar tyst (`hasData=false`) tills
 * Stripe-snapshoten börjat fyllas. Read-only, deterministisk.
 */

type AnyDb = any

export interface RevenueIntel {
  hasData: boolean
  asOf: string | null
  activeSubscribers: number
  newSubscribers: number
  trialing: number
  churnedThisMonth: number
  mrrSek: number
  revenueMonthSek: number
  currency: string
  mrrDeltaSek: number   // mot föregående snapshot
  churnRatePct: number  // churnade / (aktiva + churnade)
}

const EMPTY: RevenueIntel = {
  hasData: false, asOf: null, activeSubscribers: 0, newSubscribers: 0, trialing: 0,
  churnedThisMonth: 0, mrrSek: 0, revenueMonthSek: 0, currency: 'sek', mrrDeltaSek: 0, churnRatePct: 0,
}

const n = (v: unknown) => Number(v ?? 0) || 0

export async function revenueIntel(db: AnyDb, projectId?: string): Promise<RevenueIntel> {
  try {
    let q = db.from('revenue_snapshots')
      .select('snapshot_date, active_subscribers, new_subscribers, trialing, churned_this_month, mrr_sek, revenue_month_sek, currency')
      .order('snapshot_date', { ascending: false })
      .limit(2)
    if (projectId) q = q.eq('project_id', projectId)
    const { data } = await q
    const rows = data ?? []
    if (rows.length === 0) return EMPTY

    const latest = rows[0]
    const prev = rows[1]
    const active = n(latest.active_subscribers)
    const churned = n(latest.churned_this_month)
    return {
      hasData: true,
      asOf: latest.snapshot_date,
      activeSubscribers: active,
      newSubscribers: n(latest.new_subscribers),
      trialing: n(latest.trialing),
      churnedThisMonth: churned,
      mrrSek: n(latest.mrr_sek),
      revenueMonthSek: n(latest.revenue_month_sek),
      currency: latest.currency ?? 'sek',
      mrrDeltaSek: prev ? n(latest.mrr_sek) - n(prev.mrr_sek) : 0,
      churnRatePct: active + churned > 0 ? Math.round((churned / (active + churned)) * 100) : 0,
    }
  } catch {
    return EMPTY
  }
}
