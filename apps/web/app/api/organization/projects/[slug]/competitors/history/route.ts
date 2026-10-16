import { NextResponse } from 'next/server'
import { assertSameOrigin } from '@/lib/atlas/executive/http'
import {
  competitorHistoryEnabled, saveOrganizationCompetitorHistory,
} from '@/lib/atlas/project-analytics/handlarborsen-competitor-history-service'
import { HANDLARBORSEN_PROJECT_SLUG } from '@/lib/atlas/collectors/handlarborsen-marketplace'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60
const headers = { 'Cache-Control': 'private, no-store' }
const deny = (code: number, status: string) =>
  NextResponse.json({ status }, { status: code, headers })

/** Same six immutable source/day records. No client-selected URL or retry loop. */
export async function POST(request: Request, { params }: { params: { slug: string } }) {
  if (params.slug !== HANDLARBORSEN_PROJECT_SLUG) return deny(404, 'not_found')
  if (!competitorHistoryEnabled()) return deny(409, 'disabled')
  const crossOrigin = assertSameOrigin(request)
  if (crossOrigin) return crossOrigin
  const length = request.headers.get('content-length')
  if ((length !== null && length !== '0') || request.headers.get('transfer-encoding')
    || request.headers.get('content-type') || new URL(request.url).search) return deny(400, 'invalid_request')

  const result = await saveOrganizationCompetitorHistory()
  if (result.status === 'saved') return NextResponse.json(result, { status: 201, headers })
  if (result.status === 'already_saved') return NextResponse.json(result, { status: 200, headers })
  return deny(result.status === 'unauthorized' ? 401
    : result.status === 'forbidden' ? 403
    : result.status === 'disabled' ? 409
    : result.status === 'invalid' ? 422 : 503, result.status)
}
