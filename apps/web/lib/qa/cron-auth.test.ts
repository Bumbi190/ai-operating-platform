import { describe, it, expect, afterEach } from 'vitest'
import { requireCronAuth } from '@/lib/api-auth'

const ORIG = process.env.CRON_SECRET
afterEach(() => { process.env.CRON_SECRET = ORIG })

function req(auth?: string): Request {
  return new Request('https://x/api/cron', {
    headers: auth ? { authorization: auth } : {},
  })
}

describe('requireCronAuth — fail closed', () => {
  it('rejects with 500 when CRON_SECRET is unset (no longer fail-open)', () => {
    delete process.env.CRON_SECRET
    const r = requireCronAuth(req('Bearer anything'))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.response.status).toBe(500)
  })

  it('rejects with 500 when CRON_SECRET is empty string', () => {
    process.env.CRON_SECRET = ''
    const r = requireCronAuth(req('Bearer '))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.response.status).toBe(500)
  })

  it('rejects with 401 on a wrong/missing bearer token', () => {
    process.env.CRON_SECRET = 'secret123'
    expect(requireCronAuth(req('Bearer wrong')).ok).toBe(false)
    expect(requireCronAuth(req()).ok).toBe(false)
    const r = requireCronAuth(req('Bearer wrong'))
    if (!r.ok) expect(r.response.status).toBe(401)
  })

  it('accepts the correct bearer token', () => {
    process.env.CRON_SECRET = 'secret123'
    expect(requireCronAuth(req('Bearer secret123')).ok).toBe(true)
  })
})
