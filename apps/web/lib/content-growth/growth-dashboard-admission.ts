/**
 * Unmounted, server-only admission candidate for the first Growth Engine pilot.
 * The Prompt only. No credentials, provider requests, metrics reads or mutations.
 * A successful stored account binding does NOT prove historical post evidence
 * or current provider access. Until an approved trusted evidence reader exists,
 * this gate never returns a projection or authorizes a pilot.
 */
import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import type { createAdminClient } from '@/lib/supabase/admin'
import { assertProjectAllowed, getAllowedProjectIds, IMPOSSIBLE_PROJECT_ID } from '@/lib/atlas/isolation'
import { isProjectId, readActiveBinding } from '@/lib/media/social-bindings'

type RequestClient = Pick<Awaited<ReturnType<typeof createClient>>, 'auth' | 'from'>
type MetadataClient = Pick<ReturnType<typeof createAdminClient>, 'from'>
type Status =
  | 'no_access'
  | 'unavailable'
  | 'account_missing'
  | 'account_blocked'
  | 'account_unverified'
  | 'post_evidence_not_established'

export type GrowthDashboardAdmission = Readonly<{
  status: Status
  projection: null
  authorizesPilot: false
}>

const result = (status: Status): GrowthDashboardAdmission =>
  ({ status, projection: null, authorizesPilot: false })

/**
 * Only server code may supply a request-scoped authenticated client and a
 * lazy server-side metadata client. Never take either from a request body.
 * Existing Atlas owner allow-list is necessary but not sufficient: independently
 * recheck the exact project/owner and pilot slug using the request's RLS client.
 * Resolve stored binding metadata only after both ownership checks succeed.
 * Do not return user, project, account, binding, or provider identifiers.
 */
export async function readGrowthDashboardAdmission(
  requestClient: RequestClient,
  requestedProjectId: unknown,
  metadataClient: () => MetadataClient,
): Promise<GrowthDashboardAdmission> {
  if (!isProjectId(requestedProjectId) || requestedProjectId === IMPOSSIBLE_PROJECT_ID) {
    return result('no_access')
  }

  try {
    const { data, error } = await requestClient.auth.getUser()
    const userId = data?.user?.id
    if (error || !isProjectId(userId) || userId === IMPOSSIBLE_PROJECT_ID) return result('no_access')

    const allowed = await getAllowedProjectIds(requestClient, userId)
    if (!Array.isArray(allowed) || !allowed.every(id => isProjectId(id) && id !== IMPOSSIBLE_PROJECT_ID)
      || !assertProjectAllowed(requestedProjectId, allowed)) return result('no_access')

    // Exact scoped RLS read; never use an admin client for this ownership proof.
    // This is a second defense even if an unexpected allow-list contains an ID.
    const project = await requestClient.from('projects')
      .select('id, owner_id, slug')
      .eq('id', requestedProjectId)
      .eq('owner_id', userId)
      .maybeSingle()
    if (project.error) return result('unavailable')
    if (!project.data || project.data.id !== requestedProjectId ||
      project.data.owner_id !== userId || project.data.slug !== 'ai-media-automation') {
      return result('no_access')
    }

    // Use the existing active-binding reader, never the credential resolver.
    // Explicit non-null client prevents readActiveBinding's default factory.
    const db = metadataClient()
    if (!db || typeof db.from !== 'function') return result('unavailable')
    const stored = await readActiveBinding(requestedProjectId, 'instagram', db)
    if (!stored.ok) return result('unavailable')
    const binding = stored.binding
    if (!binding) return result('account_missing')
    if (binding.projectId !== requestedProjectId || binding.platform !== 'instagram') {
      return result('unavailable')
    }
    if (binding.blockedAt !== null || binding.blockedReason !== null) return result('account_blocked')
    if (binding.verification !== 'provider_attested' ||
      !Number.isFinite(Date.parse(binding.verifiedAt))) return result('account_unverified')

    // A mutable media_insights cache and account-level snapshots cannot
    // certify per-post fixed-age observations or a predeclared A/B roster.
    // Do not attempt to read them or turn fetched_at into a verified timestamp.
    return result('post_evidence_not_established')
  } catch {
    return result('unavailable')
  }
}