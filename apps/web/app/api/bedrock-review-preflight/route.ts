/**
 * Preview-only, NON-BILLABLE readiness check for a manually entered editorial
 * review. This route NEVER imports the Bedrock SDK, STS, or any publishing code.
 *
 * No model call, no spend reservation, no storage of supplied news text.
 * It requires a same-origin browser request + verified platform operator +
 * ownership of the explicitly requested project.
 */
import { resolveManualBedrockOperatorGrant, assertManualBedrockOperatorGrant } from '@/lib/ai/bedrock-pilot/operator-grant'
import {
  BedrockPilotRefused, prepareManualEditorialReview,
  type ManualReviewRequest,
} from '@/lib/ai/bedrock-pilot/manual-review-contract'
import { boundNovaMicroPilotGrossUsd } from '@/lib/ai/bedrock-pilot/shadow-policy'
import { isSpendGateEnforced } from '@/lib/cost/spend-gate-flag'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PILOT_BRANCH = 'feat/omnira-bedrock-pilot-20261116'
const MAX_BODY_BYTES = 20 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function json(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}
function refusal(status: number, reason: string): Response {
  return json(status, { status: 'refused', reason, canDispatch: false, modelInvoked: false })
}

export async function POST(request: Request): Promise<Response> {
  if (process.env.VERCEL_ENV !== 'preview' ||
      process.env.VERCEL_GIT_COMMIT_REF !== PILOT_BRANCH) {
    return refusal(404, 'not_isolated_preview')
  }

  // This endpoint is intentionally browser-only and not usable with a cross-site form.
  // The server also validates the Supabase principal and project independently.
  let targetOrigin: string
  try { targetOrigin = new URL(request.url).origin } catch {
    return refusal(403, 'origin_denied')
  }
  if (request.headers.get('origin') !== targetOrigin ||
      request.headers.get('sec-fetch-site') !== 'same-origin') {
    return refusal(403, 'origin_denied')
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return refusal(415, 'json_required')
  }
  const declaredLength = Number(request.headers.get('content-length') ?? 0)
  if (!Number.isFinite(declaredLength) || declaredLength > MAX_BODY_BYTES) {
    return refusal(413, 'body_too_large')
  }

  let parsed: unknown
  try {
    const raw = await request.text()
    if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
      return refusal(413, 'body_too_large')
    }
    parsed = JSON.parse(raw)
  } catch {
    return refusal(400, 'invalid_json')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return refusal(400, 'invalid_json_shape')
  }
  const body = parsed as Record<string, unknown>
  if (typeof body.projectId !== 'string' || !UUID.test(body.projectId)) {
    return refusal(400, 'invalid_project')
  }

  // A supplied project id is a selector, NEVER permission. No user-supplied
  // actor, approval flag, or project grants are accepted.
  const auth = await resolveManualBedrockOperatorGrant(body.projectId)
  if (!auth.ok) {
    return refusal(403, 'operator_or_project_access_denied')
  }
  assertManualBedrockOperatorGrant(auth.grant, body.projectId)

  try {
    // Validation only: this pure function is "opted in" for a simulation.
    // The actual model adapter STILL requires BEDROCK_GOVERNED_PILOT_ENABLED,
    // which remains absent, and is NOT imported by this route.
    const requestInput: ManualReviewRequest = {
      projectId: body.projectId,
      script: body.script as string,
      sources: body.sources as ManualReviewRequest['sources'],
      maxOutputTokens: body.maxOutputTokens as number,
    }
    const prepared = prepareManualEditorialReview({
      pilotEnabled: true,
      environment: process.env.VERCEL_ENV,
      branch: process.env.VERCEL_GIT_COMMIT_REF,
      // Dry-run validates document shape independently of the live budget gate.
      // The actual dispatcher still requires isSpendGateEnforced() at runtime.
      hardSpendGate: true,
      operatorApproved: true,
      operation: 'manual_editorial_quality_review',
      executionContext: 'OPERATOR_EXECUTION',
      executionScopeKind: 'PROJECT',
      executionProjectId: auth.grant.projectId,
    }, requestInput)

    const hardSpendGateActive = isSpendGateEnforced()
    return json(200, {
      status: hardSpendGateActive ? 'preflight_passed' : 'preflight_blocked',
      reason: hardSpendGateActive ? null : 'hard_spend_gate_required',
      hardSpendGateActive,
      canDispatch: false,
      modelInvoked: false,
      costReserved: false,
      sourceReferencesFactChecked: false,
      previewOnly: true,
      verifiedOperatorAndProject: true,
      maxOutputTokens: prepared.maxOutputTokens,
      sourceCount: requestInput.sources.length,
      promptBytes: Buffer.byteLength(prepared.prompt, 'utf8'),
      upperGrossUsdBeforeCredits: boundNovaMicroPilotGrossUsd(prepared.maxOutputTokens),
      // No input text, source extracts, AWS tokens, or project ID returned.
    })
  } catch (e) {
    if (e instanceof BedrockPilotRefused) return refusal(422, e.reason)
    return refusal(503, 'preflight_unavailable')
  }
}
