/**
 * Manual availability review in the ISOLATED AWS Preview branch only.
 * Additional IAM read permission and its own feature flag are required.
 * This endpoint CANNOT invoke models, create agreements or reserve spend.
 */
import { resolvePlatformOperator } from '@/lib/auth/platform-operator'
import { CATALOG_READ_ROLE, getCatalogReadCredentials } from '@/lib/ai/model-control/catalog-oidc'
import { validAvailabilityModelId } from '@/lib/ai/model-control/availability-review'
import { readBedrockModelAvailability } from '@/lib/ai/model-control/availability-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 25
const PILOT_BRANCH = 'feat/omnira-bedrock-pilot-20261116'

function reply(status: number, data: Record<string, unknown>): Response {
  return Response.json(data, {
    status, headers: {'Cache-Control':'private, no-store'},
  })
}
function refuse(code: number, reason: string): Response {
  return reply(code, {
    status: 'blocked', reason, canDispatch: false, modelCallsMade: false,
    productionInvocationVerified: false, pricingVerified: false,
  })
}

export async function POST(request: Request): Promise<Response> {
  if (process.env.VERCEL_ENV !== 'preview'
    || process.env.VERCEL_GIT_COMMIT_REF !== PILOT_BRANCH) {
    return refuse(404, 'not_isolated_preview')
  }
  let origin: string
  try {origin = new URL(request.url).origin} catch {return refuse(403, 'origin_denied')}
  if (request.headers.get('origin') !== origin
    || request.headers.get('sec-fetch-site') !== 'same-origin') {
    return refuse(403, 'origin_denied')
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return refuse(415, 'json_required')
  }
  const len = Number(request.headers.get('content-length') ?? 0)
  if (!Number.isFinite(len) || len > 256) return refuse(413, 'invalid_request_size')
  let payload: unknown
  try {
    const body = await request.text()
    if (Buffer.byteLength(body, 'utf8') > 256) return refuse(413, 'invalid_request_size')
    payload = JSON.parse(body)
  } catch {
    return refuse(400, 'invalid_request')
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || Object.keys(payload).length !== 1
    || !validAvailabilityModelId((payload as {modelId?: unknown}).modelId)) {
    return refuse(400, 'invalid_model_identifier')
  }
  const modelId = (payload as {modelId: string}).modelId
  try {
    const operator = await resolvePlatformOperator()
    if (!operator.ok) return refuse(403, 'platform_operator_required')
  } catch {return refuse(403, 'platform_operator_required')}

  // A NEW explicit flag, separate from discovery, keeps this fully disabled
  // until the owner reviews the single added IAM read action.
  if (process.env.OMNIRA_BEDROCK_AVAILABILITY_ENABLED !== 'true') {
    return refuse(200, 'availability_review_disabled')
  }
  if (process.env.AWS_BEDROCK_CATALOG_ROLE_ARN !== CATALOG_READ_ROLE) {
    return refuse(200, 'catalog_read_role_not_configured')
  }
  const oidcToken = request.headers.get('x-vercel-oidc-token')
  if (!oidcToken) return refuse(200, 'vercel_oidc_token_missing')

  try {
    const credentials = await getCatalogReadCredentials({
      configuredRoleArn: process.env.AWS_BEDROCK_CATALOG_ROLE_ARN,
      oidcToken,
    })
    const result = await readBedrockModelAvailability(credentials, modelId)
    return reply(200, result)
  } catch (error) {
    // Never send AWS SDK errors, tokens, raw agreement text or account metadata.
    const code = error instanceof Error ? error.message : ''
    const allowed: Record<string,string> = {
      AVAILABILITY_IAM_DENIED:'availability_iam_permission_missing',
      AVAILABILITY_MODEL_NOT_LISTED:'model_not_listed_in_source_region',
      AVAILABILITY_CATALOG_INVALID:'catalog_metadata_rejected',
      AVAILABILITY_RESPONSE_INVALID:'availability_metadata_rejected',
    }
    return refuse(200, allowed[code] ?? 'availability_api_unavailable')
  }
}
