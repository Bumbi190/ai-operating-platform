/** Native Swedish candidates discovered with ElevenLabs voice search, 2026-10-16. */
export const ATLAS_SWEDISH_VOICES = {
  anders: { id: 'DSL3PSQNPbkOavwmnYl1', label: 'Anders · varm rikssvenska' },
  peter: { id: 'oJEeOXECH9V31Oci9WHK', label: 'Peter · naturlig skånska' },
} as const
/**
 * Dormant alias: the key carries no provider ID. Whether it is selectable is a
 * server-only decision (see nova-voice.ts); the client only learns the label.
 */
export const ATLAS_NOVA_VOICE = { key: 'nova', label: 'Nova (Agent Office)' } as const
export type AtlasSwedishVoice = keyof typeof ATLAS_SWEDISH_VOICES | typeof ATLAS_NOVA_VOICE.key
export function isAtlasSwedishVoice(value: unknown): value is AtlasSwedishVoice {
  return typeof value === 'string' && (Object.hasOwn(ATLAS_SWEDISH_VOICES, value) || value === ATLAS_NOVA_VOICE.key)
}
export function atlasVoiceLabel(voice: AtlasSwedishVoice): string {
  return voice === ATLAS_NOVA_VOICE.key ? ATLAS_NOVA_VOICE.label : ATLAS_SWEDISH_VOICES[voice].label
}
/** Adult Nova is the preferred operator voice only when the server actually authorises it. */
export function preferredAtlasVoice<T extends { key: AtlasSwedishVoice }>(available: readonly T[]): AtlasSwedishVoice {
  return available.some(v => v.key === 'nova') ? 'nova'
    : available.some(v => v.key === 'anders') ? 'anders'
    : available[0]?.key ?? 'anders'
}
/** Anders and Peter keep the proven low-latency path. Only the gated Nova option uses v4. */
export const ATLAS_ELEVEN_MODEL = 'eleven_flash_v2_5' as const
export const ATLAS_NOVA_ELEVEN_MODEL = 'eleven_v4' as const
