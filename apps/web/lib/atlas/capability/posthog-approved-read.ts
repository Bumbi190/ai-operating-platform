import 'server-only'

import { createHash } from 'node:crypto'
import { resolveProjectAccess } from '@/lib/auth/project-access'
import { createPosthogStoreClient } from './posthog-store-client'
import { resolveAuthorization } from '../authorization/principal-read'
import { canonicalJson } from '../mission/binding'
import { assertProjectAllowed } from '../isolation'
import { loadPosthogBindings } from './posthog-config'
import { resolveScopedPosthogConfig } from './posthog-scoped'
import { readPosthogDashboards } from './posthog-read'

const ACTION = 'analytics.posthog.dashboards.read'
const fingerprint = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex')
const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

async function context(request: unknown) {
  const access = await resolveProjectAccess()
  if (!access.ok) throw new Error('posthog_unauthorized')
  const input = request && typeof request === 'object' ? request as Record<string, unknown> : {}
  if (typeof input.projectId !== 'string' || !input.projectId.trim()) throw new Error('posthog_invalid_project')
  if (!assertProjectAllowed(input.projectId, access.allowedProjectIds)) throw new Error('posthog_project_forbidden')
  let config
  try {
    config = resolveScopedPosthogConfig({
      requestedOmniraProjectId: input.projectId,
      allowedOmniraProjectIds: access.allowedProjectIds,
      bindings: loadPosthogBindings({
        POSTHOG_OMNIRA_PROJECT_ID: process.env.POSTHOG_OMNIRA_PROJECT_ID,
        POSTHOG_PROJECT_ID: process.env.POSTHOG_PROJECT_ID,
        POSTHOG_PERSONAL_API_KEY: process.env.POSTHOG_PERSONAL_API_KEY,
        POSTHOG_APP_HOST: process.env.POSTHOG_APP_HOST,
      }),
    })
  } catch { throw new Error('posthog_not_configured') }
  const payload = {
    schemaVersion: 1, projectId: input.projectId, actionKind: ACTION,
    posthogProjectId: config.projectId, appHost: config.appHost,
    operation: 'list_dashboards', limit: 10, offset: 0, timeoutMs: 5000, maxResponseBytes: 1048576,
  }
  const target = { targetType: 'posthog_dashboard_read', targetId: input.projectId, versionHash: fingerprint(payload) }
  return { access, input, config, payload, target }
}

/** Pure proposal preparation after principal/config resolution; never issues a grant. */
export async function prepareApprovedPosthogRead(request: unknown) {
  const current = await context(request)
  return {
    projectId: current.payload.projectId, actionKind: ACTION, target: current.target,
    payload: current.payload, enabled: process.env.POSTHOG_APPROVED_READ_ENABLED === 'true',
  }
}

async function requireGrant(current: Awaited<ReturnType<typeof context>>, minimumValidityMs: number) {
  try {
    if (typeof current.input.authorizationId !== 'string' || !current.input.authorizationId.trim()) throw new Error()
    const authorization = await resolveAuthorization(current.input.authorizationId)
    const state = authorization.state
    const expiry = state?.expiresAt ? Date.parse(state.expiresAt) : NaN
    if (authorization.status !== 'ok' || !state || state.status !== 'granted' ||
        state.authorizationId !== current.input.authorizationId || state.projectId !== current.payload.projectId ||
        state.principalId !== current.access.userId || state.conditions.length !== 0 ||
        !Number.isFinite(expiry) || expiry <= Date.now() + minimumValidityMs ||
        state.authority.actionKind !== ACTION || canonicalJson(state.target) !== canonicalJson(current.target) ||
        authorization.history.length !== 2) throw new Error()
    return authorization
  } catch { throw new Error('posthog_read_not_authorized') }
}

async function finish(attemptId: string, principalId: string, outcome: 'succeeded' | 'failed') {
  try {
    const { data, error } = await createPosthogStoreClient().rpc('atlas_posthog_finish_read', {
      p_attempt_id: attemptId, p_principal_id: principalId, p_outcome: outcome,
    })
    if (error || data !== true) throw new Error()
  } catch { throw new Error('posthog_read_audit_failed') }
}

/**
 * Explicit human-granted read ONLY. Separate from the draft autonomous mission
 * capability. The switch can disable this path; it cannot grant permission.
 * Durable reservation/audit are mandatory and never have a process-local fallback.
 */
export async function readApprovedPosthogDashboards(request: unknown) {
  const current = await context(request)
  if (process.env.POSTHOG_APPROVED_READ_ENABLED !== 'true') throw new Error('posthog_approved_read_disabled')
  if (current.input.expectedVersionHash !== current.target.versionHash) throw new Error('posthog_review_stale')
  const authorization = await requireGrant(current, 5000)
  let attemptId: string
  try {
    const { data, error } = await createPosthogStoreClient().rpc('atlas_posthog_reserve_read', {
      p_project_id: current.payload.projectId, p_principal_id: current.access.userId,
      p_authorization_id: authorization.state!.authorizationId, p_request_hash: current.target.versionHash,
      p_authorization_event_ids: authorization.history.map(event => event.eventId).sort(),
    })
    if (error?.message === 'posthog_read_quota_exceeded') throw new Error('posthog_read_rate_limited')
    if (error || !uuid(data)) throw new Error()
    attemptId = data
  } catch (error) {
    if (error instanceof Error && error.message === 'posthog_read_rate_limited') throw error
    throw new Error('posthog_read_reservation_failed')
  }

  let result
  try {
    result = await readPosthogDashboards(current.config)
    // Suppress data if the original grant was revoked/expired during the request.
    await requireGrant(current, 0)
  } catch (error) {
    await finish(attemptId, current.access.userId, 'failed')
    if (error instanceof Error && error.message === 'posthog_read_not_authorized') throw error
    throw new Error('posthog_read_failed')
  }
  await finish(attemptId, current.access.userId, 'succeeded')
  return result
}
