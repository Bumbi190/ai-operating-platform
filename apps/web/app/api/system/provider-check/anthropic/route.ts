import { NextResponse } from 'next/server'
import { resolvePlatformOperator } from '@/lib/auth/platform-operator'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 15

type CredentialStatus = 'accepted' | 'invalid_key' | 'forbidden' | 'not_configured' | 'unavailable'
const responseHeaders = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' }

function result(status: CredentialStatus, httpStatus: number) {
  return NextResponse.json({
    provider: 'anthropic',
    credentialStatus: status,
    inferenceVerified: false,
    billableGenerationPerformed: false,
  }, { status: httpStatus, headers: responseHeaders })
}

/**
 * Operator-only, non-generating credential diagnostic.
 *
 * Anthropic GET /v1/models authenticates the *actual production environment*
 * API key. Never fetch model completions, return the provider body, log
 * credential/header details, or accept caller-controlled URL/headers.
 *
 * This validates API authentication, not an inference, credit balance, or a
 * queued news job. Live inference remains governed separately.
 */
export async function GET() {
  const operator = await resolvePlatformOperator()
  if (!operator.ok) {
    return NextResponse.json(
      { provider: 'anthropic', credentialStatus: 'access_denied' },
      { status: operator.reason === 'unauthenticated' ? 401 : 403, headers: responseHeaders },
    )
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) return result('not_configured', 503)

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/models?limit=1', {
      method: 'GET',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    })
    // Provider responses and error bodies must never reach the app response.
    await upstream.body?.cancel().catch(() => {})
    if (upstream.ok) return result('accepted', 200)
    if (upstream.status === 401) return result('invalid_key', 502)
    if (upstream.status === 403) return result('forbidden', 503)
    return result('unavailable', 503)
  } catch {
    return result('unavailable', 503)
  }
}
