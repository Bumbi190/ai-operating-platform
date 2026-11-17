import { describe, expect, it } from 'vitest'
import {
  EDITORIAL_MODELS, EDITORIAL_MODEL_CHOICES_VERSION, modelChoicesForRole,
  recommendedModelForRole, previewEditorialModelChoice,
} from '@/lib/article/daily/model-choice'

describe('The Prompt model choices are advisory and support multiple providers', () => {
  it('catalog has unique stable IDs and has no callable or publishing permissions', () => {
    expect(EDITORIAL_MODEL_CHOICES_VERSION).toBe('the-prompt.editorial-models.v1')
    expect(new Set(EDITORIAL_MODELS.map(m => m.key)).size).toBe(EDITORIAL_MODELS.length)
    expect(EDITORIAL_MODELS.every(m => !m.canInvoke && !m.canPublish)).toBe(true)
    expect(new Set(EDITORIAL_MODELS.map(m => m.provider))).toEqual(
      new Set(['aws-bedrock', 'anthropic-api', 'openai-api']))
  })
  it('only Nova Micro has verified AWS preview smoke, not production or universal entitlement', () => {
    const preview = EDITORIAL_MODELS.find(m => m.key === 'bedrock-nova-micro')
    expect(preview?.availability).toBe('preview_smoke_only')
    expect(preview?.region).toBe('us-east-1')
    expect(EDITORIAL_MODELS.filter(m => m.provider === 'aws-bedrock' &&
      m.availability === 'preview_smoke_only')).toHaveLength(1)
  })
  it('Nova Pro and Lite are candidates, not guaranteed available, priced, or admitted', () => {
    for (const key of ['bedrock-nova-pro', 'bedrock-nova-lite']) {
      const m = EDITORIAL_MODELS.find(x => x.key === key)
      expect(m).toBeDefined()
      expect(m?.availability).toBe('unverified')
      expect(m?.cost).toBe('unverified')
    }
  })
  it('recommendations cover four AI roles, controller is deterministic with no model', () => {
    expect(recommendedModelForRole('news_scout')).toBe('bedrock-nova-micro')
    expect(recommendedModelForRole('corroboration_researcher')).toBe('bedrock-nova-lite')
    expect(recommendedModelForRole('longform_writer')).toBe('anthropic-sonnet-direct')
    expect(recommendedModelForRole('independent_fact_checker')).toBe('bedrock-nova-pro')
    expect(recommendedModelForRole('publication_controller')).toBe(null)
    expect(modelChoicesForRole('publication_controller')).toHaveLength(0)
  })
  it('allows appropriate manual substitution but never authorizes dispatch', () => {
    const writer = previewEditorialModelChoice({
      role: 'longform_writer', key: 'bedrock-nova-pro',
    })
    expect(writer.advisoryStatus).toBe('candidate_only')
    expect(writer.selectedModel?.lineage).toBe('amazon')
    expect(writer.reason).toBe('account_access_and_pricing_unverified')
    expect(writer.dispatchAuthorized).toBe(false)
    expect(writer.publicationAuthorized).toBe(false)
    expect(writer.productionEntitlementVerified).toBe(false)
  })
  it('prevents classifying cheap Nova Micro as a validated longform author', () => {
    const result = previewEditorialModelChoice({ role: 'longform_writer', key: 'bedrock-nova-micro' })
    expect(result).toMatchObject({
      advisoryStatus: 'blocked', reason: 'model_not_qualified_for_role',
      dispatchAuthorized: false,
    })
  })
  it('prevents non-independent reviewers even when hosted through different API providers', () => {
    const result = previewEditorialModelChoice({
      role: 'independent_fact_checker', key: 'bedrock-nova-pro',
      writerKey: 'bedrock-nova-lite',
    })
    expect(result.advisoryStatus).toBe('blocked')
    expect(result.reason).toBe('reviewer_same_model_lineage')
    expect(result.independentFromWriter).toBe(false)
  })
  it('allows different model lineage for reviewer, still candidate-only', () => {
    const result = previewEditorialModelChoice({
      role: 'independent_fact_checker', key: 'bedrock-nova-pro',
      writerKey: 'anthropic-sonnet-direct',
    })
    expect(result.advisoryStatus).toBe('candidate_only')
    expect(result.independentFromWriter).toBe(true)
    expect(result.dispatchAuthorized).toBe(false)
  })
  it('missing writer identity blocks independent fact-checker', () => {
    const result = previewEditorialModelChoice({
      role: 'independent_fact_checker', key: 'bedrock-nova-pro',
    })
    expect(result).toMatchObject({
      advisoryStatus: 'blocked', reason: 'writer_lineage_unknown',
    })
  })
  it('unknown arbitrary model string cannot become a role model', () => {
    const result = previewEditorialModelChoice({
      role: 'news_scout', key: 'arn:aws:bedrock:us-east-1::foundation-model/unreviewed',
    })
    expect(result).toMatchObject({
      advisoryStatus: 'blocked', reason: 'model_not_qualified_for_role',
      dispatchAuthorized: false,
    })
  })
  it('publication controller can never select a provider', () => {
    const result = previewEditorialModelChoice({
      role: 'publication_controller', key: 'anthropic-sonnet-direct',
    })
    expect(result.selectedKey).toBe(null)
    expect(result.advisoryStatus).toBe('deterministic_gate_only')
    expect(result.publicationAuthorized).toBe(false)
  })
})
