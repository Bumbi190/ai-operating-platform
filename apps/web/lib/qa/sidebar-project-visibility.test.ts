import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  shouldRenderGlobalProjectList,
  shouldRenderProjectSection,
  sidebarProjectsFor,
} from '@/lib/nav/sidebar-visibility'

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

  it('keeps workspace sub-navigation inside the section', () => {
    // The whole point of rendering the open project in vNext.
    expect(SIDEBAR).toContain('...projectNav')
    expect(SIDEBAR).toContain('mediaProjectNav')
  })
})
