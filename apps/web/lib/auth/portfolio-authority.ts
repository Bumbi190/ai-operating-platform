/**
 * lib/auth/portfolio-authority.ts — whole-portfolio authority, and the
 * platform-level authority that requires it together with the platform operator.
 *
 * ── WHERE THE RULE CAME FROM ───────────────────────────────────────────────
 * `provePortfolioAuthority` was written for the world-scope Executive Brief
 * (EI-S1.2R1) and lived privately in lib/atlas/intelligence/principal-read.ts.
 * Closure audit #6 (A6-1) found a second platform-level artifact, the Manager's
 * daily plan, built from every tenant's operational data with no such check.
 * The rule moved here unchanged instead of being written a second time; the
 * Executive Brief imports it back and behaves exactly as before.
 *
 * ── TWO AUTHORITIES, AND NEITHER IMPLIES THE OTHER ─────────────────────────
 *   PLATFORM OPERATOR  lib/auth/platform-operator.ts — may RUN the platform:
 *                      the global stop, platform spend, platform media.
 *   PORTFOLIO OWNER    here — may READ a synthesis drawn from every project,
 *                      because they provably own every project.
 *
 * Operator status never granted another tenant's data: every isolation phase
 * scoped the operator's reads to the operator's own projects, and the world
 * Executive Brief never consulted it. Owning every project never granted
 * platform spend either; 9X gave that to the operator. An artifact that is both,
 * a platform-wide synthesis paid for by the platform, needs both.
 * `resolvePlatformPortfolioAuthority` resolves exactly that.
 *
 * ── WHY THE PROOF IS NOT RUN WITH THE CALLER'S CLIENT ──────────────────────
 * Enumerating "every project" through a cookie-bound client under an
 * `owner_id = auth.uid()` policy is a tautology: every project I can see is a
 * project I own, so the proof would pass for anyone. It therefore runs through a
 * module-owned service-role reader that selects `id, owner_id` and nothing else.
 * `import 'server-only'` keeps that reader, and its key, out of client bundles.
 */

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { resolvePlatformOperator, type PlatformOperatorDenial } from './platform-operator'

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

/**
 * Default authority seam. Uses the service-role client deliberately and
 * narrowly: enumerating the whole platform is precisely the question being
 * asked, and a user-scoped client cannot answer it without begging it.
 */
export const serviceRolePortfolioReader: PortfolioAuthorityReader = async () => {
  const { data, error } = await createAdminClient().from('projects').select('id, owner_id')
  if (error) throw new Error(`[portfolio-authority] portfolio enumeration failed: ${error.message}`)
  return (data ?? []) as unknown as PortfolioProjectRow[]
}

/**
 * True only when the principal owns EVERY project on the platform.
 *
 * Fails closed on every uncertainty: a read error, an empty platform, an
 * unowned project, or a project owned by anyone else. Authority must be
 * positively held, never inferred from absence.
 */
export async function provePortfolioAuthority(
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

// ─── Platform operator AND whole portfolio ───────────────────────────────────

export type PlatformPortfolioDenial = PlatformOperatorDenial | 'portfolio_denied'

/** Proof that the session is the platform operator AND owns every project. */
export interface PlatformPortfolioAuthority {
  readonly ok: true
  readonly userId: string
  /** Server-derived; what a ledger records as the actor. */
  readonly actor: string
}

export type PlatformPortfolioAuthorityResult =
  | PlatformPortfolioAuthority
  | { ok: false; reason: PlatformPortfolioDenial }

/**
 * Only `resolvePlatformPortfolioAuthority` can put a value in here, so a
 * consumer that insists on one (`assertPlatformPortfolioAuthority`) cannot be
 * satisfied by an object literal that merely has the right shape.
 */
const minted = new WeakSet<object>()

/**
 * Resolve platform-level authority for the verified session.
 *
 * The operator check runs FIRST because it needs no privileged read at all: an
 * ordinary session is refused without a service-role client ever being made.
 * Only an operator pays for the portfolio proof, whose one read is ids and
 * owners. Nothing here comes from a request body, header or argument.
 */
export async function resolvePlatformPortfolioAuthority(): Promise<PlatformPortfolioAuthorityResult> {
  const operator = await resolvePlatformOperator()
  if (!operator.ok) return { ok: false, reason: operator.reason }

  if (!(await provePortfolioAuthority(operator.userId, serviceRolePortfolioReader))) {
    return { ok: false, reason: 'portfolio_denied' }
  }

  const authority: PlatformPortfolioAuthority = Object.freeze({
    ok: true as const, userId: operator.userId, actor: operator.actor,
  })
  minted.add(authority)
  return authority
}

/** True only for an authority minted by `resolvePlatformPortfolioAuthority`. */
export function isPlatformPortfolioAuthority(value: unknown): value is PlatformPortfolioAuthority {
  return typeof value === 'object' && value !== null && minted.has(value)
}

/**
 * For code that PRODUCES platform-level output: refuse unless handed a minted
 * authority. A backstop behind the route's own check, so a future caller that
 * forgets the route-level gate still cannot reach the model or the cache.
 */
export function assertPlatformPortfolioAuthority(
  value: unknown,
): asserts value is PlatformPortfolioAuthority {
  if (!isPlatformPortfolioAuthority(value)) {
    throw new Error(
      '[portfolio-authority] platform-level output requires platform operator and whole-portfolio authority',
    )
  }
}
