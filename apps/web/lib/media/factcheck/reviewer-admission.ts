/**
 * FactCheck paid-review admission contract.
 *
 * This pure module helps prove DENY before a provider call. It is not a grant:
 * only the server-side governed adapter may provide the feature flag, real
 * enforced spend state and physically owned RUN_BOUND authority.
 */
import type {ExecutionContract} from '@/lib/governance/execution-stop'
import type {RunBoundAuthority} from '@/lib/governance/execution-signal'
import type {ScriptMaterial} from './contract'

const MEDIA_SLUG = 'ai-media-automation'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type ReviewerAdmissionInput = Readonly<{
  flag: string | undefined
  spendGateEnforced: boolean
  execution: ExecutionContract
  authority: RunBoundAuthority
  trustedProjectId: string
  material: ScriptMaterial
}>
export type ReviewerAdmission =
  | Readonly<{allowed: true; reason: null}>
  | Readonly<{allowed: false; reason: string}>

export function assessReviewerAdmission(input: ReviewerAdmissionInput): ReviewerAdmission {
  const deny = (reason:string): ReviewerAdmission => ({allowed:false,reason})
  if (input?.flag !== 'true') return deny('factcheck_not_enabled')
  if (input.spendGateEnforced !== true) return deny('hard_spend_gate_required')
  if (!input.execution || !['AUTONOMOUS','OPERATOR_EXECUTION']
    .includes(input.execution.context)) return deny('invalid_execution_context')
  const scope = input.execution.scope
  if (!scope || scope.kind !== 'PROJECT' ||
      !scope.project || !('projectSlug' in scope.project) ||
      scope.project.projectSlug !== MEDIA_SLUG) {
    return deny('wrong_execution_project')
  }
  if (!input.authority || input.authority.kind !== 'RUN_BOUND' ||
      typeof input.authority.runId !== 'string' ||
      typeof input.authority.claimId !== 'string' ||
      !UUID.test(input.authority.runId) ||
      !UUID.test(input.authority.claimId) ||
      (input.authority.context &&
       input.authority.context !== input.execution.context)) {
    return deny('owned_run_required')
  }
  // The trustedProjectId must be database-resolved from the actual claimed run.
  // Never read it from the manuscript or an LLM response in a live route.
  if (typeof input.trustedProjectId !== 'string' ||
      !UUID.test(input.trustedProjectId) ||
      !input.material ||
      input.material.projectId !== input.trustedProjectId ||
      typeof input.material.scriptId !== 'string' ||
      !UUID.test(input.material.scriptId)) {
    return deny('unverified_story_project')
  }
  return {allowed:true,reason:null}
}
