/**
 * Cron authentication.
 *
 * This module used to hold the global-API-key auth chain as well
 * (`requireApiKey`, `requireUserOrApiKey` and their constant-time comparison).
 * That chain is gone: Phase 4B removed the HTTP capability route by route, 4C
 * removed the consumer and its secret, 4D retired the runtime configuration,
 * and this change removes the verifier itself. It had zero callers before it
 * was deleted.
 *
 * What remains is a different security class that happens to share the file:
 * cron authentication over `CRON_SECRET`. It is untouched.
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
