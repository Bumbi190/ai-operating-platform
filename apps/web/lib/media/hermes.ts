/**
 * hermes.ts — TypeScript client for the Hermes Python worker.
 *
 * Hermes runs Playwright + Gemini Computer Use to autonomously browse
 * the web and extract structured information for Omnira's media pipeline.
 *
 * Set HERMES_URL and HERMES_SECRET in env vars to enable.
 * If HERMES_URL is not set, all calls return null (graceful degradation).
 */

const HERMES_URL    = process.env.HERMES_URL    ?? ''
const HERMES_SECRET = process.env.HERMES_SECRET ?? ''

function hermesHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...(HERMES_SECRET ? { Authorization: `Bearer ${HERMES_SECRET}` } : {}),
  }
}

// ── Response types ────────────────────────────────────────────────────────────

export interface HermesScrapeResult {
  title:          string
  url:            string
  source_name:    string
  summary:        string
  key_insight:    string
  virality_score: number
  content_angle:  'educational' | 'controversial' | 'inspiring' | 'practical'
}

export interface HermesResearchResult {
  topic:                string
  summary:              string
  key_facts:            string[]
  key_players:          string[]
  recent_developments:  string[]
  sources_visited:      string[]
  virality_score:       number
  suggested_angle:      'educational' | 'controversial' | 'inspiring' | 'practical'
  script_hook_idea:     string
}

export interface HermesTrendingTopic {
  topic:            string
  source:           'google_trends' | 'reddit' | 'hackernews'
  search_volume:    string
  engagement_score: number
  context:          string
  url:              string
}

export interface HermesTrendsResult {
  fetched_at: string
  count:      number
  topics:     HermesTrendingTopic[]
}

export interface HermesReadResult {
  success:    boolean
  url:        string
  title:      string
  text:       string   // Clean article text, up to ~4000 words
  word_count: number
  error?:     string
}

export interface HermesCompetitorPost {
  title:  string
  source: 'youtube' | 'tldr_ai' | 'rundown_ai' | 'bens_bites'
  views:  string
  hook:   string
  url:    string
}

export interface HermesCompetitorResult {
  fetched_at:      string
  pattern_summary: string
  top_hooks:       string[]
  trending_topics: string[]
  posts:           HermesCompetitorPost[]
}

// ── Health check ──────────────────────────────────────────────────────────────

export function isHermesConfigured(): boolean {
  return Boolean(HERMES_URL)
}

export async function checkHermesHealth(): Promise<boolean> {
  if (!HERMES_URL) return false
  try {
    const res = await fetch(`${HERMES_URL}/health`, { method: 'GET' })
    return res.ok
  } catch {
    return false
  }
}

// ── Trends ────────────────────────────────────────────────────────────────────

/**
 * Fetch trending AI topics from Google Trends, Reddit, and HackerNews.
 * No Gemini — pure Playwright scraping (~15-20 seconds).
 *
 * Use the result to guide news selection: prioritise stories that match
 * what people are actively searching for and discussing right now.
 *
 * Returns null if Hermes is not configured or the request fails.
 */
export async function callHermesTrends(): Promise<HermesTrendsResult | null> {
  if (!HERMES_URL) return null

  try {
    const res = await fetch(`${HERMES_URL}/trends`, {
      method:  'GET',
      headers: hermesHeaders(),
      signal:  AbortSignal.timeout(60 * 1000), // 60s — parallel scraping of 3 sources
    })

    if (!res.ok) {
      console.error(`[hermes] /trends returned ${res.status}`)
      return null
    }

    return await res.json() as HermesTrendsResult
  } catch (err) {
    console.error('[hermes] /trends error:', err)
    return null
  }
}

// ── Scrape ────────────────────────────────────────────────────────────────────

/**
 * Ask Hermes to autonomously browse news sites and find the best AI story.
 * Pass previously-seen URLs to avoid duplicates.
 *
 * Returns null if Hermes is not configured or the request fails.
 */
export async function callHermesScrape(
  excludeUrls: string[] = [],
): Promise<HermesScrapeResult | null> {
  if (!HERMES_URL) return null

  try {
    const res = await fetch(`${HERMES_URL}/scrape`, {
      method:  'POST',
      headers: hermesHeaders(),
      body:    JSON.stringify({ exclude_urls: excludeUrls }),
      // Hermes can take up to 3 minutes — use a long timeout via AbortSignal
      signal: AbortSignal.timeout(3 * 60 * 1000),
    })

    if (!res.ok) {
      console.error(`[hermes] /scrape returned ${res.status}`)
      return null
    }

    const body = await res.json() as { data?: HermesScrapeResult; raw?: string; parsed: boolean }

    if (!body.parsed || !body.data) {
      console.warn('[hermes] /scrape returned unparsed result:', body.raw?.slice(0, 200))
      return null
    }

    return body.data
  } catch (err) {
    console.error('[hermes] /scrape error:', err)
    return null
  }
}

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * Ask Hermes to fetch a URL and return the full article text.
 * No Gemini used — pure Playwright DOM extraction (~3-5 seconds per article).
 *
 * Returns null if Hermes is not configured or the request fails.
 */
export async function callHermesRead(
  url: string,
): Promise<HermesReadResult | null> {
  if (!HERMES_URL) return null

  try {
    const res = await fetch(`${HERMES_URL}/read`, {
      method:  'POST',
      headers: hermesHeaders(),
      body:    JSON.stringify({ url }),
      signal:  AbortSignal.timeout(30 * 1000), // 30s — single article, should be fast
    })

    if (!res.ok) {
      console.error(`[hermes] /read returned ${res.status} for ${url}`)
      return null
    }

    return await res.json() as HermesReadResult
  } catch (err) {
    console.error('[hermes] /read error:', err)
    return null
  }
}

// ── Competitors ───────────────────────────────────────────────────────────────

/**
 * Fetch competitor intelligence from YouTube AI search, TLDR AI,
 * The Rundown AI, and Ben's Bites.
 *
 * Run weekly — not every cron cycle. Cache result in memories table
 * and re-use for 7 days. Takes ~20-30 seconds.
 *
 * Returns null if Hermes is not configured or the request fails.
 */
export async function callHermesCompetitors(): Promise<HermesCompetitorResult | null> {
  if (!HERMES_URL) return null

  try {
    const res = await fetch(`${HERMES_URL}/competitors`, {
      method:  'GET',
      headers: hermesHeaders(),
      signal:  AbortSignal.timeout(60 * 1000), // 60s — parallel scraping of 4 sources
    })

    if (!res.ok) {
      console.error(`[hermes] /competitors returned ${res.status}`)
      return null
    }

    return await res.json() as HermesCompetitorResult
  } catch (err) {
    console.error('[hermes] /competitors error:', err)
    return null
  }
}

/**
 * Read multiple article URLs in parallel (max 3 concurrent).
 * Returns only the successful results.
 */
export async function callHermesReadMany(
  urls: string[],
  maxConcurrent = 3,
): Promise<HermesReadResult[]> {
  if (!HERMES_URL || !urls.length) return []

  const results: HermesReadResult[] = []
  // Process in batches to avoid overwhelming Hermes
  for (let i = 0; i < urls.length; i += maxConcurrent) {
    const batch   = urls.slice(i, i + maxConcurrent)
    const settled = await Promise.allSettled(batch.map(url => callHermesRead(url)))
    for (const s of settled) {
      if (s.status === 'fulfilled' && s.value?.success) {
        results.push(s.value)
      }
    }
  }
  return results
}

// ── Research ──────────────────────────────────────────────────────────────────

/**
 * Ask Hermes to do a deep-dive research session on a specific topic.
 * Depth: "quick" (~2 min) | "standard" (~5 min) | "deep" (~10 min)
 *
 * Returns null if Hermes is not configured or the request fails.
 */
export async function callHermesResearch(
  topic: string,
  depth: 'quick' | 'standard' | 'deep' = 'standard',
): Promise<HermesResearchResult | null> {
  if (!HERMES_URL) return null

  try {
    const res = await fetch(`${HERMES_URL}/research`, {
      method:  'POST',
      headers: hermesHeaders(),
      body:    JSON.stringify({ topic, depth }),
      signal:  AbortSignal.timeout(10 * 60 * 1000),
    })

    if (!res.ok) {
      console.error(`[hermes] /research returned ${res.status}`)
      return null
    }

    const body = await res.json() as { data?: HermesResearchResult; raw?: string; parsed: boolean }

    if (!body.parsed || !body.data) {
      console.warn('[hermes] /research returned unparsed result:', body.raw?.slice(0, 200))
      return null
    }

    return body.data
  } catch (err) {
    console.error('[hermes] /research error:', err)
    return null
  }
}
