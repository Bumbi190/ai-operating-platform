/**
 * lib/atlas/intelligence/principal-read.ts
 * Principal-scoped read boundary for Executive Intelligence artifacts.
 *
 * WHY THIS EXISTS
 * There was an internal route, `GET /api/atlas/intelligence/brief`, that
 * authenticated with the shared `CRON_SECRET` and — called without `projectId` —
 * returned artifacts across every project through a service-role client. The
 * EI-S1.0 audit recorded it as a gap and this module was the answer for
 * user-facing reads.
 *
 * EI-S1.5A finished the job: the audit found the route had no live caller —
 * no `fetch`, no Vercel cron entry, no pg_cron schedule (that schedules
 * `/api/atlas/intelligence/cron/brief`, which GENERATES briefs and is a
 * different endpoint) — so it was RETIRED rather than re-authenticated. A
 * reusable shared infrastructure secret must never become a parallel data
 * authorization model, and an unused privileged endpoint is best removed
 * rather than hardened.
 *
 * This module is therefore the ONLY Executive Brief read path.
 *
 * This module is the minimal alternative: a server-side read bound to an
 * authenticated principal, reusing the existing isolation boundary
 * (`getAllowedProjectIds`, which filters on `owner_id` in application code) and
 * the existing IntelligenceStore. It adds no new authorization framework.
 *
 * Note: the repository does not contain the `projects` table definition or any
 * `create policy` statement for it, so no in-repo artefact proves what RLS is
 * actually enabled there. This boundary is therefore written to be correct
 * whether or not `projects` enforces RLS.
 *
 * FAIL-CLOSED RULES
 *   • no principal                       → null
 *   • project scope not in the allow-list → null
 *   • world scope unless the principal provably owns every project → null
 *
 * The third rule is the important one. A world-scope (`project_id IS NULL`)
 * Executive Brief is a synthesis *across* the portfolio, so reading it is only
 * safe for a principal who is authorised for the whole portfolio. A principal
 * who cannot see every project must never obtain the world brief, because that
 * would hand them conclusions drawn from another project's intelligence.
 *
 * Errors resolve to null rather than propagating: a read failure must degrade to
 * "no brief" and never to an unscoped read.
 *
 * WHY PORTFOLIO AUTHORITY IS NOT PROVEN WITH THE CALLER'S CLIENT (EI-S1.2R1)
 * The world-scope proof must not be an RLS-filtered query pretending to
 * enumerate rows that the same RLS hides. If the enumeration ran on a
 * cookie-bound user client under a `owner_id = auth.uid()` policy, then
 * "every project I can see is a project I own" is a tautology and the world
 * brief would be granted to anyone. The proof therefore runs through an
 * explicit, module-owned authority seam rather than through whatever client the
 * caller happened to inject — the caller's privilege level can no longer change
 * the answer. `import 'server-only'` keeps this module (and the service-role
 * key its default seam uses) out of any client bundle.
 */

import 'server-only'

import { getAllowedProjectIds } from '@/lib/atlas/isolation'
import { createAdminClient } from '@/lib/supabase/admin'
import { createIntelligenceStore } from './postgres-store'
import type { IntelligenceStore } from './store'
import type { ExecutiveBriefBody, IntelligenceObject } from './types'

type AnyDb = any

/**
 * One project row as the authority seam sees it. Least privilege: identity and
 * ownership only — never settings, names or any other project content.
 */
export interface PortfolioProjectRow {
  id: string
  owner_id: string | null
}

/**
 * Enumerates EVERY project on the platform, independently of the caller.
 * Must not be backed by a user-filtered client; see the header.
 */
export type PortfolioAuthorityReader = () => Promise<PortfolioProjectRow[]>

export interface PrincipalBriefRequest {
  /**
   * Server-side DB handle used ONLY to resolve the principal's own allow-list
   * (`getAllowedProjectIds`, which filters on `owner_id` and so returns the
   * same set under either a user-scoped or a service-role client). It is never
   * used to decide portfolio authority.
   */
  db: AnyDb
  /** Authenticated principal id (`auth.uid()`). Absent ⇒ denied. */
  userId: string | null | undefined
  /**
   * Project to read. Omit or pass null for the world/portfolio brief, which
   * requires provable authority over every project.
   */
  projectId?: string | null
  store?: IntelligenceStore
  /** Test seam. Production callers omit it and get the service-role reader. */
  portfolioAuthorityReader?: PortfolioAuthorityReader
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
    // World scope: the principal must be provably authorised for the entire
    // platform, proven independently of the caller's client (see header).
    const authorized = await provePortfolioAuthority(
      userId,
      request.portfolioAuthorityReader ?? serviceRolePortfolioReader,
    )
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
 * Default authority seam. Uses the service-role client deliberately and
 * narrowly: enumerating the whole platform is precisely the question being
 * asked, and a user-scoped client cannot answer it without begging it. The
 * select is limited to `id, owner_id` so no project content is read, and this
 * module is `server-only` so the key never reaches a browser bundle.
 */
const serviceRolePortfolioReader: PortfolioAuthorityReader = async () => {
  const { data, error } = await createAdminClient().from('projects').select('id, owner_id')
  if (error) throw new Error(`[principal-read] portfolio enumeration failed: ${error.message}`)
  return (data ?? []) as unknown as PortfolioProjectRow[]
}

/**
 * True only when the principal owns EVERY project on the platform.
 *
 * A world-scope (`project_id IS NULL`) Executive Brief is synthesised from
 * platform-wide signals — `querySignals` applies no project filter for global
 * scope — so its conclusions can be drawn from any project. Reading it is only
 * safe for a principal who holds authority over all of them.
 *
 * Fails closed on every uncertainty: a read error, an empty platform, an
 * unowned project, or a project owned by anyone else. Authority must be
 * positively held, never inferred from absence.
 */
async function provePortfolioAuthority(
  userId: string,
  readPortfolio: PortfolioAuthorityReader,
): Promise<boolean> {
  let projects: PortfolioProjectRow[]
  try {
    projects = await readPortfolio()
  } catch {
    return false
  }
  if (projects.length === 0) return false
  return projects.every(project => project.owner_id === userId)
}
