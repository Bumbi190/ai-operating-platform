/**
 * AWS Bedrock catalog snapshots: model discovery, not entitlement.
 * The full source list is one region only. Multi-region and Bedrock Mantle
 * discovery need separate reviewed adapters.
 *
 * ListFoundationModels is a single response. ListInferenceProfiles is paged.
 * A successful list response never implies model InvokeModel permission,
 * active commercial terms, a pinned USD price or data-region clearance.
 */
export const CATALOG_REGION = 'us-east-1' as const
export const CATALOG_MAX_FOUNDATIONS = 1000
export const CATALOG_MAX_PROFILES = 1000
export const CATALOG_PROFILE_PAGE_SIZE = 100
export const CATALOG_MAX_PROFILE_PAGES = 12

export interface FoundationModelRaw {
  readonly modelId?: string
  readonly modelArn?: string
  readonly modelName?: string
  readonly providerName?: string
  readonly inputModalities?: readonly string[]
  readonly outputModalities?: readonly string[]
  readonly inferenceTypesSupported?: readonly string[]
  readonly responseStreamingSupported?: boolean
  readonly modelLifecycle?: { readonly status?: string }
}
export interface InferenceProfileRaw {
  readonly inferenceProfileId?: string
  readonly inferenceProfileName?: string
  readonly inferenceProfileArn?: string
  readonly type?: string
  readonly status?: string
  readonly models?: readonly {readonly modelArn?: string}[]
}
export type CatalogFoundation = Readonly<{
  modelId: string
  modelName: string
  providerName: string
  inputModalities: readonly string[]
  outputModalities: readonly string[]
  inferenceTypes: readonly string[]
  lifecycle: string
  streaming: boolean
  sourceRegion: typeof CATALOG_REGION
  accountEntitlementVerified: false
  invocationPermissionVerified: false
  priceVerified: false
  canDispatch: false
}>
export type CatalogProfile = Readonly<{
  profileId: string
  profileName: string
  status: string
  type: string
  destinations: readonly string[]
  sourceRegion: typeof CATALOG_REGION
  accountEntitlementVerified: false
  destinationRegionsApproved: false
  priceVerified: false
  canDispatch: false
}>
export type CatalogSnapshot = Readonly<{
  source: 'aws-bedrock-control-plane'
  region: typeof CATALOG_REGION
  completeForRegion: true
  models: readonly CatalogFoundation[]
  profiles: readonly CatalogProfile[]
  modelCallsMade: false
  credentialsExposed: false
  accountEntitlementVerified: false
  priceVerified: false
  canDispatch: false
}>

const SAFE_MODEL_ID = /^[A-Za-z0-9._:/-]{1,260}$/
function clean(value: unknown, max=200): string {
  return typeof value === 'string' ? value.slice(0, max) : ''
}
function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? [...new Set(value.filter(
    (s): s is string => typeof s === 'string' && /^[A-Z_]{2,30}$/.test(s)
  ))].slice(0, 24).sort() : []
}
function exactUnique(ids: readonly string[], what: string): void {
  if (new Set(ids).size !== ids.length) throw new Error('BEDROCK_CATALOG_DUPLICATE_'+what)
}

export function normalizeBedrockCatalog(
  models: readonly FoundationModelRaw[],
  profiles: readonly InferenceProfileRaw[],
): CatalogSnapshot {
  if (!Array.isArray(models) || models.length > CATALOG_MAX_FOUNDATIONS ||
      !Array.isArray(profiles) || profiles.length > CATALOG_MAX_PROFILES) {
    throw new Error('BEDROCK_CATALOG_SIZE_INVALID')
  }
  const foundations: CatalogFoundation[] = models.map((item: FoundationModelRaw) => {
    if (!SAFE_MODEL_ID.test(item?.modelId ?? '')) throw new Error('BEDROCK_CATALOG_BAD_MODEL_ID')
    return {
      modelId: item.modelId!,
      modelName: clean(item.modelName, 170),
      providerName: clean(item.providerName, 100),
      inputModalities: stringArray(item.inputModalities),
      outputModalities: stringArray(item.outputModalities),
      inferenceTypes: stringArray(item.inferenceTypesSupported),
      lifecycle: clean(item.modelLifecycle?.status, 50),
      streaming: item.responseStreamingSupported === true,
      sourceRegion: CATALOG_REGION,
      accountEntitlementVerified: false,
      invocationPermissionVerified: false,
      priceVerified: false,
      canDispatch: false,
    }
  })
  const profileRows: CatalogProfile[] = profiles.map((item: InferenceProfileRaw) => {
    if (!SAFE_MODEL_ID.test(item?.inferenceProfileId ?? '')) {
      throw new Error('BEDROCK_CATALOG_BAD_PROFILE_ID')
    }
    const destinations = (item.models ?? []).map(m => {
      const arn = clean(m?.modelArn, 550)
      // Destination ARNs are metadata, never invocation permission. A profile
      // can route outside the source region; that must be reviewed separately.
      const match = /^arn:aws(?:-[a-z0-9-]+)?:bedrock:([a-z0-9-]+):/.exec(arn)
      if (!match) throw new Error('BEDROCK_CATALOG_BAD_DESTINATION_ARN')
      return match[1]
    })
    return {
      profileId: item.inferenceProfileId!,
      profileName: clean(item.inferenceProfileName, 200),
      status: clean(item.status, 50),
      type: clean(item.type, 70),
      destinations: [...new Set(destinations)].sort(),
      sourceRegion: CATALOG_REGION,
      accountEntitlementVerified: false,
      destinationRegionsApproved: false,
      priceVerified: false,
      canDispatch: false,
    }
  })
  exactUnique(foundations.map(x=>x.modelId), 'MODEL')
  exactUnique(profileRows.map(x=>x.profileId), 'PROFILE')
  return {
    source: 'aws-bedrock-control-plane',
    region: CATALOG_REGION,
    completeForRegion: true,
    models: foundations.sort((a,b)=>a.providerName.localeCompare(b.providerName)
      || a.modelName.localeCompare(b.modelName)),
    profiles: profileRows.sort((a,b)=>a.profileId.localeCompare(b.profileId)),
    modelCallsMade: false,
    credentialsExposed: false,
    accountEntitlementVerified: false,
    priceVerified: false,
    canDispatch: false,
  }
}

/**
 * A bounded all-or-nothing profile pager. Never expose a partial snapshot when
 * permissions fail, a nextToken repeats, or the page limit is exceeded.
 */
export async function collectInferenceProfiles(
  page: (nextToken?: string)=>Promise<{
    inferenceProfileSummaries?: readonly InferenceProfileRaw[]
    nextToken?: string
  }>,
): Promise<readonly InferenceProfileRaw[]> {
  const profiles: InferenceProfileRaw[] = []
  const seen = new Set<string>()
  let nextToken: string | undefined
  for (let n=0; n<CATALOG_MAX_PROFILE_PAGES; n++) {
    const result = await page(nextToken)
    if (!Array.isArray(result?.inferenceProfileSummaries)) {
      throw new Error('BEDROCK_CATALOG_INVALID_PROFILE_RESPONSE')
    }
    profiles.push(...result.inferenceProfileSummaries)
    if (profiles.length>CATALOG_MAX_PROFILES) throw new Error('BEDROCK_CATALOG_TOO_MANY_PROFILES')
    const next = result.nextToken
    if (!next) return profiles
    if (typeof next !== 'string' || next.length>2048 || seen.has(next)) {
      throw new Error('BEDROCK_CATALOG_INVALID_PAGE_TOKEN')
    }
    seen.add(next)
    nextToken=next
  }
  throw new Error('BEDROCK_CATALOG_PROFILE_PAGINATION_INCOMPLETE')
}
