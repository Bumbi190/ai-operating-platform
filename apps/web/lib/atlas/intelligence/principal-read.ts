/**
 * lib/atlas/intelligence/principal-read.ts
 * Principal-scoped read boundary for Executive Intelligence artifacts.
 *
 * WHY THIS EXISTS
 * The internal route `GET /api/atlas/intelligence/brief` authenticates with the
 * shared `CRON_SECRET` and, called without `projectId`, returns artifacts across
 * every project. That is acceptable for a cron-only internal surface and must
 * never back a user-facing page. The EI-S1.0 audit recorded it as a gap.
 *
 * This module is the minimal alternative: a server-side read bound to an
 * authenticated principal, reusing the existing isolation boundary
 * (`getAllowedProjectIds`, which mirrors the `projects_owner` RLS policy) and
 * the existing IntelligenceStore. It adds no new authorization framework.
 *
 * FAIL-CLOSED RULES
 *   • no principal                       → null
 *   • project scope not in the allow-list → null
 *   • world scope while any project is outside the allow-list → null
 *
 * The third rule is the important one. A world-scope (`project_id IS NULL`)
 * Executive Brief is a synthesis *across* the portfolio, so reading it is only
 * safe for a principal who is authorised for the whole portfolio. A principal
 * who cannot see every project must never obtain the world brief, because that
 * would hand them conclusions drawn from another project's intelligence.
 *
 * Errors resolve to null rather than propagating: a read failure must degrade to
 * "no brief" and never to an unscoped read.
 */

import { getAllowedProjectIds } from '@/lib/atlas/isolation'
import { createIntelligenceStore } from './postgres-store'
import type { IntelligenceStore } from './store'
import type { ExecutiveBriefBody, IntelligenceObject } from './types'

type AnyDb = any

export interface PrincipalBriefRequest {
  /** Server-side DB handle used ONLY to resolve the principal's allow-list. */
  db: AnyDb
  /** Authenticated principal id (`auth.uid()`). Absent ⇒ denied. */
  userId: string | null | undefined
  /**
   * Project to read. Omit or pass null for the world/portfolio brief, which
   * requires authority over every project.
   */
  projectId?: string | null
  store?: IntelligenceStore
}

export interface PrincipalBriefResult {
  brief: IntelligenceObject<ExecutiveBriefBody> | null
  /** Why nothing was returned. `ok` means the read was permitted. */
  status: 'ok' | 'no_principal' | 'project_denied' | 'portfolio_denied' | 'unavailable' | 'not_produced'
}

const DENIED = (status: PrincipalBriefResult['status']): PrincipalBriefResult => ({ brief: null, status })

/**
 * Read the latest non-superseded Executive Brief the principal is entitled to.
 * Never throws.
 */
export async function readExecutiveBriefForPrincipal(
  request: PrincipalBriefRequest,
): Promise<PrincipalBriefResult> {
  const { db, userId } = request
  if (!userId) return DENIED('no_principal')

  const requestedProjectId = request.projectId ?? null
  const store = request.store ?? createIntelligenceStore()

  let allowedProjectIds: string[]
  try {
    allowedProjectIds = await getAllowedProjectIds(db, userId)
  } catch {
    return DENIED('unavailable')
  }

  if (requestedProjectId !== null) {
    // Project scope: membership in the allow-list is the whole test.
    if (!allowedProjectIds.includes(requestedProjectId)) return DENIED('project_denied')
  } else {
    // World scope: the principal must be authorised for the entire portfolio.
    const authorized = await isAuthorizedForWholePortfolio(db, allowedProjectIds)
    if (!authorized) return DENIED('portfolio_denied')
  }

  try {
    const briefs = await store.query<ExecutiveBriefBody>({
      kinds: ['executive_brief'],
      projectId: requestedProjectId,
      limit: 1,
    })
    const brief = briefs[0] ?? null
    return brief ? { brief, status: 'ok' } : DENIED('not_produced')
  } catch {
    return DENIED('unavailable')
  }
}

/**
 * True only when every project row is inside the principal's allow-list.
 * Any error, and any project the principal cannot see, denies the read.
 */
async function isAuthorizedForWholePortfolio(db: AnyDb, allowedProjectIds: string[]): Promise<boolean> {
  try {
    const { data, error } = await db.from('projects').select('id')
    if (error) return false
    const all = (data ?? []) as { id: string }[]
    // A principal with no projects never reaches the portfolio brief, even when
    // the portfolio itself is empty: authority has to be positively held.
    if (allowedProjectIds.length === 0) return false
    const allowed = new Set(allowedProjectIds)
    return all.every(project => allowed.has(project.id))
  } catch {
    return false
  }
}
