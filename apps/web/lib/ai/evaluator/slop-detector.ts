/**
 * slop-detector.ts
 *
 * Deterministic heuristics for detecting "AI slop" in generated text.
 *
 * "AI slop" = generic, over-hyped, formulaic language that signals
 * low-effort AI output. No LLM call needed — pure pattern matching.
 *
 * Returns a score and the exact phrases found so the human
 * reviewer can see exactly why something was flagged.
 *
 * Score: 0–10 where 10 = maximum slop, 0 = clean.
 * (This is INVERTED from quality — higher slop = worse content.)
 */

// ─── Slop Pattern Definitions ────────────────────────────────────────────────

/**
 * Hard slop: phrases that almost always indicate generic AI output.
 * Each hit adds 1.5 points to slop score.
 */
export const HARD_SLOP_PHRASES: readonly string[] = [
  // Hype without substance
  'game-changer',
  'game changer',
  'revolutionary',
  'groundbreaking',
  'unprecedented',
  'cutting-edge',
  'cutting edge',
  'state-of-the-art',
  'state of the art',
  'next-generation',
  'next generation',
  'world-class',

  // Filler acknowledgements
  "it's important to note",
  "it is important to note",
  "it's worth noting",
  "it is worth noting",
  'it should be noted',
  'needless to say',
  'as we all know',
  'it goes without saying',

  // Corporate speak
  'leverage',
  'synergy',
  'paradigm shift',
  'paradigm-shift',
  'holistic approach',
  'thought leader',
  'thought leadership',
  'empower',
  'robust solution',
  'seamless experience',
  'end-to-end solution',
  'best-in-class',
  'value-add',

  // AI writing clichés
  'dive into',
  'delve into',
  "let's explore",
  "let's dive",
  'unpack this',
  'buckle up',
  'fasten your seatbelt',
  'the bottom line is',

  // Age-of-AI clichés
  "in today's fast-paced world",
  "in today's digital age",
  "in today's rapidly evolving",
  'the future is here',
  'the age of ai',
  'welcome to the future',
  'ai is changing everything',
  'ai is transforming',
  'ai will revolutionize',
  'ai will change everything',
  'ai-powered future',
  'accelerating pace of change',
]

/**
 * Soft slop: weaker signals. Each hit adds 0.5 points.
 */
export const SOFT_SLOP_PHRASES: readonly string[] = [
  'transform',
  'transformative',
  'disrupt',
  'disruptive',
  'innovative',
  'innovation',
  'reimagine',
  'ecosystem',
  'unlock the potential',
  'unlock potential',
  'stay ahead of the curve',
  'ahead of the curve',
  'at the end of the day',
  'touch base',
  'circle back',
  'move the needle',
  'bandwidth',  // when used metaphorically
  'going forward',
  'in the pipeline',
  'on the same page',
]

/**
 * Structural slop: patterns detected by regex, not phrase matching.
 */
interface StructuralCheck {
  name: string
  description: string
  test: (text: string) => boolean
  weight: number
}

export const STRUCTURAL_CHECKS: readonly StructuralCheck[] = [
  {
    name: 'starts_with_i',
    description: 'Script starts with "I " (sounds personal/generic)',
    test: (t) => /^I\s/m.test(t.trim()),
    weight: 1.0,
  },
  {
    name: 'exclamation_overuse',
    description: 'More than 2 exclamation marks (clickbait energy)',
    test: (t) => (t.match(/!/g) ?? []).length > 2,
    weight: 1.0,
  },
  {
    name: 'weak_cta',
    description: 'Ends with generic CTA ("What do you think?", "Let me know!")',
    test: (t) => {
      const end = t.slice(-80).toLowerCase()
      return (
        end.includes('what do you think?') ||
        end.includes('let me know!') ||
        end.includes('let me know what you think') ||
        end.includes("don't forget to like") ||
        end.includes("don't forget to subscribe")
      )
    },
    weight: 1.0,
  },
  {
    name: 'are_you_ready',
    description: 'Opens with "Are you ready to..." (overused scroll-stopper)',
    test: (t) => /^are you ready to/i.test(t.trim()),
    weight: 1.5,
  },
  {
    name: 'ellipsis_overuse',
    description: 'More than 3 ellipses (...) — padding / trailing off',
    test: (t) => (t.match(/\.\.\./g) ?? []).length > 3,
    weight: 0.5,
  },
  {
    name: 'all_caps_overuse',
    description: 'More than 2 ALL-CAPS words (shouting / clickbait)',
    test: (t) => {
      const capsWords = t.match(/\b[A-Z]{3,}\b/g) ?? []
      // Exclude known legitimate caps: AI, API, GPT, LLM, etc.
      const filtered = capsWords.filter(w =>
        !['AI', 'API', 'GPT', 'LLM', 'AGI', 'URL', 'CEO', 'CTO', 'US', 'UK', 'EU', 'UN'].includes(w)
      )
      return filtered.length > 2
    },
    weight: 0.5,
  },
]

// ─── Result Type ─────────────────────────────────────────────────────────────

export interface SlopResult {
  /** 0–10, higher = more slop (worse) */
  score: number
  /** Exact phrases found */
  phrasesFound: string[]
  /** Structural issues found */
  structuralIssues: string[]
  /** All signals combined for display */
  allSignals: string[]
  /** One-line verdict */
  verdict: 'clean' | 'minor_slop' | 'moderate_slop' | 'heavy_slop'
}

// ─── Main Detector ────────────────────────────────────────────────────────────

/**
 * Detect AI slop in a text string.
 * Returns a score (0–10) and the exact signals found.
 */
export function detectSlop(text: string): SlopResult {
  const lower = text.toLowerCase()
  let score = 0

  const phrasesFound: string[] = []
  const structuralIssues: string[] = []

  // Check hard slop phrases
  for (const phrase of HARD_SLOP_PHRASES) {
    if (lower.includes(phrase.toLowerCase())) {
      phrasesFound.push(phrase)
      score += 1.5
    }
  }

  // Check soft slop phrases
  for (const phrase of SOFT_SLOP_PHRASES) {
    if (lower.includes(phrase.toLowerCase())) {
      phrasesFound.push(phrase)
      score += 0.5
    }
  }

  // Check structural patterns
  for (const check of STRUCTURAL_CHECKS) {
    if (check.test(text)) {
      structuralIssues.push(check.description)
      score += check.weight
    }
  }

  // Clamp to 0–10
  score = Math.min(10, Math.round(score * 10) / 10)

  const allSignals = [...phrasesFound, ...structuralIssues]

  const verdict: SlopResult['verdict'] =
    score === 0   ? 'clean' :
    score <= 2.5  ? 'minor_slop' :
    score <= 5.0  ? 'moderate_slop' :
                    'heavy_slop'

  return { score, phrasesFound, structuralIssues, allSignals, verdict }
}

/**
 * Returns a clean slop score as a quality score (inverted: 10 = no slop).
 * Useful when you want higher = better consistency with other dimensions.
 */
export function slopToQualityScore(slopScore: number): number {
  return Math.round((10 - slopScore) * 10) / 10
}
