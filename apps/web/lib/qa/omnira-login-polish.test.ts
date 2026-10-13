import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { PNG } from 'pngjs'
import styles from '@/app/(auth)/login/login.module.css'

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
    expect(page).toContain('src="/atlas-orb-login-masked.png"')
    expect(page).toContain('className={styles.orbImage}')
    expect(page).not.toContain('className={styles.orbCore}')
    expect(css).toContain('mix-blend-mode: screen')
    expect(readFileSync(resolve(__dirname, '../../public/atlas-orb-login.png')).byteLength).toBeGreaterThan(100_000)
  })

  it('alpha-masks every image edge while preserving the approved orb and star pixels', () => {
    const originalBytes = readFileSync(resolve(__dirname, '../../public/atlas-orb-login.png'))
    expect(createHash('sha256').update(originalBytes).digest('hex')).toBe('5cfb54efe49f324997d996a03e57a469c7e59ce2dd805c315da8280f763f6863')
    const original = PNG.sync.read(originalBytes)
    const masked = PNG.sync.read(readFileSync(resolve(__dirname, '../../public/atlas-orb-login-masked.png')))
    expect([masked.width, masked.height]).toEqual([original.width, original.height])
    let featheredPixels = 0
    for (let y = 0; y < masked.height; y++) {
      for (let x = 0; x < masked.width; x++) {
        const offset = (y * masked.width + x) * 4
        const radius = Math.hypot((x - (masked.width - 1) / 2) / ((masked.width - 1) / 2), (y - (masked.height - 1) / 2) / ((masked.height - 1) / 2))
        // The sphere and star fit inside 70%; only the outer backdrop is feathered.
        if (radius <= 0.7) {
          if (!masked.data.subarray(offset, offset + 4).equals(original.data.subarray(offset, offset + 4))) {
            throw new Error(`Approved orb pixel changed at ${x},${y}`)
          }
        }
        if (radius >= 0.98 && masked.data[offset + 3] !== 0) {
          throw new Error(`Opaque outer edge at ${x},${y}`)
        }
        if (masked.data[offset + 3] > 0 && masked.data[offset + 3] < 255) featheredPixels++
      }
    }
    expect(featheredPixels).toBeGreaterThan(100_000)
  })

  it('renders a decorative prioritized orb in a separate pulse layer behind the label', () => {
    const html = renderToStaticMarkup(React.createElement(LoginPage))
    expect(html).toContain(`<div class="${styles.atlasVisual}" aria-hidden="true">`)
    expect(html).toContain(`<div class="${styles.orbHalo}"><div class="${styles.orbPulse}"><img`)
    expect(html).toContain('atlas-orb-login-masked.png')
    expect(html).toContain('sizes="(max-width: 800px) 1px, (max-width: 948px) 275px, (max-width: 1552px) 29vw, 450px"')
    expect(html).not.toContain('loading="lazy"')
    expect(css).toContain('width: min(100%, clamp(275px, 29vw, 450px))')
    expect(css).toContain('animation: pulseOrb 5.5s ease-in-out infinite')
    expect(css).toContain('50% { transform: scale(1.02); }')
    expect(css).toContain('animation: fadeOrbHalo 5.5s ease-in-out infinite')
    expect(css).not.toContain('floatOrb')
  })

  it('uses mobile-specific layout and reduced motion without changing global theme', () => {
    expect(css).toContain('@media (max-width: 800px)')
    expect(css).toContain('@media (max-width: 460px)')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('.mobileBrand { display: flex;')
    expect(css).toContain('.showcase { display: none; }')
    const reducedMotion = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reducedMotion).toContain('.orbPulse, .orbHalo::before { animation: none; }')
    expect(css).toContain(':focus-visible')
    expect(css).toContain('.eyeButton')
    expect(css).toContain('.orbitOne')
    expect(css).toContain('.orbitTwo')
    expect(css).toContain('.orbitThree')
  })
})
