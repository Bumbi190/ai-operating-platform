/**
 * Display scale + motion preferences.
 *
 * Two things are worth guarding here and they are different in kind.
 *
 * The RESOLUTION RULES are pure and are asserted directly: what a stored value
 * parses to, what the override does to the system preference, and what every
 * combination resolves to. Those are the rules a future change is most likely
 * to get subtly wrong.
 *
 * The WIRING is asserted as a source contract, the same approach
 * atlas-launcher-vnext.test.ts uses — vitest runs in `environment: node` with
 * no React testing environment. What matters there is not how the provider is
 * written but that there is still exactly ONE of it, that motion reaches CSS
 * and JS through the same root attribute, and that legacy cannot be scaled.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DEFAULT_DISPLAY_SCALE,
  DEFAULT_MOTION_PREFERENCE,
  DISPLAY_SCALES,
  DISPLAY_SCALE_ATTRIBUTE,
  DISPLAY_SCALE_FACTORS,
  DISPLAY_SCALE_LABELS,
  DISPLAY_SCALE_STORAGE_KEY,
  MOTION_ATTRIBUTE,
  MOTION_PREFERENCES,
  MOTION_PREFERENCE_LABELS,
  MOTION_STORAGE_KEY,
  isReducedMotion,
  parseDisplayScale,
  parseMotionPreference,
  resolveMotion,
  type MotionPreference,
} from '@/lib/ui/display-preferences'

const WEB_ROOT = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(WEB_ROOT, p), 'utf8')

const PROVIDER = read('components/platform/os/OperatorMode.tsx')
const LAYOUT = read('app/(platform)/layout.tsx')
const GLOBALS = read('app/globals.css')
const ORB_CANVAS = read('components/platform/vnext/AtlasOrbCanvas.tsx')

// ─────────────────────────────────────────────────────────────────────────────
// Display scale
// ─────────────────────────────────────────────────────────────────────────────

describe('display scale · values and defaults', () => {
  it('offers exactly the three approved levels, with Swedish labels', () => {
    expect([...DISPLAY_SCALES]).toEqual(['compact', 'default', 'large'])
    expect(DISPLAY_SCALE_LABELS).toEqual({
      compact: 'Kompakt', default: 'Standard', large: 'Stor',
    })
  })

  it('defaults to Standard, which is a no-op multiplier', () => {
    expect(DEFAULT_DISPLAY_SCALE).toBe('default')
    expect(DISPLAY_SCALE_FACTORS.default).toBe(1)
  })

  it('keeps the factors from the approved design', () => {
    expect(DISPLAY_SCALE_FACTORS).toEqual({ compact: 0.9, default: 1, large: 1.15 })
  })
})

describe('display scale · stored values', () => {
  it('accepts every valid level', () => {
    for (const scale of DISPLAY_SCALES) expect(parseDisplayScale(scale)).toBe(scale)
  })

  it('treats anything else as no opinion rather than as an error', () => {
    for (const junk of ['', ' ', 'Large', 'LARGE', 'huge', '1.15', null, undefined, 3, {}, []]) {
      expect(parseDisplayScale(junk), String(junk)).toBeNull()
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Motion resolution — the rule that matters most
// ─────────────────────────────────────────────────────────────────────────────

describe('motion · preference values', () => {
  it('offers exactly the three approved modes, with Swedish labels', () => {
    expect([...MOTION_PREFERENCES]).toEqual(['system', 'reduce', 'full'])
    expect(MOTION_PREFERENCE_LABELS).toEqual({
      system: 'Följ systemet', reduce: 'Reducerad', full: 'Full',
    })
  })

  it('defaults to following the system', () => {
    expect(DEFAULT_MOTION_PREFERENCE).toBe('system')
  })

  it('treats an unrecognised stored value as no opinion', () => {
    for (const junk of ['', 'System', 'none', 'reduced', null, undefined, 0, {}]) {
      expect(parseMotionPreference(junk), String(junk)).toBeNull()
    }
    for (const value of MOTION_PREFERENCES) expect(parseMotionPreference(value)).toBe(value)
  })
})

describe('motion · resolution covers every combination', () => {
  const CASES: Array<[MotionPreference, boolean, 'reduce' | 'full']> = [
    // preference   OS asks reduce   resolved
    ['system', false, 'full'],
    ['system', true, 'reduce'],
    // An explicit choice wins in BOTH directions — that is the point of it.
    ['reduce', false, 'reduce'],
    ['reduce', true, 'reduce'],
    ['full', false, 'full'],
    ['full', true, 'full'],
  ]

  it.each(CASES)('%s + system:%s → %s', (preference, system, expected) => {
    expect(resolveMotion(preference, system)).toBe(expected)
  })

  it('only ever answers reduce or full', () => {
    for (const [preference, system] of CASES.map(([p, s]) => [p, s] as const)) {
      expect(['reduce', 'full']).toContain(resolveMotion(preference, system))
    }
  })

  it('the override is what lets an operator disagree with their device', () => {
    // The two cases a media query alone could never express.
    expect(resolveMotion('full', true)).toBe('full')
    expect(resolveMotion('reduce', false)).toBe('reduce')
  })

  it('isReducedMotion reads the resolved answer, not the preference', () => {
    expect(isReducedMotion(resolveMotion('system', true))).toBe(true)
    expect(isReducedMotion(resolveMotion('full', true))).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// One provider, one storage convention
// ─────────────────────────────────────────────────────────────────────────────

describe('preferences · one provider owns them', () => {
  it('extends the existing provider instead of adding a second one', () => {
    expect(PROVIDER).toContain('export function OperatorModeProvider')
    expect(PROVIDER).toContain('useDisplayPreferences')
    // No competing provider anywhere in the app.
    const providers = ['DisplayScaleProvider', 'MotionProvider', 'PreferencesProvider']
    for (const name of providers) {
      expect(PROVIDER, name).not.toContain(`function ${name}`)
    }
  })

  it('is mounted exactly once, by the platform layout', () => {
    expect([...LAYOUT.matchAll(/<OperatorModeProvider\b/g)]).toHaveLength(1)
    expect(LAYOUT).toMatch(/<OperatorModeProvider uiGeneration=\{uiGeneration\}>/)
  })

  it('uses the established omnira: storage namespace', () => {
    expect(DISPLAY_SCALE_STORAGE_KEY).toBe('omnira:display-scale')
    expect(MOTION_STORAGE_KEY).toBe('omnira:motion')
    // The operator-mode key this provider already owned is untouched.
    expect(PROVIDER).toContain("'omnira:operator-mode'")
  })

  it('reads storage through the strict parsers, never raw', () => {
    expect(PROVIDER).toContain('parseDisplayScale(localStorage.getItem')
    expect(PROVIDER).toContain('parseMotionPreference(localStorage.getItem')
  })

  it('persists the raw preference and derives the resolution fresh', () => {
    // Storing the resolved answer would freeze a device preference that can
    // change between sessions.
    expect(PROVIDER).toContain(`localStorage.setItem(MOTION_STORAGE_KEY, motionPreference)`)
    expect(PROVIDER).toContain('resolveMotion(motionPreference, systemPrefersReduce)')
  })

  it('keeps the system preference live rather than sampled once', () => {
    expect(PROVIDER).toContain("query.addEventListener('change'")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Root attributes — the single signal
// ─────────────────────────────────────────────────────────────────────────────

describe('preferences · reach the DOM through one root attribute each', () => {
  it('names the attributes in one place', () => {
    expect(DISPLAY_SCALE_ATTRIBUTE).toBe('data-display-scale')
    expect(MOTION_ATTRIBUTE).toBe('data-motion')
  })

  it('publishes the RESOLVED motion, not the preference', () => {
    expect(PROVIDER).toMatch(/setAttribute\(MOTION_ATTRIBUTE, resolvedMotion\)/)
  })

  it('the display scale rule is gated behind the attribute', () => {
    // Without the attribute the root font size is untouched, which is what
    // keeps legacy at the browser default.
    expect(GLOBALS).toContain('html[data-display-scale] {')
    expect(GLOBALS).toContain('font-size: calc(16px * var(--os-scale))')
    expect(GLOBALS).toMatch(/--os-scale:\s*1;/)
  })

  it('does NOT use CSS zoom — it breaks viewport units in this shell', () => {
    // Measured: at 1.15 a 100dvh element renders 692px inside a 600px viewport,
    // and root-level zoom does not rescale viewport units either.
    expect(GLOBALS).not.toMatch(/^\s*zoom:/m)
  })

  it('reduced motion stops animation globally when resolved to reduce', () => {
    expect(GLOBALS).toContain("html[data-motion='reduce'] *")
    expect(GLOBALS).toContain('animation-duration: 0.01ms !important')
    expect(GLOBALS).toContain('transition-duration: 0.01ms !important')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Existing consumers are reconciled — no half-and-half
// ─────────────────────────────────────────────────────────────────────────────

describe('motion · every existing consumer reads the resolved signal', () => {
  const CSS_CONSUMERS = [
    'components/platform/vnext/AtlasHomeVNext.module.css',
    'components/platform/os/AtlasLauncherOrb.module.css',
    'components/platform/intelligence/GraphCanvas.module.css',
    'components/platform/trading/AtlasMarketView.module.css',
  ]

  it.each(CSS_CONSUMERS)('%s honours an explicit "full" override', (path) => {
    const css = read(path)
    const blocks = css.split('@media (prefers-reduced-motion: reduce)').slice(1)
    expect(blocks.length, 'expected at least one reduced-motion block').toBeGreaterThan(0)
    for (const block of blocks) {
      const body = block.slice(0, block.indexOf('\n}'))
      const selectors = [...body.matchAll(/^\s{2,}([^\s@{][^{]*)\{/gm)].map((m) => m[1].trim())
      expect(selectors.length, `${path} selectors`).toBeGreaterThan(0)
      for (const selector of selectors) {
        expect(selector, `${path}: ${selector}`).toContain(":where(html:not([data-motion='full']))")
      }
    }
  })

  it('the guard adds no specificity, so the cascade is unchanged', () => {
    // :where() is specificity-zero. Anything else here would silently reorder
    // rules inside blocks that were already correct.
    for (const path of CSS_CONSUMERS) {
      const css = read(path)
      expect(css, path).not.toMatch(/(?<!:where\()html:not\(\[data-motion='full'\]\)/)
    }
  })

  it('the JS consumer reads the root attribute, not the media query alone', () => {
    expect(ORB_CANVAS).toContain('function prefersReducedMotion')
    expect(ORB_CANVAS).toContain('getAttribute(MOTION_ATTRIBUTE)')
    expect(ORB_CANVAS).toContain('reducedMotion: prefersReducedMotion()')
    // The media query survives only as the pre-hydration fallback.
    expect(ORB_CANVAS).not.toContain("matchMedia('(prefers-reduced-motion: reduce)')")
  })

  it('re-resolves when the operator changes the preference', () => {
    // The OS preference has not moved, so a matchMedia listener alone would
    // leave the orb on the tier it resolved at mount.
    expect(ORB_CANVAS).toContain('MutationObserver')
    expect(ORB_CANVAS).toContain('attributeFilter: [MOTION_ATTRIBUTE]')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Legacy stays exactly as it was
// ─────────────────────────────────────────────────────────────────────────────

describe('preferences · legacy safety', () => {
  it('display scale is vNext-only', () => {
    expect(PROVIDER).toContain('const displayScaleAvailable = isVNext(uiGeneration)')
    // Legacy actively clears the attribute rather than merely not setting it,
    // so switching generations cannot leave a stale scale behind.
    expect(PROVIDER).toContain('root.removeAttribute(DISPLAY_SCALE_ATTRIBUTE)')
    expect(PROVIDER).toContain("root.style.removeProperty('--os-scale')")
  })

  it('the pre-paint script scales only vNext, but applies motion everywhere', () => {
    expect(LAYOUT).toContain('dangerouslySetInnerHTML')
    expect(LAYOUT).toContain('isVNext(uiGeneration)')
    // Motion is written unconditionally — an accessibility choice must survive
    // a UI rollback.
    const script = LAYOUT.slice(LAYOUT.indexOf('__html:'), LAYOUT.indexOf('}}\n      />'))
    expect(script).toContain('MOTION_ATTRIBUTE')
    expect(script).toContain('DISPLAY_SCALE_ATTRIBUTE')
  })

  it('no stylesheet scales the root font size unconditionally', () => {
    expect(GLOBALS).not.toMatch(/^html\s*\{[^}]*font-size/m)
    expect(GLOBALS).not.toMatch(/^:root\s*\{[^}]*font-size:\s*calc/m)
  })
})

describe('display scale · shell geometry stays scale-invariant', () => {
  it('the sidebar column is a px literal, not a rem value', () => {
    // Typography scales; the shell's column widths do not. Making this 16.25rem
    // so it followed the preference narrowed the canvas by ~39px at Large, and
    // responsive-table-contract computes the table floors against this width
    // with only 16px of headroom — so a scaled column silently breaks tables at
    // lg. That test caught it; this one states the decision.
    expect(LAYOUT).toContain('lg:[grid-template-columns:260px_minmax(0,1fr)]')
  })

  it('shell chrome text is rem so it does follow the preference', () => {
    expect(GLOBALS).toContain('font-size: 0.78125rem') // .nav-pill — 12.5px @ default
    expect(read('components/platform/os/Breadcrumbs.module.css'))
      .toMatch(/font-size: 0\.71875rem/) // 11.5px @ default
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Atlas invariant
// ─────────────────────────────────────────────────────────────────────────────

describe('preferences · Atlas runtime is untouched', () => {
  it('changes orb visual quality only, never orb state', () => {
    // The quality tier is a rendering budget. Nothing here may reach the state
    // machine, the voice phase, or the transitions between them.
    expect(ORB_CANVAS).not.toContain('resolveAtlasOrbState')
    expect(ORB_CANVAS).not.toContain('voicePhase')
    expect(ORB_CANVAS).not.toContain('setVoicePhase')
  })

  it('reduced motion leaves states distinguishable without movement', () => {
    // Atlas Home's reduced-motion block removes animation and transition only.
    // If it ever started hiding a state's colour or glow, states would become
    // indistinguishable for anyone who cannot see motion.
    const css = read('components/platform/vnext/AtlasHomeVNext.module.css')
    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    const body = block.slice(0, block.indexOf('\n}'))
    expect(body).toMatch(/animation:\s*none/)
    expect(body).toMatch(/transition:\s*none/)
    expect(body).not.toMatch(/display:\s*none|visibility:\s*hidden|opacity:\s*0\b/)
  })
})
