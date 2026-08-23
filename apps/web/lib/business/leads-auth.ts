/**
 * Authentication for /api/business/leads — and ONLY that route.
 *
 * SECURITY CREDENTIAL PHASE 2. This adds a third way to authenticate a lead
 * create: a `project_api_credentials` principal holding the exact scope
 * `business.leads.create`. The two existing ways are untouched.
 *
 * DELIBERATELY NOT A GENERAL "dual auth" HELPER. It lives under `lib/business/`
 * and names leads in its own identifiers because the blast radius of a generic
 * one is the whole API: campaigns, revenue, chat/tts and runs would inherit
 * project-credential access the moment someone reached for the convenient
 * import. Phase 2 is leads-create and nothing else, so the code says so.
 *
 * ── WHY A UNION AND NOT `{ ok: true }` ───────────────────────────────────────
 *
 * `requireUserOrApiKey` answers "may this request proceed" and discards which
 * of the two paths said yes. That is exactly the loss of information this phase
 * cannot afford: the credential path must scope the write to one project, while
 * the legacy path must keep its existing unscoped behaviour. A boolean cannot
 * express that difference, so the caller is handed the auth CLASS and has to
 * decide per class.
 *
 * The legacy path is `legacy_api_key`, never `project_credential`. Holding the
 * global key still proves possession of a shared secret and establishes no
 * principal — calling it a principal in the type system would be a lie that
 * later code would act on.
 *
 * ── PRECEDENCE, AND WHY THE NAMESPACE CHECK COMES FIRST ──────────────────────
 *
 *   1. A valid Supabase session   → user
 *   2. Bearer token in the `omn_` namespace → credential path, or DENY
 *   3. Any other bearer token     → legacy AIOPS_API_KEY
 *
 * Step 2 never falls through to step 3. A token that announces itself as a
 * project credential and then fails — malformed, unknown prefix, wrong secret,
 * revoked, expired, wrong scope — is denied outright. Allowing fallback would
 * mean an attacker could probe the credential surface for free and still get a
 * second attempt at the global key, and it would make a revoked credential
 * behave differently depending on what else the caller knew.
 *
 * The namespace test uses the SAME token extraction as `requireApiKey`
 * (`replace(/^Bearer\s+/i, '').trim()`), not a stricter one. With a stricter
 * matcher, a header of bare `omn_…` with no `Bearer ` would fail the namespace
 * test, fall to the legacy branch, and be compared against the global key —
 * quietly re-opening the fallback this module exists to close.
 */

import 'server-only'

import { NextResponse } from 'next/server'

import { requireApiKey } from '@/lib/api-auth'
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
  | { kind: 'legacy_api_key' }
  | { kind: 'project_credential'; principal: ProjectApiPrincipal }

export type LeadsAuthResult =
  | { ok: true; auth: LeadsAuth }
  | { ok: false; response: NextResponse }

/**
 * Token exactly as `requireApiKey` would see it. Shared on purpose — see the
 * header note about why a stricter matcher would re-open the legacy fallback.
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
 * operation, or `null` when no such scope exists yet. V1 defines only
 * `business.leads.create`; there is no read scope, so GET passes `null` and a
 * credential token is denied rather than silently tried as the global key.
 *
 * The session branch reproduces `requireUserOrApiKey`'s exact shape, including
 * the swallowed throw, so an unauthenticated browser still falls through to key
 * auth precisely as it does today. The legacy branch calls `requireApiKey`
 * itself rather than reimplementing it, so its 401 body and its 500-on-missing-
 * env remain byte-identical.
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
    // No session — fall through to token auth, exactly as api-auth does.
  }

  const token = presentedToken(request)

  // 2. Project-credential namespace. Terminal: never falls through.
  if (isCredentialNamespace(token)) {
    if (credentialScope === null) return { ok: false, response: unauthorized() }

    const result = await requireProjectApiScope(request, credentialScope)
    if (!result.ok) return { ok: false, response: result.response }

    return { ok: true, auth: { kind: 'project_credential', principal: result.principal } }
  }

  // 3. Legacy global key, unchanged.
  const legacy = requireApiKey(request)
  if (!legacy.ok) return { ok: false, response: legacy.response }
  return { ok: true, auth: { kind: 'legacy_api_key' } }
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
