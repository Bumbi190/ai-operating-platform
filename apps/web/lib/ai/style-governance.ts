/**
 * style-governance.ts
 *
 * Central style token configuration for all image generation in Familje-Stunden.
 * These tokens are injected automatically into every image prompt in runner.ts.
 *
 * ARCHITECTURE:
 *   - Forbidden styles prevent gpt-image-1/Ideogram from drifting to cinematic rendering
 *   - Required styles lock the visual tone to flat cartoon children's book
 *   - Golden master paths point to reference images used by Vision QA scoring
 *   - Thresholds define minimum acceptable scores for each quality dimension
 *
 * USAGE:
 *   import { buildStylePrefix, STYLE_CONSTRAINTS } from '@/lib/ai/style-governance'
 *   const prompt = `${buildStylePrefix(mode)} ${sceneDescription}`
 */

// ─── Style Constraints ───────────────────────────────────────────────────────

export const STYLE_CONSTRAINTS = {
  /**
   * These keywords/styles should never appear in AI-generated illustrations.
   * Injected as negative guidance into prompts.
   */
  forbidden: [
    'cinematic lighting',
    'dramatic lighting',
    'volumetric lighting',
    'painterly texture',
    'oil painting',
    'realistic rendering',
    'photorealistic',
    'dark shadows',
    'moody atmosphere',
    'chiaroscuro',
    'HDR',
    '3D render',
    'CGI',
  ] as const,

  /**
   * These qualities should always be present in AI-generated illustrations.
   * Injected as positive guidance into prompts.
   */
  required: [
    'bright even daylight',
    'flat soft shading',
    'minimal texture',
    'simple color gradients',
    'vector-like clean lines',
    'cheerful warm palette',
    'child-safe visual tone',
    'vibrant saturated colors',
    'clean bold shapes',
  ] as const,

  /**
   * Color constraints for all illustration modes.
   */
  colors: {
    noValuesBelowHex: '#555555',   // No dark values — keeps images bright
    paletteStyle: 'primary colors, pastel accents, warm tones',
    background: 'bright, never dark or moody',
  },

  /**
   * Composition constraints per illustration mode.
   */
  composition: {
    saga: 'portrait 2:3, characters centered, scene fills frame',
    activity: 'square 1:1, scene fills top 65%, bottom 35% is soft pastel gradient (blank)',
    cover: 'portrait 2:3, title text prominently rendered in the illustration',
    coloring: 'square 1:1, black outlines on white background, no filled areas',
  },
} as const

// ─── Golden Master Reference Paths ──────────────────────────────────────────

/**
 * Storage paths for golden master reference images.
 * These are perfect reference images used by Vision QA scoring to grade
 * new generations. They are NOT used as generation references (images.edit()
 * has weak style enforcement — golden masters are comparison targets only).
 *
 * Store at: Supabase storage / run-images / golden-masters /
 */
export const GOLDEN_MASTERS = {
  saga:     'golden-masters/saga-master.png',
  activity: 'golden-masters/activity-master.png',
  cover:    'golden-masters/cover-master.png',
  coloring: 'golden-masters/coloring-master.png',
} as const

// ─── Vision QA Thresholds ────────────────────────────────────────────────────

/**
 * Minimum acceptable scores (0–10) for Vision QA scoring.
 * A generated image must meet all thresholds to be accepted.
 * If any dimension falls below threshold: retry with stronger constraints.
 */
export const QA_THRESHOLDS = {
  brightness:      7,   // How bright/light the overall image feels
  flatness:        7,   // How flat/vector-like vs painterly/rendered
  childReadability: 7,  // How clear and readable for a young child
  novaConsistency:  6,  // How well Nova matches her canonical design
  plingConsistency: 6,  // How well Pling matches his canonical design
  brandAlignment:   6,  // How well the image fits Familje-Stunden brand
  overallMinimum:   6,  // Weighted average floor
} as const

// ─── Prompt Builders ─────────────────────────────────────────────────────────

type IllustrationMode = 'saga' | 'activity' | 'cover' | 'coloring'

/**
 * Builds the style governance prefix for an image prompt.
 * This prefix is prepended to every image generation prompt to enforce
 * consistent style constraints regardless of which AI model is used.
 *
 * @param mode - The illustration mode determines composition guidance
 * @returns A string to prepend to the scene-specific prompt
 */
export function buildStylePrefix(mode: IllustrationMode): string {
  const required = STYLE_CONSTRAINTS.required.join(', ')
  const forbidden = STYLE_CONSTRAINTS.forbidden.map(f => `NO ${f}`).join(', ')
  const composition = STYLE_CONSTRAINTS.composition[mode]

  return `Bright flat cartoon children's book illustration. Required style: ${required}. Forbidden: ${forbidden}. Composition: ${composition}.`
}

/**
 * Returns the Vision QA scoring prompt for use with Claude Vision.
 * Pass this to claude-haiku with the generated image attached.
 *
 * @param mode - Illustration mode for mode-specific scoring guidance
 * @returns Structured scoring prompt as a string
 */
export function buildQaScoringPrompt(mode: IllustrationMode): string {
  const { brightness, flatness, childReadability, novaConsistency, plingConsistency, brandAlignment } = QA_THRESHOLDS
  return `Score this ${mode} illustration for Familje-Stunden (a Swedish children's subscription service) on these dimensions. Return ONLY valid JSON, no prose.

Scoring dimensions (each 0–10):
- brightness: Is the image bright, cheerful, light? (target ≥${brightness})
- flatness: Is it flat/vector-like cartoon style, NOT painterly or cinematic? (target ≥${flatness})
- childReadability: Are shapes clean, clear, simple enough for a young child? (target ≥${childReadability})
- novaConsistency: Does the girl (if present) have ponytail + pink headband + round face? (target ≥${novaConsistency}, or 10 if Nova not in scene)
- plingConsistency: Does the robot (if present) have dome head + yellow heart on chest? (target ≥${plingConsistency}, or 10 if Pling not in scene)
- brandAlignment: Does this feel warm, cheerful, and appropriate for Familje-Stunden? (target ≥${brandAlignment})

Return:
{
  "brightness": <0-10>,
  "flatness": <0-10>,
  "childReadability": <0-10>,
  "novaConsistency": <0-10>,
  "plingConsistency": <0-10>,
  "brandAlignment": <0-10>,
  "overallScore": <weighted average>,
  "passed": <true if all dimensions meet thresholds>,
  "issues": ["list of specific problems if any"],
  "suggestion": "one sentence on what to change in prompt if retrying"
}`
}
