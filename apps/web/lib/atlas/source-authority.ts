/**
 * lib/atlas/source-authority.ts — Atlas Signal Platform, source authority data.
 *
 * Authority data — NOT algorithm. Lives outside lib/atlas/impact-score.ts on
 * purpose: the engine should know nothing about WHERE authority values
 * come from. Today it's a const map; v2 will be a DB-backed table with
 * caching; v3 may combine multiple sources (DB + LLM-rated + citation
 * graph). `loadAuthorityMap` is async from start so swapping the
 * implementation later is a zero-caller change.
 *
 * Caller responsibility: pre-load the authority map before calling
 * computeScore. The engine reads `ScoreInput.sourceAuthority` (a plain
 * Record) and never reaches for I/O of its own.
 *
 * See OMNIRA_ATLAS_BRIEF_ADR.md → "Source authority — separate concern".
 */

/**
 * Neutral fallback authority for sources not in the v1 list.
 * 50 is the explicit "we have no information about this source" value,
 * not "we think this source is mediocre." When a source becomes known
 * enough to rate, we add it to SOURCE_AUTHORITY.
 */
export const DEFAULT_AUTHORITY = 50

/**
 * v1 authority table. Keys are lowercased source names; lookup is
 * case-insensitive. This list is part of SCORE_ENGINE_VERSION 1.0.0 — any
 * change to its values bumps the version on the engine side so historic
 * scores remain interpretable.
 *
 * Curation principle: only sources we can defend in public methodology.
 * Unknown sources fall back to DEFAULT_AUTHORITY — neutral, honest.
 */
const SOURCE_AUTHORITY: Record<string, number> = {
  // Tier 1 — wire services and newspapers of record
  'bloomberg':             95,
  'financial times':       95,
  'wall street journal':   95,
  'reuters':               92,
  'the economist':         92,
  'economist':             92,
  'new york times':        90,
  'nyt':                   90,
  'associated press':      92,
  'ap':                    92,

  // Tier 2 — technology-specialist publications
  'mit technology review': 88,
  'mit tech review':       88,  // alias — media_news_items naming convention
  'wired':                 85,
  'wired ai':              85,  // alias — media_news_items naming convention
  'ars technica':          82,
  'the verge':             75,
  'techcrunch':            72,
  'the information':       85,
  'semafor':               78,

  // Tier 3 — primary sources from AI labs and major orgs
  'openai blog':           90,
  'openai':                90,
  'anthropic blog':        90,
  'anthropic':             90,
  'deepmind blog':         90,
  'google deepmind':       90,
  'meta ai':               85,
  'microsoft research':    85,
  'nvidia blog':           82,
  'hugging face':          78,
  'arxiv':                 80,

  // Tier 4 — recognized industry analysis
  'stratechery':           80,
  'platformer':            78,
}

/**
 * Pre-load authority values for a set of source names. Returns a map keyed
 * by the source name AS THE CALLER PROVIDED IT (preserving original casing
 * for downstream display) — lookup is case-insensitive internally.
 *
 * Async from start. v1 wraps a const lookup in Promise.resolve. v2 will
 * issue a DB query. The signature does not change between versions.
 *
 * Empty input → empty map (no extra I/O).
 */
export async function loadAuthorityMap(
  sourceNames: string[],
): Promise<Record<string, number>> {
  if (sourceNames.length === 0) return {}
  const map: Record<string, number> = {}
  for (const name of sourceNames) {
    const key = name.trim().toLowerCase()
    map[name] = SOURCE_AUTHORITY[key] ?? DEFAULT_AUTHORITY
  }
  return map
}
