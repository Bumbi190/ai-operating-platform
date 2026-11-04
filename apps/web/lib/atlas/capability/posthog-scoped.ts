/**
 * Project-scoped PostHog reader.
 *
 * The caller must have authenticated the user and derived owned Omnira
 * project IDs from the canonical project access boundary. Bindings are
 * server-owned; no PostHog project ID or key is accepted from browser input.
 * This read adapter is not attached to the Nova tool registry or any route.
 */
import { assertProjectAllowed } from '../isolation'
import { readPosthogDashboards, type PosthogReadConfig, type PosthogDashboardResponse } from './posthog-read'

export type PosthogProjectBinding = Readonly<{
  omniraProjectId: string
  posthog: PosthogReadConfig
}>

export type ScopedPosthogReadRequest = Readonly<{
  requestedOmniraProjectId: string
  allowedOmniraProjectIds: readonly string[]
  bindings: readonly PosthogProjectBinding[]
}>

/** This is an access check, not an autonomy license or delegation grant. */
export function resolveScopedPosthogConfig(request: ScopedPosthogReadRequest): PosthogReadConfig {
  if (!request.requestedOmniraProjectId ||
      !assertProjectAllowed(request.requestedOmniraProjectId, [...request.allowedOmniraProjectIds])) {
    throw new Error('posthog_project_forbidden')
  }
  const matches = request.bindings.filter(
    binding => binding.omniraProjectId === request.requestedOmniraProjectId,
  )
  if (matches.length !== 1) throw new Error('posthog_binding_unavailable')
  return matches[0].posthog
}

/**
 * A trusted service-only read primitive; caller must independently prove
 * mission capability authorization before invoking this function.
 */
export async function readScopedPosthogDashboards(
  request: ScopedPosthogReadRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<PosthogDashboardResponse> {
  const config = resolveScopedPosthogConfig(request)
  return readPosthogDashboards(config, fetchImpl)
}
