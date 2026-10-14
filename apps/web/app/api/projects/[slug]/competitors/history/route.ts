import { NextResponse } from 'next/server'
import { assertSameOrigin } from '@/lib/atlas/executive/http'
import {
  competitorHistoryEnabled,
  saveCompetitorHistory,
} from '@/lib/atlas/project-analytics/handlarborsen-competitor-history-service'
import { HANDLARBORSEN_PROJECT_SLUG } from '@/lib/atlas/collectors/handlarborsen-marketplace'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// The owner-initiated scan may make up to ten bounded external requests.
// Legacy Vercel functions otherwise time out before the full scan completes.
export const maxDuration = 60

const headers = { 'Cache-Control': 'private, no-store' }
const response = (status: number, code: string) =>
  NextResponse.json({ status: code }, { status, headers })

/**
 * A deliberately single-action POST. The browser cannot supply a scan target,
 * time, source, output path, credentials, or project. This is never a cron route.
 */
export async function POST(request: Request, { params }: { params: { slug: string } }) {
  if (!competitorHistoryEnabled()) return response(409, 'disabled')
  if (params.slug !== HANDLARBORSEN_PROJECT_SLUG) return response(404, 'not_found')
  const refused = assertSameOrigin(request)
  if (refused) {
    if (process.env.VERCEL_ENV === 'preview') console.warn('[hb-history-smoke] request rejected by same-origin gate')
    return refused
  }
  const length = request.headers.get('content-length')
  if ((length !== null && length !== '0') ||
      request.headers.get('transfer-encoding') ||
      request.headers.get('content-type') ||
      new URL(request.url).search !== '') {
    if (process.env.VERCEL_ENV === 'preview') console.warn('[hb-history-smoke] request rejected by shape gate')
    return response(400, 'invalid_request')
  }

  const result = await saveCompetitorHistory()
  if (result.status !== 'saved' && result.status !== 'already_saved' && process.env.VERCEL_ENV === 'preview') {
    // Status only; never log cookies, user identities, competitor content or external URLs.
    console.warn('[hb-history-smoke] save refused:', result.status)
  }
  if (result.status === 'saved') return NextResponse.json(result, { status: 201, headers })
  if (result.status === 'already_saved') return NextResponse.json(result, { headers })
  return response(
    result.status === 'unauthorized' ? 401
      : result.status === 'forbidden' ? 403
      : result.status === 'disabled' ? 409
      : result.status === 'invalid' ? 422 : 503,
    result.status,
  )
}
