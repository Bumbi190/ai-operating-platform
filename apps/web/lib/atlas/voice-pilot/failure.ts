/** Only map our stable code, never expose an arbitrary server/proxy message. */
export const VOICE_ACCESS_NOTICE = 'Åtkomstkontrollen svarade inte. Försök igen om en stund; din mikrofonbehörighet behöver inte ändras.'
export async function voiceResponseError(response: Response, fallback: string): Promise<Error> {
  const value = await response.json().catch(() => null)
  return new Error(value?.code === 'ATLAS_VOICE_AUTH_UNAVAILABLE' ? 'voice_access_unavailable' : fallback)
}
export const isVoiceAccessFailure = (error: unknown) => error instanceof Error && error.message === 'voice_access_unavailable'
