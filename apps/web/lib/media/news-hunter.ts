/**
 * news-hunter.ts — Autonomous AI news discovery for "The Prompt" media brand.
 *
 * Sources (all free, no auth required for read):
 *   - Hacker News  — Algolia search API
 *   - Reddit       — JSON API (r/artificial, r/MachineLearning, r/singularity, r/OpenAI)
 *   - RSS feeds    — OpenAI, Anthropic, The Verge AI, Wired AI, TechCrunch AI, DeepMind
 *
 * Flow:
 *   1. fetchAllSources()       — parallel fetch from all sources
 *   2. deduplicateAgainstDB()  — remove URLs already in media_news_items
 *   3. scoreAndRank()          — virality formula (source × engagement × recency)
 *   4. claudeEditorialPick()   — Claude selects top 3 with editorial reasoning
 */

import { Anthropic } from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RawStory {
  title: string
  url: string
  summary: string
  source: string          // 'hackernews' | 'reddit_*' | 'rss_*'
  sourceLabel: string     // Human-readable: "Hacker News", "r/MachineLearning", etc.
  publishedAt: Date
  engagementScore: number // Raw: HN points, Reddit upvotes, 0 for RSS
  authorityWeight: number // 0–1: how trusted this source is
}

export interface ScoredStory extends RawStory {
  viralityScore: number  // 0–100 composite
}

export interface HunterCandidate {
  rank: number
  story: ScoredStory
  editorialNote: string  // Claude's reasoning for picking this
  suggestedAngle: 'educational' | 'controversial' | 'inspiring' | 'practical'
  estimatedViralityScore: number  // 0–100
}

export interface HunterResult {
  fetchedAt: string
  totalFetched: number
  afterDedup: number
  candidates: HunterCandidate[]
  claudeSummary: string
}

// ─── Trusted domains whitelist ────────────────────────────────────────────────
// Only stories whose URL matches one of these domains are included.
// RSS feeds are already curated so they bypass this check.
// Add new domains here as the brand grows.

const TRUSTED_DOMAINS = new Set([
  // AI labs — primary sources
  'openai.com',
  'anthropic.com',
  'deepmind.google',
  'deepmind.com',
  'blog.google',
  'research.google',
  'ai.google',
  'meta.ai',
  'mistral.ai',
  'huggingface.co',
  'together.ai',
  'cohere.com',
  'stability.ai',
  'inflection.ai',
  'xai.com',
  'groq.com',

  // Tech press — editorial, fact-checked
  'theverge.com',
  'wired.com',
  'techcrunch.com',
  'technologyreview.com',
  'arstechnica.com',
  'venturebeat.com',
  'zdnet.com',
  'cnet.com',
  'engadget.com',
  'theregister.com',

  // General news with strong tech desks
  'reuters.com',
  'bloomberg.com',
  'ft.com',
  'bbc.com',
  'bbc.co.uk',
  'nytimes.com',
  'wsj.com',
  'theguardian.com',
  'apnews.com',

  // Academic / research
  'arxiv.org',
  'nature.com',
  'science.org',
  'dl.acm.org',
  'proceedings.mlr.press',

  // HN self-posts and Reddit discussions are OK (no external URL required)
  'news.ycombinator.com',
  'reddit.com',
])

function isDomainTrusted(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '')
    // Check exact match or subdomain match
    if (TRUSTED_DOMAINS.has(hostname)) return true
    // Check if any trusted domain is a suffix (e.g. blog.openai.com → openai.com)
    for (const domain of TRUSTED_DOMAINS) {
      if (hostname.endsWith(`.${domain}`)) return true
    }
    return false
  } catch {
    return false
  }
}

// ─── Source weights (how authoritative each source is) ────────────────────────

const SOURCE_WEIGHTS: Record<string, number> = {
  hackernews: 0.95,
  reddit_artificial: 0.80,
  reddit_machinelearning: 0.90,
  reddit_singularity: 0.70,
  reddit_openai: 0.85,
  rss_openai: 1.0,
  rss_anthropic: 1.0,
  rss_deepmind: 0.95,
  rss_theverge: 0.85,
  rss_wired: 0.85,
  rss_techcrunch: 0.80,
  rss_mit: 0.90,
}

// ─── RSS feed definitions ─────────────────────────────────────────────────────

const RSS_FEEDS = [
  { key: 'rss_openai',    label: 'OpenAI Blog',       url: 'https://openai.com/blog/rss.xml' },
  { key: 'rss_anthropic', label: 'Anthropic Blog',    url: 'https://www.anthropic.com/rss.xml' },
  { key: 'rss_deepmind',  label: 'DeepMind Blog',     url: 'https://deepmind.google/blog/rss.xml' },
  { key: 'rss_theverge',  label: 'The Verge AI',      url: 'https://www.theverge.com/ai-artificial-intelligence/rss/index.xml' },
  { key: 'rss_wired',     label: 'Wired AI',          url: 'https://www.wired.com/feed/tag/ai/latest/rss' },
  { key: 'rss_techcrunch',label: 'TechCrunch AI',     url: 'https://techcrunch.com/tag/artificial-intelligence/feed/' },
  { key: 'rss_mit',       label: 'MIT Tech Review',   url: 'https://www.technologyreview.com/feed/' },
]

// ─── RSS XML parser (no external deps) ───────────────────────────────────────

function extractXmlValue(xml: string, tag: string): string {
  // Try CDATA first
  const cdataRe = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, 'i')
  const cdataMatch = xml.match(cdataRe)
  if (cdataMatch) return cdataMatch[1].trim()

  // Plain text
  const plainRe = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i')
  const plainMatch = xml.match(plainRe)
  return plainMatch ? plainMatch[1].trim() : ''
}

function parseRssDate(str: string): Date {
  if (!str) return new Date()
  const d = new Date(str)
  return isNaN(d.getTime()) ? new Date() : d
}

function parseRssFeed(xml: string, key: string, label: string): RawStory[] {
  const stories: RawStory[] = []
  const weight = SOURCE_WEIGHTS[key] ?? 0.75

  // Split on <item> boundaries
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi
  let match: RegExpExecArray | null

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]
    const title   = extractXmlValue(block, 'title')
    const link    = extractXmlValue(block, 'link') || extractXmlValue(block, 'guid')
    const desc    = extractXmlValue(block, 'description')
    const pubDate = extractXmlValue(block, 'pubDate') || extractXmlValue(block, 'dc:date') || extractXmlValue(block, 'published')

    if (!title || !link || !link.startsWith('http')) continue

    // Basic AI keyword filter for general feeds (Wired, MIT, TechCrunch publish non-AI too)
    const AI_KEYWORDS = /\b(AI|LLM|GPT|Claude|Gemini|llama|machine learning|neural|model|AGI|deepmind|anthropic|openai|chatgpt|mistral|groq|inference|foundation model|diffusion|multimodal|autonomous|agentic)\b/i
    const isAI = AI_KEYWORDS.test(title) || AI_KEYWORDS.test(desc)
    if (!isAI && (key === 'rss_wired' || key === 'rss_techcrunch' || key === 'rss_mit')) continue

    stories.push({
      title:           title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"),
      url:             link,
      summary:         desc.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').slice(0, 400),
      source:          key,
      sourceLabel:     label,
      publishedAt:     parseRssDate(pubDate),
      engagementScore: 0,
      authorityWeight: weight,
    })

    if (stories.length >= 5) break  // Cap per feed
  }

  return stories
}

// ─── Hacker News (Algolia API) ────────────────────────────────────────────────

async function fetchHackerNews(): Promise<RawStory[]> {
  const cutoff = Math.floor((Date.now() - 48 * 3600 * 1000) / 1000)
  const queries = [
    'artificial intelligence',
    'large language model',
    'OpenAI OR Anthropic OR DeepMind',
    'GPT OR Claude OR Gemini',
  ]

  const allHits: RawStory[] = []
  const seenUrls = new Set<string>()

  for (const q of queries) {
    try {
      const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&numericFilters=created_at_i>${cutoff},points>25&hitsPerPage=8`
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) continue

      const data = await res.json() as {
        hits: Array<{ objectID: string; title: string; url?: string; story_text?: string; points: number; created_at_i: number }>
      }

      for (const hit of data.hits) {
        const storyUrl = hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`
        if (seenUrls.has(storyUrl)) continue
        if (!isDomainTrusted(storyUrl)) continue  // only trusted sources
        seenUrls.add(storyUrl)

        allHits.push({
          title:           hit.title,
          url:             storyUrl,
          summary:         hit.story_text?.replace(/<[^>]+>/g, '').slice(0, 400) ?? '',
          source:          'hackernews',
          sourceLabel:     'Hacker News',
          publishedAt:     new Date(hit.created_at_i * 1000),
          engagementScore: hit.points,
          authorityWeight: SOURCE_WEIGHTS.hackernews,
        })
      }
    } catch {
      // Silently skip failed queries
    }
  }

  return allHits
}

// ─── Reddit ───────────────────────────────────────────────────────────────────

async function fetchReddit(subreddit: string): Promise<RawStory[]> {
  const key = `reddit_${subreddit.toLowerCase()}`
  const weight = SOURCE_WEIGHTS[key] ?? 0.75

  try {
    const res = await fetch(
      `https://www.reddit.com/r/${subreddit}/top.json?t=day&limit=8`,
      {
        headers: { 'User-Agent': 'ThePromptBot/1.0 (news aggregator)' },
        signal: AbortSignal.timeout(8000),
      },
    )
    if (!res.ok) return []

    const data = await res.json() as {
      data: { children: Array<{ data: { id: string; title: string; url: string; selftext: string; score: number; created_utc: number; is_self: boolean; stickied?: boolean; permalink: string } }> }
    }

    return data.data.children
      .filter(c => {
        if (c.data.stickied || c.data.score <= 20) return false
        // Self-posts (reddit.com URLs) are always OK — link posts must be trusted
        if (c.data.is_self) return true
        return isDomainTrusted(c.data.url)
      })
      .map(c => ({
        title:           c.data.title,
        url:             c.data.is_self
          ? `https://reddit.com${c.data.permalink}`
          : c.data.url,
        summary:         c.data.selftext.slice(0, 400),
        source:          key,
        sourceLabel:     `r/${subreddit}`,
        publishedAt:     new Date(c.data.created_utc * 1000),
        engagementScore: c.data.score,
        authorityWeight: weight,
      }))
  } catch {
    return []
  }
}

// ─── RSS feeds ────────────────────────────────────────────────────────────────

async function fetchRSSFeed(feed: typeof RSS_FEEDS[0]): Promise<RawStory[]> {
  try {
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': 'ThePromptBot/1.0 (news aggregator)', Accept: 'application/rss+xml,application/xml,text/xml' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []
    const xml = await res.text()
    return parseRssFeed(xml, feed.key, feed.label)
  } catch {
    return []
  }
}

// ─── Fetch all sources in parallel ───────────────────────────────────────────

export async function fetchAllSources(): Promise<RawStory[]> {
  const results = await Promise.allSettled([
    fetchHackerNews(),
    fetchReddit('artificial'),
    fetchReddit('MachineLearning'),
    fetchReddit('singularity'),
    fetchReddit('OpenAI'),
    ...RSS_FEEDS.map(feed => fetchRSSFeed(feed)),
  ])

  const stories: RawStory[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') stories.push(...r.value)
  }
  return stories
}

// ─── Deduplication against DB ─────────────────────────────────────────────────

export async function deduplicateAgainstDB(
  stories: RawStory[],
  db: SupabaseClient,
  projectId: string,
): Promise<RawStory[]> {
  // Fetch recently seen URLs (last 14 days)
  const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString()
  const { data: existingItems } = await db
    .from('media_news_items')
    .select('url, title')
    .eq('project_id', projectId)
    .gte('created_at', since)

  const seenUrls = new Set((existingItems ?? []).map(i => i.url?.toLowerCase()))
  const seenTitles = new Set(
    (existingItems ?? []).map(i =>
      i.title?.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50),
    ),
  )

  // Also dedup within the fetched batch
  const batchUrls = new Set<string>()

  return stories.filter(s => {
    const url = s.url.toLowerCase()
    const titleKey = s.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50)

    if (seenUrls.has(url) || seenTitles.has(titleKey) || batchUrls.has(url)) return false
    batchUrls.add(url)
    return true
  })
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

function computeViralityScore(story: RawStory): number {
  const now = Date.now()
  const ageHours = (now - story.publishedAt.getTime()) / 3600000

  // Recency score: exponential decay, half-life ~12h
  const recencyScore = Math.exp(-0.0578 * ageHours)  // 0.693/12 ≈ 0.0578

  // Engagement score: log scale, cap at 2000
  const engCapped = Math.min(story.engagementScore, 2000)
  const engScore = engCapped > 0 ? Math.log10(engCapped + 1) / Math.log10(2001) : 0

  // Composite: authority 30%, engagement 40%, recency 30%
  const raw = story.authorityWeight * 0.30 + engScore * 0.40 + recencyScore * 0.30

  return Math.round(raw * 100)
}

export function scoreAndRank(stories: RawStory[]): ScoredStory[] {
  return stories
    .map(s => ({ ...s, viralityScore: computeViralityScore(s) }))
    .sort((a, b) => b.viralityScore - a.viralityScore)
}

// ─── Claude editorial pick ────────────────────────────────────────────────────

export async function claudeEditorialPick(
  stories: ScoredStory[],
  maxCandidates = 3,
  trendingTopics: string[] = [],   // Optional: trending topics from Hermes to guide selection
): Promise<{ candidates: HunterCandidate[]; summary: string }> {
  const claude = new Anthropic()

  // Feed top 20 to Claude for editorial judgment
  const top20 = stories.slice(0, 20)

  const storiesList = top20
    .map((s, i) =>
      `[${i + 1}] ${s.title}
   Source: ${s.sourceLabel} | Score: ${s.viralityScore}/100 | Age: ${Math.round((Date.now() - s.publishedAt.getTime()) / 3600000)}h ago
   Summary: ${s.summary.slice(0, 200) || '(no summary)'}
   URL: ${s.url}`,
    )
    .join('\n\n')

  // Build trend context block if we have trending topics
  const trendBlock = trendingTopics.length > 0
    ? `\n\nCURRENT TRENDING TOPICS (from Google Trends, Reddit & HackerNews right now):
${trendingTopics.slice(0, 12).map((t, i) => `${i + 1}. ${t}`).join('\n')}

IMPORTANT: If any news story relates to or expands on one of these trending topics, strongly prefer it. Stories that match what people are actively searching for will get significantly more reach.`
    : ''

  const systemPrompt = `You are the editorial director of "The Prompt" — a premium AI news channel on Instagram and TikTok.

Brand voice: Bloomberg QuickTake meets Wired Magazine. Factual, fast-paced, retention-optimized. NOT hype.

Your job: Given a ranked list of AI news stories, pick the ${maxCandidates} BEST for short-form video.

Selection criteria (in order of importance):
1. TREND ALIGNMENT — if a story matches current trending searches/discussions, it gets higher reach
2. GENUINE NEWS VALUE — something actually happened, not speculation or roundup
3. BROAD APPEAL — interesting to smart non-experts, not just ML researchers
4. FRESHNESS — breaking or same-day is ideal
5. VISUAL POTENTIAL — can we make a compelling 60-second video from this?
6. UNIQUENESS — avoid "another AI chatbot" stories unless truly landmark

AVOID:
- Lists ("Top 10 AI tools"), roundups, opinion pieces without news hook
- Stories already told many times (ChatGPT's nth update, etc.)
- Pure research papers with no real-world impact angle yet
- Drama/controversy without substantive news value

Return ONLY valid JSON (no markdown fences):
{
  "picks": [
    {
      "rank": 1,
      "storyIndex": <1-based index from the list>,
      "editorialNote": "One sentence on why this is the best pick today",
      "suggestedAngle": "educational|controversial|inspiring|practical",
      "estimatedViralityScore": 85
    }
  ],
  "summary": "One sentence describing today's AI news landscape"
}`

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `Today's AI news candidates:\n\n${storiesList}${trendBlock}\n\nPick the ${maxCandidates} best for short-form video.`,
    }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : ''
  const clean = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

  let parsed: { picks: Array<{ rank: number; storyIndex: number; editorialNote: string; suggestedAngle: string; estimatedViralityScore: number }>; summary: string }
  try {
    parsed = JSON.parse(clean)
  } catch {
    // Fallback: return top N by score
    const fallbackCandidates: HunterCandidate[] = top20.slice(0, maxCandidates).map((s, i) => ({
      rank: i + 1,
      story: s,
      editorialNote: 'Auto-selected by virality score (Claude parse error)',
      suggestedAngle: 'educational' as const,
      estimatedViralityScore: s.viralityScore,
    }))
    return { candidates: fallbackCandidates, summary: 'News hunter ran but Claude returned invalid JSON.' }
  }

  const candidates: HunterCandidate[] = parsed.picks.map(pick => ({
    rank: pick.rank,
    story: top20[pick.storyIndex - 1] ?? top20[0],
    editorialNote: pick.editorialNote,
    suggestedAngle: (pick.suggestedAngle as HunterCandidate['suggestedAngle']) ?? 'educational',
    estimatedViralityScore: pick.estimatedViralityScore,
  })).filter(c => c.story)

  return { candidates, summary: parsed.summary }
}

// ─── Main orchestrator ────────────────────────────────────────────────────────

export async function runNewsHunter(
  db: SupabaseClient,
  projectId: string,
  maxCandidates = 3,
  trendingTopics: string[] = [],   // Optional: from Hermes /trends
): Promise<HunterResult> {
  const fetchedAt = new Date().toISOString()

  // 1. Fetch all sources
  const allStories = await fetchAllSources()

  // 2. Dedup against DB
  const fresh = await deduplicateAgainstDB(allStories, db, projectId)

  // 3. Score and rank
  const scored = scoreAndRank(fresh)

  // 4. Claude picks the best — with optional trend context
  const { candidates, summary } = await claudeEditorialPick(scored, maxCandidates, trendingTopics)

  return {
    fetchedAt,
    totalFetched: allStories.length,
    afterDedup: fresh.length,
    candidates,
    claudeSummary: summary,
  }
}
