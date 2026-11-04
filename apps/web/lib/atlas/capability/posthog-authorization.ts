import 'server-only'
import { prepareApprovedPosthogRead } from './posthog-approved-read'
import { requestAuthorization } from '../authorization/principal-write'

/** Purpose-scoped request only. Never grants, reads PostHog, or accepts raw authority. */
export async function requestPosthogAuthorization(input: unknown) {
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  if (Object.keys(value).some(key => !['projectId','expectedVersionHash'].includes(key))) {
    throw new Error('posthog_invalid_request')
  }
  const proposal = await prepareApprovedPosthogRead({ projectId: value.projectId })
  if (!proposal.enabled) throw new Error('posthog_approved_read_disabled')
  if (value.expectedVersionHash !== proposal.target.versionHash) throw new Error('posthog_review_stale')
  const result = await requestAuthorization({
    projectId: proposal.projectId,
    target: proposal.target,
    authority: {
      actionKind: proposal.actionKind,
      description: 'Read up to 10 PostHog dashboard IDs and titles from the reviewed project. No traffic queries or writes.',
    },
    targetPayload: proposal.payload,
  })
  if (result.status !== 'ok' || !result.state || result.state.status !== 'pending') {
    throw new Error('posthog_authorization_request_failed')
  }
  return { authorizationId: result.state.authorizationId, target: proposal.target }
}
