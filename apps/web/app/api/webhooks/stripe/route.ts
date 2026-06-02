/**
 * POST /api/webhooks/stripe
 *
 * Del 1: realtids-intäkt. På `invoice.paid` → skriv till revenue_events via den
 * BEFINTLIGA `logRevenue` (återbruk). Verifierar Stripe-signatur med Node crypto
 * (ingen stripe-dependency).
 *
 * INAKTIV tills STRIPE_WEBHOOK_SECRET finns. Aktivering: sätt env + peka en
 * webhook i Stripe-dashboarden hit (event: invoice.paid).
 */
import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { logRevenue } from '@/lib/business/store'

export const dynamic = 'force-dynamic'

const STRIPE_PROJECT_SLUG = 'familje-stunden'

// Verifierar Stripe-Signature: "t=<ts>,v1=<hmac>" mot HMAC-SHA256(`${t}.${body}`).
function verify(payload: string, sigHeader: string | null, secret: string): boolean {
  if (!sigHeader) return false
  const parts = Object.fromEntries(sigHeader.split(',').map(p => p.split('=')) as [string, string][])
  const t = parts['t']; const v1 = parts['v1']
  if (!t || !v1) return false
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1)) } catch { return false }
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ status: 'disabled', note: 'Sätt STRIPE_WEBHOOK_SECRET för att aktivera.' })

  const payload = await request.text()
  if (!verify(payload, request.headers.get('stripe-signature'), secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  let event: any
  try { event = JSON.parse(payload) } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  // Endast faktiska betalningar → intäkt. Övriga events ignoreras (snapshoten täcker resten).
  if (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded') {
    const inv = event.data?.object ?? {}
    const amountSek = (inv.amount_paid ?? 0) / 100
    if (amountSek > 0) {
      try {
        await logRevenue({
          project_slug: STRIPE_PROJECT_SLUG,
          amount_sek:   amountSek,
          currency:     (inv.currency ?? 'sek').toLowerCase(),
          source:       'stripe',
          description:  `Stripe ${inv.billing_reason ?? 'invoice'} ${inv.id ?? ''}`.trim(),
          occurred_at:  inv.created ? new Date(inv.created * 1000).toISOString() : undefined,
        } as any)
      } catch (e) {
        return NextResponse.json({ received: true, logged: false, error: e instanceof Error ? e.message : 'fel' }, { status: 200 })
      }
    }
  }

  return NextResponse.json({ received: true })
}
