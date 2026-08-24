import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  shouldRenderGlobalProjectList,
  shouldRenderProjectSection,
  shouldRenderSettingsFooter,
  sidebarProjectsFor,
} from '@/lib/nav/sidebar-visibility'
import { LEGACY_GLOBAL_NAV } from '@/lib/nav/legacy-nav'
import { vnextNavItemsFor } from '@/lib/nav/vnext-nav'

/**
 * Sidebar project-section visibility.
 *
 * C3 changes an actual render decision, so pinning it by reading Sidebar's
 * source — the temporary floor C1 established — is not enough on its own. The
 * decision was extracted into pure functions that Sidebar consumes, so the test
 * exercises the real thing rather than a restatement of intent.
 *
 * The last block asserts the coupling: if Sidebar stops calling these, the
 * tests above would keep passing while the shell did something else entirely.
 */

const SIDEBAR = readFileSync(
  resolve(__dirname, '../../components/platform/Sidebar.tsx'),
  'utf8',
)

const PROJECTS = [
  { slug: 'ai-media-automation', name: 'The Prompt' },
  { slug: 'familje-stunden', name: 'Familje-Stunden' },
  { slug: 'gainpilot', name: 'GainPilot' },
  { slug: 'studieos', name: 'StudieOS' },
]

describe('sidebar · global project list', () => {
  it('legacy renders it', () => {
    expect(shouldRenderGlobalProjectList('legacy')).toBe(true)
  })

  it('vNext does not — ProjectRail is canonical', () => {
    expect(shouldRenderGlobalProjectList('vnext')).toBe(false)
  })
})

describe('sidebar · which projects render', () => {
  it('legacy renders every project, in order, wherever you are', () => {
    for (const active of [undefined, 'gainpilot']) {
      expect(sidebarProjectsFor('legacy', PROJECTS, active).map((p) => p.slug))
        .toEqual(PROJECTS.map((p) => p.slug))
    }
  })

  it('vNext renders none while outside a project', () => {
    expect(sidebarProjectsFor('vnext', PROJECTS, undefined)).toEqual([])
  })

  it('vNext renders only the open project, so its workspace nav keeps an anchor', () => {
    for (const slug of PROJECTS.map((p) => p.slug)) {
      expect(sidebarProjectsFor('vnext', PROJECTS, slug).map((p) => p.slug)).toEqual([slug])
    }
  })

  it('vNext renders none for a slug that is not in the allowed set', () => {
    // The list is already scoped server-side; this only confirms the filter does
    // not invent an entry from an unknown slug.
    expect(sidebarProjectsFor('vnext', PROJECTS, 'not-a-project')).toEqual([])
  })

  it('never mutates the caller list', () => {
    const copy = [...PROJECTS]
    sidebarProjectsFor('legacy', PROJECTS, 'gainpilot')
    sidebarProjectsFor('vnext', PROJECTS, 'gainpilot')
    expect(PROJECTS).toEqual(copy)
  })
})

describe('sidebar · whether the section renders at all', () => {
  it('legacy always shows it, including with no projects at all', () => {
    expect(shouldRenderProjectSection('legacy', PROJECTS, undefined)).toBe(true)
    expect(shouldRenderProjectSection('legacy', [], undefined)).toBe(true)
  })

  it('vNext hides it on Atlas Home', () => {
    // Where ProjectRail already lists every project.
    expect(shouldRenderProjectSection('vnext', PROJECTS, undefined)).toBe(false)
  })

  it('vNext shows it inside a project', () => {
    expect(shouldRenderProjectSection('vnext', PROJECTS, 'studieos')).toBe(true)
  })

  it('vNext hides it rather than offering an empty state', () => {
    // Legacy owns "Driftsätt ditt första system"; vNext must not show a bare
    // heading or a deploy CTA where there is no list to speak of.
    expect(shouldRenderProjectSection('vnext', [], undefined)).toBe(false)
    expect(shouldRenderProjectSection('vnext', [], 'gainpilot')).toBe(false)
  })
})

describe('sidebar · settings placement', () => {
  it('legacy keeps the footer pill — Settings was never in its nav list', () => {
    expect(shouldRenderSettingsFooter('legacy')).toBe(true)
    expect(LEGACY_GLOBAL_NAV.map((i) => i.href)).not.toContain('/settings')
  })

  it('vNext drops the pill, because the nav list now carries Inställningar', () => {
    expect(shouldRenderSettingsFooter('vnext')).toBe(false)
    expect(vnextNavItemsFor('desktop').map((i) => i.href)).toContain('/settings')
  })

  it('never shows Settings twice in the same generation', () => {
    for (const generation of ['legacy', 'vnext'] as const) {
      const inNav = generation === 'vnext'
        ? vnextNavItemsFor('desktop').filter((i) => i.href === '/settings').length
        : LEGACY_GLOBAL_NAV.filter((i) => i.href === '/settings').length
      const inFooter = shouldRenderSettingsFooter(generation) ? 1 : 0
      expect(inNav + inFooter).toBe(1)
    }
  })
})

describe('sidebar · which nav list each generation renders', () => {
  it('vNext renders the canonical model in its approved order', () => {
    expect(vnextNavItemsFor('desktop').map((i) => i.label)).toEqual([
      'Atlas', 'Chat',
      'Granskningar', 'Aktivitet', 'Planering', 'Marknadsgranskning', 'Content Center',
      'Minne', 'Intelligence Graph', 'Revenue Center',
      'System', 'Inställningar',
    ])
  })

  it('adds exactly the three approved destinations', () => {
    const legacy = new Set(LEGACY_GLOBAL_NAV.map((i) => i.href))
    const added = vnextNavItemsFor('desktop').map((i) => i.href).filter((h) => !legacy.has(h))
    expect(added.sort()).toEqual(['/planning', '/settings', '/system'])
  })

  it('drops nothing that legacy carried', () => {
    const vnext = new Set(vnextNavItemsFor('desktop').map((i) => i.href))
    for (const item of LEGACY_GLOBAL_NAV) expect(vnext.has(item.href)).toBe(true)
  })

  it('still excludes Manager and any project link', () => {
    const hrefs = vnextNavItemsFor('desktop').map((i) => i.href)
    expect(hrefs).not.toContain('/manager')
    expect(hrefs.some((h) => h.startsWith('/projects'))).toBe(false)
  })

  it('legacy order is untouched by the vNext reorder', () => {
    expect(LEGACY_GLOBAL_NAV.map((i) => i.href)).toEqual([
      '/atlas', '/atlas/marketing', '/atlas/content', '/revenue',
      '/agent-activity', '/chat', '/approvals', '/memory', '/intelligence/graph',
    ])
  })
})

describe('sidebar · the shell actually consumes these decisions', () => {
  it('imports the visibility module', () => {
    expect(SIDEBAR).toContain("from '@/lib/nav/sidebar-visibility'")
  })

  it('renders the list from the resolved set, not the raw prop', () => {
    expect(SIDEBAR).toContain('sidebarProjects.map')
    expect(SIDEBAR).not.toContain('projects.map((project)')
  })

  it('gates the section and the deploy affordances on the decisions', () => {
    expect(SIDEBAR).toContain('{showProjectSection && (')
    expect(SIDEBAR).toContain('{showGlobalProjectList && (')
    expect(SIDEBAR).toContain('{showGlobalProjectList && projects.length === 0 && (')
  })

  it('renders the nav list from the resolved sections, not the legacy constant', () => {
    expect(SIDEBAR).toContain('section.items.map')
    expect(SIDEBAR).toContain("from '@/lib/nav/vnext-nav'")
    expect(SIDEBAR).toContain("vnextNavGroupsFor('desktop')")
    expect(SIDEBAR).not.toContain('globalNav.map')
  })

  it('renders one heading per section, from the section label', () => {
    // Presentational only: the heading reuses the sidebar's existing eyebrow
    // treatment rather than introducing a competing style, and carries no state.
    expect(SIDEBAR).toContain('{section.label}')
    expect(SIDEBAR).toMatch(/eyebrow !text-\[9px\] !text-faint/)
  })

  it('gates the settings footer on the decision', () => {
    expect(SIDEBAR).toContain('{showSettingsFooter && (')
  })

  it('keeps workspace sub-navigation inside the section', () => {
    // The whole point of rendering the open project in vNext.
    expect(SIDEBAR).toContain('...projectNav')
    expect(SIDEBAR).toContain('mediaProjectNav')
  })
})
