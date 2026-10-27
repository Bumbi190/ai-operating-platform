import 'server-only'
import { listStandardVoiceIds, streamAtlasSwedishVoice } from '@/lib/media/elevenlabs'
import { resolveNovaVoiceId } from './nova-voice'
import { ATLAS_NOVA_VOICE, ATLAS_SWEDISH_VOICES, isAtlasSwedishVoice, type AtlasSwedishVoice } from './voices'

/** Server-owned voice selection; all provider I/O stays in the sanctioned adapter. */
export async function availableSwedishVoices(signal: AbortSignal): Promise<AtlasSwedishVoice[]> {
  const base = Object.keys(ATLAS_SWEDISH_VOICES) as (keyof typeof ATLAS_SWEDISH_VOICES)[]
  const novaId = resolveNovaVoiceId()
  const ids = await listStandardVoiceIds([...base.map(key => ATLAS_SWEDISH_VOICES[key].id), ...(novaId ? [novaId] : [])], signal)
  const found: AtlasSwedishVoice[] = base.filter(key => ids.includes(ATLAS_SWEDISH_VOICES[key].id))
  // Nova is listed last so Anders stays the default, and only when the provider confirms it.
  if (novaId && ids.includes(novaId)) found.push(ATLAS_NOVA_VOICE.key)
  return found
}
export async function streamSwedishSpeech(
  ctx: Parameters<typeof streamAtlasSwedishVoice>[0], text: string, voice: AtlasSwedishVoice, signal: AbortSignal,
): Promise<Response> {
  if (!isAtlasSwedishVoice(voice)) throw new Error('unsupported_voice')
  if (voice === ATLAS_NOVA_VOICE.key) {
    // Fail closed before any lookup or paid call unless the owner approved a configured ID.
    const novaId = resolveNovaVoiceId()
    if (!novaId) throw new Error('voice_not_approved')
    return streamAtlasSwedishVoice(ctx, text, novaId, signal)
  }
  return streamAtlasSwedishVoice(ctx, text, ATLAS_SWEDISH_VOICES[voice].id, signal)
}
