/**
 * The Prompt — deterministic NEW-news editorial preflight.
 *
 * A real article URL and a trustworthy original publication timestamp are
 * required. Popularity/LLM scoring cannot turn stale or unverified articles
 * into breaking news. This module has no provider calls or side effects.
 */
export interface FreshNewsLead {
  title: string
  summary: string
  url: string
  publishedAt: Date
  source: string
  sourceLabel: string
}
export type NewsRefusal =
  | 'invalid_date' | 'future_date' | 'stale' | 'not_ai_news'
  | 'unsafe_url' | 'unverified_source' | 'low_news_value'
export interface FreshNewsDecision {
  eligible: boolean
  reason: NewsRefusal | null
  ageHours: number | null
}

export const FRESH_NEWS_MAX_HOURS = 48
export const MAX_FUTURE_SKEW_MINUTES = 15
const MAX_AGE_MS = FRESH_NEWS_MAX_HOURS * 3600000
const MAX_FUTURE_MS = MAX_FUTURE_SKEW_MINUTES * 60000

// This is an editorial source allowlist, not a claim that each article is true.
// Community discussions need an independently verified source first.
const VERIFIED_RSS_SOURCES = new Set([
  'rss_openai','rss_anthropic','rss_deepmind',
  'rss_theverge','rss_wired','rss_techcrunch','rss_mit',
])
const QUALIFIED_DOMAINS = new Set([
  'openai.com','anthropic.com','deepmind.google','blog.google',
  'theverge.com','wired.com','techcrunch.com','technologyreview.com',
])
const AI_WORDS = /\b(ai|artificial intelligence|machine learning|llm|chatgpt|openai|anthropic|claude|codex|gemini|deepmind|neural|large language model|foundation model|agentic|ai agents?|gpt-\d|llama|mistral|copilot|inference)\b/i
const NON_NEWS = /\b(opinion|roundup|weekly digest|the best \d+|top \d+|buying guide|how to|beginner.s guide|explained:|what is ai\??)\b/i

export function checkFreshRelevantNews(
  lead: FreshNewsLead, nowMs = Date.now(),
): FreshNewsDecision {
  const reject = (reason: NewsRefusal, ageHours: number | null = null): FreshNewsDecision =>
    ({eligible:false,reason,ageHours})
  if (!Number.isFinite(nowMs) || !(lead.publishedAt instanceof Date) ||
      !Number.isFinite(lead.publishedAt.getTime()))
    return reject('invalid_date')
  const ageMs = nowMs - lead.publishedAt.getTime()
  const ageHours = Math.round((ageMs / 3600000) * 10) / 10
  if (ageMs < -MAX_FUTURE_MS) return reject('future_date',ageHours)
  if (ageMs > MAX_AGE_MS) return reject('stale',ageHours)
  let domain: string
  try {
    const url = new URL(lead.url)
    if (url.protocol !== 'https:' || url.username || url.password || url.port)
      return reject('unsafe_url',ageHours)
    domain = url.hostname.toLowerCase().replace(/^www\./,'')
  } catch { return reject('unsafe_url',ageHours) }
  if (!VERIFIED_RSS_SOURCES.has(lead.source) ||
      ![...QUALIFIED_DOMAINS].some(d=>domain===d || domain.endsWith('.'+d)))
    return reject('unverified_source',ageHours)
  if (!AI_WORDS.test(lead.title+' '+lead.summary))
    return reject('not_ai_news',ageHours)
  if (NON_NEWS.test(lead.title))
    return reject('low_news_value',ageHours)
  return {eligible:true,reason:null,ageHours}
}
export function filterFreshRelevantNews<T extends FreshNewsLead>(
  leads: readonly T[], nowMs = Date.now(),
): {eligible:T[];rejections:Record<NewsRefusal,number>} {
  const rejections:Record<NewsRefusal,number>={
    invalid_date:0,future_date:0,stale:0,not_ai_news:0,
    unsafe_url:0,unverified_source:0,low_news_value:0,
  }
  const eligible:T[]=[]
  for(const lead of leads){
    const result=checkFreshRelevantNews(lead,nowMs)
    if(result.eligible) eligible.push(lead)
    else if(result.reason)rejections[result.reason]++
  }
  return {eligible,rejections}
}
