import 'server-only'
import { listStandardVoiceIds, streamAtlasSwedishVoice } from '@/lib/media/elevenlabs'
import { ATLAS_SWEDISH_VOICES, isAtlasSwedishVoice, type AtlasSwedishVoice } from './voices'

/** Server-owned voice selection; all provider I/O stays in the sanctioned adapter. */
export async function availableSwedishVoices(signal: AbortSignal): Promise<AtlasSwedishVoice[]> {
  const ids = await listStandardVoiceIds(Object.values(ATLAS_SWEDISH_VOICES).map(v => v.id), signal)
  return (Object.keys(ATLAS_SWEDISH_VOICES) as AtlasSwedishVoice[]).filter(key => ids.includes(ATLAS_SWEDISH_VOICES[key].id))
}
export async function streamSwedishSpeech(
  ctx: Parameters<typeof streamAtlasSwedishVoice>[0], text: string, voice: AtlasSwedishVoice, signal: AbortSignal,
): Promise<Response> {
  if (!isAtlasSwedishVoice(voice)) throw new Error('unsupported_voice')
  return streamAtlasSwedishVoice(ctx, text, ATLAS_SWEDISH_VOICES[voice].id, signal)
}
