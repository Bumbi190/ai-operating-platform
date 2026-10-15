/** Brand/source invariants. Actual messenger interaction is exercised by Playwright. */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const WEB_ROOT = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(WEB_ROOT, p), 'utf8')

const MINI = read('components/platform/os/AtlasMiniOrb.tsx')
const LAUNCHER = read('components/platform/os/AtlasLauncherOrb.tsx')
const LAUNCHER_CSS = read('components/platform/os/AtlasLauncherOrb.module.css')
const LEGACY_ORB = read('components/platform/os/AtlasOrb.tsx')
const LOGO = read('components/platform/OmniraLogo.tsx')

describe('persistent messenger integration', () => {
  it('mounts in the authenticated shell and opens text', () => {
    expect(read('app/(platform)/layout.tsx')).toContain('<AtlasMiniOrb ')
    expect(MINI).toContain('<AtlasLauncherOrb')
    expect(MINI).toContain('onClick={state.openPanel}')
    expect(MINI).not.toMatch(/<AtlasOrb\b/)
  })
  it('hides on full Atlas surfaces without resetting the shell state', () => {
    expect(MINI).toContain("'/atlas'")
    expect(MINI).toContain("pathname.startsWith('/chat/')")
    expect(MINI).toContain('useMiniChatState(atlas.deactivate)')
  })
  it('uses the compact symbol and clears the activity peek', () => {
    expect(MINI).toContain('size={40}')
    expect(MINI).toContain('styles.projectDock')
    expect(
      read('components/platform/os/AtlasMiniChatPanel.module.css')
    ).toContain('safe-area-inset-bottom')
  })
})

describe('LEGACY SAFETY — the shared orb is not collateral damage', () => {
  it('AtlasOrb keeps its legacy indigo/violet palette', () => {
    // Recolouring AtlasOrb would have silently redesigned the legacy Atlas home.
    expect(LEGACY_ORB).toContain("idle:      { ring: 'rgba(99,102,241,'")
    expect(LEGACY_ORB).toContain("thinking:  { ring: 'rgba(139,92,246,'")
  })

  it('the legacy Atlas home still renders AtlasOrb', () => {
    const home = read('app/(platform)/atlas/AtlasVoiceHome.tsx')
    expect(home).toContain('<AtlasOrb')
  })
})

describe('accessible label and keyboard contract', () => {
  it('uses a real button element', () => {
    expect(LAUNCHER).toContain('<button')
    expect(LAUNCHER).toContain('type="button"')
  })

  it('the accessible name matches the visible tooltip', () => {
    // WCAG "Label in Name": the visible label must be in the accessible name.
    expect(LAUNCHER).toContain("label = 'Öppna Atlas'")
    expect(LAUNCHER).toContain('aria-label={label}')
    expect(LAUNCHER).toContain('{label}')
    expect(MINI).toContain('label="Öppna Atlas"')
  })

  it('still exposes the voice phase to assistive tech', () => {
    expect(LAUNCHER).toContain('aria-describedby={descriptionId}')
    expect(LAUNCHER).toContain('className="sr-only"')
    expect(MINI).toContain('stateDescription=')
    for (const s of ['Samtal pågår', 'Öppna textchatt']) {
      expect(MINI, s).toContain(s)
    }
  })

  it('has a visible focus state that does not rely on the glow alone', () => {
    expect(LAUNCHER_CSS).toMatch(/\.launcher:focus-visible\s*\{[^}]*outline:/)
  })

  it('decorative layers are hidden from assistive tech', () => {
    const hidden = LAUNCHER.match(/aria-hidden="true"/g) ?? []
    expect(hidden.length).toBeGreaterThanOrEqual(4)
  })

  it('the tooltip cannot intercept the click', () => {
    expect(LAUNCHER_CSS).toMatch(/\.tooltip\s*\{[^}]*pointer-events:\s*none/)
  })

  it('owns its own positioning context for the tooltip', () => {
    // The tooltip is absolutely positioned against the wrapper. Borrowing that
    // containing block from a utility class means the tooltip flies off-screen
    // wherever that class is not in effect — observed in a render harness where
    // `right` resolved to 1010px against the page. The module owns it instead.
    expect(LAUNCHER_CSS).toMatch(/\.root\s*\{[^}]*position:\s*relative/)
    expect(LAUNCHER).toContain('className={cn(styles.root, className)}')
    expect(LAUNCHER).not.toContain("cn('relative'")
  })
})

describe('vNext visual language', () => {
  it('reuses the canonical four-point crystal rather than a second identity', () => {
    expect(LOGO).toContain('export const OMNIRA_MARK_POINTS')
    expect(LAUNCHER).toContain(
      "import { OMNIRA_MARK_POINTS } from '@/components/platform/OmniraLogo'"
    )
    expect(LAUNCHER).toContain('points={OMNIRA_MARK_POINTS}')
  })

  it('is cyan/teal, with no legacy pink or purple in the launcher surface', () => {
    expect(LAUNCHER_CSS).toMatch(/rgba\(34,\s*211,\s*238/) // cyan
    expect(LAUNCHER_CSS).toMatch(/rgba\(45,\s*212,\s*191/) // teal
    // The old indigo #6366f1 / violet #8b5cf6 families must not appear on the
    // resting launcher surface.
    expect(LAUNCHER_CSS).not.toMatch(/rgba\(99,\s*102,\s*241/)
    expect(LAUNCHER_CSS).not.toMatch(/rgba\(139,\s*92,\s*246/)
    expect(LAUNCHER_CSS).not.toMatch(/#6366f1|#8b5cf6|pink|fuchsia/i)
  })

  it('does not key off --os-accent, which differs per UI generation', () => {
    // The launcher is rendered on both generations by the shared layout;
    // --os-accent is only cyan under [data-ui-generation='vnext']. The token is
    // named in a comment explaining exactly this, so assert on USE, not mention.
    expect(LAUNCHER_CSS).not.toMatch(/var\(\s*--os-accent/)
    expect(LAUNCHER).not.toMatch(/var\(\s*--os-accent/)
  })

  it('uses global glass/edge tokens rather than scattered hard-coded chrome', () => {
    expect(LAUNCHER_CSS).toContain('var(--omnira-edge)')
    expect(LAUNCHER).toContain('var(--omnira-cyan-soft')
    expect(LAUNCHER).toContain('var(--omnira-teal')
  })

  it('reads as glass, not as a support bubble', () => {
    expect(LAUNCHER_CSS).toContain('backdrop-filter')
    expect(LAUNCHER_CSS).toContain('border-radius: 999px')
    // No chat/message iconography in the launcher itself.
    expect(LAUNCHER).not.toMatch(/MessageSquare|MessageCircle|ChatBubble/)
  })

  it('keeps the glow restrained — no oversized halo', () => {
    // Every blur radius in the launcher's shadows stays modest.
    const blurs = [...LAUNCHER_CSS.matchAll(/\d+px\s+(\d+)px\s+rgba/g)].map(
      (m) => Number(m[1])
    )
    expect(blurs.length).toBeGreaterThan(0)
    expect(Math.max(...blurs)).toBeLessThanOrEqual(40)
  })
})

describe('motion', () => {
  it('is completely still at rest — idle draws no animation', () => {
    // Only the non-idle phases attach a ring animation.
    expect(LAUNCHER_CSS).not.toMatch(
      /\.launcher\[data-phase='idle'\][^}]*animation/
    )
    expect(LAUNCHER_CSS).toMatch(
      /\.launcher\[data-phase='listening'\] \.stateRing/
    )
  })

  it('honours prefers-reduced-motion', () => {
    expect(LAUNCHER_CSS).toContain('@media (prefers-reduced-motion: reduce)')
    const reduced = LAUNCHER_CSS.slice(
      LAUNCHER_CSS.indexOf('@media (prefers-reduced-motion: reduce)')
    )
    expect(reduced).toContain('animation: none')
    expect(reduced).toContain('transition: none')
    expect(reduced).toMatch(/transform:\s*none/)
  })
})

describe('no new runtime dependency', () => {
  it('the launcher owns no state, effects, fetching or routing', () => {
    for (const forbidden of [
      'useState',
      'useEffect',
      'useRef',
      'fetch(',
      'useRouter',
      'usePathname',
      'useAtlas'
    ]) {
      expect(LAUNCHER, forbidden).not.toContain(forbidden)
    }
  })

  it('the state ring reuses the phase the launcher was already given', () => {
    expect(LAUNCHER).toContain('phase: OrbPhase')
    expect(LAUNCHER).toContain('data-phase={phase}')
    expect(MINI).toContain('phase={atlas.voicePhase}')
  })

  it('adds no icon library or remote asset', () => {
    expect(LAUNCHER).not.toContain("from 'lucide-react'")
    // No network fetches. The SVG xmlns namespace is a URI, not a request, so
    // match on things that would actually load: src/href/import.
    expect(LAUNCHER).not.toMatch(/(?:src|href)=\{?['"]https?:/)
    expect(LAUNCHER).not.toMatch(/from ['"]https?:/)
    expect(LAUNCHER_CSS).not.toMatch(/url\(\s*['"]?https?:/)
    expect(LAUNCHER_CSS).not.toContain('@import')
  })
})
