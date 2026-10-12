import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => null }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: vi.fn(),
      signInWithOtp: vi.fn(),
    },
  }),
}))

import LoginPage from '@/app/(auth)/login/page'

// The repository Vitest transform uses the classic JSX runtime for TSX tests.
;(globalThis as unknown as { React: typeof React }).React = React

const page = readFileSync(resolve(__dirname, '../../app/(auth)/login/page.tsx'), 'utf8')
const css = readFileSync(resolve(__dirname, '../../app/(auth)/login/login.module.css'), 'utf8')

describe('Omnira login design — behavior and accessibility contract', () => {
  it('renders branded sign-in with correctly labeled and autocomplete-enabled inputs', () => {
    const html = renderToStaticMarkup(React.createElement(LoginPage))
    expect(html).toContain('OMNIRA')
    expect(html).toContain('AI OPERATING SYSTEM')
    expect(html).toContain('Välkommen tillbaka')
    expect(html).toContain('type="email"')
    expect(html).toContain('autoComplete="email"')
    expect(html).toContain('type="password"')
    expect(html).toContain('autoComplete="current-password"')
    expect(html).toContain('id="omnira-login-email"')
    expect(html).toContain('id="omnira-login-password"')
    expect(html).toContain('Visa lösenord')
    expect(html).toContain('Öppna Omnira')
    expect(html).toContain('Logga in med e-postlänk')
    expect(html).toContain('href="/forgot-password"')
  })

  it('keeps the original authentication, callback and no-signup contracts', () => {
    expect(page).toContain('signInWithPassword({ email, password })')
    expect(page).toContain('signInWithOtp({')
    expect(page).toContain('shouldCreateUser: false')
    expect(page).toContain("window.location.origin + '/auth/confirm'")
    expect(page).toContain("router.push('/atlas')")
    expect(page).toContain("setError('Fel e-post eller lösenord.')")
    expect(page).not.toMatch(/console\.log\(.*(?:email|password)|localStorage|sessionStorage/)
  })

  it('has a screenreader-friendly error, show-password control and accessible mode toggling', () => {
    expect(page).toContain('role="alert"')
    expect(page).toContain("aria-label={passwordVisible ? 'Dölj lösenord' : 'Visa lösenord'}")
    expect(page).toContain('aria-pressed={passwordVisible}')
    expect(page).toContain('type="button"')
    expect(page).toContain('switchMode(!magicMode)')
    expect(page).toContain('role="status"')
    expect(page).toContain('disabled={loading}')
  })

  it('uses the approved original Atlas orb instead of the generic generated placeholder', () => {
    expect(page).toContain('src="/atlas-orb-login.png"')
    expect(page).toContain('className={styles.orbImage}')
    expect(page).not.toContain('className={styles.orbCore}')
    expect(css).toContain('mix-blend-mode: screen')
    expect(readFileSync(resolve(__dirname, '../../public/atlas-orb-login.png')).byteLength).toBeGreaterThan(100_000)
  })

  it('uses mobile-specific layout and reduced motion without changing global theme', () => {
    expect(css).toContain('@media (max-width: 800px)')
    expect(css).toContain('@media (max-width: 460px)')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('.mobileBrand { display: flex;')
    expect(css).toContain('.showcase { display: none; }')
    expect(css).toContain('.orbHalo { animation: none; }')
    expect(css).toContain(':focus-visible')
    expect(css).toContain('.eyeButton')
    expect(css).toContain('.orbitOne')
    expect(css).toContain('.orbitTwo')
    expect(css).toContain('.orbitThree')
  })
})
