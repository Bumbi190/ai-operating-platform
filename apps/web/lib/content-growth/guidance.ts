/**
 * Project-scoped short-form editorial guidance adapted from public MIT skill ideas.
 * Knowledge only: does not grant tool, budget, credential, DM, or publishing rights.
 * These strings are used by the existing editorial pipelines, not an external runtime.
 *
 * Inspiration (ideas paraphrased, not upstream skill text):
 * https://github.com/Ootto-AI/claude-virality-skill
 * https://github.com/Ootto-AI/claude-content-skills
 */
import {
  INSTAGRAM_AGENT_PROMPT_GUIDANCE,
  INSTAGRAM_AGENT_FAMILY_GUIDANCE,
  INSTAGRAM_AGENT_REVIEW_GUIDANCE,
} from './instagram-agent'

export const CONTENT_GROWTH_VERSION = 'atlas-content-growth-v1-instagram-agent'

export const THE_PROMPT_GROWTH_GUIDANCE = [
  'VISUAL-FIRST REEL DIRECTION (producer brief; not proof of the rendered frames):',
  '- Frame 0 must already show a real, recognisable, story-specific subject. Do not start on black, a logo intro, a generic gradient or a static title card.',
  '- Plan visible movement immediately: an authentic screenshot, event, change, comparison or number from the verified source. Do not invent interfaces, results or metrics.',
  '- The first spoken words should start promptly and name the actual subject. Land the concrete stakes in the first three seconds; legible high-contrast words must communicate the point without audio.',
  '- Let every following spoken beat have a corresponding real visual or movement. Prefer sources and proof to decorative stock.',
  '- Generate several distinct candidate hook angles internally (result-first, problem-first, surprising verified fact). Pick one grounded in the source; do not copy a competitor hook.',
  '- One honest end CTA only. Never promise a DM, download or material unless an approved delivery workflow actually exists.',
  '- The Prompt voiceover must remain the pinned Victoria voice from lib/voice/config.ts; never choose another voice by display name.',
  '- Preserve the existing JSON response shape. This is creative direction, not a render, publish or analytics command.',
  INSTAGRAM_AGENT_PROMPT_GUIDANCE,
].join('\n')

export const FAMILJE_STUNDEN_GROWTH_GUIDANCE = [
  'REEL STORYBOARD DIRECTION (for the existing reel_spec.scenes only):',
  '- In scene 1 (0–3 s), open immediately on a recognisable, already-approved family activity, Nova or Pling asset, or authentic parent problem. Make a concrete benefit obvious to a tired parent.',
  '- Specify visible motion or a meaningful action in the first beat (a card being revealed, a safe activity beginning, a character gesturing), not a black frame, generic logo intro, static title or shocking fake claim.',
  '- Use short, high-contrast on-screen Swedish text that works without sound; each later spoken beat should correspond to an approved scene or asset.',
  '- Prefer warm, age-appropriate curiosity and practical usefulness over clickbait, fear, pressure, child exploitation or false developmental promises.',
  '- Vary hook angles between result, familiar parent situation and playful curiosity. Use only the supplied brief, brand canon, approved characters and asset references.',
  '- Preserve one brief-approved CTA; never imply an automated DM, freebie or link delivery that is not actually configured.',
  '- Nova and Pling must use the already-approved exact character ElevenLabs voices; if the role-level voice mapping is unverified, BLOCK generation instead of falling back to Sanna/Victoria.',
  '- Keep the existing response JSON and existing reel_spec.scenes fields unchanged. This does not authorize rendering or publishing.',
  INSTAGRAM_AGENT_FAMILY_GUIDANCE,
].join('\n')

export const CONTENT_GROWTH_QA_GUIDANCE = [
  'FIRST-THREE-SECONDS REVIEW (script-level only): assess whether the planned opening names a verified subject, implies a concrete viewer benefit, and suggests an immediate real visual rather than abstract decoration.',
  'If the script or supplied source gives no evidence of a moving, recognisable opening, list that as a weak spot. Never claim to have inspected actual rendered frames: that needs a separate video QA step.',
  'Do not improve engagement at the cost of factual accuracy; never invent social proof, numbers, engagement, or a guaranteed viral outcome.',
  'Keep the existing six numeric scoring dimensions, thresholds and JSON schema unchanged.',
  INSTAGRAM_AGENT_REVIEW_GUIDANCE,
].join('\n')
