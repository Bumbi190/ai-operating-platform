import { requestPosthogAuthorization } from '@/lib/atlas/capability/posthog-authorization'
import { smallJson } from '@/lib/atlas/capability/posthog-approved-http'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } })
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'posthog_origin_denied' }, 403)
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return json({ error: 'posthog_json_required' }, 415)
  let input: unknown
  try { input = await smallJson(request) } catch { return json({ error: 'posthog_invalid_json' }, 400) }
  try { return json(await requestPosthogAuthorization(input)) } catch (error) {
    const codes: Record<string, number> = {
      posthog_unauthorized: 401, posthog_invalid_project: 400, posthog_project_forbidden: 403,
      posthog_invalid_request: 400, posthog_review_stale: 409, posthog_not_configured: 503,
      posthog_approved_read_disabled: 503, posthog_authorization_request_failed: 503,
    }
    const code = error instanceof Error && Object.hasOwn(codes, error.message) ? error.message : 'posthog_request_failed'
    return json({ error: code }, codes[code] ?? 500)
  }
}
