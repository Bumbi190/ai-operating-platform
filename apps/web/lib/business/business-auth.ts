/**
 * Session authorization for the business routes.
 *
 * BUSINESS_SESSION_PROJECT_SCOPE_CAMPAIGNS_REVENUE. Authenticating a user is
 * not authorizing a project. `/api/business/campaigns` and
 * `/api/business/revenue` proved only that SOMEONE was logged in and then let
 * the caller name the project — or, on a read with no filter at all, returned
 * every row in every tenant's project. This module is where a session caller's
 * project is decided instead.
 *
 * ── SCOPE OF THIS MODULE ─────────────────────────────────────────────────────
 *
 * It classifies the caller and resolves an authorized project. It grants
 * NOTHING: no credential path, no new capability, no widening. The legacy
 * `AIOPS_API_KEY` class is returned as `legacy_api_key` and deliberately left
 * with the behaviour it already had — that is transitional debt scheduled for
 * removal, not something to paper over here.
 *
 * It is named for the business routes and lives beside them. It is not the
 * general "dual auth for every route" helper: `chat/tts` is not project-bound
 * and must not import this.
 *
 * ── ONE IMPLEMENTATION, NOT TWO ──────────────────────────────────────────────
 *
 * `resolveSessionProject` is shared with `leads-auth.ts` rather than copied.
 * Two files carrying the same security-critical resolution is how they drift:
 * one gets a fix, the other keeps the hole. Ownership itself is never
 * reimplemented here — `resolveProjectAccess`, `assertProjectAllowed` and
 * `scopeToProjects` remain the only source of truth.
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

/** Repository escape hatch for tables outside the generated Database type. */
type AnyDb = any // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Which class of caller this is. A boolean would lose exactly the distinction
 * this phase needs: the session path gets scoping, the legacy path keeps its
 * existing unscoped behaviour until it is deleted.
 */
export type BusinessAuth =
  | { kind: 'user'; userId: string }
  | { kind: 'legacy_api_key' }

export type BusinessAuthResult =
  | { ok: true; auth: BusinessAuth }
  | { ok: false; response: NextResponse }

/**
 * Resolve who is calling a business route.
 *
 * Reproduces `requireUserOrApiKey`'s exact order and its swallowed throw, and
 * calls `requireApiKey` itself for the legacy branch so that path's 401 body
 * and its 500-on-missing-env stay byte-identical.
 */
export async function resolveBusinessAuth(request: Request): Promise<BusinessAuthResult> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) return { ok: true, auth: { kind: 'user', userId: user.id } }
  } catch {
    // No session — fall through to key auth, exactly as api-auth does.
  }

  const legacy = requireApiKey(request)
  if (!legacy.ok) return { ok: false, response: legacy.response }
  return { ok: true, auth: { kind: 'legacy_api_key' } }
}

// ── Reads: the allow-list a query must be scoped to ─────────────────────────

export type SessionScopeResult =
  | { ok: true; allowedProjectIds: string[] }
  | { ok: false; response: NextResponse }

/**
 * The projects a session caller may read from.
 *
 * Returned as a LIST rather than a single project because reads must be scoped
 * at the query boundary. Post-filtering a service-role result would mean the
 * rows were fetched first, and one forgotten filter later turns that into a
 * leak; `applyProjectScope` instead pushes an impossible id into the query when
 * the list is empty, so a user who owns nothing can never match a row.
 *
 * An empty list is a legitimate answer meaning "nothing", never "everything".
 */
export async function resolveSessionScope(sessionUserId: string): Promise<SessionScopeResult> {
  const access = await resolveProjectAccess()
  if (!access.ok) return { ok: false, response: access.response }
  if (access.userId !== sessionUserId) return { ok: false, response: projectForbidden() }
  return { ok: true, allowedProjectIds: access.allowedProjectIds }
}

// ── Writes: one authorized project ──────────────────────────────────────────

/** A caller-supplied project reference. Input, never a security principal. */
export interface ProjectRefInput {
  project_id?: unknown
  project_slug?: unknown
}

export type SessionProjectResult =
  | { ok: true; projectId: string }
  | { ok: false; response: NextResponse }

/** Message and status preserved verbatim from the pre-existing store error. */
const NO_PROJECT = () => NextResponse.json(
  { error: 'Okänt projekt — ange project_id eller giltig project_slug' },
  { status: 400 },
)

/**
 * Resolve and authorize the project a session caller named.
 *
 * ── WHY 403 AND NOT A COLLAPSED 404 ──────────────────────────────────────────
 *
 * `/api/leads` — the established business-route precedent — answers
 * `projectForbidden()`. `assertProjectAllowed` is pure set membership against
 * the caller's OWN projects and never looks the target up, so an unknown uuid
 * and another tenant's uuid are already indistinguishable. 403 leaks nothing a
 * caller could not derive from their own project list.
 *
 * ── THE SLUG IS THE DANGEROUS ONE ────────────────────────────────────────────
 *
 * A slug must be resolved to be checked, and "resolve globally, then authorize"
 * would answer differently for an unknown slug than for a real slug the caller
 * does not own — an existence oracle over every tenant's project names. The
 * lookup is therefore scoped with `scopeToProjects`, so unknown and foreign
 * both return zero rows and the identical refusal.
 */
export async function resolveSessionProject(
  ref: ProjectRefInput,
  sessionUserId: string,
): Promise<SessionProjectResult> {
  const access = await resolveProjectAccess()
  if (!access.ok) return { ok: false, response: access.response }

  // Two canonical session reads must agree. A mismatch means the session
  // changed mid-request; that is denied, never resolved in the caller's favour.
  if (access.userId !== sessionUserId) return { ok: false, response: projectForbidden() }

  const rawId = ref.project_id
  if (rawId !== undefined && rawId !== null) {
    if (typeof rawId !== 'string') return { ok: false, response: projectForbidden() }
    if (!assertProjectAllowed(rawId, access.allowedProjectIds)) {
      return { ok: false, response: projectForbidden() }
    }
    return { ok: true, projectId: rawId }
  }

  const rawSlug = ref.project_slug
  if (rawSlug !== undefined && rawSlug !== null) {
    if (typeof rawSlug !== 'string' || rawSlug.length === 0) {
      return { ok: false, response: projectForbidden() }
    }
    try {
      const db = createAdminClient() as AnyDb
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
