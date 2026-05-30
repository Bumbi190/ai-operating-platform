/**
 * API key authentication for external integrations (Hermes, scripts, etc.)
 *
 * Set AIOPS_API_KEY in .env.local — any long random string works.
 * Generate one with: openssl rand -base64 32
 *
 * Usage in a route:
 *   const auth = requireApiKey(request)
 *   if (!auth.ok) return auth.response
 */

import { NextResponse } from 'next/server'

interface AuthOk {
  ok: true
}

interface AuthFail {
  ok: false
  response: NextResponse
}

type AuthResult = AuthOk | AuthFail

export function requireApiKey(request: Request): AuthResult {
  const apiKey = process.env.AIOPS_API_KEY
  if (!apiKey) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'AIOPS_API_KEY is not configured on the server' },
        { status: 500 },
      ),
    }
  }

  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim()

  if (!token || token !== apiKey) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Unauthorized — provide a valid API key via Authorization: Bearer <key>' },
        { status: 401 },
      ),
    }
  }

  return { ok: true }
}
