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
import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'

/**
 * Constant-time string comparison for secrets. Avoids the early-exit timing
 * side-channel of `a !== b`. Length is compared first (a token's length is not
 * secret-sensitive and timingSafeEqual throws on unequal-length buffers).
 */
function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ab.length !== bb.length) return false
  return crypto.timingSafeEqual(ab, bb)
}

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

  if (!token || !timingSafeEqualStr(token, apiKey)) {
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

/**
 * Cron authentication — FAIL CLOSED.
 *
 * Replaces the old per-route guard `if (cronSecret && header !== secret)`, which
 * was fail-OPEN: when CRON_SECRET was unset the guard was skipped and the route
 * became publicly callable. Here a missing secret is a hard 500, and any header
 * mismatch is a 401 — the route can never run unauthenticated.
 *
 * Usage:
 *   const auth = requireCronAuth(request)
 *   if (!auth.ok) return auth.response
 */
export function requireCronAuth(request: Request): AuthResult {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'CRON_SECRET is not configured on the server' },
        { status: 500 },
      ),
    }
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }
  return { ok: true }
}

/**
 * Tillåt antingen en inloggad app-användare ELLER en giltig API-nyckel.
 * Används för business-endpoints som anropas både från UI och från externa
 * integrationer (Stripe-webhooks, cron, agenter).
 */
export async function requireUserOrApiKey(request: Request): Promise<AuthResult> {
  // 1. Inloggad användare?
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) return { ok: true }
  } catch {
    // ingen session — fall tillbaka till API-nyckel
  }
  // 2. API-nyckel?
  return requireApiKey(request)
}
