/** Server-owned release gates; never derived from URL/cookies. */
export function atlasVoiceLiveEnabled() {
  return process.env.VERCEL_ENV === 'production' && process.env.ATLAS_VOICE_STREAM_MODE === 'live'
}
export function atlasVoicePreviewEnabled() {
  return process.env.VERCEL_ENV === 'preview' || (process.env.VERCEL_ENV !== 'production' && process.env.NODE_ENV === 'development')
}
export function atlasVoiceConversationEnabled() {
  return atlasVoiceLiveEnabled() || (atlasVoicePreviewEnabled() && process.env.ATLAS_VOICE_STREAM_MODE === 'pilot')
}
