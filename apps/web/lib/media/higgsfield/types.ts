export type ConnectionStatus = 'disconnected' | 'connected' | 'reconnect_required' | 'unavailable'
export type HiggsfieldFailure = 'disabled' | 'not_configured' | 'invalid_endpoint' | 'provider_unavailable' | 'invalid_response' | 'unsupported_server_schema' | 'state_invalid' | 'access_denied' | 'connection_changed' | 'reconnect_required' | 'storage_unavailable' | 'busy'
export class HiggsfieldError extends Error {
  constructor(readonly code: HiggsfieldFailure) { super(code); this.name = 'HiggsfieldError' }
}
export interface SafeConnectionStatus {
  status: ConnectionStatus
  identityVerified: boolean
  generationEnabled: false
}
export interface SafeInspection extends SafeConnectionStatus {
  creditBalance: number | null
  quoteCredits: number | null
  observedAt: string
}
export interface PayloadContext { projectId: string; recordKind: 'connection' | 'oauth'; recordId: string }
export interface SealedPayload { v: 1; iv: string; tag: string; ciphertext: string }
