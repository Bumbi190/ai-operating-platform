import { NextResponse } from 'next/server'
import { completeBrokerEnrollment } from '@/lib/atlas/code-broker/principal'

export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  let body: unknown
  try {
    const raw = await request.text()
    if (raw.length > 32_768) return NextResponse.json({ error: 'invalid_request' }, { status: 413 })
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }
  const result = await completeBrokerEnrollment(body)
  if (result.status !== 'ok') {
    const status = result.status === 'expired' ? 410 : result.status === 'invalid_request' ? 400 : 403
    return NextResponse.json({ error: result.status }, { status })
  }
  return NextResponse.json({ ok: true, brokerId: result.broker.brokerId, status: result.broker.status }, { status: 201 })
}
