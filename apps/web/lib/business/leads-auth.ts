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
import { createAdminClient } from '@/lib/supabase/admin'
import {
  resolveProjectAccess, assertProjectAllowed, projectForbidden,
} from '@/lib/auth/project-access'
import { scopeToProjects } from '@/lib/atlas/isolation'
import {
  requireProjectApiScope,
  type ProjectApiPrincipal,
} from '@/lib/auth/project-api-credentials'

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
 * ── THE HOLE THIS CLOSES ─────────────────────────────────────────────────────
 *
 * Authenticating a user is not authorizing a project. Before this, the session
 * path proved only that SOMEONE was logged in and then handed the body straight
 * to `createLead`, whose `resolveProjectId` takes `project_id` verbatim and
 * resolves `project_slug` service-role with no owner filter. Any logged-in user
 * could therefore write a lead into any tenant's project by naming it.
 *
 * ── WHY 403 AND NOT A COLLAPSED 404 ──────────────────────────────────────────
 *
 * `/api/leads` — the closest precedent, and the other route that writes this
 * same table — answers `projectForbidden()`. The Executive routes collapse
 * foreign and unknown into one 404 because they act on specific record ids
 * whose existence is itself sensitive. Nothing like that applies here:
 * `assertProjectAllowed` is pure set membership against the caller's OWN
 * projects and never looks the target up, so an unknown uuid and another
 * tenant\'s uuid are already indistinguishable — both are simply absent from
 * the allow-list. 403 leaks nothing that the caller could not derive from
 * their own project list.
 *
 * ── THE SLUG IS THE DANGEROUS ONE ────────────────────────────────────────────
 *
 * A slug MUST be resolved to be checked, and a naive "resolve globally, then
 * authorize" would answer differently for an unknown slug than for a real slug
 * the caller does not own — an existence oracle over every tenant\'s project
 * names. So the lookup itself is scoped with `scopeToProjects`, whose
 * `scopeProjectFilter` substitutes an impossible id for an empty allow-list.
 * Unknown and foreign both return zero rows and therefore the identical 403,
 * and a user who owns nothing can never match anything.
 *
 * ── ONE SESSION, NOT TWO ─────────────────────────────────────────────────────
 *
 * `resolveProjectAccess()` performs its own canonical session lookup, so this
 * cross-checks its `userId` against the one the auth resolver already
 * established. Two independent reads that disagree mean the session changed
 * mid-request; that is denied rather than resolved in the caller\'s favour.
 */
/** Repository escape hatch for tables outside the generated Database type. */
type AnyDb = any // eslint-disable-line @typescript-eslint/no-explicit-any

export type SessionProjectResult =
  | { ok: true; projectId: string }
  | { ok: false; response: NextResponse }

/** Message and status preserved verbatim from the pre-existing store error. */
const NO_PROJECT = () => NextResponse.json(
  { error: 'Okänt projekt — ange project_id eller giltig project_slug' },
  { status: 400 },
)

export async function resolveSessionLeadProject(
  body: Record<string, unknown>,
  sessionUserId: string,
): Promise<SessionProjectResult> {
  const access = await resolveProjectAccess()
  if (!access.ok) return { ok: false, response: access.response }

  // Two canonical session reads must agree. A mismatch is denied, never merged.
  if (access.userId !== sessionUserId) return { ok: false, response: projectForbidden() }

  const rawId = body.project_id
  if (rawId !== undefined && rawId !== null) {
    if (typeof rawId !== 'string') return { ok: false, response: projectForbidden() }
    if (!assertProjectAllowed(rawId, access.allowedProjectIds)) {
      return { ok: false, response: projectForbidden() }
    }
    return { ok: true, projectId: rawId }
  }

  const rawSlug = body.project_slug
  if (rawSlug !== undefined && rawSlug !== null) {
    if (typeof rawSlug !== 'string' || rawSlug.length === 0) {
      return { ok: false, response: projectForbidden() }
    }
    try {
      // Repository convention for tables absent from the generated types
      // (see lib/atlas/*/store.ts): cast once at the client boundary.
      const db = createAdminClient() as AnyDb
      // Scoped by `id`, so the lookup can only ever see the caller's own
      // projects — an unknown slug and a foreign slug both return zero rows.
      const { data, error } = await scopeToProjects(
        db.from('projects').select('id').eq('slug', rawSlug),
        access.allowedProjectIds,
        'id',
      ).maybeSingle()
      // Unknown slug, foreign slug and a lookup failure are one response.
      if (error || !data?.id) return { ok: false, response: projectForbidden() }
      return { ok: true, projectId: data.id as string }
    } catch {
      return { ok: false, response: projectForbidden() }
    }
  }

  return { ok: false, response: NO_PROJECT() }
}
