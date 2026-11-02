import { describe, expect, it } from 'vitest'
import { allowSafeTextFallback } from '@/lib/atlas/provider-recovery'

const safe = {
  enabled: true,
  configured: true,
  originalProvider: 'anthropic' as const,
  safeTurn: true,
  errorCode: 'ATLAS_PROVIDER_REQUEST_FAILED',
  textEmitted: false,
  toolCalls: 0,
  clientAborted: false,
  retryAlreadyAttempted: false,
}

describe('one guarded, paid text fallback', () => {
  it('allows exactly one fresh, no-output, no-tool provider failover', () => {
    expect(allowSafeTextFallback(safe)).toBe(true)
  })
  it.each([
    { enabled: false }, { configured: false }, { safeTurn: false },
    { originalProvider: 'openai' as const }, { errorCode: 'ATLAS_PROVIDER_AUTHENTICATION_FAILED' },
    { textEmitted: true }, { toolCalls: 1 }, { toolCalls: 2 },
    { clientAborted: true }, { retryAlreadyAttempted: true },
  ])('never retries unsafe or unapproved state %o', change => {
    expect(allowSafeTextFallback({ ...safe, ...change })).toBe(false)
  })
})
