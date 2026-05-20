/**
 * Brand Voice Configuration — AI Media Automation
 *
 * Victoria is the canonical narrator for all AI news and automation content.
 * Warm, trustworthy, conversational. Optimized for short-form retention.
 *
 * To find Victoria's voice ID:
 *   1. Go to https://elevenlabs.io/voice-library
 *   2. Search "Victoria"
 *   3. Copy the voice ID from the URL or voice card
 *   OR: Go to https://elevenlabs.io/app/voice-lab → "Add Generative or Cloned Voice"
 *      and check "Pre-made" voices for Victoria
 *
 * Default ID below is the ElevenLabs built-in "Victoria" voice.
 * Update VICTORIA_VOICE_ID if you have a custom/cloned version.
 */

export const VICTORIA_VOICE_ID = 'qSeXEcewz7tA0Q0qk9fH'  // Victoria — Warm, Trustworthy, Conversational (ElevenLabs)

// ─── Model ──────────────────────────────────────────────────────────────────

/**
 * eleven_turbo_v2_5 — fastest, highest quality for short-form.
 * Switch to 'eleven_multilingual_v2' for multilingual content.
 */
export const BRAND_MODEL = 'eleven_turbo_v2_5'

// ─── Voice Settings (optimized for AI news, documentary feel) ────────────────

/**
 * Tuned for:
 * - Premium documentary pacing (not robotic, not over-emotive)
 * - High clarity for technical AI terms
 * - Natural sentence-level breath/pause
 * - Retention-optimized: enough warmth to hold attention, enough authority to inform
 */
export const BRAND_VOICE_SETTINGS = {
  stability: 0.50,          // ~0.45–0.55 sweet spot: natural variation without drift
  similarity_boost: 0.82,   // High fidelity to Victoria's voice character
  style: 0.12,              // Subtle expressive lift — avoids flat TTS feel
  use_speaker_boost: true,  // Crispness for compressed mobile audio
} as const

// ─── Voice Registry ──────────────────────────────────────────────────────────

/**
 * All available brand voices. Victoria is the default.
 * Add entries here as the brand voice roster expands.
 */
export const BRAND_VOICES = {
  victoria: {
    id: VICTORIA_VOICE_ID,
    label: 'Victoria',
    description: 'Warm, Trustworthy, Conversational — English (American)',
    useCase: 'AI news, automation explainers, short-form documentary',
    settings: BRAND_VOICE_SETTINGS,
  },
  // Future voices:
  // marcus: { id: '...', label: 'Marcus', description: 'Deep, authoritative', ... },
} as const

export type BrandVoiceName = keyof typeof BRAND_VOICES

/**
 * The default voice used across all pipelines unless explicitly overridden.
 */
export const DEFAULT_BRAND_VOICE: BrandVoiceName = 'victoria'

/**
 * Get the config for a specific brand voice (or the default).
 */
export function getBrandVoice(name: BrandVoiceName = DEFAULT_BRAND_VOICE) {
  return BRAND_VOICES[name]
}
