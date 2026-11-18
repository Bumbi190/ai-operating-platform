/**
 * Agent Office voice identity, v0.35.
 *
 * Approved character identity is NOT the same as an authenticated agent chat,
 * a current runtime speech voice, or permission to bill a speech provider.
 *
 * Sources:
 * - Familje-Stunden, docs/december-2026/CALENDAR_INSTRUCTIONS_V3_AUDIO.json:
 *   user-approved Pling Alternative B, ElevenLabs voice, model, processing.
 * - user-approved Nova original: nova_final.wav. Its originating ElevenLabs
 *   voice ID has NOT been confirmed, so no live Nova synthesis is permitted
 *   under that voice identity. Atlas's separate existing /api/chat/tts route
 *   intentionally remains unchanged.
 *
 * Never silently substitute Victoria, Sanna, a default OpenAI voice or an
 * unprocessed ElevenLabs output for an approved character voice.
 */

export const VOICE_IDENTITY_SOURCE = 'OMNIRA_AGENT_OFFICE_PINNED_CHARACTER_V035'

export const PLING_APPROVED_VOICE = Object.freeze({
  character: 'pling',
  label: 'Pling · Alternativ B',
  provider: 'elevenlabs',
  voiceId: 'vhPZICLLz0UIRNLnUe0u',
  model: 'eleven_v4',
  processing: 'rubberband=tempo=1:pitch=1.122462048:transients=mixed:detector=soft:pitchq=quality:formant=shifted,highshelf=f=3000:g=1,alimiter=limit=0.92:level=false:latency=true',
  evidence: 'Familje-Stunden/docs/december-2026/CALENDAR_INSTRUCTIONS_V3_AUDIO.json',
  approved: true,
  fullRecipeRequired: true,
  synthesisConnected: false,
  perAgentSessionConnected: false,
} as const)

export const NOVA_APPROVED_REFERENCE = Object.freeze({
  character: 'nova',
  label: 'Nova · bevarad originalröst',
  referenceName: 'nova_final.wav',
  originatingVoiceId: null,
  provider: 'approved-audio-reference',
  approved: true,
  referenceLocationVerifiedInThisWorktree: false,
  synthesisConnected: false,
  perAgentSessionConnected: false,
} as const)

export const EXISTING_ATLAS_RUNTIME = Object.freeze({
  // Facts reverified after main sync in apps/web/app/api/chat/tts/route.ts.
  // Main's M0 compatibility uses per-character tts-1 for a bounded spend estimate.
  // This metadata never selects or invokes the production speech provider.
  // This is NOT a claim that onyx equals the separately approved Nova WAV.
  model: 'tts-1',
  voice: 'onyx',
  chatRoute: '/chat',
  voiceRoute: '/atlas',
  mustRemainUnchanged: true,
} as const)

export type OfficeCharacter = 'nova' | 'pling'
export type OfficeVoiceIdentity =
  | typeof PLING_APPROVED_VOICE
  | typeof NOVA_APPROVED_REFERENCE

export function approvedCharacterVoice(character: OfficeCharacter): OfficeVoiceIdentity {
  if (character === 'pling') return PLING_APPROVED_VOICE
  if (character === 'nova') return NOVA_APPROVED_REFERENCE
  throw new TypeError('Unknown Omnira character; never guess another voice')
}

export type VoiceReadiness = Readonly<{
  identity: OfficeCharacter
  profileApproved: true
  speechReady: false
  agentConversationReady: false
  fallbackAllowed: false
  reason: string
}>

/**
 * Pure safety evaluation, intentionally no provider call or dispatcher.
 * All project Plings and the hallway/lobby demo Plings share one speaker
 * identity regardless of their scenic slug, job, or current animation.
 */
export function characterVoiceReadiness(character: OfficeCharacter): VoiceReadiness {
  const profile = approvedCharacterVoice(character)
  if (profile.character === 'pling') return {
    identity: 'pling',
    profileApproved: true,
    speechReady: false,
    agentConversationReady: false,
    fallbackAllowed: false,
    reason: 'Godkänd Pling-röst finns, men autentiserad agentbindning, budgetgrind och hela ljudreceptet saknar liveanslutning.',
  }
  return {
    identity: 'nova',
    profileApproved: true,
    speechReady: false,
    agentConversationReady: false,
    fallbackAllowed: false,
    reason: 'Den godkända Nova-referensen finns i tidigare arbete men originalets live-TTS-identitet är inte verifierad i denna runtime.',
  }
}
