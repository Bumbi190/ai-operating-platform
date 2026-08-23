/**
 * Session-only authentication.
 *
 * The narrowest auth primitive in the codebase: it proves there is a logged-in
 * user and returns their id. It knows nothing about projects, nothing about
 * machine credentials, and nothing about `AIOPS_API_KEY`.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 *
 * Routes that need no machine caller previously used `requireUserOrApiKey`,
 * which accepts the global key as a fallback. Reaching for it made every such
 * route a legacy surface by default — including `/api/chat/tts`, which is not
 * project-bound and spends money at OpenAI on every call. This is the helper to
 * reach for instead, so "just authenticate the user" stops implying "and also
 * accept the global key".
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ─────────────────────────────────────────
 *
 * No Authorization header is read, so no bearer token of any kind can satisfy
 * it. No service-role client is constructed — authentication is the user's own
 * session, never a privileged read. And it enumerates no projects: callers that
 * need project scope use `resolveProjectAccess`, which owns that concern.
 *
 * That last split is on purpose rather than duplication. `resolveProjectAccess`
 * answers "who is calling and which projects may they touch", and pays for an
 * admin round-trip to do it. A route like TTS needs only the first half, and
 * should not pay for — or be able to misuse — the second.
 */

import 'server-only'

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export type UserSessionResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse }

/** Standard 401, matching the shape every other auth helper here returns. */
const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

/**
 * Require a logged-in user.
 *
 * Fails closed on every path: no session, an invalid session, or a thrown
 * client/transport error all produce 401. A throw is caught rather than
 * propagated so a broken session read can never surface as a 500 that some
 * caller might treat differently from a denial.
 */
export async function requireUserSession(): Promise<UserSessionResult> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, response: unauthorized() }
    return { ok: true, userId: user.id }
  } catch {
    return { ok: false, response: unauthorized() }
  }
}
