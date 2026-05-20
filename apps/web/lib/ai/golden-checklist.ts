/**
 * golden-checklist.ts
 *
 * Lightweight Vision QA gate for Familje-Stunden image generation.
 * Purpose: reject obviously bad generations before they reach the PDF.
 *
 * NOT autonomous multi-stage orchestration.
 * NOT exact image similarity comparison.
 * IS a simple PASS / FAIL quality gate based on emotional/style signals.
 *
 * Max 1 retry per image. No infinite loops.
 */

// ─── Hard Fails ──────────────────────────────────────────────────────────────
// Any of these = automatic FAIL. Regenerate once.

export const HARD_FAILS = [
  'cinematic lighting',
  'painterly style',
  'realistic rendering',
  'dark mood or atmosphere',
  'cluttered composition',
  'too much background detail',
  'incorrect Nova appearance',
  'incorrect Pling proportions',
  'text inside image',
  'distorted anatomy',
  'visible AI artifacts',
  'multiple competing focal points',
  'inconsistent art style within image',
] as const

// ─── Soft Fails ──────────────────────────────────────────────────────────────
// These reduce score but don't force regeneration alone.

export const SOFT_FAILS = [
  'slightly busy background',
  'muted or dull colors',
  'weak focal point',
  'excessive shading or gradients',
  'slightly inconsistent character proportions',
] as const

// ─── Pass Signals ────────────────────────────────────────────────────────────
// These confirm the image meets Familje-Stunden quality standard.

export const PASS_SIGNALS = [
  'flat cartoon style',
  'bright cheerful colors',
  'warm emotional tone',
  'simple readable composition',
  'strong clear focal point',
  'Nova looks consistent',
  'Pling is small and friendly',
  'clean bold outlines',
  'family-safe and cozy feel',
  'feels hand-directed not AI-generic',
  'matches Familje-Stunden visual identity',
] as const

// ─── QA Prompt Builder ───────────────────────────────────────────────────────

type IllustrationMode = 'saga' | 'activity' | 'cover' | 'coloring'

/**
 * Builds a short, deterministic Vision QA prompt.
 * Claude Vision returns PASS or FAIL with a score and one-line reason.
 *
 * @param mode - Illustration mode for context-specific guidance
 * @returns Prompt string for Claude claude-haiku-4-5 Vision
 */
export function buildVisionQaPrompt(mode: IllustrationMode): string {
  const hardFails = HARD_FAILS.join(', ')
  const passSignals = PASS_SIGNALS.slice(0, 5).join(', ')

  return `You are a visual QA reviewer for Familje-Stunden, a Swedish children's subscription service.

Evaluate this ${mode} illustration against the Familje-Stunden style standard.

FAIL immediately if you detect any of these: ${hardFails}.

PASS if the image shows: ${passSignals}.

Score the June parity (1–10): how closely does this match the warm, flat, cheerful cartoon style of a premium Swedish children's book?

Reply in EXACTLY this format — nothing else:

PASS
Score: X/10
Reason: one sentence

or

FAIL
Score: X/10
Reason: one sentence`
}
