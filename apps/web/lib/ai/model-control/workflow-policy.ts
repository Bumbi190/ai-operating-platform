/**
 * Omnira-wide PURE workflow model candidate selector (never executes AI).
 *
 * Project/workflow context is a FILTER, not an authorization credential.
 * The trusted dispatcher must separately recheck project authority,
 * privacy/consent, model region/profile and entitlement, verified prices,
 * withGovernedSpend, STOP, and an explicit approval before each API call.
 *
 * Unsupported modalities are blocked, not silently swapped to a text model.
 * No "fallback to first available" for explicit model preferences.
 */
import {
  OMNIRA_MODEL_CATALOG, MODEL_CAPABILITIES,
  type GlobalModelCapability, type GlobalModelCandidate,
  type GlobalModelLineage, type GlobalModelProvider,
} from './catalog'

export const OMNIRA_WORKFLOW_ROUTING_VERSION = 'omnira.workflow-model-policy.v1' as const

export interface WorkflowModelRequest {
  readonly projectId: string
  readonly workflowId: string
  readonly requiredCapabilities: readonly GlobalModelCapability[]
  readonly minimumProvisionalQuality: 1 | 2 | 3
  readonly dataClassification: 'public' | 'internal' | 'restricted'
  readonly allowExternalProcessing: boolean
  /** Cost and provider preference, NOT budget or spend authorization. */
  readonly preferBedrock: boolean
  readonly allowedProviders: readonly GlobalModelProvider[]
  /** A user override: a failing model MUST NOT silently choose another. */
  readonly requestedModelKey?: string | null
  /** The fact checker must not share underlying lineage with the author. */
  readonly excludeModelLineage?: GlobalModelLineage | null
  /** Restrict AWS model processing to explicitly reviewed source regions. */
  readonly allowedAwsSourceRegions?: readonly string[]
}

export type WorkflowCandidateAssessment = Readonly<{
  key: string
  provider: GlobalModelProvider
  modelId: string
  lineage: GlobalModelLineage
  status: 'candidate_only' | 'rejected'
  reasons: readonly string[]
  unresolvedReleaseGates: readonly string[]
  dispatchAuthorized: false
}>

export type WorkflowModelDecision = Readonly<{
  version: typeof OMNIRA_WORKFLOW_ROUTING_VERSION
  status: 'candidate_only' | 'blocked'
  projectId: string | null
  workflowId: string | null
  suggestedModelKey: string | null
  considered: readonly WorkflowCandidateAssessment[]
  dataLocationVerified: false
  accountEntitlementVerified: false
  budgetReserved: false
  dispatchAuthorized: false
  publicationAuthorized: false
  explanation: string
}>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const WORKFLOW_ID = /^[a-z0-9][a-z0-9._/-]{2,99}$/

function validRequest(x: WorkflowModelRequest): boolean {
  if (!x || typeof x !== 'object' || Array.isArray(x) ||
      typeof x.projectId !== 'string' || !UUID.test(x.projectId) ||
      typeof x.workflowId !== 'string' || !WORKFLOW_ID.test(x.workflowId) ||
      !Array.isArray(x.requiredCapabilities) || !x.requiredCapabilities.length ||
      x.requiredCapabilities.length > MODEL_CAPABILITIES.length ||
      x.requiredCapabilities.some(c => !MODEL_CAPABILITIES.includes(c)) ||
      ![1, 2, 3].includes(x.minimumProvisionalQuality) ||
      !['public', 'internal', 'restricted'].includes(x.dataClassification) ||
      typeof x.allowExternalProcessing !== 'boolean' ||
      typeof x.preferBedrock !== 'boolean' ||
      !Array.isArray(x.allowedProviders) || !x.allowedProviders.length ||
      x.allowedProviders.some(p => !['aws-bedrock', 'anthropic-api', 'openai-api'].includes(p))) return false

  if (x.requestedModelKey != null &&
      (typeof x.requestedModelKey !== 'string' || x.requestedModelKey.length > 120)) return false
  if (x.excludeModelLineage != null &&
      !['amazon', 'anthropic', 'openai'].includes(x.excludeModelLineage)) return false
  if (x.allowedAwsSourceRegions != null &&
      (!Array.isArray(x.allowedAwsSourceRegions) ||
       x.allowedAwsSourceRegions.some(r => typeof r !== 'string' ||
         !/^[a-z]{2}-[a-z]+-\d$/.test(r)))) return false
  return true
}

function inspect(model: GlobalModelCandidate, req: WorkflowModelRequest): WorkflowCandidateAssessment {
  const reasons: string[] = []
  if (!req.requiredCapabilities.every(c => model.capabilities.includes(c))) reasons.push('capability_mismatch')
  if (model.provisionalQualityTier < req.minimumProvisionalQuality) reasons.push('quality_below_threshold')
  if (!req.allowedProviders.includes(model.provider)) reasons.push('provider_not_allowlisted')
  if (!req.allowExternalProcessing || req.dataClassification === 'restricted') {
    reasons.push('external_processing_forbidden')
  }
  if (req.excludeModelLineage === model.underlyingLineage) reasons.push('independence_conflict')
  if (model.provider === 'aws-bedrock' && req.allowedAwsSourceRegions &&
      (!model.region || !req.allowedAwsSourceRegions.includes(model.region))) {
    reasons.push('aws_region_not_reviewed')
  }

  const unresolvedReleaseGates = [
    'project_ownership_and_execution_scope',
    'model_entitlement_and_endpoint_verification',
    'provider_price_snapshot_and_credit_application',
    'canonical_hard_budget_and_STOP',
    'human_approval_or_scoped_autonomy_license',
    'quality_benchmark_for_this_workflow',
  ]
  if (model.availability === 'unverified') unresolvedReleaseGates.push('model_region_and_profile_unknown')
  if (model.cost === 'unverified') unresolvedReleaseGates.push('price_unknown')
  if (model.provider === 'aws-bedrock') {
    unresolvedReleaseGates.push('production_oidc_role_and_iam_model_allowlist')
    unresolvedReleaseGates.push('cross_region_inference_destinations_if_profile_used')
  }
  return {
    key: model.key, provider: model.provider, modelId: model.modelId,
    lineage: model.underlyingLineage,
    status: reasons.length === 0 ? 'candidate_only' : 'rejected',
    reasons, unresolvedReleaseGates,
    dispatchAuthorized: false,
  }
}

export function planModelForWorkflow(input: unknown): WorkflowModelDecision {
  const blocked = (explanation: string): WorkflowModelDecision => ({
    version: OMNIRA_WORKFLOW_ROUTING_VERSION,
    status: 'blocked', projectId: null, workflowId: null,
    suggestedModelKey: null, considered: [],
    dataLocationVerified: false, accountEntitlementVerified: false,
    budgetReserved: false, dispatchAuthorized: false,
    publicationAuthorized: false, explanation,
  })
  if (!validRequest(input as WorkflowModelRequest)) return blocked('invalid_or_unscoped_workflow')
  const req = input as WorkflowModelRequest
  const candidates = OMNIRA_MODEL_CATALOG.map(m => inspect(m, req))
  const matching = candidates.filter(c => c.status === 'candidate_only')
  // An explicit selection must either match and be considered, or BLOCK.
  const preferred = req.requestedModelKey
  const selected = preferred
    ? matching.find(c => c.key === preferred) ?? null
    : matching
        .slice()
        .sort((a, b) => {
          const aModel = OMNIRA_MODEL_CATALOG.find(m => m.key === a.key)!
          const bModel = OMNIRA_MODEL_CATALOG.find(m => m.key === b.key)!
          // For routine tasks prefer the minimum sufficient quality rather
          // than pretending provisional tier 3 is always a better bargain.
          const qualityGap = aModel.provisionalQualityTier - bModel.provisionalQualityTier
          if (qualityGap !== 0) return qualityGap
          // A known price is required before an unverified Bedrock model can
          // outrank an otherwise equally qualified, priced existing provider.
          const priceUnknown = Number(aModel.cost === 'unverified') - Number(bModel.cost === 'unverified')
          if (priceUnknown !== 0) return priceUnknown
          if (req.preferBedrock && a.provider !== b.provider) {
            if (a.provider === 'aws-bedrock') return -1
            if (b.provider === 'aws-bedrock') return 1
          }
          return a.key.localeCompare(b.key)
        })[0] ?? null
  return {
    version: OMNIRA_WORKFLOW_ROUTING_VERSION,
    status: selected ? 'candidate_only' : 'blocked',
    projectId: req.projectId, workflowId: req.workflowId,
    suggestedModelKey: selected?.key ?? null,
    considered: candidates, dataLocationVerified: false,
    accountEntitlementVerified: false, budgetReserved: false,
    dispatchAuthorized: false, publicationAuthorized: false,
    explanation: selected
      ? 'candidate_only_no_model_dispatch_release'
      : preferred ? 'requested_model_not_qualified_no_fallback'
        : 'no_qualified_model_in_current_catalog',
  }
}
