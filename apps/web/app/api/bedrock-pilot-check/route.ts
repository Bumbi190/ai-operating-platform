/**
 * Temporary AWS OIDC smoke check for the isolated Bedrock pilot branch only.
 * This endpoint NEVER invokes Bedrock or reads static AWS credentials.
 * POST is manual; no scheduled or build-time calls.
 * Remove before merging the pilot and never deploy on the production branch.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 10

const PILOT_BRANCH = 'feat/omnira-bedrock-pilot-20261116'
const PILOT_ROLE = 'arn:aws:iam::793854110735:role/Omnira-Bedrock-Test'
const PILOT_REGION = 'us-east-1'
const STS_ENDPOINT = 'https://sts.us-east-1.amazonaws.com/'

function response(status: number, value: Record<string, string | boolean>): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

export async function POST(request: Request): Promise<Response> {
  // Fail closed outside this exact temporary preview branch.
  if (
    process.env.VERCEL_ENV !== 'preview' ||
    process.env.VERCEL_GIT_COMMIT_REF !== PILOT_BRANCH
  ) {
    return response(404, { status: 'unavailable' })
  }

  // Do not use AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY or AWS_REGION.
  // Existing Remotion Lambda integrations must remain untouched.
  if (
    process.env.AWS_BEDROCK_ROLE_ARN !== PILOT_ROLE ||
    process.env.AWS_BEDROCK_REGION !== PILOT_REGION
  ) {
    return response(503, { status: 'configuration_not_ready' })
  }

  // Vercel injects this token into Functions. Never log or return its contents.
  const oidcToken = request.headers.get('x-vercel-oidc-token')
  if (!oidcToken) return response(401, { status: 'vercel_oidc_token_missing' })

  const payload = new URLSearchParams({
    Action: 'AssumeRoleWithWebIdentity',
    Version: '2011-06-15',
    RoleArn: PILOT_ROLE,
    RoleSessionName: 'omnira-bedrock-preview-smoke',
    WebIdentityToken: oidcToken,
    DurationSeconds: '900',
  })

  try {
    const result = await fetch(STS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload.toString(),
      signal: AbortSignal.timeout(7000),
      cache: 'no-store',
    })
    const xml = await result.text()
    // Never return temporary AWS credentials, tokens or the raw STS response.
    if (!result.ok || !xml.includes('<Credentials>') || !xml.includes('<AssumedRoleUser>')) {
      return response(502, { status: 'oidc_role_assumption_not_verified' })
    }
    return response(200, {
      status: 'verified',
      oidcRoleAssumed: true,
      bedrockInvoked: false,
    })
  } catch {
    return response(502, { status: 'oidc_preflight_unavailable' })
  }
}
