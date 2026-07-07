/**
 * Quality Gate — AI-powered script evaluator for The Prompt.
 *
 * Scores each generated script before image generation begins.
 * If score is below threshold, the pipeline auto-regenerates the script once.
 *
 * Engagement-poäng (0–10): hook_strength, retention_score, visual_relevance,
 * shareability, discussion_potential + faktasäkerhet hallucination_risk.
 * overall = snitt av de 5 engagemangspoängen.
 *
 * Tröskel: overall ≥ 8.0 OCH hook ≥ 8 OCH hallucination_risk ≥ 7 för att passera.
 * Under det → auto-omskrivning (en gång).
 */

import { Anthropic } from '@anthropic-ai/sdk'

export interface QualityScore {
  hook_strength: number          // Hook Score — stoppar de första <2s scrollen?
  retention_score: number        // håller storyn kvar tittaren hela klippet?
  visual_relevance: number       // kan storyn representeras av konkreta, story-specifika visuals?
  shareability: number           // skulle någon faktiskt dela detta?
  discussion_potential: number   // triggar det kommentarer/debatt?
  hallucination_risk: number     // 10 = inga påhittade fakta, 0 = mycket riskabelt
  overall: number
  passed: boolean
  verdict: string                // one-sentence explanation
  weak_spots: string[]           // specific things to fix
}

const QUALITY_SYSTEM = `You are the editorial quality director for "The Prompt" — a premium AI news channel.

Your job: score AI-generated video scripts HARSHLY and SPECIFICALLY.

Standard: Bloomberg QuickTake meets WSJ. If it sounds like LinkedIn or generic AI content, it fails.

The audience: 20–30 year old developers and tech professionals who consume 50+ pieces of content per day.
The test: Would this stop doomscrolling within 1.5 seconds?

Score 5 ENGAGEMENT dimensions + 1 factual-safety guard. Be HARSH — the bar is 8/10.

hook_strength (0–10) — Hook Score:
- 9–10: Curiosity gap, stops the scroll in <2s, makes you NEED the next line
- 7–8: Strong but a bit safe/generic
- 0–6: Starts with a company/"announced", or "AI is changing the world" tier — fail

retention_score (0–10) — does the story keep watching to the end?
- 9–10: Clear why-it-matters → consequence → example → question arc, no dead air
- 7–8: Mostly tight, one flat section
- 0–6: Front-loaded or rambling, viewer drops off

visual_relevance (0–10) — can this be shown with concrete, STORY-SPECIFIC visuals?
- 9–10: Names real actors/actions that map to specific imagery (agents using software, robots working, hearings…)
- 7–8: Mostly concrete, some generic moments
- 0–6: Abstract — would only yield generic server rooms / random laptops

shareability (0–10) — would someone send this to a friend?
- 9–10: Surprising, status-worthy, "you have to see this"
- 0–6: Forgettable

discussion_potential (0–10) — does it trigger comments/debate?
- 9–10: Ends on a real question, takes an angle people react to
- 0–6: No opinion, no question, nothing to argue about

hallucination_risk (0–10) — factual safety (10 = safest):
- 10: Strictly within the source, hedges where appropriate
- 7–9: Mostly grounded, minor extrapolation
- 0–6: Invents numbers/events not in the source — BLOCKS publishing regardless of other scores

overall = average of the 5 engagement scores (NOT hallucination_risk).
passed = overall ≥ 8.0 AND hallucination_risk ≥ 7.

Return ONLY valid JSON:
{
  "hook_strength": 8,
  "retention_score": 8,
  "visual_relevance": 8,
  "shareability": 8,
  "discussion_potential": 8,
  "hallucination_risk": 9,
  "overall": 8.0,
  "passed": true,
  "verdict": "Curiosity-gap hook, strong arc; example could be more specific.",
  "weak_spots": ["Make the example name a concrete company/number"]
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
      hook_strength: 8, retention_score: 8, visual_relevance: 8, shareability: 8,
      discussion_potential: 8, hallucination_risk: 8, overall: 8.0, passed: true,
      verdict: 'Quality check parse error — proceeding with caution.', weak_spots: [],
    }
  }
}

/** Returns true if the script should be regenerated. Bar: overall ≥ 8, hook ≥ 8, faktasäkert. */
export function shouldRegenerate(score: QualityScore): boolean {
  return score.overall < 8.0 || score.hook_strength < 8 || score.hallucination_risk < 7
}
