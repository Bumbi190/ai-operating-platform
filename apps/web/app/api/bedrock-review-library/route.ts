/**
 * Read-only The Prompt source selector for the isolated Bedrock pilot Preview.
 * No provider dispatch, billing, article fetching, database writes or publishing.
 * The project and its scripts are always scoped to the verified operator/owner.
 */
import { getSavedPromptReview, listSavedPromptReviews } from '@/lib/ai/bedrock-pilot/saved-review-data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PILOT_BRANCH = 'feat/omnira-bedrock-pilot-20261116'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function response(status: number, value: Record<string, unknown>): Response {
  return new Response(JSON.stringify(value), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  })
}

export async function POST(request: Request): Promise<Response> {
  if (process.env.VERCEL_ENV !== 'preview' ||
      process.env.VERCEL_GIT_COMMIT_REF !== PILOT_BRANCH) {
    return response(404, { ok: false, reason: 'not_isolated_preview' })
  }
  let origin: string
  try { origin = new URL(request.url).origin } catch {
    return response(403, { ok: false, reason: 'origin_denied' })
  }
  if (request.headers.get('origin') !== origin ||
      request.headers.get('sec-fetch-site') !== 'same-origin') {
    return response(403, { ok: false, reason: 'origin_denied' })
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return response(415, { ok: false, reason: 'json_required' })
  }
  const len = Number(request.headers.get('content-length') ?? 0)
  if (!Number.isFinite(len) || len > 512) {
    return response(413, { ok: false, reason: 'invalid_request_size' })
  }

  let body: unknown
  try {
    const raw = await request.text()
    if (Buffer.byteLength(raw, 'utf8') > 512) {
      return response(413, { ok: false, reason: 'invalid_request_size' })
    }
    body = JSON.parse(raw)
  } catch {
    return response(400, { ok: false, reason: 'invalid_json' })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return response(400, { ok: false, reason: 'invalid_json' })
  }
  const data = body as Record<string, unknown>
  if (data.kind !== 'list' && data.kind !== 'detail') {
    return response(400, { ok: false, reason: 'invalid_action' })
  }
  if (data.kind === 'detail' && (typeof data.scriptId !== 'string' || !UUID.test(data.scriptId))) {
    return response(400, { ok: false, reason: 'invalid_script' })
  }

  const result = data.kind === 'list'
    ? await listSavedPromptReviews()
    : await getSavedPromptReview(data.scriptId as string)
  if (!result.ok) {
    const denied = ['operator_required', 'project_access_denied',
      'prompt_not_owned', 'operator_or_project_denied']
    const status = denied.includes(result.reason) ? 403
      : result.reason === 'script_not_found' ? 404 : 503
    return response(status, { ok: false, reason: result.reason })
  }
  return response(200, result)
}
