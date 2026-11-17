/**
 * Project-scoped editorial role blueprint for future Bedrock-backed agents.
 *
 * This is a task graph, NOT an instance of Bedrock Agents Classic or AgentCore.
 * No provider client or publisher is imported; all permissions stay disabled
 * until an explicit The Prompt autonomy license and a guarded release.
 *
 * Amazon Nova Micro has been OIDC-tested for text; a higher-quality writer
 * model has NOT yet been verified or authorized by IAM.
 */
import type { DailyPlan } from './editorial-plan'

export type EditorialAgentRole =
  | 'news_scout' | 'corroboration_researcher' | 'longform_writer'
  | 'independent_fact_checker' | 'publication_controller'

export type EditorialAgentTask = Readonly<{
  role: EditorialAgentRole
  stage: number
  purpose: string
  modelId: string | null
  modelAccessVerified: false | 'pilot_only'
  requiredInputs: readonly string[]
  status: 'waiting_for_release'
  canInvokeModel: false
  canPublish: false
}>

export const DAILY_EDITORIAL_ROLE_BLUEPRINT: readonly EditorialAgentTask[] = Object.freeze([
  {
    role:'news_scout', stage:1,
    purpose:'Rank and deduplicate existing relevant AI news; keep real platform receipts separate from unposted scripts.',
    modelId:'amazon.nova-micro-v1:0', modelAccessVerified:'pilot_only',
    requiredInputs:['owned_project_inventory','canonical_news_urls','social_publication_receipts'],
    status:'waiting_for_release', canInvokeModel:false, canPublish:false,
  },
  {
    role:'corroboration_researcher', stage:2,
    purpose:'Read the primary source and locate independent contemporary evidence. No fabricated citations or scraped text republishing.',
    modelId:'amazon.nova-micro-v1:0', modelAccessVerified:'pilot_only',
    requiredInputs:['source_read_provenance','independent_source_domain','direct_attribution'],
    status:'waiting_for_release', canInvokeModel:false, canPublish:false,
  },
  {
    role:'longform_writer', stage:3,
    purpose:'Produce an original grounded analysis or deep-dive from verified evidence, not from a social-media script alone.',
    modelId:null, modelAccessVerified:false,
    requiredInputs:['two_independent_verified_sources','original_reporting_summary','copyright_constraints','word_tier'],
    status:'waiting_for_release', canInvokeModel:false, canPublish:false,
  },
  {
    role:'independent_fact_checker', stage:4,
    purpose:'Check dates, names, metrics, quotations, reporting provenance, rights, article originality and risk.',
    modelId:null, modelAccessVerified:false,
    requiredInputs:['claim_to_source_map','copyright_review','risk_classification','no_unresolved_unsupported_facts'],
    status:'waiting_for_release', canInvokeModel:false, canPublish:false,
  },
  {
    role:'publication_controller', stage:5,
    purpose:'Only send independently approved and uniquely identified articles through the existing The Prompt publishing RPC.',
    modelId:null, modelAccessVerified:false,
    requiredInputs:['signed_human_approval_or_valid_scoped_autonomy_license','canonical_STOP','hard_budget_reservation','daily_quota','idempotent_external_id','correct_destination'],
    status:'waiting_for_release', canInvokeModel:false, canPublish:false,
  },
])

export type EditorialDailyHandoff = Readonly<{
  status: 'prepare_only'
  projectId: string
  targetArticleCount: number
  taskCount: number
  roles: readonly EditorialAgentTask[]
  publicationDecision: 'NO_GO'
  reason: 'aws_production_credentials_and_editorial_authority_not_released'
}>

export function buildEditorialHandoff(plan: DailyPlan): EditorialDailyHandoff {
  if (plan.mode !== 'prepare_only' || plan.canPublish || plan.canDispatch) {
    throw new Error('EDITORIAL_PLAN_MUST_BE_NON_DISPATCHING')
  }
  return {
    status: 'prepare_only',
    projectId: plan.projectId,
    targetArticleCount: plan.candidates.length,
    taskCount: DAILY_EDITORIAL_ROLE_BLUEPRINT.length,
    roles: DAILY_EDITORIAL_ROLE_BLUEPRINT,
    publicationDecision: 'NO_GO',
    reason: 'aws_production_credentials_and_editorial_authority_not_released',
  }
}
