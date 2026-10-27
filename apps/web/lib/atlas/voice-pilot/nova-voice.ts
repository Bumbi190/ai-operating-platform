import 'server-only'

/**
 * Dormant Nova (Agent Office) voice gate. Server-only so no provider voice ID
 * ever reaches a client bundle.
 *
 * Nova is selectable only when BOTH hold:
 *  - ATLAS_NOVA_VOICE_ID is a 20-char ElevenLabs ID that is not the rejected one
 *  - ATLAS_NOVA_VOICE_APPROVED is exactly "true" (explicit owner approval)
 */
// Explicitly rejected by the owner. Never use it, even if configured and approved.
export const REJECTED_NOVA_ELEVENLABS_VOICE_ID = 'I0uKCr8dyBq1Ouru7CWl'

type Env = Record<string, string | undefined>

export function resolveNovaVoiceId(env: Env = process.env): string | null {
  if (env.ATLAS_NOVA_VOICE_APPROVED?.trim() !== 'true') return null
  const id = env.ATLAS_NOVA_VOICE_ID?.trim()
  if (!id || !/^[A-Za-z0-9]{20}$/.test(id)) return null
  if (id.toLowerCase() === REJECTED_NOVA_ELEVENLABS_VOICE_ID.toLowerCase()) return null
  return id
}
