/** Native Swedish candidates discovered with ElevenLabs voice search, 2026-10-16. */
export const ATLAS_SWEDISH_VOICES = {
  anders: { id: 'DSL3PSQNPbkOavwmnYl1', label: 'Anders · varm rikssvenska' },
  peter: { id: 'oJEeOXECH9V31Oci9WHK', label: 'Peter · naturlig skånska' },
} as const
export type AtlasSwedishVoice = keyof typeof ATLAS_SWEDISH_VOICES
export function isAtlasSwedishVoice(value: unknown): value is AtlasSwedishVoice {
  return typeof value === 'string' && Object.hasOwn(ATLAS_SWEDISH_VOICES, value)
}
export const ATLAS_ELEVEN_MODEL = 'eleven_flash_v2_5'
