/**
 * content-evaluator.ts
 *
 * Main evaluation pipeline for The Prompt platform.
 *
 * Flow: Generate → evaluate(content) → EvaluationResult → store in DB
 *
 * Architecture:
 *   - Deterministic heuristics run first (fast, free, always)
 *   - Optional Haiku call for nuanced scoring (hook strength, brand voice)
 *   - No recursive loops, no autonomous decisions
 *   - Human always makes the final approval call
 *
 * Scoring dimensions (all 0–10, higher = better EXCEPT slop_score):
 *   hook_strength   — Does the opening create genuine curiosity?
 *   slop_score      — AI slop density (higher = MORE slop = worse)
 *   brand_alignment — Matches The Prompt editorial voice
 *   specificity     — Concrete facts vs vague generalities
 *   pacing_quality  — Sentence rhythm, varied length, punch
 *   overall_score   — Weighted composite (slop inverted in calculation)
 */

import Anthropic from '@anthropic-ai/sdk'
import { detectSlop, slopToQualityScore } from './slop-detector'
import { toJson } from '@/lib/supabase/json'

// ─── Types ───────────────────────────────────────────────────────────────────

export type ContentType = 'script' | 'hook' | 'caption' | 'image_prompt' | 'news' | 'text'

export interface EvaluationInput {
  content: string
  contentType: ContentType
  /** Optional: run the more expensive Haiku scoring pass */
  deepScore?: boolean
}

export interface ScoreIssue {
  dimension: string
  detail: string
}

export interface EvaluationResult {
  // Scores
  hookStrength:    number | null
  slopScore:       number        // 0–10, higher = more slop
  brandAlignment:  number | null
  specificity:     number
  pacingQuality:   number
  overallScore:    number

  // Gate
  passed: boolean

  // Signals
  hardFails:   string[]
  softFails:   string[]
  passSignals: string[]
  slopPhrases: string[]

  // Reasoning
  issues:     ScoreIssue[]
  suggestion: string | null

  // For storage
  contentPreview: string
}

// ─── Brand Voice Heuristics ───────────────────────────────────────────────────
// The Prompt brand: fast, factual, premium — Bloomberg QuickTake meets AI.
// Smart but accessible, no jargon without explanation.

const BRAND_POSITIVE_SIGNALS: readonly string[] = [
  // Specificity markers
  /\d{4}/.source,           // years
  /\$[\d,.]+/.source,       // dollar amounts
  /\d+%/.source,            // percentages
  /\d+[xX]/.source,         // multipliers
]

const BRAND_NEGATIVE_SIGNALS: readonly string[] = [
  'in today',
  'the future of',
  'everything we know',
  'changing the world',
  'will never be the same',
  'you won\'t believe',
  'mind-blowing',
  'insane',
  'absolutely incredible',
  'crazy thing happened',
]

// Hard fails for The Prompt brand specifically
const BRAND_HARD_FAILS: readonly string[] = [
  'stay tuned',
  'smash that like button',
  'hit that subscribe',
  'links in bio',
  "don't miss out",
  'limited time offer',
  'act now',
]

// ─── Deterministic Scorers ───────────────────────────────────────────────────

function scorePacing(text: string): { score: number; issues: string[] } {
  const issues: string[] = []
  const sentences = text
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0)

  if (sentences.length === 0) return { score: 5, issues: ['No sentences detected'] }

  const lengths = sentences.map(s => s.split(/\s+/).length)
  const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length
  const maxLength = Math.max(...lengths)

  let score = 10

  // Penalise very long sentences (The Prompt style: max ~12 words)
  if (maxLength > 20) {
    score -= 2
    issues.push(`Sentence too long (${maxLength} words) — target max 12`)
  } else if (maxLength > 15) {
    score -= 1
    issues.push(`Some long sentences (${maxLength} words max)`)
  }

  // Penalise very short scripts with no rhythm variation
  if (sentences.length < 3) {
    score -= 1
    issues.push('Too few sentences to evaluate pacing')
  }

  // Penalise monotonous length (all sentences same length = robotic)
  const lengthVariance = lengths.reduce((acc, l) => acc + Math.abs(l - avgLength), 0) / lengths.length
  if (lengthVariance < 1.5 && sentences.length > 3) {
    score -= 1
    issues.push('Monotonous sentence length — vary short and long for rhythm')
  }

  return { score: Math.max(0, score), issues }
}

function scoreSpecificity(text: string): { score: number; issues: string[] } {
  const issues: string[] = []
  let score = 5  // baseline

  // Positive signals: numbers, dates, named entities give specificity
  const hasNumbers = /\d+/.test(text)
  const hasDollarAmounts = /\$[\d,.]+[BMK]?/.test(text)
  const hasPercentages = /\d+(\.\d+)?%/.test(text)
  const hasYear = /\b(20\d{2}|19\d{2})\b/.test(text)
  const hasMultiplier = /\d+[xX]\b/.test(text)
  const hasNamedEntity = /\b(Google|Apple|OpenAI|Anthropic|Meta|Microsoft|Amazon|Tesla|NVIDIA|Sam Altman|Demis Hassabis|Yann LeCun|Geoffrey Hinton)\b/.test(text)

  if (hasNumbers) score += 0.5
  if (hasDollarAmounts) score += 1.0
  if (hasPercentages) score += 1.0
  if (hasYear) score += 0.5
  if (hasMultiplier) score += 0.5
  if (hasNamedEntity) score += 1.5

  // Negative signals: vague qualifiers
  const vagueCount = (text.match(/\b(some|many|various|certain|several|a lot of|lots of|huge|massive)\b/gi) ?? []).length
  if (vagueCount > 3) {
    score -= 1.5
    issues.push(`${vagueCount} vague quantifiers — replace with specific numbers`)
  } else if (vagueCount > 1) {
    score -= 0.5
  }

  // Very short content can't be specific
  if (text.trim().length < 50) {
    score -= 1
    issues.push('Content too short to evaluate specificity')
  }

  return { score: Math.min(10, Math.max(0, score)), issues }
}

function scoreBrandAlignment(text: string): { score: number; hardFails: string[]; softFails: string[] } {
  const lower = text.toLowerCase()
  let score = 7  // start positive — assume OK
  const hardFails: string[] = []
  const softFails: string[] = []

  // Hard fails for The Prompt brand
  for (const phrase of BRAND_HARD_FAILS) {
    if (lower.includes(phrase)) {
      hardFails.push(phrase)
      score -= 2.5
    }
  }

  // Negative brand signals
  for (const phrase of BRAND_NEGATIVE_SIGNALS) {
    if (lower.includes(phrase)) {
      softFails.push(phrase)
      score -= 0.75
    }
  }

  // Positive brand signals (specificity proxies)
  for (const pattern of BRAND_POSITIVE_SIGNALS) {
    if (new RegExp(pattern).test(text)) {
      score += 0.5
    }
  }

  // The Prompt is English — penalise if mostly non-English (simple check)
  const nonAscii = (text.match(/[^\x00-\x7F]/g) ?? []).length
  if (nonAscii > text.length * 0.3) {
    softFails.push('High non-ASCII ratio — The Prompt targets English audiences')
    score -= 1
  }

  return { score: Math.min(10, Math.max(0, score)), hardFails, softFails }
}

// ─── LLM-powered Hook Scorer ─────────────────────────────────────────────────

/**
 * Scores hook strength using claude-haiku (fast + cheap).
 * Only called when deepScore: true.
 */
async function scoreHookWithHaiku(
  hookText: string
): Promise<{ score: number; passSignals: string[]; issues: ScoreIssue[]; suggestion: string }> {
  const client = new Anthropic()

  const prompt = `You are a script quality evaluator for "The Prompt" — an AI news channel.
Brand: Bloomberg QuickTake meets AI. Tone: fast, factual, premium. No hype.

Evaluate this hook (opening 1–3 sentences of a video script):
---
${hookText.slice(0, 500)}
---

Score the hook 0–10 on curiosity creation. Consider:
- Does it make the viewer NEED to know what happens next?
- Is it specific (has a number, name, or fact)?
- Does it avoid generic AI hype language?
- Is it punchy — max 12 words per sentence?

Return ONLY valid JSON, no prose:
{
  "score": 7.5,
  "pass_signals": ["specific claim", "creates tension"],
  "issues": [{"dimension": "specificity", "detail": "missing a concrete number"}],
  "suggestion": "Add a specific statistic to make it feel real"
}`

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')

    const parsed = JSON.parse(jsonMatch[0])
    return {
      score: typeof parsed.score === 'number' ? Math.min(10, Math.max(0, parsed.score)) : 5,
      passSignals: Array.isArray(parsed.pass_signals) ? parsed.pass_signals : [],
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      suggestion: typeof parsed.suggestion === 'string' ? parsed.suggestion : null,
    }
  } catch {
    // Fallback: return neutral score if Haiku fails
    return { score: 5, passSignals: [], issues: [], suggestion: null }
  }
}

// ─── Main Evaluator ───────────────────────────────────────────────────────────

/**
 * Evaluate a piece of content and return scored EvaluationResult.
 *
 * Usage:
 *   const result = await evaluate({ content: script, contentType: 'script', deepScore: true })
 *   if (!result.passed) { show to human for review }
 */
export async function evaluate(input: EvaluationInput): Promise<EvaluationResult> {
  const { content, contentType, deepScore = false } = input

  // ── 1. Slop detection (always runs) ──────────────────────────────────────
  const slopResult = detectSlop(content)

  // ── 2. Pacing (always runs) ───────────────────────────────────────────────
  const pacingResult = scorePacing(content)

  // ── 3. Specificity (always runs) ─────────────────────────────────────────
  const specificityResult = scoreSpecificity(content)

  // ── 4. Brand alignment (always runs) ─────────────────────────────────────
  const brandResult = scoreBrandAlignment(content)

  // ── 5. Hook scoring (LLM — only with deepScore) ──────────────────────────
  let hookStrength: number | null = null
  let hookPassSignals: string[] = []
  let hookIssues: ScoreIssue[] = []
  let hookSuggestion: string | null = null

  if (deepScore && (contentType === 'script' || contentType === 'hook')) {
    // Extract hook: first 1–3 sentences
    const hookText = content.split(/[.!?]+/).slice(0, 3).join('. ')
    const hookResult = await scoreHookWithHaiku(hookText)
    hookStrength = hookResult.score
    hookPassSignals = hookResult.passSignals
    hookIssues = hookResult.issues
    hookSuggestion = hookResult.suggestion
  }

  // ── 6. Collect all issues ─────────────────────────────────────────────────
  const issues: ScoreIssue[] = []

  if (slopResult.score >= 3) {
    issues.push({
      dimension: 'slop',
      detail: `${slopResult.verdict.replace('_', ' ')}: "${slopResult.phrasesFound.slice(0, 3).join('", "')}"`,
    })
  }
  for (const i of pacingResult.issues) {
    issues.push({ dimension: 'pacing', detail: i })
  }
  for (const i of specificityResult.issues) {
    issues.push({ dimension: 'specificity', detail: i })
  }
  if (brandResult.hardFails.length > 0) {
    issues.push({
      dimension: 'brand',
      detail: `Hard fail phrases: "${brandResult.hardFails.join('", "')}"`,
    })
  }
  if (brandResult.softFails.length > 0) {
    issues.push({
      dimension: 'brand',
      detail: `Brand tone issues: "${brandResult.softFails.join('", "')}"`,
    })
  }
  for (const i of hookIssues) {
    issues.push(i)
  }

  // ── 7. Collect pass signals ───────────────────────────────────────────────
  const passSignals: string[] = [...hookPassSignals]
  if (slopResult.score === 0) passSignals.push('No slop language detected')
  if (specificityResult.score >= 7) passSignals.push('Good specificity — concrete facts present')
  if (pacingResult.score >= 8) passSignals.push('Strong pacing — varied sentence rhythm')
  if (brandResult.hardFails.length === 0 && brandResult.softFails.length === 0) {
    passSignals.push('Clean brand voice')
  }

  // ── 8. Calculate overall score ────────────────────────────────────────────
  // Weights: slop gets inverted (clean slop = good quality score)
  const slopQuality = slopToQualityScore(slopResult.score)

  const scores: { score: number; weight: number }[] = [
    { score: slopQuality,                weight: 0.25 },  // slop is a strong signal
    { score: specificityResult.score,    weight: 0.25 },  // specificity matters most for The Prompt
    { score: brandResult.score,          weight: 0.25 },  // brand voice
    { score: pacingResult.score,         weight: 0.15 },  // pacing
    ...(hookStrength !== null ? [{ score: hookStrength, weight: 0.10 }] : []),
  ]

  // Renormalise weights if no hook score
  const totalWeight = scores.reduce((a, s) => a + s.weight, 0)
  const overallScore = Math.round(
    (scores.reduce((a, s) => a + s.score * s.weight, 0) / totalWeight) * 10
  ) / 10

  // ── 9. Pass/fail gate ─────────────────────────────────────────────────────
  const hasHardBrandFail = brandResult.hardFails.length > 0
  const isTooSloppy = slopResult.score >= 6
  const passed =
    overallScore >= 5.5 &&
    !hasHardBrandFail &&
    !isTooSloppy

  // ── 10. Build suggestion ──────────────────────────────────────────────────
  const suggestion =
    hookSuggestion ??
    (isTooSloppy     ? `Remove slop phrases: ${slopResult.phrasesFound.slice(0, 2).join(', ')}` :
     hasHardBrandFail ? `Remove brand hard-fail phrases: ${brandResult.hardFails.join(', ')}` :
     specificityResult.score < 5 ? 'Add a specific number, name, or date to ground the content' :
     null)

  return {
    hookStrength,
    slopScore:      slopResult.score,
    brandAlignment: brandResult.score,
    specificity:    specificityResult.score,
    pacingQuality:  pacingResult.score,
    overallScore,
    passed,
    hardFails:      [...brandResult.hardFails, ...slopResult.structuralIssues.filter(s => s.includes('Hard'))],
    softFails:      [...brandResult.softFails, ...slopResult.structuralIssues],
    passSignals,
    slopPhrases:    slopResult.phrasesFound,
    issues,
    suggestion,
    contentPreview: content.slice(0, 300),
  }
}

// ─── Convenience wrapper for storing results in DB ───────────────────────────

/**
 * Maps EvaluationResult to a DB-insertable object for the evaluations table.
 */
export function toDbRecord(
  result: EvaluationResult,
  opts: {
    projectId: string
    contentType: ContentType
    outputId?: string
    scriptId?: string
  }
) {
  return {
    project_id:      opts.projectId,
    content_type:    opts.contentType,
    output_id:       opts.outputId ?? null,
    script_id:       opts.scriptId ?? null,
    hook_strength:   result.hookStrength,
    slop_score:      result.slopScore,
    brand_alignment: result.brandAlignment,
    specificity:     result.specificity,
    pacing_quality:  result.pacingQuality,
    overall_score:   result.overallScore,
    passed:          result.passed,
    hard_fails:      result.hardFails,
    soft_fails:      result.softFails,
    pass_signals:    result.passSignals,
    slop_phrases:    result.slopPhrases,
    issues:          toJson(result.issues),
    suggestion:      result.suggestion,
    content_preview: result.contentPreview,
  }
}
