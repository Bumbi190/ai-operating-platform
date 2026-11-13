/**
 * Article job error classification and config parsing.
 *
 * Cost gates and stops must DEFER (no attempt burned, no fallback provider);
 * a possibly-billed in-flight abort must FAIL rather than auto-retry and pay twice.
 */

import { describe, expect, it } from 'vitest'
import { classifyArticleJobError } from '@/lib/article/jobs/repo'
import { readArticleJobsConfig } from '@/lib/article/jobs/config'
import { LeaseLostError } from '@/lib/article/jobs/types'
import { ProviderNotDispatchedError, SpendRefusedError } from '@/lib/cost/governed-spend'
import { GovernanceDispatchUnknownError } from '@/lib/governance/execution-signal'

describe('classifyArticleJobError', () => {
  it('maps governance outcomes', () => {
    expect(classifyArticleJobError(new SpendRefusedError({ reason: 'budget_exceeded' as never, provider: 'anthropic', operation: 'x' }))).toBe('deferred')
    expect(classifyArticleJobError(new ProviderNotDispatchedError('no'))).toBe('deferred')
    expect(classifyArticleJobError(new GovernanceDispatchUnknownError('anthropic', 'stop' as never))).toBe('fatal')
    expect(classifyArticleJobError(new LeaseLostError('j'))).toBe('lease_lost')
  })
  it('treats ordinary provider/network errors as retryable', () => {
    expect(classifyArticleJobError(new Error('529 overloaded'))).toBe('retryable')
    // A look-alike name must not be granted governance status.
    expect(classifyArticleJobError(Object.assign(new Error('x'), { name: 'SpendRefusedError' }))).toBe('retryable')
  })
})

describe('readArticleJobsConfig', () => {
  it('is off by default and only exact "true" enables it', () => {
    expect(readArticleJobsConfig({}).enabled).toBe(false)
    expect(readArticleJobsConfig({ THEPROMPT_ARTICLE_JOBS_ENABLED: 'yes' }).enabled).toBe(false)
    expect(readArticleJobsConfig({ THEPROMPT_ARTICLE_JOBS_ENABLED: 'true' }).enabled).toBe(true)
  })
  it('clamps budgets and rejects an invalid since', () => {
    const c = readArticleJobsConfig({ THEPROMPT_ARTICLE_JOBS_DAILY_MAX: '99', THEPROMPT_ARTICLE_JOBS_MAX_ATTEMPTS: '0', THEPROMPT_ARTICLE_JOBS_SINCE: 'soon' })
    expect(c).toMatchObject({ dailyMax: 6, maxAttempts: 1, since: null })
    expect(readArticleJobsConfig({}).dailyMax).toBe(2)
  })
})
