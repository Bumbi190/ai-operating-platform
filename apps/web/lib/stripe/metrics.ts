/**
 * lib/stripe/metrics.ts — Stripe som BI-datakälla (Del 1).
 *
 * Läser Stripe via en RESTRICTED READ-ONLY key och beräknar prenumerations-KPI:er
 * (aktiva, nya, trialing, churn, MRR, intäkt/mån). Stripe är source of truth — vi
 * lagrar bara dagliga aggregat, ingen lokal billinglogik.
 *
 * INAKTIV tills `STRIPE_RESTRICTED_KEY` finns i env → `stripeConfigured()` = false
 * och allt degraderar tyst. Ingen ny npm-dependency (rå fetch mot Stripe REST).
 *
 * Aktivering senare = sätt env-varianten + schemalägg cron. Inget mer.
 */

const STRIPE_API = 'https://api.stripe.com/v1'

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_RESTRICTED_KEY
}

export interface StripeMetrics {
  activeSubscribers: number
  newSubscribers:    number   // skapade denna månad
  trialing:          number
  churnedThisMonth:  number
  mrrSek:            number
  revenueMonthSek:   number
  currency:          string
}

async function stripeGet(path: string, params: Record<string, string> = {}): Promise<any> {
  const key = process.env.STRIPE_RESTRICTED_KEY!
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${STRIPE_API}${path}${qs ? `?${qs}` : ''}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${await res.text().catch(() => '')}`)
  return res.json()
}

/** Paginerar en list-endpoint (Stripe `has_more` + `starting_after`). */
async function stripeList(path: string, params: Record<string, string> = {}, cap = 1000): Promise<any[]> {
  const out: any[] = []
  let startingAfter: string | undefined
  do {
    const page = await stripeGet(path, { limit: '100', ...params, ...(startingAfter ? { starting_after: startingAfter } : {}) })
    const data: any[] = page.data ?? []
    out.push(...data)
    startingAfter = page.has_more && data.length ? data[data.length - 1].id : undefined
  } while (startingAfter && out.length < cap)
  return out
}

// Normaliserar ett prenumerationsbelopp till MÅNAD (öre → kr).
function monthlyAmountSek(sub: any): number {
  let orePerMonth = 0
  for (const item of sub.items?.data ?? []) {
    const price = item.price
    const qty = item.quantity ?? 1
    const unit = price?.unit_amount ?? 0
    const interval = price?.recurring?.interval ?? 'month'
    const count = price?.recurring?.interval_count ?? 1
    let perMonth = unit
    if (interval === 'year')  perMonth = unit / (12 * count)
    if (interval === 'week')  perMonth = unit * (52 / 12) / count
    if (interval === 'day')   perMonth = unit * (365 / 12) / count
    if (interval === 'month') perMonth = unit / count
    orePerMonth += perMonth * qty
  }
  return orePerMonth / 100
}

/**
 * Beräknar KPI:er ur Stripe. Returnerar null om Stripe ej konfigurerat (inaktivt).
 */
export async function computeStripeMetrics(): Promise<StripeMetrics | null> {
  if (!stripeConfigured()) return null

  const now = new Date()
  const monthStart = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000)

  // Aktiva + trialing prenumerationer (expanderar price för MRR).
  const [active, trialingSubs] = await Promise.all([
    stripeList('/subscriptions', { status: 'active', 'expand[]': 'data.items.data.price' }),
    stripeList('/subscriptions', { status: 'trialing', 'expand[]': 'data.items.data.price' }),
  ])

  const mrrSek = active.reduce((s, sub) => s + monthlyAmountSek(sub), 0)
  const currency = (active[0]?.currency ?? trialingSubs[0]?.currency ?? 'sek').toLowerCase()

  // Nya denna månad (skapade ≥ månadsstart).
  const created = await stripeList('/subscriptions', { status: 'all', 'created[gte]': String(monthStart) })
  const newSubscribers = created.length

  // Churn denna månad (avslutade ≥ månadsstart).
  const canceled = await stripeList('/subscriptions', { status: 'canceled', 'canceled_at[gte]': String(monthStart) })
  const churnedThisMonth = canceled.length

  // Intäkt denna månad (betalda fakturor).
  const invoices = await stripeList('/invoices', { status: 'paid', 'created[gte]': String(monthStart) })
  const revenueMonthSek = invoices.reduce((s, inv) => s + (inv.amount_paid ?? 0), 0) / 100

  return {
    activeSubscribers: active.length,
    newSubscribers,
    trialing: trialingSubs.length,
    churnedThisMonth,
    mrrSek: Math.round(mrrSek * 100) / 100,
    revenueMonthSek: Math.round(revenueMonthSek * 100) / 100,
    currency,
  }
}
