import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Middleware persistence of the UI-generation choice.
 *
 * Two things are proven here, and the second matters more than the first:
 *   1. a valid ?ui= value is persisted as the omnira_ui cookie, and applied to
 *      the *request* so the same server render already sees it;
 *   2. every existing authentication redirect still fires exactly as before.
 *
 * The gate must never become an auth or authorization input, so the auth cases
 * are asserted for both generations and for a forged cookie.
 */

let currentUser: { id: string } | null = null

vi.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, opts: any) => {
    // Exercise the cookie plumbing the real client uses, so the request-cookie
    // propagation path is not accidentally bypassed by the mock.
    opts?.cookies?.getAll?.()
    return {
      auth: {
        getUser: async () => ({ data: { user: currentUser }, error: null }),
      },
    }
  },
}))

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'anon-key-for-tests'

const { NextRequest } = await import('next/server')
const { middleware } = await import('@/middleware')
const { OMNIRA_UI_COOKIE } = await import('@/lib/ui/generation')

function request(url: string, cookies: Record<string, string> = {}) {
  const req = new NextRequest(new URL(url, 'http://localhost:3000'))
  for (const [name, value] of Object.entries(cookies)) req.cookies.set(name, value)
  return req
}

function uiCookie(res: Awaited<ReturnType<typeof middleware>>) {
  return res.cookies.get(OMNIRA_UI_COOKIE)?.value ?? null
}

beforeEach(() => {
  currentUser = { id: 'user-1' }
})

describe('middleware · ui generation persistence', () => {
  it('persists vnext when ?ui=vnext enters a platform route', async () => {
    const res = await middleware(request('/atlas?ui=vnext'))
    expect(uiCookie(res)).toBe('vnext')
  })

  it('persists legacy when ?ui=legacy enters a platform route', async () => {
    const res = await middleware(request('/atlas?ui=legacy'))
    expect(uiCookie(res)).toBe('legacy')
  })

  it('makes the choice visible to the same server render, not just the response', async () => {
    // This is what removes the need for a redirect round-trip: the downstream
    // render reads the cookie off the request.
    const req = request('/atlas?ui=vnext')
    await middleware(req)
    expect(req.cookies.get(OMNIRA_UI_COOKIE)?.value).toBe('vnext')
  })

  it('writes no cookie when no ?ui= is present', async () => {
    const res = await middleware(request('/atlas'))
    expect(uiCookie(res)).toBeNull()
  })

  it('writes no cookie for a malformed ?ui= value', async () => {
    for (const junk of ['bogus', '', 'VNEXT', 'admin']) {
      const res = await middleware(request(`/atlas?ui=${encodeURIComponent(junk)}`))
      expect(uiCookie(res)).toBeNull()
    }
  })

  it('leaves an existing cookie untouched when no ?ui= is present', async () => {
    const res = await middleware(request('/approvals', { [OMNIRA_UI_COOKIE]: 'vnext' }))
    expect(uiCookie(res)).toBeNull()
  })

  it('an explicit ?ui= overrides a stale cookie', async () => {
    const res = await middleware(request('/atlas?ui=legacy', { [OMNIRA_UI_COOKIE]: 'vnext' }))
    expect(uiCookie(res)).toBe('legacy')
  })

  it('scopes the cookie narrowly and keeps it off the client', async () => {
    const res = await middleware(request('/atlas?ui=vnext'))
    const cookie = res.cookies.get(OMNIRA_UI_COOKIE)
    expect(cookie?.path).toBe('/')
    expect(cookie?.sameSite).toBe('lax')
    expect(cookie?.httpOnly).toBe(true)
    // http://localhost in tests → not Secure; production https sets it.
    expect(cookie?.secure).toBe(false)
  })
})

describe('middleware · authentication is unchanged', () => {
  it('still redirects an unauthenticated request to /login', async () => {
    currentUser = null
    const res = await middleware(request('/atlas'))
    expect(res.status).toBe(307)
    expect(new URL(res.headers.get('location')!).pathname).toBe('/login')
  })

  it('still redirects an authenticated request away from /login', async () => {
    const res = await middleware(request('/login'))
    expect(res.status).toBe(307)
    expect(new URL(res.headers.get('location')!).pathname).toBe('/dashboard')
  })

  it('still lets an authenticated request through', async () => {
    const res = await middleware(request('/atlas'))
    expect(res.status).toBe(200)
  })

  it('the ui gate does not change who is redirected, in either generation', async () => {
    for (const ui of ['vnext', 'legacy']) {
      currentUser = null
      const denied = await middleware(request(`/atlas?ui=${ui}`))
      expect(denied.status).toBe(307)
      expect(new URL(denied.headers.get('location')!).pathname).toBe('/login')
      // The choice is still persisted on the redirect, so the post-login render
      // lands in the generation the operator asked for.
      expect(uiCookie(denied)).toBe(ui)

      currentUser = { id: 'user-1' }
      const allowed = await middleware(request(`/atlas?ui=${ui}`))
      expect(allowed.status).toBe(200)
    }
  })

  it('a forged omnira_ui cookie grants no access', async () => {
    currentUser = null
    for (const forged of ['vnext', 'legacy', 'admin', 'true']) {
      const res = await middleware(request('/system', { [OMNIRA_UI_COOKIE]: forged }))
      expect(res.status).toBe(307)
      expect(new URL(res.headers.get('location')!).pathname).toBe('/login')
    }
  })

  it('still passes API, auth, password and public routes through untouched', async () => {
    currentUser = null
    for (const path of ['/api/health', '/auth/confirm', '/forgot-password', '/update-password', '/privacy', '/terms']) {
      const res = await middleware(request(path))
      expect(res.status).toBe(200)
    }
  })

  it('still forwards a stray ?code= to /auth/confirm', async () => {
    currentUser = null
    const res = await middleware(request('/atlas?code=abc123'))
    expect(res.status).toBe(307)
    const location = new URL(res.headers.get('location')!)
    expect(location.pathname).toBe('/auth/confirm')
    expect(location.searchParams.get('code')).toBe('abc123')
  })

  it('preserves the query string on the login redirect', async () => {
    currentUser = null
    const res = await middleware(request('/atlas?ui=vnext'))
    const location = new URL(res.headers.get('location')!)
    expect(location.pathname).toBe('/login')
    expect(location.searchParams.get('ui')).toBe('vnext')
  })
})
