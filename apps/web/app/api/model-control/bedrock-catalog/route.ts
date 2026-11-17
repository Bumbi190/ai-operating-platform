/**
 * Private, manual, preview-only AWS Bedrock catalog inspection.
 * No AWS SDK calls unless separately configured with dedicated read-only role.
 * No provider invocation, no project changes, no DB writes or publishing.
 */
import { resolvePlatformOperator } from '@/lib/auth/platform-operator'
import { CATALOG_READ_ROLE, getCatalogReadCredentials } from '@/lib/ai/model-control/catalog-oidc'
import { readAwsBedrockCatalog } from '@/lib/ai/model-control/bedrock-catalog-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 25

const PILOT_BRANCH = 'feat/omnira-bedrock-pilot-20261116'

function reply(status: number, data: Record<string, unknown>): Response {
  return Response.json(data, {
    status, headers: { 'Cache-Control': 'private, no-store' },
  })
}
function refuse(code: number, reason: string): Response {
  return reply(code, {
    status: 'blocked', reason, region: 'us-east-1',
    modelCallsMade: false, canDispatch: false,
    priceVerified: false, accountEntitlementVerified: false,
  })
}

export async function POST(request: Request): Promise<Response> {
  if (process.env.VERCEL_ENV !== 'preview' ||
      process.env.VERCEL_GIT_COMMIT_REF !== PILOT_BRANCH) {
    return refuse(404, 'not_isolated_preview')
  }
  let expectedOrigin: string
  try { expectedOrigin = new URL(request.url).origin } catch {
    return refuse(403, 'origin_denied')
  }
  if (request.headers.get('origin') !== expectedOrigin ||
      request.headers.get('sec-fetch-site') !== 'same-origin') {
    return refuse(403, 'origin_denied')
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return refuse(415, 'json_required')
  }
  const len = Number(request.headers.get('content-length') ?? 0)
  if (!Number.isFinite(len) || len > 128) return refuse(413, 'invalid_request_size')
  let body: string
  try { body = await request.text() } catch { return refuse(400, 'invalid_request') }
  if (Buffer.byteLength(body, 'utf8') > 128 || body.trim() !== '{}') {
    return refuse(400, 'invalid_request')
  }

  // Catalog discovery is Omnira-wide, so platform operator authorization
  // is checked server-side; project membership alone cannot grant it.
  try {
    const operator = await resolvePlatformOperator()
    if (!operator.ok) return refuse(403, 'platform_operator_required')
  } catch {
    return refuse(403, 'platform_operator_required')
  }

  if (process.env.OMNIRA_BEDROCK_CATALOG_DISCOVERY_ENABLED !== 'true') {
    return refuse(200, 'read_only_catalog_disabled')
  }
  if (process.env.AWS_BEDROCK_CATALOG_ROLE_ARN !== CATALOG_READ_ROLE) {
    return refuse(200, 'catalog_read_role_not_configured')
  }
  const oidcToken = request.headers.get('x-vercel-oidc-token')
  if (!oidcToken) return refuse(200, 'vercel_oidc_token_missing')

  try {
    const creds = await getCatalogReadCredentials({
      configuredRoleArn: process.env.AWS_BEDROCK_CATALOG_ROLE_ARN,
      oidcToken,
    })
    const catalog = await readAwsBedrockCatalog(creds)
    return reply(200, {status: 'catalog_listed', ...catalog})
  } catch (error) {
    const known = new Set([
      'CATALOG_STS_DENIED', 'CATALOG_STS_UNAVAILABLE',
      'CATALOG_IAM_READ_PERMISSION_MISSING', 'CATALOG_API_UNAVAILABLE',
      'CATALOG_RESPONSE_INCOMPLETE',
    ])
    const code = error instanceof Error ? error.message : ''
    return refuse(200, known.has(code) ? code.toLowerCase() : 'catalog_discovery_unavailable')
  }
}
