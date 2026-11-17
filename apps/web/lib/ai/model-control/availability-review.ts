/**
 * Single-model, Preview-only access inspection. These AWS control-plane
 * statuses do NOT authorize a Bedrock Runtime or paid provider call.
 */
export const AVAILABILITY_REVIEW_VERSION = 'omnira.bedrock-availability-review.v1' as const
export const MAX_AVAILABILITY_MODEL_ID_LENGTH = 140
// AWS GetFoundationModelAvailability accepts foundation model IDs, not profiles.
// Use a narrower character grammar than generic catalog discovery.
const MODEL_ID = /^[a-z0-9-]{1,63}\.[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63}){0,2}(?::[a-z0-9-]{1,63}){0,2}$/

// Observed in this account's 2026-11-17 AWS control-plane response.
// These are NOT proven model aliases or permissions for specific versions.
// Never generalize by stripping :0 (variants like :0:128k are distinct).
const OBSERVED_UNVERSIONED_AVAILABILITY_RESPONSE: Readonly<Record<string, string>> = Object.freeze({
  'amazon.nova-micro-v1:0': 'amazon.nova-micro-v1',
})

export function validAvailabilityModelId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= MAX_AVAILABILITY_MODEL_ID_LENGTH
    && MODEL_ID.test(value)
}

export type AccessSignal = 'available' | 'not_available' | 'unknown'
export type AgreementSignal = AccessSignal | 'pending' | 'error'
export type AvailabilityReview = Readonly<{
  version: typeof AVAILABILITY_REVIEW_VERSION
  status: 'reviewed'
  sourceRegion: 'us-east-1'
  modelId: string
  authorization: 'authorized' | 'not_authorized' | 'unknown'
  entitlement: AccessSignal
  agreement: AgreementSignal
  region: AccessSignal
  accessForCatalogRole: 'reported_available' | 'not_available' | 'needs_review'
  /** A versionless AWS family response cannot verify a specific model version. */
  responseIdentityScope: 'exact' | 'unversioned_family'
  exactModelIdentityVerified: boolean
  /** Catalog-role availability is not permission for any production worker. */
  productionInvocationVerified: false
  profileRoutingVerified: false
  regionProcessingApproved: false
  pricingVerified: false
  budgetReserved: false
  canDispatch: false
  modelCallsMade: false
}>

export function normalizeAvailabilityReview(
  requestedModelId: string,
  raw: {
    modelId?: string
    authorizationStatus?: string
    entitlementAvailability?: string
    regionAvailability?: string
    agreementAvailability?: {status?: string}
  },
): AvailabilityReview {
  if (!validAvailabilityModelId(requestedModelId)) throw new Error('AVAILABILITY_RESPONSE_INVALID')
  // AWS SDK response IDs are optional: differentiate absent from contradictory.
  // Do not log or return an unexpected model ID to the browser.
  if (!raw || typeof raw.modelId !== 'string' || raw.modelId.length === 0) {
    throw new Error('AVAILABILITY_RESPONSE_ID_MISSING')
  }
  const exactIdentity = raw.modelId === requestedModelId
  const observedVersionlessFamily = !exactIdentity &&
    OBSERVED_UNVERSIONED_AVAILABILITY_RESPONSE[requestedModelId] === raw.modelId
  if (!exactIdentity && !observedVersionlessFamily) {
    throw new Error('AVAILABILITY_RESPONSE_ID_MISMATCH')
  }
  const authorization = raw.authorizationStatus === 'AUTHORIZED' ? 'authorized'
    : raw.authorizationStatus === 'NOT_AUTHORIZED' ? 'not_authorized' : 'unknown'
  const signal = (value?: string): AccessSignal =>
    value === 'AVAILABLE' ? 'available'
      : value === 'NOT_AVAILABLE' ? 'not_available' : 'unknown'
  const entitlement = signal(raw.entitlementAvailability)
  const region = signal(raw.regionAvailability)
  const agreement: AgreementSignal =
    raw.agreementAvailability?.status === 'PENDING' ? 'pending'
      : raw.agreementAvailability?.status === 'ERROR' ? 'error'
        : signal(raw.agreementAvailability?.status)
  const denied = authorization === 'not_authorized' || entitlement === 'not_available'
    || agreement === 'not_available' || agreement === 'error' || region === 'not_available'
  const allReported = authorization === 'authorized'
    && entitlement === 'available' && agreement === 'available'
    && region === 'available'
  return {
    version: AVAILABILITY_REVIEW_VERSION, status: 'reviewed',
    sourceRegion: 'us-east-1', modelId: requestedModelId,
    authorization, entitlement, agreement, region,
    // Even an all-green versionless family reply is NOT positive evidence for
    // this precise catalog variant. Keep manual review and zero dispatch.
    accessForCatalogRole: !exactIdentity ? 'needs_review'
      : denied ? 'not_available'
      : allReported ? 'reported_available' : 'needs_review',
    responseIdentityScope: exactIdentity ? 'exact' : 'unversioned_family',
    exactModelIdentityVerified: exactIdentity,
    productionInvocationVerified: false, profileRoutingVerified: false,
    regionProcessingApproved: false, pricingVerified: false,
    budgetReserved: false, canDispatch: false, modelCallsMade: false,
  }
}
