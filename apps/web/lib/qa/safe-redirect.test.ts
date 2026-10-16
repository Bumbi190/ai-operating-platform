import { describe, expect, it } from 'vitest'
import { safeAuthDestination } from '@/lib/auth/safe-redirect'
describe('post-auth redirect allowlist', () => {
  it('allows only four reviewed internal paths', () => {
    expect(safeAuthDestination('/atlas')).toBe('/atlas')
    expect(safeAuthDestination('/dashboard')).toBe('/dashboard')
    expect(safeAuthDestination('/organization')).toBe('/organization')
    expect(safeAuthDestination('/viewer/handlarborsen')).toBe('/viewer/handlarborsen')
  })
  it('rejects external origins, protocol relatives, path tricks and unknown routes', () => {
    for (const input of ['https://example.com','//example.com','/\\example.com','/%2f%2fevil.com','/atlas/../../logout','/api/manager','/atlas?next=//evil.com']) {
      expect(safeAuthDestination(input)).toBe('/dashboard')
    }
    expect(safeAuthDestination(null)).toBe('/dashboard')
  })
})
