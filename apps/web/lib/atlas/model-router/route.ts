/**
 * Deterministic, pure selection of a *candidate*. This module NEVER dispatches.
 * A selected candidate must still pass project work-package admission,
 * independent review, the spend reservation gate and human authorization.
 * Providers with unknown readiness, cost or entitlement fail closed.
 */
import {
  ATLAS_WORKERS,
  type AtlasTask,
  type WorkerCandidate,
  type QualityTier,
} from './catalog'

export const ROUTER_DECISION_VERSION = 'atlas.model-router.decision.v1' as const
const MAX_HEALTH_AGE_MS = 5 * 60 * 1000

export interface WorkerEvidence {
  readonly workerId: string
  /** Verified on trusted host, not from client-supplied request data. */
  readonly health: 'ready' | 'unavailable' | 'unknown'
  readonly observedAtMs: number
  /** Local inference must be proved by a successful smoke test. */
  readonly inferenceSmokePassed?: boolean
  /** Attested, fresh host RAM/VRAM/temperature gate; distinct from inference success. */
  readonly localResourcePreflightPassed?: boolean
  /** For paid/subscription harnesses, login alone is not a quota guarantee. */
  readonly entitlement?: 'available' | 'exhausted' | 'unknown'
  readonly authenticated?: boolean
  /** A positive, trusted estimate is required before considering metered AI. */
  readonly estimatedSpendSek?: number
  /** Prime Agent pilot: trusted host ran a real tool/patch smoke recently. */
  readonly pilotToolSmokePassed?: boolean
  /** Separate approved pilot workspace, not the canonical SDF1 sandbox. */
  readonly pilotIsolationVerified?: boolean
  /** Fresh quota check from the pilot ledger, not a guarantee of USD billing. */
  readonly pilotCodexSlotAvailable?: boolean
  /** Required human approval for this experimental pilot only. */
  readonly pilotHumanApproved?: boolean
}

export interface RoutingRequest {
  readonly task: AtlasTask
  readonly minimumQuality: QualityTier
  readonly dataClassification: 'public' | 'internal' | 'restricted'
  /** Agent must be separately authorized to see data; these values never grant access. */
  readonly allowExternalProcessing: boolean
  /** For independently reviewed code, the author provider may not self-review. */
  readonly excludeProvider?: WorkerCandidate['provider']
  readonly excludeModelLineage?: WorkerCandidate['modelLineage']
  readonly observedNowMs: number
  readonly evidence: readonly WorkerEvidence[]
  /**
   * Inputs below are advisory signals from a trusted caller; NOT spending authority.
   * Real dispatch must revalidate approval and reserve spend in the authoritative DB.
   */
  readonly meteredPolicy: {
    readonly humanApproved: boolean
    readonly hardSpendGateEnforced: boolean
    readonly remainingBudgetSek: number | null
    readonly approvedCeilingSek: number | null
  }
}

export type RejectReason =
  | 'task_mismatch'
  | 'quality_below_threshold'
  | 'independence_conflict'
  | 'independence_unproven'
  | 'external_processing_forbidden'
  | 'unverified_or_stale_health'
  | 'local_inference_not_proven'
  | 'local_resources_unavailable'
  | 'account_not_authenticated'
  | 'quota_not_available'
  | 'unverified_commercial_terms'
  | 'spend_authority_missing'
  | 'spend_estimate_missing'
  | 'spend_limit_exceeded'
  | 'pilot_tool_smoke_missing'
  | 'pilot_isolation_unverified'
  | 'pilot_codex_slot_unavailable'
  | 'pilot_human_approval_missing'
  | 'invalid_request'

export interface RoutingDiagnostic {
  readonly workerId: string
  readonly rejected: readonly RejectReason[]
}

export type RoutingDecision = {
  readonly version: typeof ROUTER_DECISION_VERSION
  readonly status: 'selected' | 'blocked'
  readonly selectedWorkerId: string | null
  readonly selectedModelId: string | null
  readonly considered: readonly RoutingDiagnostic[]
  readonly independentReviewRequired: boolean
  readonly dispatchAuthorized: false
  readonly explanation: string
}

function finitePositive(value: number | undefined | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}
function finiteNonnegative(value: number | undefined | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function reasonFor(candidate: WorkerCandidate, request: RoutingRequest): RejectReason[] {
  const reasons: RejectReason[] = []
  if (!candidate.supportedTasks.includes(request.task)) reasons.push('task_mismatch')
  if (candidate.qualityTier < request.minimumQuality) reasons.push('quality_below_threshold')
  if (candidate.provider === request.excludeProvider) reasons.push('independence_conflict')
  if (request.excludeModelLineage && (candidate.modelLineage === request.excludeModelLineage
      || candidate.modelLineage === 'unknown')) reasons.push('independence_unproven')
  if (candidate.boundary === 'external'
      && (!request.allowExternalProcessing || request.dataClassification === 'restricted')) {
    reasons.push('external_processing_forbidden')
  }

  // Duplicate/conflicting evidence is not acceptable; the host must reconcile it.
  const matching = request.evidence.filter(e => e.workerId === candidate.id)
  const observation = matching.length === 1 ? matching[0] : null
  if (!observation
      || observation.health !== 'ready'
      || !Number.isSafeInteger(observation.observedAtMs)
      || !Number.isSafeInteger(request.observedNowMs)
      || observation.observedAtMs > request.observedNowMs
      || request.observedNowMs - observation.observedAtMs > MAX_HEALTH_AGE_MS) {
    reasons.push('unverified_or_stale_health')
  }

  if (candidate.cost === 'local') {
    if (observation?.localResourcePreflightPassed !== true) reasons.push('local_resources_unavailable')
    if (observation?.inferenceSmokePassed !== true) reasons.push('local_inference_not_proven')
  } else {
    if (observation?.authenticated !== true) reasons.push('account_not_authenticated')
    if (observation?.entitlement !== 'available') reasons.push('quota_not_available')
  }

  // An experimental Prime Agent pilot is NOT the canonical code-broker sandbox.
  // Only a verified, fresh host observation and a separate human approval may
  // nominate it for review. Final execution remains categorically unauthorized.
  if (candidate.harness === 'prime-agent-docker') {
    if (observation?.pilotToolSmokePassed !== true) reasons.push('pilot_tool_smoke_missing')
    if (observation?.pilotIsolationVerified !== true) reasons.push('pilot_isolation_unverified')
    if (observation?.pilotCodexSlotAvailable !== true) reasons.push('pilot_codex_slot_unavailable')
    if (observation?.pilotHumanApproved !== true) reasons.push('pilot_human_approval_missing')
  }

  // An Abacus CLI login / Codex subscription does NOT establish Abacus prices.
  // Must be separately attested and explicitly onboarded as a new cost class.
  if (candidate.cost === 'unverified') reasons.push('unverified_commercial_terms')

  if (candidate.cost === 'metered') {
    const policy = request.meteredPolicy
    if (!policy.humanApproved || !policy.hardSpendGateEnforced
        || !finiteNonnegative(policy.remainingBudgetSek)
        || !finiteNonnegative(policy.approvedCeilingSek)) {
      reasons.push('spend_authority_missing')
    }
    if (!finitePositive(observation?.estimatedSpendSek)) {
      reasons.push('spend_estimate_missing')
    } else if (
      !finiteNonnegative(policy.remainingBudgetSek)
      || !finiteNonnegative(policy.approvedCeilingSek)
      || observation.estimatedSpendSek > policy.remainingBudgetSek
      || observation.estimatedSpendSek > policy.approvedCeilingSek
    ) {
      reasons.push('spend_limit_exceeded')
    }
  }

  return reasons
}

const COST_RANK: Readonly<Record<WorkerCandidate['cost'], number>> = {
  local: 0, subscription: 1, unverified: 2, metered: 3,
}

/**
 * Validate runtime input as well as TypeScript shapes. Unknown classification
 * or task may NEVER widen what the scheduler considers safe.
 */
function isRoutingRequest(input: unknown): input is RoutingRequest {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false
  const r = input as Partial<RoutingRequest>
  if (!['classify', 'summarize', 'plan', 'code_patch', 'code_review'].includes(r.task as string)
      || ![1, 2, 3].includes(r.minimumQuality as number)
      || !['public', 'internal', 'restricted'].includes(r.dataClassification as string)
      || typeof r.allowExternalProcessing !== 'boolean'
      || (r.excludeProvider !== undefined && !['ollama', 'openai', 'abacus'].includes(r.excludeProvider))
      || (r.excludeModelLineage !== undefined && !['openai', 'qwen', 'unknown'].includes(r.excludeModelLineage))
      || !Number.isSafeInteger(r.observedNowMs) || (r.observedNowMs as number) < 0
      || !Array.isArray(r.evidence)
      || !r.meteredPolicy || typeof r.meteredPolicy !== 'object') return false
  const p = r.meteredPolicy
  if (typeof p.humanApproved !== 'boolean' || typeof p.hardSpendGateEnforced !== 'boolean'
      || ![null, undefined].includes(p.remainingBudgetSek as null | undefined)
        && !finiteNonnegative(p.remainingBudgetSek)
      || ![null, undefined].includes(p.approvedCeilingSek as null | undefined)
        && !finiteNonnegative(p.approvedCeilingSek)) return false
  return r.evidence.every((e: unknown) => {
    if (!e || typeof e !== 'object' || Array.isArray(e)) return false
    const ev = e as Partial<WorkerEvidence>
    return typeof ev.workerId === 'string'
      && ['ready', 'unavailable', 'unknown'].includes(ev.health as string)
      && Number.isSafeInteger(ev.observedAtMs) && (ev.observedAtMs as number) >= 0
      && (ev.authenticated === undefined || typeof ev.authenticated === 'boolean')
      && (ev.inferenceSmokePassed === undefined || typeof ev.inferenceSmokePassed === 'boolean')
      && (ev.localResourcePreflightPassed === undefined || typeof ev.localResourcePreflightPassed === 'boolean')
      && (ev.entitlement === undefined
        || ['available', 'exhausted', 'unknown'].includes(ev.entitlement))
      && (ev.estimatedSpendSek === undefined || typeof ev.estimatedSpendSek === 'number')
      && (ev.pilotToolSmokePassed === undefined || typeof ev.pilotToolSmokePassed === 'boolean')
      && (ev.pilotIsolationVerified === undefined || typeof ev.pilotIsolationVerified === 'boolean')
      && (ev.pilotCodexSlotAvailable === undefined || typeof ev.pilotCodexSlotAvailable === 'boolean')
      && (ev.pilotHumanApproved === undefined || typeof ev.pilotHumanApproved === 'boolean')
  })
}

/**
 * Fail-closed, versioned advisory decision. A second agent may REVIEW a patch,
 * but independence and execution approval are enforced by a different boundary.
 */
export function routeModel(input: unknown): RoutingDecision {
  if (!isRoutingRequest(input)) return {
    version: ROUTER_DECISION_VERSION,
    status: 'blocked',
    selectedWorkerId: null,
    selectedModelId: null,
    considered: ATLAS_WORKERS.map(w => ({ workerId: w.id, rejected: ['invalid_request'] })),
    independentReviewRequired: true,
    dispatchAuthorized: false,
    explanation: 'Invalid routing request. No selection or fallback is allowed.',
  }
  const request = input
  const considered = ATLAS_WORKERS.map(candidate => ({
    workerId: candidate.id,
    rejected: reasonFor(candidate, request),
  }))
  const options = ATLAS_WORKERS
    .filter((candidate, index) => considered[index].rejected.length === 0)
    .sort((a, b) =>
      COST_RANK[a.cost] - COST_RANK[b.cost]
      || b.qualityTier - a.qualityTier
      || a.id.localeCompare(b.id))
  const selected = options[0]
  return {
    version: ROUTER_DECISION_VERSION,
    status: selected ? 'selected' : 'blocked',
    selectedWorkerId: selected?.id ?? null,
    selectedModelId: selected?.modelId ?? null,
    considered,
    independentReviewRequired: request.task === 'code_patch',
    dispatchAuthorized: false,
    explanation: selected
      ? `Candidate ${selected.id} meets recorded task, quality, health, privacy and cost filters; no execution authorized.`
      : 'No verified candidate meets task, quality, health, privacy and spend requirements. Stop; no automatic paid fallback.',
  }
}

/**
 * Require the reviewer to be from a different provider than the code author.
 * This proposes a reviewer ONLY; SDF1 authorizations still must be checked.
 * Current catalog may correctly BLOCK when no independent verified option exists.
 */
export function routeIndependentReviewer(
  authorWorkerId: string,
  request: RoutingRequest,
): RoutingDecision {
  const author = ATLAS_WORKERS.find(w => w.id === authorWorkerId)
  // Unknown author lineage could itself be Codex/OpenAI. Independence is unprovable.
  if (!author || author.modelLineage === 'unknown' || !isRoutingRequest(request)) return routeModel(null)
  return routeModel({
    ...request,
    task: 'code_review',
    minimumQuality: request.minimumQuality < 2 ? 2 : request.minimumQuality,
    excludeProvider: author.provider,
    excludeModelLineage: author.modelLineage,
  })
}
