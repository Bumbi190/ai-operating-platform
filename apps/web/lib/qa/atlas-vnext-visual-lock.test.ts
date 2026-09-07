/**
 * Atlas Home · vNext visual lock.
 *
 * Atlas Home is the owner-approved visual baseline. Every shell slice from here
 * on reconciles the rest of the platform TOWARD it, which makes it exactly the
 * surface a shell change is most likely to disturb by accident.
 *
 * This gate is deliberately NOT a CSS snapshot. A snapshot of a 35 KB stylesheet
 * fails on every whitespace change and passes on every meaningful one that keeps
 * the byte count, so it trains people to regenerate it without reading. What is
 * asserted instead is the small set of structural facts that, if any one of them
 * broke, would mean Atlas Home is no longer the thing that was approved:
 *
 *   1. it is still what /atlas renders for the vNext generation
 *   2. its visual layer stack is still assembled
 *   3. the orb's runtime state still has exactly one owner, with the same states
 *   4. it is insulated from the accent contract the shell slices retune
 *   5. no Claude Design prototype runtime has entered the app
 *
 * Source contracts, in the style of atlas-launcher-vnext.test.ts — vitest runs
 * in `environment: node` with no React testing environment.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { ATLAS_ORB_STATES } from '@/lib/atlas/orb-state'

const WEB_ROOT = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(WEB_ROOT, p), 'utf8')

const ATLAS_PAGE = read('app/(platform)/atlas/page.tsx')
const HOME = read('components/platform/vnext/AtlasHomeVNext.tsx')
const HOME_CSS = read('components/platform/vnext/AtlasHomeVNext.module.css')
const ORB_VISUAL = read('components/platform/vnext/AtlasOrbVisual.tsx')
const COMMAND_CORE = read('components/platform/vnext/AtlasCommandCore.tsx')
const ORB_STATE = read('lib/atlas/orb-state.ts')

// ─────────────────────────────────────────────────────────────────────────────
// 1 · Atlas Home is still the vNext landing surface
// ─────────────────────────────────────────────────────────────────────────────

describe('atlas home · is the vNext landing surface', () => {
  it('/atlas renders AtlasHomeVNext for the vNext generation', () => {
    expect(ATLAS_PAGE).toContain('AtlasHomeVNext')
    expect(ATLAS_PAGE).toMatch(/isVNext\(generation\)/)
    expect(ATLAS_PAGE).toMatch(/<AtlasHomeVNext\s+model=\{model\}\s*\/>/)
  })

  it('resolves the generation through the one canonical resolver', () => {
    // Reading the cookie or ?ui= directly here would create a second answer to
    // "which UI is this?" that lib/ui/generation could not keep consistent.
    expect(ATLAS_PAGE).toContain("from '@/lib/ui/generation'")
    expect(ATLAS_PAGE).toContain('resolveUiGeneration')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2 · The visual layer stack is still assembled
// ─────────────────────────────────────────────────────────────────────────────

describe('atlas home · visual layers remain present', () => {
  const AMBIENT_LAYERS = ['ambientGrid', 'ambientStars', 'ambientOrbit', 'ambientGlow']
  const COMPOSITION = ['AtlasCommandCore', 'ProjectRail', 'ActivitySystemRail', 'AtlasMobileNav']

  it.each(AMBIENT_LAYERS)('renders the %s ambient layer', (layer) => {
    expect(HOME).toContain(`styles.${layer}`)
    expect(HOME_CSS).toContain(`.${layer}`)
  })

  it.each(COMPOSITION)('still composes %s', (child) => {
    expect(HOME).toContain(`<${child}`)
  })

  it('keeps the orb layer stack that gives the orb its depth', () => {
    const ORB_LAYERS = [
      'orbEnergyField', 'orbHalo', 'orbAxisHorizontal', 'orbAxisVertical',
      'orbOrbitOuter', 'orbOrbitInner', 'orbOrbitTilted', 'orbParticleField',
      'orbGlass', 'orbReflection', 'orbCore', 'orbMark',
    ]
    for (const layer of ORB_LAYERS) {
      expect(ORB_VISUAL, `orb layer ${layer}`).toContain(`styles.${layer}`)
      expect(HOME_CSS, `orb layer ${layer} has no style`).toContain(`.${layer}`)
    }
  })

  it('keeps the orb reachable and described for assistive tech', () => {
    expect(ORB_VISUAL).toContain('aria-label')
    expect(ORB_VISUAL).toContain('aria-describedby="atlas-orb-state-description"')
    expect(ORB_VISUAL).toContain('id="atlas-orb-state-description"')
  })

  it('still answers prefers-reduced-motion', () => {
    expect(HOME_CSS).toContain('@media (prefers-reduced-motion: reduce)')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3 · The runtime state owner has not moved or forked
// ─────────────────────────────────────────────────────────────────────────────

describe('atlas orb · runtime remains the single state owner', () => {
  it('keeps exactly the seven approved states', () => {
    expect([...ATLAS_ORB_STATES]).toEqual([
      'idle', 'listening', 'thinking', 'speaking',
      'executing', 'awaiting_approval', 'warning',
    ])
  })

  it('derives state in orb-state.ts and nowhere else', () => {
    expect(ORB_STATE).toContain('export function resolveAtlasOrbState')
    expect(COMMAND_CORE).toContain('resolveAtlasOrbState')
    // The visual is handed a state; it must never compute one.
    expect(ORB_VISUAL).not.toContain('resolveAtlasOrbState')
    expect(ORB_VISUAL).toMatch(/state:\s*AtlasOrbState/)
  })

  it('drives state from the live runtime, not from a timer', () => {
    expect(COMMAND_CORE).toContain('useAtlas')
    expect(COMMAND_CORE).toContain('atlas.voicePhase')
    // A self-advancing visual state machine is the specific thing the design
    // handoff forbids: the prototype's chips are demo controls, not runtime.
    expect(COMMAND_CORE).not.toMatch(/setInterval|setTimeout/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4 · Atlas Home is insulated from the shell's accent contract
// ─────────────────────────────────────────────────────────────────────────────

describe('atlas home · is insulated from shell accent retuning', () => {
  it('consumes the palette directly, never the --os-accent contract', () => {
    // Shell slices retune --os-accent* per generation. Atlas Home reads
    // --omnira-* palette tokens instead, so that retuning provably cannot
    // reach the approved surface. This is what lets a shell slice ship
    // without re-approving Atlas.
    expect(HOME_CSS).not.toMatch(/var\(--os-accent/)
    expect(HOME_CSS).toMatch(/var\(--omnira-/)
  })

  it('keeps its orb-local variables local', () => {
    // These describe one orb's rendering, not a platform colour. If they ever
    // move to :root they become a shared contract nobody intended to sign.
    for (const local of ['--orb-cyan', '--orb-blue', '--atlas-audio-level']) {
      expect(HOME_CSS).toContain(`${local}:`)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5 · No Claude Design prototype runtime has entered the app
// ─────────────────────────────────────────────────────────────────────────────

describe('design export stays reference material', () => {
  const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|css)$/
  const SKIP_DIR = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'coverage'])

  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIR.has(entry)) continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) sourceFiles(full, out)
      else if (SOURCE_EXT.test(entry)) out.push(full)
    }
    return out
  }

  it('no app source imports the prototype runtime or a .dc.html file', () => {
    // support.js is Claude Design's generated dc-runtime — a second React shim.
    // Importing any part of it would stand a parallel rendering path beside the
    // real one, which is the duplication class the vNext plan exists to prevent.
    const offenders: string[] = []
    for (const file of sourceFiles(WEB_ROOT)) {
      const src = readFileSync(file, 'utf8')
      // This test names the forbidden tokens itself, so exclude it.
      if (file.endsWith('atlas-vnext-visual-lock.test.ts')) continue
      if (/dc-runtime|\.dc\.html|omniraAtlasSignal/.test(src)) {
        offenders.push(file.slice(WEB_ROOT.length + 1))
      }
      if (/(?:from|require\()\s*['"][^'"]*\bsupport\.js['"]/.test(src)) {
        offenders.push(file.slice(WEB_ROOT.length + 1))
      }
    }
    expect(offenders, `prototype runtime referenced in: ${offenders.join(', ')}`).toEqual([])
  })

  it('the versioned reference copy is never a build input', () => {
    // design/references/** is repo-root material. Naming that path in a comment
    // is fine and useful — it tells the next reader where the approved values
    // came from. What must never appear is a form that RESOLVES the path:
    // an import, a require, a CSS url()/@import, or a runtime fetch. Those
    // would turn the frozen export into something the app builds against.
    const REACH_IN = [
      /(?:from|require\()\s*['"][^'"]*design\/references/,
      /@import\s+[^;]*design\/references/,
      /url\(\s*['"]?[^'")]*design\/references/,
      /fetch\(\s*['"`][^'"`]*design\/references/,
    ]
    const offenders: string[] = []
    for (const file of sourceFiles(WEB_ROOT)) {
      if (file.endsWith('atlas-vnext-visual-lock.test.ts')) continue
      const src = readFileSync(file, 'utf8')
      if (REACH_IN.some((pattern) => pattern.test(src))) {
        offenders.push(file.slice(WEB_ROOT.length + 1))
      }
    }
    expect(offenders, `design export resolved from: ${offenders.join(', ')}`).toEqual([])
  })
})
