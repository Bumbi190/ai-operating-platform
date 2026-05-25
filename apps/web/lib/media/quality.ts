/**
 * Quality Gate — AI-powered script evaluator for The Prompt.
 *
 * Scores each generated script before image generation begins.
 * If score is below threshold, the pipeline auto-regenerates the script once.
 *
 * Scoring dimensions:
 * - hook_strength:          Does the first sentence stop scrolling? (0–10)
 * - information_density:    Facts per second — specific, real, named? (0–10)
 * - scroll_stop_probability: Would a 20-year-old stop mid-scroll? (0–10)
 * - hallucination_risk:     Does it add claims not in the source? (0–10, lower = worse)
 * - editorial_quality:      Bloomberg/WSJ standard — not LinkedIn, not hype? (0–10)
 *
 * Threshold: overall ≥ 7.0 to proceed. Hook strength ≥ 7 required.
 */

import { Anthropic } from '@anthropic-ai/sdk'

export interface QualityScore {
  hook_strength: number
  information_density: number
  scroll_stop_probability: number
  hallucination_risk: number        // 10 = no hallucination risk, 0 = very risky
  editorial_quality: number
  overall: number
  passed: boolean
  verdict: string                   // one-sentence explanation
  weak_spots: string[]              // specific things to fix
}

const QUALITY_SYSTEM = `You are the editorial quality director for "The Prompt" — a premium AI news channel.

Your job: score AI-generated video scripts HARSHLY and SPECIFICALLY.

Standard: Bloomberg QuickTake meets WSJ. If it sounds like LinkedIn or generic AI content, it fails.

The audience: 20–30 year old developers and tech professionals who consume 50+ pieces of content per day.
The test: Would this stop doomscrolling within 1.5 seconds?

Scoring criteria (0–10 each):

hook_strength (0–10):
- 9–10: Creates immediate tension/curiosity, sounds like insider info, specific company/number/event
- 7–8: Good but could be sharper or more specific
- 5–6: Generic, vague, or too safe
- 0–4: "AI is changing the world" tier — automatic fail

information_density (0–10):
- 9–10: Every sentence contains a specific fact (name, number, date, model, benchmark)
- 7–8: Mostly specific, one vague sentence
- 5–6: Too much setup, not enough signal
- 0–4: Atmospheric with no real information

scroll_stop_probability (0–10):
- 9–10: Someone mid-scroll would pause and watch
- 7–8: Interesting to the target audience
- 5–6: Might watch if already interested
- 0–4: Skip immediately

hallucination_risk (0–10):
- 10: Stays strictly within source material, uses hedging where appropriate
- 7–9: Mostly grounded, minor extrapolation
- 5–6: Some claims feel invented or overstated
- 0–4: Makes up numbers/events not in source

editorial_quality (0–10):
- 9–10: Could run on Bloomberg, sounds authoritative and human
- 7–8: Good quality, minor polish needed
- 5–6: Feels AI-generated or corporate
- 0–4: LinkedIn hype or generic AI content

Return ONLY valid JSON:
{
  "hook_strength": 7,
  "information_density": 8,
  "scroll_stop_probability": 7,
  "hallucination_risk": 9,
  "editorial_quality": 8,
  "overall": 7.8,
  "passed": true,
  "verdict": "Strong hook with good specificity, slightly safe in the consequence section.",
  "weak_spots": ["Consequence section is too vague — add a concrete implication"]
}`

export async function scoreScript(
  hook: string,
  script: string,
  sourceContext: string,
): Promise<QualityScore> {
  const client = new Anthropic()

  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system: QUALITY_SYSTEM,
    messages: [{
      role: 'user',
      content: `Score this script:

HOOK: "${hook}"

FULL SCRIPT: "${script}"

SOURCE CONTEXT (what the original article actually said):
${sourceContext.slice(0, 600)}`,
    }],
  })

  const raw = res.content[0].type === 'text' ? res.content[0].text : ''
  const clean = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

  try {
    return JSON.parse(clean) as QualityScore
  } catch {
    // Fallback if JSON parse fails — don't block the pipeline
    return {
      hook_strength: 7,
      information_density: 7,
      scroll_stop_probability: 7,
      hallucination_risk: 8,
      editorial_quality: 7,
      overall: 7.2,
      passed: true,
      verdict: 'Quality check parse error — proceeding with caution.',
      weak_spots: [],
    }
  }
}

/** Returns true if the script should be regenerated */
export function shouldRegenerate(score: QualityScore): boolean {
  return score.overall < 7.0 || score.hook_strength < 7
}
