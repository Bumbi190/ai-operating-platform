/**
 * Atlas mini-launcher — vNext presentation contract.
 *
 * This slice is presentation-only, and the risk in a presentation-only slice is
 * that something behavioural moves with it. So the assertions that matter most
 * here are the ones proving nothing changed: the click handler, the position,
 * the footprint, and the legacy orb that another page still depends on.
 *
 * The repo has no React testing environment (vitest runs in `environment: node`
 * with no testing-library), and adding one for a button would be a heavier
 * change than the button itself. These are therefore source contracts, the same
 * approach `atlas-latency.test.ts` uses for the chat route.
 */

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

describe('launcher renders in the platform layout', () => {
  it('is mounted by the platform layout', () => {
    expect(read('app/(platform)/layout.tsx')).toContain('<AtlasMiniOrb />')
  })

  it('the mini orb now renders the vNext launcher', () => {
    expect(MINI).toContain('<AtlasLauncherOrb')
    // The legacy orb component is no longer rendered here.
    expect(MINI).not.toMatch(/<AtlasOrb\b/)
  })

  it('stays hidden on /atlas, where the full orb lives', () => {
    expect(MINI).toContain("if (pathname === '/atlas') return null")
  })
})

describe('NAVIGATION INVARIANT — behaviour is untouched', () => {
  it('still calls the same handler', () => {
    expect(MINI).toContain('onClick={handleOrbClick}')
  })

  it('the handler body is unchanged in every branch', () => {
    // Each mapping from UI intention to runtime action, exactly as before.
    expect(MINI).toContain('if (!atlas.isSessionActive) {')
    expect(MINI).toContain('atlas.activate()')
    expect(MINI).toContain('setPanelOpen(true)')
    expect(MINI).toContain("if (atlas.voicePhase === 'speaking') {")
    expect(MINI).toContain('atlas.stopAudio()')
    expect(MINI).toContain("if (atlas.voicePhase === 'listening') {")
    expect(MINI).toContain('atlas.deactivate()')
    expect(MINI).toContain('setPanelOpen(p => !p)')
  })

  it('keeps the panel’s own navigation targets', () => {
    expect(MINI).toContain("atlas.openWorkspace('/atlas')")
    expect(MINI).toContain('atlas.openWorkspace(`/chat/${atlas.conversationId}`)')
  })

  it('keeps the same position, footprint and stacking', () => {
    expect(MINI).toContain('hidden lg:block fixed bottom-6 right-6 z-50')
    expect(MINI).toContain('const MINI_SIZE = 52')
    expect(MINI).toContain('size={MINI_SIZE}')
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
    expect(LAUNCHER).toContain("type=\"button\"")
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
    expect(MINI).toContain('stateDescription={`Atlas — ${phaseDescription(atlas.voicePhase)}`}')
    for (const s of ['Tryck för att prata', 'Lyssnar…', 'Tänker…', 'Talar…']) {
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
})

describe('vNext visual language', () => {
  it('reuses the canonical four-point crystal rather than a second identity', () => {
    expect(LOGO).toContain('export const OMNIRA_MARK_POINTS')
    expect(LAUNCHER).toContain("import { OMNIRA_MARK_POINTS } from '@/components/platform/OmniraLogo'")
    expect(LAUNCHER).toContain('points={OMNIRA_MARK_POINTS}')
  })

  it('is cyan/teal, with no legacy pink or purple in the launcher surface', () => {
    expect(LAUNCHER_CSS).toMatch(/rgba\(34,\s*211,\s*238/)   // cyan
    expect(LAUNCHER_CSS).toMatch(/rgba\(45,\s*212,\s*191/)   // teal
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
    const blurs = [...LAUNCHER_CSS.matchAll(/\d+px\s+(\d+)px\s+rgba/g)].map(m => Number(m[1]))
    expect(blurs.length).toBeGreaterThan(0)
    expect(Math.max(...blurs)).toBeLessThanOrEqual(40)
  })
})

describe('motion', () => {
  it('is completely still at rest — idle draws no animation', () => {
    // Only the non-idle phases attach a ring animation.
    expect(LAUNCHER_CSS).not.toMatch(/\.launcher\[data-phase='idle'\][^}]*animation/)
    expect(LAUNCHER_CSS).toMatch(/\.launcher\[data-phase='listening'\] \.stateRing/)
  })

  it('honours prefers-reduced-motion', () => {
    expect(LAUNCHER_CSS).toContain('@media (prefers-reduced-motion: reduce)')
    const reduced = LAUNCHER_CSS.slice(LAUNCHER_CSS.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reduced).toContain('animation: none')
    expect(reduced).toContain('transition: none')
    expect(reduced).toMatch(/transform:\s*none/)
  })
})

describe('no new runtime dependency', () => {
  it('the launcher owns no state, effects, fetching or routing', () => {
    for (const forbidden of ['useState', 'useEffect', 'useRef', 'fetch(', 'useRouter', 'usePathname', 'useAtlas']) {
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
