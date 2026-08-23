export const ATLAS_SERVICE_ERROR_CODES = [
  'ATLAS_PROVIDER_NOT_CONFIGURED',
  'ATLAS_PROVIDER_AUTHENTICATION_FAILED',
  'ATLAS_PROVIDER_REQUEST_FAILED',
  'ATLAS_TTS_NOT_CONFIGURED',
  'ATLAS_TTS_REQUEST_FAILED',
] as const

export type AtlasServiceErrorCode = (typeof ATLAS_SERVICE_ERROR_CODES)[number]

const ATLAS_SERVICE_ERROR_MESSAGES: Record<AtlasServiceErrorCode, string> = {
  ATLAS_PROVIDER_NOT_CONFIGURED: 'Atlas AI-leverantör är inte konfigurerad i servermiljön.',
  ATLAS_PROVIDER_AUTHENTICATION_FAILED: 'Atlas AI-leverantör kunde inte autentiseras. Kontrollera serverns lokala provider-konfiguration.',
  ATLAS_PROVIDER_REQUEST_FAILED: 'Atlas kunde inte hämta ett AI-svar just nu.',
  ATLAS_TTS_NOT_CONFIGURED: 'Atlas svarade i text, men röstleverantören är inte konfigurerad i servermiljön.',
  ATLAS_TTS_REQUEST_FAILED: 'Atlas svarade i text, men ljudet kunde inte skapas just nu.',
}

export function isAtlasServiceErrorCode(value: unknown): value is AtlasServiceErrorCode {
  return typeof value === 'string' && (ATLAS_SERVICE_ERROR_CODES as readonly string[]).includes(value)
}

export function getAtlasServiceErrorMessage(code: AtlasServiceErrorCode): string {
  return ATLAS_SERVICE_ERROR_MESSAGES[code]
}

export function classifyAnthropicError(error: unknown): AtlasServiceErrorCode {
  const candidate = error as { status?: unknown; message?: unknown } | null
  const status = typeof candidate?.status === 'number' ? candidate.status : null
  const message = typeof candidate?.message === 'string' ? candidate.message.toLowerCase() : ''

  if (
    status === 401
    || message.includes('authentication')
    || message.includes('api key')
    || message.includes('apikey')
    || message.includes('authtoken')
  ) {
    return 'ATLAS_PROVIDER_AUTHENTICATION_FAILED'
  }

  return 'ATLAS_PROVIDER_REQUEST_FAILED'
}
