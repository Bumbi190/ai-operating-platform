/**
 * Pure, non-dispatching evidence reconciliation for the Bedrock pilot.
 *
 * IMPORTANT: ListInferenceProfiles is DISCOVERY, not GetInferenceProfile.
 * A source-region summary may name model ARNs, but it does not clear the
 * live destination list, privacy, regional processing, pricing or budget.
 *
 * This helper cannot authorize anything. All outputs remain hard-blocked.
 */
import {
  CATALOG_REGION, type CatalogSnapshot, type CatalogProfile,
} from './discovery-normalize'
import {
  validAvailabilityModelId, type AvailabilityReview,
} from './availability-review'

export const BEDROCK_RELEASE_READINESS_VERSION = 'omnira.bedrock-release-readiness.v1' as const

export type ProfileEvidence = Readonly<{
  profileId: string
  exactModelIdInList: true
  sourceRegion: typeof CATALOG_REGION
  listDestinations: readonly string[]
  globalDestinationsUnspecified: boolean
  getInferenceProfileVerified: false
  destinationsApproved: false
  canDispatch: false
}>

export type BedrockReleaseReadiness = Readonly<{
  version: typeof BEDROCK_RELEASE_READINESS_VERSION
  status: 'blocked'
  modelId: string | null
  sourceRegion: typeof CATALOG_REGION
  inSourceCatalog: boolean
  exactAvailabilityIdentityVerified: boolean
  availableForCatalogRole: boolean
  matchedProfiles: readonly ProfileEvidence[]
  selectedProfileId: string | null
  blockers: readonly string[]
  priceUsdVerified: false
  creditApplicationVerified: false
  regionProcessingApproved: false
  budgetReserved: false
  productionRoleVerified: false
  canDispatch: false
  modelCallsMade: false
}>

/** Never accept region, profile, or entitlement claims from an untrusted workflow. */
export function reviewBedrockReleaseReadiness(input: {
  modelId: string
  snapshot: CatalogSnapshot
  availability?: AvailabilityReview | null
  selectedProfileId?: string | null
}): BedrockReleaseReadiness {
  const reasons: string[] = []
  const requestedId = input?.modelId
  const snapshot = input?.snapshot
  const sourceValid = snapshot?.region === CATALOG_REGION
    && snapshot.completeForRegion === true
    && snapshot.source === 'aws-bedrock-control-plane'
    && Array.isArray(snapshot.models)
    && Array.isArray(snapshot.profiles)
    && snapshot.canDispatch === false
  const idValid = validAvailabilityModelId(requestedId)

  if (!idValid) reasons.push('invalid_model_identifier')
  if (!sourceValid) reasons.push('source_catalog_unverified')

  const model = idValid && sourceValid
    ? snapshot.models.find(m => m.modelId === requestedId) : null
  if (idValid && sourceValid && !model) reasons.push('model_not_in_source_catalog')
  if (model && model.lifecycle !== 'ACTIVE') reasons.push('model_not_active')

  const availability = input?.availability
  const exact = Boolean(
    idValid && sourceValid && availability?.status === 'reviewed'
    && availability.modelId === requestedId
    && availability.sourceRegion === CATALOG_REGION
    && availability.exactModelIdentityVerified === true
    && availability.responseIdentityScope === 'exact'
    && availability.canDispatch === false,
  )
  const catalogRoleAvailable = exact
    && availability?.accessForCatalogRole === 'reported_available'
  if (!availability) reasons.push('availability_not_checked')
  else if (!exact) reasons.push('model_identity_or_access_evidence_unverified')
  else if (!catalogRoleAvailable) reasons.push('catalog_role_access_requires_review')

  const profiles: ProfileEvidence[] = []
  if (sourceValid && idValid) {
    for (const profile of snapshot.profiles as readonly CatalogProfile[]) {
      if (!Array.isArray(profile.modelIds) || !profile.modelIds.includes(requestedId)) {
        continue
      }
      profiles.push({
        profileId: profile.profileId,
        exactModelIdInList: true,
        sourceRegion: CATALOG_REGION,
        listDestinations: [...profile.destinations],
        globalDestinationsUnspecified: profile.globalDestinationUnspecified,
        getInferenceProfileVerified: false,
        destinationsApproved: false,
        canDispatch: false,
      })
    }
  }
  profiles.sort((a,b)=>a.profileId.localeCompare(b.profileId))

  const selected = input?.selectedProfileId ?? null
  if (selected !== null) {
    if (typeof selected !== 'string' || selected.length > 140) {
      reasons.push('invalid_profile_selection')
    } else {
      const chosen = profiles.find(p => p.profileId === selected)
      if (!chosen) reasons.push('profile_does_not_exactly_match_model')
      else {
        const row = snapshot.profiles.find(x => x.profileId === chosen.profileId)!
        if (row.status !== 'ACTIVE') reasons.push('profile_not_active')
        if (row.type !== 'SYSTEM_DEFINED') reasons.push('profile_type_requires_review')
        if (row.modelIds.length !== 1) reasons.push('profile_mixed_model_ids_require_review')
        if (chosen.globalDestinationsUnspecified) reasons.push('global_routing_unbounded')
        if (!chosen.listDestinations.length) reasons.push('destination_regions_not_explicit')
        // Only a later GetInferenceProfile in the SAME source Region can clear this.
        reasons.push('get_inference_profile_not_checked')
      }
    }
  } else reasons.push('direct_or_profile_route_not_verified')

  // Hard release gates, unconditionally false, irrespective of listing / access.
  reasons.push('destination_policy_not_approved')
  reasons.push('live_model_price_and_credits_unverified')
  reasons.push('governed_spend_reservation_missing')
  reasons.push('production_role_and_human_authority_missing')

  return {
    version: BEDROCK_RELEASE_READINESS_VERSION,
    status: 'blocked',
    modelId: idValid ? requestedId : null,
    sourceRegion: CATALOG_REGION,
    inSourceCatalog: Boolean(model),
    exactAvailabilityIdentityVerified: exact,
    availableForCatalogRole: catalogRoleAvailable,
    matchedProfiles: profiles,
    selectedProfileId: typeof selected === 'string' ? selected : null,
    blockers: [...new Set(reasons)],
    priceUsdVerified: false,
    creditApplicationVerified: false,
    regionProcessingApproved: false,
    budgetReserved: false,
    productionRoleVerified: false,
    canDispatch: false,
    modelCallsMade: false,
  }
}
