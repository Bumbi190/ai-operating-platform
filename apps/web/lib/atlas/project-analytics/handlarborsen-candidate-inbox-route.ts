import 'server-only'
import { NextResponse } from 'next/server'
import { assertSameOrigin } from '@/lib/atlas/executive/http'
import { HANDLARBORSEN_PROJECT_SLUG } from '@/lib/atlas/collectors/handlarborsen-marketplace'
import {
  competitorInboxEnabled, loadCompetitorInbox, markCompetitorInboxRead, type InboxAudience,
} from './handlarborsen-candidate-inbox-service'

const headers = { 'Cache-Control': 'private, no-store' }
const fail = (status: number, reason: string) =>
  NextResponse.json({ status: reason }, { status, headers })

/** Exact POST-only acknowledgement. Actor/project are NEVER browser-controlled. */
export async function postCandidateInboxReceipt(
  mode: InboxAudience, request: Request, slug: string,
) {
  if (slug !== HANDLARBORSEN_PROJECT_SLUG) return fail(404,'not_found')
  if (!competitorInboxEnabled()) return fail(409,'disabled')
  const refused = assertSameOrigin(request)
  if (refused) return refused
  const type = request.headers.get('content-type')??''
  const length = request.headers.get('content-length')
  if (!/^application\/json(?:;|$)/i.test(type)
    || request.headers.get('transfer-encoding')
    || (length!==null && (!/^\d+$/.test(length) || Number(length)>256))
    || new URL(request.url).search) return fail(400,'invalid_request')
  let payload: unknown
  try {
    const body = await request.text()
    if (!body || new TextEncoder().encode(body).byteLength>256) return fail(400,'invalid_request')
    payload = JSON.parse(body)
  } catch { return fail(400,'invalid_request') }

  const result = await markCompetitorInboxRead(mode,payload)
  if (result.status === 'updated' || result.status === 'unchanged')
    return NextResponse.json(result, { status:200, headers })
  return fail(result.status === 'unauthorized' ? 401
    : result.status === 'forbidden' ? 403
    : result.status === 'invalid' ? 422
    : result.status === 'not_found' ? 404
    : result.status === 'disabled' ? 409 : 503,result.status)
}

/** Read-only personal counts. Never serializes recipient IDs or candidate evidence. */
export async function getCandidateInboxSummary(
  mode: InboxAudience, request: Request, slug: string,
) {
  if (slug !== HANDLARBORSEN_PROJECT_SLUG) return fail(404,'not_found')
  if (!competitorInboxEnabled()) return fail(409,'disabled')
  if (new URL(request.url).search) return fail(400,'invalid_request')
  try {
    const result = await loadCompetitorInbox(mode)
    if (result.status === 'ok') return NextResponse.json({
      status: 'ok', unreadCount: result.unreadCount, totalCount: result.notifications.length,
    }, { headers })
    return fail(result.status === 'unauthorized' ? 401 : result.status === 'forbidden' ? 403
      : result.status === 'disabled' ? 409 : 503, result.status)
  } catch { return fail(503,'unavailable') }
}
