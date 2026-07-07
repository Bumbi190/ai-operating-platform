/**
 * lib/article/ground.ts
 *
 * Build the grounding corpus for an article. Strong mode = full source text from
 * Hermes read; weak mode = the news item's own summary/key_insight (degraded).
 *
 * Pure helper around the input: if groundingText is already supplied it's used as-is.
 * The Hermes fetch lives in buildGroundingFromSource (caller decides whether to fetch).
 */

import { callHermesRead, isHermesConfigured } from '@/lib/media/hermes'
import type { ArticleWriterInput, GroundingResult, NewsItemInput } from './types'

const STRONG_MIN_WORDS = 150

function wordCount(text: string): number {
  const t = text.trim()
  return t ? t.split(/\s+/).length : 0
}

function fallbackText(item: NewsItemInput): string {
  return [item.title, item.summary, item.key_insight ? `Key insight: ${item.key_insight}` : '']
    .filter(Boolean)
    .join('\n\n')
}

/** Resolve grounding from input that may already carry groundingText. */
export function resolveGrounding(input: ArticleWriterInput): GroundingResult {
  const supplied = (input.groundingText ?? '').trim()
  if (supplied && wordCount(supplied) >= STRONG_MIN_WORDS) {
    return { text: supplied, mode: 'strong', wordCount: wordCount(supplied), source: 'hermes' }
  }
  const fb = fallbackText(input.newsItem)
  return { text: fb, mode: 'weak', wordCount: wordCount(fb), source: 'news_item' }
}

/**
 * Fetch grounding from the source URL via Hermes (when configured), with graceful
 * fallback to the news item's own fields. Returns the GroundingResult to feed the Writer.
 */
export async function buildGroundingFromSource(item: NewsItemInput): Promise<GroundingResult> {
  if (item.url && isHermesConfigured()) {
    try {
      const read = await callHermesRead(item.url)
      const text = (read?.text ?? '').trim()
      if (read?.success && wordCount(text) >= STRONG_MIN_WORDS) {
        return { text, mode: 'strong', wordCount: wordCount(text), source: 'hermes' }
      }
    } catch {
      // fall through to weak grounding
    }
  }
  const fb = fallbackText(item)
  return { text: fb, mode: 'weak', wordCount: wordCount(fb), source: 'news_item' }
}
