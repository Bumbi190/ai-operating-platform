import { describe, expect, it } from 'vitest'
import {
  OMNIRA_MODEL_CATALOG, OMNIRA_MODEL_CATALOG_VERSION,
} from '@/lib/ai/model-control/catalog'
import {
  planModelForWorkflow, OMNIRA_WORKFLOW_ROUTING_VERSION,
  type WorkflowModelRequest,
} from '@/lib/ai/model-control/workflow-policy'
import { EDITORIAL_MODELS } from '@/lib/article/daily/model-choice'

const PID='a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
const PROJECT2='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
function request(extra: Partial<WorkflowModelRequest> = {}): WorkflowModelRequest {
  return {
    projectId: PID, workflowId: 'the-prompt.news-hunter',
    requiredCapabilities: ['classify'], minimumProvisionalQuality: 1,
    dataClassification: 'public', allowExternalProcessing: true,
    preferBedrock: true,
    allowedProviders: ['aws-bedrock','anthropic-api','openai-api'],
    ...extra,
  }
}

describe('Shared Omnira model control plane: all workflows, no runtime rights', () => {
  it('central immutable IDs and explicit disabled flags; catalog discovery does not grant access', () => {
    expect(OMNIRA_MODEL_CATALOG_VERSION).toBe('omnira.model-catalog.v1')
    expect(new Set(OMNIRA_MODEL_CATALOG.map(m => m.key)).size).toBe(OMNIRA_MODEL_CATALOG.length)
    expect(OMNIRA_MODEL_CATALOG.every(m => !m.dispatchAuthorized &&
      !m.publicationAuthorized && !m.productionEntitlementVerified)).toBe(true)
    expect(OMNIRA_MODEL_CATALOG.filter(m => m.availability === 'preview_smoke_only'))
      .toHaveLength(1)
  })
  it('The Prompt reuses central model identity; no duplicate model/provider registry', () => {
    for (const item of EDITORIAL_MODELS) {
      const common=OMNIRA_MODEL_CATALOG.find(m=>m.key===item.key)
      expect(common).toBeDefined()
      expect(item.provider).toBe(common?.provider)
      expect(item.modelId).toBe(common?.modelId)
      expect(item.lineage).toBe(common?.underlyingLineage)
      expect(item.cost).toBe(common?.cost)
    }
  })
  it('classifying The Prompt news suggests a cheap candidate, not a dispatch permission', () => {
    const decision=planModelForWorkflow(request())
    expect(decision.version).toBe(OMNIRA_WORKFLOW_ROUTING_VERSION)
    expect(decision.status).toBe('candidate_only')
    expect(decision.suggestedModelKey).toBe('bedrock-nova-micro')
    expect(decision.dispatchAuthorized).toBe(false)
    expect(decision.budgetReserved).toBe(false)
    expect(decision.accountEntitlementVerified).toBe(false)
  })
  it('the same catalog works for unrelated owned projects and workflows', () => {
    for (const workflowId of ['familje-stunden.story-draft','webbuilder.sales-copy',
      'handlarborsen.listing-summary','omnira.atlas.research','gainpilot.analysis']) {
      const decision=planModelForWorkflow(request({
        projectId: PROJECT2,workflowId,requiredCapabilities:['summarize'],
        minimumProvisionalQuality:2,
      }))
      expect(decision.status).toBe('candidate_only')
      expect(decision.projectId).toBe(PROJECT2)
      expect(decision.workflowId).toBe(workflowId)
      expect(decision.dispatchAuthorized).toBe(false)
    }
  })
  it('unsupported image, audio, video and embeddings stay on specialist providers', () => {
    for (const capability of ['image_generation','speech_generation','video_generation','embeddings'] as const) {
      const decision=planModelForWorkflow(request({requiredCapabilities:[capability]}))
      expect(decision.status).toBe('blocked')
      expect(decision.suggestedModelKey).toBe(null)
      expect(decision.publicationAuthorized).toBe(false)
    }
  })
  it('when quality meets the task, verified pricing outranks an unpriced AWS candidate', () => {
    const decision = planModelForWorkflow(request({
      workflowId: 'the-prompt.longform-analysis',
      requiredCapabilities: ['longform'], minimumProvisionalQuality: 3,
      preferBedrock: true,
    }))
    expect(decision.status).toBe('candidate_only')
    expect(decision.suggestedModelKey).toBe('anthropic-sonnet-direct')
    expect(decision.dispatchAuthorized).toBe(false)
  })
  it('unknown model override blocks; never silently substitutes a model', () => {
    const decision=planModelForWorkflow(request({requestedModelKey:'unlisted-model'}))
    expect(decision.status).toBe('blocked')
    expect(decision.explanation).toBe('requested_model_not_qualified_no_fallback')
  })
  it('a manually selected model with insufficient capability must be refused', () => {
    const result=planModelForWorkflow(request({
      requiredCapabilities:['longform'],minimumProvisionalQuality:3,
      requestedModelKey:'bedrock-nova-micro',
    }))
    expect(result.status).toBe('blocked')
    expect(result.considered.find(x=>x.key==='bedrock-nova-micro')?.reasons)
      .toContain('capability_mismatch')
  })
  it('sensitive or forbidden external data blocks all external models', () => {
    const decisions=[
      planModelForWorkflow(request({dataClassification:'restricted'})),
      planModelForWorkflow(request({allowExternalProcessing:false})),
    ]
    for (const d of decisions) {
      expect(d.status).toBe('blocked')
      expect(d.considered.every(m => m.reasons.includes('external_processing_forbidden'))).toBe(true)
    }
  })
  it('workflow-level provider allowlist cannot be bypassed by preference', () => {
    const d=planModelForWorkflow(request({
      allowedProviders:['anthropic-api'],
      requestedModelKey:'bedrock-nova-micro',
    }))
    expect(d.status).toBe('blocked')
    expect(d.considered.find(m=>m.key==='bedrock-nova-micro')?.reasons)
      .toContain('provider_not_allowlisted')
  })
  it('an independently reviewed model family cannot self-check its own work', () => {
    const d=planModelForWorkflow(request({
      workflowId:'the-prompt.fact-review',requiredCapabilities:['review'],
      minimumProvisionalQuality:3,excludeModelLineage:'amazon',
      requestedModelKey:'bedrock-nova-pro',
    }))
    expect(d.status).toBe('blocked')
    expect(d.considered.find(m=>m.key==='bedrock-nova-pro')?.reasons)
      .toContain('independence_conflict')
  })
  it('regional restrictions prevent unreviewed AWS processing', () => {
    const d=planModelForWorkflow(request({
      allowedProviders:['aws-bedrock'],allowedAwsSourceRegions:['eu-west-1'],
      requestedModelKey:'bedrock-nova-micro',
    }))
    expect(d.status).toBe('blocked')
    expect(d.considered.find(m=>m.key==='bedrock-nova-micro')?.reasons)
      .toContain('aws_region_not_reviewed')
  })
  it('a candidate never implies model price, production rights, or OIDC was approved', () => {
    const d=planModelForWorkflow(request({
      requiredCapabilities:['longform'],minimumProvisionalQuality:3,
      requestedModelKey:'bedrock-nova-pro',
    }))
    expect(d.status).toBe('candidate_only')
    const selected=d.considered.find(m=>m.key===d.suggestedModelKey)
    expect(selected?.unresolvedReleaseGates).toContain('model_region_and_profile_unknown')
    expect(selected?.unresolvedReleaseGates).toContain('price_unknown')
    expect(selected?.unresolvedReleaseGates).toContain('production_oidc_role_and_iam_model_allowlist')
    expect(d.dispatchAuthorized).toBe(false)
  })
  it('malformed and unscoped workflow calls always fail closed', () => {
    for(const req of [
      null,{},request({projectId:'invalid'}),request({workflowId:'X'}),
      request({requiredCapabilities:[]}),request({requiredCapabilities:['unknown'] as never}),
      request({minimumProvisionalQuality:8 as never}),
      request({allowedProviders:[]}),
      request({dataClassification:'other' as never}),
      request({requestedModelKey:'a'.repeat(180)}),
    ]){
      const d=planModelForWorkflow(req)
      expect(d.status).toBe('blocked')
      expect(d.dispatchAuthorized).toBe(false)
    }
  })
})
