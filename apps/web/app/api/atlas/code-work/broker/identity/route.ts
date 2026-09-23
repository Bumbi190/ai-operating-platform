import { NextResponse } from 'next/server'
import { authenticateBrokerRequest } from '@/lib/atlas/code-broker/principal'

export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  const raw = await request.text()
  if (raw.length > 1_024) return NextResponse.json({ error: 'invalid_request' }, { status: 413 })
  if (raw !== '' && raw !== '{}') return NextResponse.json({ error: 'diagnostic_body_not_empty' }, { status: 400 })
  const result = await authenticateBrokerRequest(request, raw)
  if (result.status !== 'ok') return NextResponse.json({ error: 'broker_auth_rejected' }, { status: 401 })
  return NextResponse.json({ ok: true, brokerId: result.broker.brokerId, status: result.broker.status, authenticatedAt: new Date().toISOString() })
}
