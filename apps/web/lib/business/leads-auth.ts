/**
 * Authentication for /api/business/leads — and ONLY that route.
 *
 * TWO CLASSES, after Phase 4B3: a logged-in user, or a
 * `project_api_credentials` principal holding the exact scope
 * `business.leads.create`. There is no third.
 *
 * DELIBERATELY NOT A GENERAL "dual auth" HELPER. It lives under `lib/business/`
 * and names leads in its own identifiers because the blast radius of a generic
 * one is the whole API: campaigns, revenue, chat/tts and runs would inherit
 * project-credential access the moment someone reached for the convenient
 * import.
 *
 * ── WHAT 4B3 REMOVED, AND WHY IT COULD GO ────────────────────────────────────
 *
 * This route was the last HTTP surface that accepted the global
 * `AIOPS_API_KEY`. That class is gone. Holding a shared secret proved
 * possession and established no principal, so there was no subject to scope —
 * which is why that path wrote to whatever project the body named, and why it
 * was carried as acknowledged, time-boxed debt rather than defended.
 *
 * It could go because its one real consumer moved off it. Familje-Stunden's
 * `send-pyssel-lead` now authenticates with a scoped credential, proven
 * end-to-end in production on 2026-08-23: the credential's `last_used_at` was
 * stamped and the lead landed on the credential's own project.
 *
 * ── WHY A UNION AND NOT `{ ok: true }` ───────────────────────────────────────
 *
 * A boolean answers "may this proceed" and discards WHICH path said yes. The
 * credential path must scope the write to exactly one project, and the session
 * path must authorize the project the caller named against that user's own
 * allow-list. Those are different obligations, so the caller is handed the auth
 * CLASS and has to decide per class. Adding a class later forces every consumer
 * to consider it rather than inheriting someone else's default.
 *
 * ── PRECEDENCE ───────────────────────────────────────────────────────────────
 *
 *   1. A valid Supabase session            → user
 *   2. Bearer token in the `omn_` namespace → credential path, or DENY
 *   3. Anything else                        → 401
 *
 * Step 2 never falls through to step 3, and step 3 no longer verifies anything:
 * it denies. A token that announces itself as a project credential and then
 * fails — malformed, unknown prefix, wrong secret, revoked, disabled, expired,
 * wrong scope — is denied outright. Fallback would let an attacker probe the
 * credential surface for free, and would make a revoked credential behave
 * differently depending on what else the caller knew.
 *
 * The namespace test keeps the LOOSE token extraction
 * (`replace(/^Bearer\s+/i, '').trim()`) rather than the strict
 * `^Bearer\s+(\S+)$` the verifier uses. That asymmetry is deliberate and
 * fail-closed: a bare `omn_…` header with no `Bearer ` prefix is CLAIMED by
 * this branch and then refused by the verifier, instead of slipping past the
 * namespace test into the generic tail. Tightening the matcher here would move
 * such a token from "denied as a bad credential" to "denied as an unknown
 * bearer" — the same 401 today, but it would quietly re-open the shape of the
 * hole this module exists to close if a third class is ever added.
 */

import 'server-only'

import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import {
  requireProjectApiScope,
  type ProjectApiPrincipal,
} from '@/lib/auth/project-api-credentials'
import { resolveSessionProject } from '@/lib/business/business-auth'

/** The namespace every project credential token announces itself with. */
export const CREDENTIAL_TOKEN_PREFIX = 'omn_'

/**
 * Which class of caller this is. The route branches on `kind`, so a new auth
 * class cannot be added without every consumer being forced to consider it.
 */
export type LeadsAuth =
  | { kind: 'user'; userId: string }
  | { kind: 'project_credential'; principal: ProjectApiPrincipal }

export type LeadsAuthResult =
  | { ok: true; auth: LeadsAuth }
  | { ok: false; response: NextResponse }

/**
 * The presented token, extracted loosely on purpose — see the header note on
 * why this must stay looser than the verifier's own matcher.
 */
function presentedToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header) return null
  const token = header.replace(/^Bearer\s+/i, '').trim()
  return token.length > 0 ? token : null
}

/** Whether the caller is claiming the project-credential namespace. */
export function isCredentialNamespace(token: string | null): boolean {
  return token !== null && token.startsWith(CREDENTIAL_TOKEN_PREFIX)
}

const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

/**
 * Resolve who is calling /api/business/leads.
 *
 * `credentialScope` is the scope the project-credential path must hold for this
 * operation, or `null` when no such scope exists. V1 defines only
 * `business.leads.create`; there is no read scope, so GET passes `null` and a
 * credential token is denied there rather than being tried as something else.
 *
 * Fails closed on every path. The session read's throw is swallowed because an
 * unauthenticated browser is not an error — it simply has no session, and must
 * continue to the token branches rather than surface a 500.
 */
export async function resolveLeadsAuth(
  request: Request,
  credentialScope: string | null,
): Promise<LeadsAuthResult> {
  // 1. Session.
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) return { ok: true, auth: { kind: 'user', userId: user.id } }
  } catch {
    // No session — fall through to token auth.
  }

  const token = presentedToken(request)

  // 2. Project-credential namespace. Terminal: never falls through.
  if (isCredentialNamespace(token)) {
    if (credentialScope === null) return { ok: false, response: unauthorized() }

    const result = await requireProjectApiScope(request, credentialScope)
    if (!result.ok) return { ok: false, response: result.response }

    return { ok: true, auth: { kind: 'project_credential', principal: result.principal } }
  }

  // 3. Anything else. No global key, no verifier, no second chance — 401.
  return { ok: false, response: unauthorized() }
}

// ── Session project authorization (LEADS_SESSION_PROJECT_SCOPE) ──────────────

/**
 * The project a session user may write this lead to.
 *
 * Delegates to the shared business resolver rather than carrying its own copy.
 * The hole this closes, the 403-not-404 reasoning and the scoped slug lookup
 * are all documented there; duplicating the implementation here is how the two
 * would drift, one getting a fix the other keeps missing.
 */
export type { SessionProjectResult } from '@/lib/business/business-auth'

export async function resolveSessionLeadProject(
  body: Record<string, unknown>,
  sessionUserId: string,
) {
  return await resolveSessionProject(body, sessionUserId)
}
