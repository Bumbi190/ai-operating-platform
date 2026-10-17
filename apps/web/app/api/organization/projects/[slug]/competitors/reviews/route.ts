import { NextResponse } from 'next/server'
import { assertSameOrigin } from '@/lib/atlas/executive/http'
import { HANDLARBORSEN_PROJECT_SLUG } from '@/lib/atlas/collectors/handlarborsen-marketplace'
import {
  candidateReviewEnabled, decideCandidateReview,
} from '@/lib/atlas/project-analytics/handlarborsen-candidate-review-service'
import { authorizeOrganizationCompetitorAction } from '@/lib/auth/organization-competitor-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15

const headers = { 'Cache-Control': 'private, no-store' }
const fail = (status: number, code: string) =>
  NextResponse.json({ status: code }, { status, headers })

/**
 * Collaborator-only manual review. Request host/project/actor are not trusted:
 * the project is fixed, org membership checked before service-role mutation,
 * and the database RPC independently repeats active actor/project checks.
 */
export async function POST(request: Request, { params }: { params: { slug: string } }) {
  if (params.slug !== HANDLARBORSEN_PROJECT_SLUG) return fail(404, 'not_found')
  if (!candidateReviewEnabled()) return fail(409, 'disabled')
  const refused = assertSameOrigin(request)
  if (refused) return refused
  const contentType = request.headers.get('content-type') ?? ''
  const length = request.headers.get('content-length')
  if (!/^application\/json(?:;|$)/i.test(contentType)
    || request.headers.get('transfer-encoding')
    || (length !== null && (!/^\d+$/.test(length) || Number(length) > 512))
    || new URL(request.url).search) return fail(400, 'invalid_request')

  let payload: unknown
  try {
    const body = await request.text()
    if (!body || new TextEncoder().encode(body).byteLength > 512) return fail(400, 'invalid_request')
    payload = JSON.parse(body)
  } catch { return fail(400, 'invalid_request') }

  const grant = await authorizeOrganizationCompetitorAction('record_competitor_evidence')
  if (!grant.ok) return fail(
    grant.status === 'unauthorized' ? 401 : grant.status === 'forbidden' ? 403 : 503,
    grant.status,
  )

  const result = await decideCandidateReview(payload)
  if (result.status === 'saved') return NextResponse.json(result, { status: 201, headers })
  if (result.status === 'unchanged' || result.status === 'already_applied')
    return NextResponse.json(result, { status: 200, headers })
  return fail(
    result.status === 'unauthorized' ? 401
      : result.status === 'forbidden' ? 403
      : result.status === 'not_found' ? 404
      : result.status === 'disabled' || result.status === 'conflict' ? 409
      : result.status === 'invalid' ? 422 : 503,
    result.status,
  )
}
