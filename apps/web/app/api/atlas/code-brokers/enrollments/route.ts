import { NextResponse } from 'next/server'
import { assertSameOrigin } from '@/lib/atlas/executive/http'
import { beginBrokerEnrollment } from '@/lib/atlas/code-broker/operator'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const origin = assertSameOrigin(request)
  if (origin) return origin
  const result = await beginBrokerEnrollment()
  if (result.status !== 'ok') {
    const status = result.status === 'no_principal' ? 401 : result.status === 'conflict' ? 409 : 404
    return NextResponse.json({ error: result.status === 'not_permitted' ? 'Not found' : result.status }, { status })
  }
  return NextResponse.json({ ok: true, enrollment: result.enrollment }, { status: 201 })
}
