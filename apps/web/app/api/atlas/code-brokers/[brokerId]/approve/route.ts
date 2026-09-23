import { NextResponse } from 'next/server'
import { assertSameOrigin } from '@/lib/atlas/executive/http'
import { approveBroker } from '@/lib/atlas/code-broker/operator'

export const dynamic = 'force-dynamic'
export async function POST(request: Request, { params }: { params: { brokerId: string } }) {
  const origin = assertSameOrigin(request)
  if (origin) return origin
  const result = await approveBroker(params.brokerId)
  if (result.status !== 'ok') return NextResponse.json({ error: result.status === 'not_permitted' ? 'Not found' : result.status }, { status: result.status === 'no_principal' ? 401 : 404 })
  return NextResponse.json({ ok: true, status: result.broker.status })
}
