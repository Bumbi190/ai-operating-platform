import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  LEGACY_GLOBAL_NAV,
  LEGACY_MEDIA_PROJECT_NAV,
  LEGACY_PROJECT_NAV,
  LEGACY_SETTINGS_HREF,
} from '@/lib/nav/legacy-nav'
import {
  shouldRenderProjectSection,
  sidebarProjectsFor,
} from '@/lib/nav/sidebar-visibility'

/**
 * Legacy navigation contract.
 *
 * Stage C gives vNext its own information architecture. Every slice after this
 * one changes what a SHARED component renders, so the byte-identical reversal
 * proof used through A2.x stops applying. This suite is the replacement: it
 * pins what legacy renders today, so a vNext IA change cannot quietly alter it.
 *
 * It asserts against the same module Sidebar imports, not a transcribed copy —
 * a copy would drift with the source and prove nothing. Sidebar itself is a
 * client component wired to next/navigation, the Supabase browser client and a
 * CSS module, so rendering it in a unit test is not sound; the data was lifted
 * into a pure module instead, unchanged.
 *
 * Where a claim genuinely depends on rendering — that the project list and the
 * Settings footer are still emitted — the assertion reads Sidebar's source. That
 * is weaker than a render test and is called out as such rather than dressed up.
 */

const SIDEBAR = readFileSync(
  resolve(__dirname, '../../components/platform/Sidebar.tsx'),
  'utf8',
)

describe('legacy nav · global entries are frozen', () => {
  it('has exactly nine entries', () => {
    expect(LEGACY_GLOBAL_NAV).toHaveLength(9)
  })

  it('preserves every href in exact order', () => {
    expect(LEGACY_GLOBAL_NAV.map((i) => i.href)).toEqual([
      '/atlas',
      '/atlas/marketing',
      '/atlas/content',
      '/revenue',
      '/agent-activity',
      '/chat',
      '/approvals',
      '/memory',
      '/intelligence/graph',
    ])
  })

  it('preserves every label in exact order', () => {
    expect(LEGACY_GLOBAL_NAV.map((i) => i.label)).toEqual([
      'Atlas',
      'Marknadsgranskning',
      'Content Center',
      'Revenue Center',
      'Aktivitet',
      'Chat',
      'Granskningar',
      'Minne',
      'Intelligence Graph',
    ])
  })

  it('keeps Atlas as the only primary entry', () => {
    const primary = LEGACY_GLOBAL_NAV.filter((i) => i.primary)
    expect(primary.map((i) => i.href)).toEqual(['/atlas'])
  })

  it('gives every entry an icon', () => {
    for (const item of LEGACY_GLOBAL_NAV) expect(item.icon).toBeTruthy()
  })

  it('does not leak vNext-only destinations into legacy', () => {
    // Planning, System, Manager and Operations are reachable by URL but have
    // deliberately never been in legacy nav. Stage C adds them to vNext ONLY.
    const hrefs = LEGACY_GLOBAL_NAV.map((i) => i.href)
    for (const hidden of ['/planning', '/system', '/manager', '/atlas/operations']) {
      expect(hrefs).not.toContain(hidden)
    }
  })
})

describe('legacy nav · project workspace sub-navigation', () => {
  it('preserves the project nav entries in order', () => {
    expect(LEGACY_PROJECT_NAV.map((i) => [i.href, i.label])).toEqual([
      ['/agents', 'Agenter'],
      ['/workflows', 'Arbetsflöden'],
      ['/runs', 'Körningar'],
      ['/outputs', 'Utdata'],
    ])
  })

  it('preserves the media project nav entries in order', () => {
    expect(LEGACY_MEDIA_PROJECT_NAV.map((i) => [i.href, i.label])).toEqual([
      ['/media', 'Mediepipeline'],
      ['/generate', 'Generera'],
      ['/news', 'Nyhetsflöde'],
      ['/scripts', 'Manuskriptkö'],
    ])
  })

  it('keeps workspace nav relative, so it composes under /projects/<slug>', () => {
    for (const item of [...LEGACY_PROJECT_NAV, ...LEGACY_MEDIA_PROJECT_NAV]) {
      expect(item.href.startsWith('/')).toBe(true)
      expect(item.href.startsWith('/projects')).toBe(false)
    }
  })
})

describe('legacy nav · shell still renders the pieces that are not data', () => {
  // Source-level assertions. Weaker than rendering, but they hold against the
  // real file and would catch outright removal — which is the failure mode
  // Stage C could plausibly introduce.

  it('still maps over a project list, and legacy still resolves to all of them', () => {
    // C3 moved the shell from mapping the raw prop to mapping a resolved set,
    // so the render decision could be unit-tested. The source assertion tracks
    // that rename; the guarantee that matters — legacy renders every project —
    // is asserted against the real helper rather than against source text.
    expect(SIDEBAR).toContain('sidebarProjects.map')
    const projects = [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }]
    expect(sidebarProjectsFor('legacy', projects, undefined)).toEqual(projects)
    expect(sidebarProjectsFor('legacy', projects, 'b')).toEqual(projects)
    expect(shouldRenderProjectSection('legacy', projects, undefined)).toBe(true)
  })

  it('still composes workspace nav for a project', () => {
    expect(SIDEBAR).toContain('...projectNav')
    expect(SIDEBAR).toContain('mediaProjectNav')
  })

  it('still renders the Settings footer destination', () => {
    expect(LEGACY_SETTINGS_HREF).toBe('/settings')
    expect(SIDEBAR).toContain(`href="${LEGACY_SETTINGS_HREF}"`)
  })

  it('renders the global list from the shared definition, not an inline copy', () => {
    // If someone re-inlines the array, this contract stops guarding the real
    // thing — so the coupling itself is pinned.
    expect(SIDEBAR).toContain("from '@/lib/nav/legacy-nav'")
    expect(SIDEBAR).toContain('globalNav.map')
    expect(SIDEBAR).not.toMatch(/const\s+globalNav\s*=\s*\[/)
  })

  it('still gates vNext styling on the resolved generation only', () => {
    // Stage C must not turn the generation into anything other than a switch.
    expect(SIDEBAR).toContain('isVNext(uiGeneration)')
  })
})
