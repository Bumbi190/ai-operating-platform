/**
 * GET  /api/business/revenue?project_id=&since=&limit=   — lista intäkter (inloggad)
 * POST /api/business/revenue                             — logga intäkt (user ELLER API-nyckel)
 *
 * Body (POST): { project_id | project_slug, amount_sek, currency?, source?, description?, occurred_at? }
 *
 * Exempel: en Stripe-webhook postar hit varje gång en betalning lyckas.
 */
import { NextResponse } from 'next/server'
import { requireUserOrApiKey } from '@/lib/api-auth'
import { logRevenue, listRevenue, BusinessError } from '@/lib/business/store'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireUserOrApiKey(request)
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  try {
    const data = await listRevenue({
      project_id: searchParams.get('project_id') ?? undefined,
      sinceISO:   searchParams.get('since') ?? undefined,
      limit:      searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
    })
    return NextResponse.json(data)
  } catch (e) {
    const err = e as BusinessError
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 })
  }
}

export async function POST(request: Request) {
  const auth = await requireUserOrApiKey(request)
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const event = await logRevenue(body)
    return NextResponse.json(event, { status: 201 })
  } catch (e) {
    const err = e as BusinessError
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 })
  }
}
