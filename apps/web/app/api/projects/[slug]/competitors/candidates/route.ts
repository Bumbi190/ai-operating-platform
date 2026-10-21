import { NextResponse } from 'next/server'
import { assertSameOrigin } from '@/lib/atlas/executive/http'
import { candidateMemoryEnabled, saveReviewedCandidateLead } from '@/lib/atlas/project-analytics/handlarborsen-competitor-memory-service'
import { HANDLARBORSEN_PROJECT_SLUG } from '@/lib/atlas/collectors/handlarborsen-marketplace'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15

const headers = { 'Cache-Control': 'private, no-store' }
const respond = (status: number, code: string) =>
  NextResponse.json({ status: code }, { status, headers })

/**
 * Never accepts URLs, source IDs, timestamps or credentials from callers.
 * One manual owner gesture; no search, external HTTP or recurring execution.
 */
export async function POST(request: Request, { params }: { params: { slug: string } }) {
  if (!candidateMemoryEnabled()) return respond(409, 'disabled')
  if (params.slug !== HANDLARBORSEN_PROJECT_SLUG) return respond(404, 'not_found')
  const refused = assertSameOrigin(request)
  if (refused) return refused
  const contentLength = request.headers.get('content-length')
  if ((contentLength !== null && contentLength !== '0')
    || request.headers.get('transfer-encoding') || request.headers.get('content-type')
    || new URL(request.url).search) return respond(400, 'invalid_request')

  const result = await saveReviewedCandidateLead()
  if (result.status === 'saved') return NextResponse.json(result, { status: 201, headers })
  if (result.status === 'already_recorded') return NextResponse.json(result, { status: 200, headers })
  return respond(
    result.status === 'unauthorized' ? 401 : result.status === 'forbidden' ? 403
      : result.status === 'invalid' ? 422 : result.status === 'disabled' ? 409 : 503,
    result.status,
  )
}
