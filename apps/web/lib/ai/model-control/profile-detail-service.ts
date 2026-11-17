/**
 * Read-only, source-Region-bound system inference profile detail review.
 * Requires a NEW separately approved IAM read action + Preview-only flag.
 * GetInferenceProfile does NOT grant permission to invoke its models.
 */
import 'server-only'
import {
  BedrockClient, ListInferenceProfilesCommand, GetInferenceProfileCommand,
} from '@aws-sdk/client-bedrock'
import type { CatalogCredentials } from './catalog-oidc'
import {
  CATALOG_REGION, CATALOG_PROFILE_PAGE_SIZE,
  collectInferenceProfiles, normalizeBedrockCatalog,
} from './discovery-normalize'

const PROFILE_ID = /^[A-Za-z0-9.:-]{3,140}$/
export function validSystemProfileId(value: unknown): value is string {
  return typeof value === 'string' && PROFILE_ID.test(value)
}

export type ProfileDetailRead = Readonly<{
  status: 'profile_detail_listed'
  sourceRegion: typeof CATALOG_REGION
  profileId: string
  modelIds: readonly string[]
  destinationRegions: readonly string[]
  globalDestinationUnspecified: boolean
  sourceRegionDetailVerified: true
  accountEntitlementVerified: false
  destinationRegionsApproved: false
  priceVerified: false
  canDispatch: false
  modelCallsMade: false
}>

export async function readBedrockProfileDetail(
  creds: CatalogCredentials, requestedId: string,
): Promise<ProfileDetailRead> {
  if (!validSystemProfileId(requestedId)) throw new Error('PROFILE_INVALID_IDENTIFIER')
  if (!creds?.accessKeyId || !creds.secretAccessKey || !creds.sessionToken) {
    throw new Error('PROFILE_EXPLICIT_CREDENTIALS_REQUIRED')
  }
  const signal = AbortSignal.timeout(12_000)
  const client = new BedrockClient({
    region: CATALOG_REGION,
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
    },
    maxAttempts: 1,
  })
  try {
    const summaries = await collectInferenceProfiles(async nextToken => {
      const page = await client.send(new ListInferenceProfilesCommand({
        maxResults: CATALOG_PROFILE_PAGE_SIZE,
        ...(nextToken ? {nextToken} : {}),
      }), {abortSignal: signal})
      return {
        inferenceProfileSummaries: page.inferenceProfileSummaries,
        nextToken: page.nextToken,
      }
    })
    const matching = summaries.filter(x=>x.inferenceProfileId === requestedId)
    if (matching.length !== 1) throw new Error('PROFILE_NOT_UNIQUELY_LISTED')
    const summary = matching[0]
    if (summary.type !== 'SYSTEM_DEFINED' || summary.status !== 'ACTIVE') {
      throw new Error('PROFILE_NOT_ACTIVE_SYSTEM_DEFINED')
    }
    const detail = await client.send(new GetInferenceProfileCommand({
      inferenceProfileIdentifier: requestedId,
    }), {abortSignal: signal})
    if (detail.inferenceProfileId !== requestedId
      || detail.type !== 'SYSTEM_DEFINED' || detail.status !== 'ACTIVE'
      || (summary.inferenceProfileArn &&
        detail.inferenceProfileArn !== summary.inferenceProfileArn)
      || !Array.isArray(detail.models)
      || detail.models.length === 0 || detail.models.length > 5) {
      throw new Error('PROFILE_DETAIL_IDENTITY_OR_STATUS_MISMATCH')
    }
    // Reuse the existing strict foundation-model ARN parser, incl. global CRIS.
    const normalized = normalizeBedrockCatalog([], [{
      inferenceProfileId: detail.inferenceProfileId,
      type: detail.type, status: detail.status,
      models: detail.models,
    }]).profiles[0]
    if (!normalized || !normalized.modelIds.length) {
      throw new Error('PROFILE_DETAIL_MODEL_LIST_EMPTY')
    }
    return {
      status: 'profile_detail_listed',
      sourceRegion: CATALOG_REGION,
      profileId: requestedId,
      modelIds: normalized.modelIds,
      destinationRegions: normalized.destinations,
      globalDestinationUnspecified: normalized.globalDestinationUnspecified,
      sourceRegionDetailVerified: true,
      accountEntitlementVerified: false,
      destinationRegionsApproved: false,
      priceVerified: false,
      canDispatch: false,
      modelCallsMade: false,
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    if (code === 'PROFILE_NOT_UNIQUELY_LISTED'
      || code === 'PROFILE_NOT_ACTIVE_SYSTEM_DEFINED'
      || code === 'PROFILE_DETAIL_IDENTITY_OR_STATUS_MISMATCH'
      || code === 'PROFILE_DETAIL_MODEL_LIST_EMPTY') throw error
    if (error instanceof Error && error.name === 'AccessDeniedException') {
      throw new Error('PROFILE_READ_IAM_DENIED')
    }
    throw new Error('PROFILE_READ_UNAVAILABLE')
  } finally {
    client.destroy()
  }
}
