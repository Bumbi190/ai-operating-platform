/**
 * The Prompt website articles: pure, fail-closed daily selection and release rules.
 * Independent of the social-media schedule. Never authorizes a paid dispatch.
 */
import type { ArticleQa, GroundingResult } from './types'

export interface DailyNewsCandidate {
  id: string
  project_id: string
  title: string
  url: string | null
  source_name: string | null
  summary: string | null
  key_insight: string | null
  content_angle: string | null
  status: string
  fetched_at: string
}

const ALLOWED_PRIMARY_DOMAINS = new Set([
  'openai.com',
  'deepmind.google',
  'blog.google',
  'research.google',
  'anthropic.com',
  'ai.meta.com',
  'about.fb.com',
  'nvidia.com',
  'developer.nvidia.com',
  'blogs.microsoft.com',
  'news.microsoft.com',
  'research.microsoft.com',
  'aws.amazon.com',
  'cloud.google.com',
  'cerebras.ai',
])

export function officialPrimarySourceUrl(url: unknown): boolean {
  if (typeof url !== 'string' || url.length > 2048) return false
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
        parsed.port || parsed.hash) return false
    const hostname = parsed.hostname.toLowerCase()
    return ALLOWED_PRIMARY_DOMAINS.has(hostname) ||
      (hostname.startsWith('www.') && ALLOWED_PRIMARY_DOMAINS.has(hostname.slice(4)))
  } catch { return false }
}

export function selectFreshDailyOfficialNews(
  candidates: readonly DailyNewsCandidate[] | null,
  projectId: string,
  nowMs: number,
): DailyNewsCandidate | null {
  if (!Array.isArray(candidates)) return null
  const maxAgeMs = 36 * 60 * 60 * 1000
  return candidates.find(news => {
    const sourceMs = Date.parse(news.fetched_at)
    return news.project_id === projectId
      && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(news.id)
      && (news.status === 'new' || news.status === 'approved')
      && typeof news.title === 'string' && news.title.length >= 20 && news.title.length <= 160
      && officialPrimarySourceUrl(news.url)
      && Number.isFinite(sourceMs) && sourceMs <= nowMs
      && nowMs - sourceMs <= maxAgeMs
  }) ?? null
}

export interface IndependentFactVerdict {
  passed: boolean
  source_supported: boolean
  attributions_correct: boolean
  claims_checked: number
  unsupported_claims: string[]
  verdict: string
}

export const BLOCKED_FACT_REVIEW: IndependentFactVerdict = {
  passed: false, source_supported: false, attributions_correct: false,
  claims_checked: 0, unsupported_claims: [],
  verdict: 'Independent factual review incomplete; requires human editorial review.',
}

export function parseIndependentFactReview(value: unknown): IndependentFactVerdict {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return BLOCKED_FACT_REVIEW
  const v = value as Record<string, unknown>
  if (typeof v.passed !== 'boolean' || typeof v.source_supported !== 'boolean' ||
      typeof v.attributions_correct !== 'boolean' ||
      typeof v.claims_checked !== 'number' || !Number.isInteger(v.claims_checked) ||
      !Array.isArray(v.unsupported_claims) ||
      !v.unsupported_claims.every(x => typeof x === 'string' && x.length <= 280) ||
      typeof v.verdict !== 'string' || v.verdict.length > 500) return BLOCKED_FACT_REVIEW
  const passed = v.passed && v.source_supported && v.attributions_correct
    && v.claims_checked >= 3 && v.claims_checked <= 100
    && v.unsupported_claims.length === 0
  return {
    passed,
    source_supported: v.source_supported,
    attributions_correct: v.attributions_correct,
    claims_checked: v.claims_checked,
    unsupported_claims: v.unsupported_claims,
    verdict: v.verdict,
  }
}

export function eligibleForWebsiteAutopublish(
  news: DailyNewsCandidate,
  grounding: GroundingResult,
  qa: ArticleQa,
  factual: IndependentFactVerdict,
  enabled: boolean,
): boolean {
  return enabled
    && officialPrimarySourceUrl(news.url)
    && grounding.mode === 'strong' && grounding.source === 'hermes'
    && grounding.wordCount >= 150
    && qa.pass === true && qa.confidence === 'high'
    && factual.passed === true && factual.source_supported === true
    && factual.attributions_correct === true && factual.unsupported_claims.length === 0
}

export function confirmedPromptArticleUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password &&
      (parsed.hostname === 'theprompt.nu' || parsed.hostname === 'www.theprompt.nu')
      && parsed.pathname.startsWith('/articles/') && parsed.pathname.length > '/articles/'.length
  } catch { return false }
}
