import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/handlarborsen-test-data/contracts'
import { getReadiness } from './readiness'

const headers = { 'cache-control': 'private, no-store' }
const respond = (status: number, value: unknown) => Response.json(value, { status, headers })

export type AccessResult = { ok: true; userId: string; allowedProjectIds: string[] } | { ok: false; status: 401 | 403 }

export interface LeadFinderDeps {
  resolveAccess: () => Promise<AccessResult>
  env?: Record<string, string | undefined>
}

/**
 * GET readiness for the Handlarbörsen lead finder. Owner-only and pinned to
 * the Handlarbörsen project id: a caller whose allow-list lacks that project
 * (wrong project / other tenant) gets 403 and nothing else.
 *
 * This readiness route has no POST for live SCB search. The separate
 * /import POST is feature-gated, owner-authorized and defaults to disabled.
 * Previews can also run offline (see docs/handlarborsen-lead-finder.md).
 */
export async function leadFinderReadinessApi(request: Request, deps: LeadFinderDeps): Promise<Response> {
  if (request.method !== 'GET') return respond(405, { status: 'method_not_allowed' })
  const access = await deps.resolveAccess()
  if (!access.ok) return respond(access.status, { status: 'denied' })
  if (!access.allowedProjectIds.includes(HANDLARBORSEN_PROJECT_ID)) return respond(403, { status: 'denied' })
  return respond(200, { projectId: HANDLARBORSEN_PROJECT_ID, readiness: getReadiness(deps.env) })
}
