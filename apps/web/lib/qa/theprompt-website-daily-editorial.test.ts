import { describe, it, expect } from 'vitest'
import {
  officialPrimarySourceUrl,
  selectFreshDailyOfficialNews,
  parseIndependentFactReview,
  eligibleForWebsiteAutopublish,
  confirmedPromptArticleUrl,
  BLOCKED_FACT_REVIEW,
  type DailyNewsCandidate,
  type IndependentFactVerdict,
} from '@/lib/article/daily-editorial-policy'
import type { ArticleQa, GroundingResult } from '@/lib/article/types'

const projectId = 'a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
const now = Date.parse('2026-11-20T08:00:00Z')
const candidate: DailyNewsCandidate = {
  id: 'b8c3924a-0022-4d20-a481-dcbe6db22753',
  project_id: projectId,
  title: 'Official technology laboratory publishes a new AI model',
  source_name: 'Google DeepMind Blog',
  url: 'https://deepmind.google/blog/official-story',
  summary: 'Verifiable primary-source text',
  key_insight: null,
  content_angle: 'educational',
  status: 'new',
  fetched_at: '2026-11-20T06:30:00Z',
}

const grounding: GroundingResult = {
  mode: 'strong', source: 'hermes', wordCount: 400, text: 'Source evidence text',
}
const qa: ArticleQa = {
  pass: true, confidence: 'high', issues: [], structuralOk: true,
  slop: { score: 0.5, verdict: 'low' },
  copyOverlap: { ratio: 0, violation: false, windowSize: 15 },
}
const factual: IndependentFactVerdict = {
  passed: true, source_supported: true, attributions_correct: true,
  claims_checked: 7, unsupported_claims: [], verdict: 'All substantive claims are supported.',
}

describe('The Prompt website daily editorial gate', () => {
  it('allows only explicit HTTPS public primary-source hostnames', () => {
    for (const url of [
      'https://deepmind.google/blog/research',
      'https://www.openai.com/index/example',
      'https://blog.google/technology/research',
      'https://anthropic.com/news/example',
    ]) expect(officialPrimarySourceUrl(url)).toBe(true)
    for (const url of [
      'http://openai.com/unsafe', 'https://127.0.0.1',
      'https://openai.com.evil.example/test',
      'https://evil-openai.com/test',
      'https://wired.com/story/breaking',
      'https://localhost:8000/private',
      'https://user:pass@openai.com/index',
      'https://openai.com:444/index',
      'file:///etc/shadow',
    ]) expect(officialPrimarySourceUrl(url)).toBe(false)
  })

  it('refuses cross-project, old, future, unsourced and rejected news', () => {
    expect(selectFreshDailyOfficialNews([candidate], projectId, now)?.id).toBe(candidate.id)
    expect(selectFreshDailyOfficialNews([{ ...candidate, project_id: 'different' }], projectId, now)).toBeNull()
    expect(selectFreshDailyOfficialNews([{ ...candidate, fetched_at: '2026-11-18T00:00:00Z' }], projectId, now)).toBeNull()
    expect(selectFreshDailyOfficialNews([{ ...candidate, fetched_at: '2026-11-21T00:00:00Z' }], projectId, now)).toBeNull()
    expect(selectFreshDailyOfficialNews([{ ...candidate, status: 'scripted' }], projectId, now)?.id).toBe(candidate.id)
    expect(selectFreshDailyOfficialNews([{ ...candidate, status: 'rejected' }], projectId, now)).toBeNull()
    expect(selectFreshDailyOfficialNews([{ ...candidate, url: 'https://wired.com/story/unsupported' }], projectId, now)).toBeNull()
    expect(selectFreshDailyOfficialNews([], projectId, now)).toBeNull()
  })

  it('requires explicit valid and conservative second-model fact-check', () => {
    expect(parseIndependentFactReview(factual).passed).toBe(true)
    expect(parseIndependentFactReview({ ...factual, unsupported_claims: ['Invented statistics'] }).passed).toBe(false)
    expect(parseIndependentFactReview({ ...factual, claims_checked: 2 }).passed).toBe(false)
    expect(parseIndependentFactReview({ ...factual, source_supported: false }).passed).toBe(false)
    expect(parseIndependentFactReview({ ...factual, attributions_correct: false }).passed).toBe(false)
    expect(parseIndependentFactReview({ passed: true }).passed).toBe(false)
    expect(parseIndependentFactReview('approve').passed).toBe(false)
    expect(parseIndependentFactReview(null)).toEqual(BLOCKED_FACT_REVIEW)
  })

  it('refuses public release unless all independent gates and explicit feature flag pass', () => {
    expect(eligibleForWebsiteAutopublish(candidate, grounding, qa, factual, true)).toBe(true)
    expect(eligibleForWebsiteAutopublish(candidate, grounding, qa, factual, false)).toBe(false)
    expect(eligibleForWebsiteAutopublish(candidate, { ...grounding, mode: 'weak' }, qa, factual, true)).toBe(false)
    expect(eligibleForWebsiteAutopublish(candidate, { ...grounding, source: 'news_item' }, qa, factual, true)).toBe(false)
    expect(eligibleForWebsiteAutopublish(candidate, grounding, { ...qa, confidence: 'medium' }, factual, true)).toBe(false)
    expect(eligibleForWebsiteAutopublish(candidate, grounding, qa, { ...factual, passed: false }, true)).toBe(false)
    expect(eligibleForWebsiteAutopublish(candidate, grounding, qa, { ...factual, unsupported_claims: ['Hyped fake number'] }, true)).toBe(false)
  })

  it('does not trust publication receipts from other hosts or unrelated paths', () => {
    expect(confirmedPromptArticleUrl('https://theprompt.nu/articles/new-story')).toBe(true)
    expect(confirmedPromptArticleUrl('https://www.theprompt.nu/articles/new-story')).toBe(true)
    for (const url of [
      'https://theprompt.nu/login', 'http://theprompt.nu/articles/new-story',
      'https://theprompt.nu.evil.org/articles/a',
      'https://another-site.com/articles/a',
      'https://theprompt.nu/articles/',
    ]) expect(confirmedPromptArticleUrl(url)).toBe(false)
  })
})
