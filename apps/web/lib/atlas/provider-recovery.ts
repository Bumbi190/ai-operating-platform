/**
 * One bounded text-only provider retry, never after any output or tool call.
 * This pure gate does not authorize spending; the alternate provider still
 * passes through the existing server-side spend governance.
 */
export function allowSafeTextFallback(input: {
  enabled: boolean
  configured: boolean
  originalProvider: 'anthropic' | 'openai'
  safeTurn: boolean
  errorCode: string
  textEmitted: boolean
  toolCalls: number
  clientAborted: boolean
  retryAlreadyAttempted: boolean
}): boolean {
  return input.enabled && input.configured && input.safeTurn && input.originalProvider === 'anthropic'
    && input.errorCode === 'ATLAS_PROVIDER_REQUEST_FAILED'
    && !input.textEmitted && input.toolCalls === 0 && !input.clientAborted && !input.retryAlreadyAttempted
}
