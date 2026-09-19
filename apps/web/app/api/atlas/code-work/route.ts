/** SDF-1B2 purpose-specific proposal route. Creates control state, never work. */

import { NextResponse } from 'next/server'
import { assertSameOrigin, readJsonBody, reservedFieldIn } from '@/lib/atlas/executive/http'
import { proposeOperatorCodeWork } from '@/lib/atlas/code-work/control-plane/operator-write'

export const dynamic = 'force-dynamic'

const HTTP_STATUS = {
  no_principal: 401,
  not_permitted: 404,
  invalid_request: 400,
  conflict: 409,
  ineligible: 409,
  integrity_violation: 500,
  unavailable: 503,
} as const

export async function POST(request: Request) {
  const origin = assertSameOrigin(request)
  if (origin) return origin

  const body = await readJsonBody(request)
  if (body instanceof NextResponse) return body
  const reserved = reservedFieldIn(body)
  if (reserved) return NextResponse.json({ error: `reserved_field:${reserved}` }, { status: 400 })

  const result = await proposeOperatorCodeWork(body)
  if (result.status !== 'ok' && result.status !== 'idempotent') {
    const status = HTTP_STATUS[result.status]
    return NextResponse.json(
      { error: result.status === 'not_permitted' ? 'Not found' : result.status },
      { status },
    )
  }

  return NextResponse.json({
    ok: true,
    idempotent: result.status === 'idempotent',
    work: result.run ? {
      workId: result.run.workId,
      state: result.run.state,
      admissionHash: result.run.admissionHash,
      authorizationId: result.run.authorizationId,
    } : null,
  }, { status: result.status === 'idempotent' ? 200 : 201 })
}
