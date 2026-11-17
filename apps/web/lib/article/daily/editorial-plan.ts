/**
 * The Prompt: deterministic daily editorial candidate selection.
 *
 * This is NOT publication and performs no LLM calls, writes, scraping or spend.
 * Two slots: (1) a socially published story with real platform receipts,
 * (2) a distinct fresh story that has NOT already received a social script.
 *
 * Sources are UNVERIFIED REFERENCES, never verified factual evidence.
 * All chosen stories require article read, independent corroboration, human
 * editorial QA, explicit approval and separate cost/STOP authorization.
 */
export const DAILY_PROMPT_PROJECT_SLUG = 'ai-media-automation'
export const DAILY_ARTICLE_TARGETS = Object.freeze({
  socialExpansion: 1,
  independentNews: 1,
})
const SOCIAL_WINDOW_MS = 14 * 24 * 60 * 60 * 1000
const FRESH_WINDOW_MS = 3 * 24 * 60 * 60 * 1000

export type DailyNews = Readonly<{
  id: string
  project_id: string
  title: string | null
  url: string | null
  source_name: string | null
  status: string | null
  fetched_at: string | null
  created_at: string | null
  virality_score: number | null
}>
export type DailyScript = Readonly<{
  id: string
  project_id: string
  news_item_id: string | null
  status: string | null
  generated_at: string | null
  published_at: string | null
  instagram_media_id: string | null
  facebook_post_id: string | null
  youtube_video_id: string | null
}>
export type DailyWebsiteArticle = Readonly<{
  news_item_id: string | null
  external_id: string | null
  status: string | null
}>
export type DailyCandidate = Readonly<{
  slot: 'social_expansion' | 'independent_news'
  newsItemId: string
  sourceName: string | null
  title: string
  sourceUrl: string
  externalId: string
  suggestedTier: 'deep' | 'standard'
  socialReceiptVerified: boolean
  sourceFactsIndependentlyVerified: false
  canWrite: false
  canPublish: false
  needs: readonly [
    'read_primary_source',
    'find_independent_corroboration',
    'factual_and_copyright_review',
    'budget_and_stop_authorization',
    'human_publish_approval',
  ]
}>
export type DailyPlan = Readonly<{
  projectId: string
  generatedAt: string
  candidates: DailyCandidate[]
  counts: Readonly<{
    usableNews: number
    socialWithReceipt: number
    candidatesChosen: number
  }>
  mode: 'prepare_only'
  canDispatch: false
  canPublish: false
}>

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HOLDS = [
  'read_primary_source', 'find_independent_corroboration',
  'factual_and_copyright_review', 'budget_and_stop_authorization',
  'human_publish_approval',
] as const

function normalizedTitle(title: string): string {
  return title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim()
}
function canonicalSource(value: string | null): string | null {
  if (!value || value.length > 1700) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password ||
        !url.hostname.includes('.') || url.hostname === 'localhost') return null
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_|^fbclid$|^gclid$/i.test(key)) url.searchParams.delete(key)
    }
    return url.toString()
  } catch { return null }
}
function validDate(value: string | null | undefined): number | null {
  const t = Date.parse(value ?? '')
  return Number.isFinite(t) ? t : null
}
function currentEnough(value: string | null, now: number, window: number): boolean {
  const t = validDate(value)
  return t !== null && t <= now + 5 * 60_000 && now - t <= window
}
function socialReceipt(script: DailyScript): boolean {
  return script.status === 'published' &&
    [script.instagram_media_id, script.facebook_post_id, script.youtube_video_id]
      .some(v => typeof v === 'string' && v.trim().length > 0)
}
// Mark likely high-impact allegations or child safety stories for separate
// editorial handling. This is not a model fact judgment.
export function requiresEnhancedEditorialReview(title: string): boolean {
  return /\b(suicide|self.harm|death|killed|murder|spy|spying|honeypot|affair|abuse|assault|fraud|lawsuit|criminal|election|accused|resigned|resigns|stepped down|fired|interim ceo|new ceo|replaced|scandal|troubles)\b/i.test(title)
}
function externalId(newsId: string): string { return 'omnira_' + newsId }

export function buildDailyPromptPlan(input: {
  projectId: string
  now: string
  news: readonly DailyNews[]
  scripts: readonly DailyScript[]
  websiteArticles: readonly DailyWebsiteArticle[]
}): DailyPlan {
  const now = Date.parse(input.now)
  if (!ID_RE.test(input.projectId) || !Number.isFinite(now)) {
    throw new Error('DAILY_PROMPT_INVALID_SCOPE_OR_TIME')
  }
  const already = new Set<string>()
  for (const article of input.websiteArticles) {
    // Even a PENDING or REJECTED article must not spawn another anonymous draft.
    if (article.news_item_id && ID_RE.test(article.news_item_id)) already.add(article.news_item_id)
    if (article.external_id?.startsWith('omnira_')) already.add(article.external_id.slice(7))
  }
  const newsById = new Map<string, DailyNews>()
  for (const item of input.news) {
    if (item.project_id !== input.projectId || !ID_RE.test(item.id) ||
        !item.title?.trim() || !canonicalSource(item.url) || already.has(item.id)) continue
    if (requiresEnhancedEditorialReview(item.title)) continue
    newsById.set(item.id, item)
  }

  const usableNews = [...newsById.values()]
  const receiptScripts = input.scripts
    .filter(s => s.project_id === input.projectId && s.news_item_id &&
      newsById.has(s.news_item_id) && socialReceipt(s) &&
      currentEnough(s.published_at ?? s.generated_at, now, SOCIAL_WINDOW_MS))
    .sort((a, b) => (validDate(b.published_at ?? b.generated_at) ?? 0) -
      (validDate(a.published_at ?? a.generated_at) ?? 0))
  const chosen: DailyCandidate[] = []
  const usedTitles = new Set<string>()
  const usedUrls = new Set<string>()
  function select(item: DailyNews, slot: DailyCandidate['slot'], receipt: boolean): void {
    const url = canonicalSource(item.url)
    if (!url || !item.title) return
    const t = normalizedTitle(item.title)
    if (!t || usedTitles.has(t) || usedUrls.has(url)) return
    usedTitles.add(t); usedUrls.add(url)
    chosen.push({
      slot, newsItemId: item.id, title: item.title.slice(0, 200),
      sourceName: item.source_name, sourceUrl: url,
      externalId: externalId(item.id),
      suggestedTier: slot === 'social_expansion' ? 'deep' : 'standard',
      socialReceiptVerified: receipt, sourceFactsIndependentlyVerified: false,
      canWrite: false, canPublish: false, needs: HOLDS,
    })
  }
  for (const s of receiptScripts) {
    if (chosen.some(c => c.slot === 'social_expansion')) break
    const n = s.news_item_id ? newsById.get(s.news_item_id) : undefined
    if (n) select(n, 'social_expansion', true)
  }

  // Independence means no script in the supplied source snapshot, including
  // pending and failed/published social scripts, not just "not published".
  const scripted = new Set(input.scripts.filter(s => s.project_id === input.projectId)
    .map(s => s.news_item_id).filter((id): id is string => typeof id === 'string'))
  const independent = usableNews
    .filter(n => !scripted.has(n.id) &&
      (n.status === 'new' || n.status === 'approved') &&
      currentEnough(n.fetched_at ?? n.created_at, now, FRESH_WINDOW_MS))
    .sort((a, b) => (validDate(b.fetched_at ?? b.created_at) ?? 0) -
      (validDate(a.fetched_at ?? a.created_at) ?? 0))
  for (const item of independent) {
    if (chosen.some(c => c.slot === 'independent_news')) break
    select(item, 'independent_news', false)
  }
  return {
    projectId: input.projectId,
    generatedAt: new Date(now).toISOString(),
    candidates: chosen,
    counts: {
      usableNews: usableNews.length,
      socialWithReceipt: receiptScripts.length,
      candidatesChosen: chosen.length,
    },
    mode: 'prepare_only',
    canDispatch: false,
    canPublish: false,
  }
}
