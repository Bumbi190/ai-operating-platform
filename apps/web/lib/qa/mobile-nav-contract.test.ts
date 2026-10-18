import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { vnextNavItemsFor } from '@/lib/nav/vnext-nav'
import { resolveDestination } from '@/lib/nav/registry'
import { LEGACY_PROJECT_NAV } from '@/lib/nav/legacy-nav'
import { shouldRenderGlobalProjectList } from '@/lib/nav/sidebar-visibility'
import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AtlasMobileNav } from '@/components/platform/vnext/AtlasMobileNav'

;(globalThis as unknown as { React: typeof React }).React = React

/**
 * Mobile navigation contract.
 *
 * C6 reconciles AtlasMobileNav onto the canonical model so navigation identity
 * cannot drift between surfaces again. It had already drifted: mobile built its
 * list straight from the registry, which labels the same destinations
 * "Approvals", "Activity" and "Knowledge" where desktop shows "Granskningar",
 * "Aktivitet" and "Minne" — and `knowledge` is an alias to /memory that never
 * had a page.
 *
 * What this suite guards: the same five original destinations stay in order,
 * while the dedicated /projects portfolio entry is now also accessible on
 * mobile. The model — not the component — still owns the destination list.
 */

const read = (rel: string) => readFileSync(resolve(__dirname, '../..', rel), 'utf8')

const MOBILE = read('components/platform/vnext/AtlasMobileNav.tsx')
const MOBILE_CODE = MOBILE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('mobile nav · portfolio quick jump', () => {
  it('keeps the same five original destinations, in the same order', () => {
    const original = ['atlas', 'chat', 'approvals', 'activity', 'knowledge']
      .map((id) => resolveDestination(id as never)!.href)
    const current = vnextNavItemsFor('mobile').map((i) => i.href)
    expect(original.every((href) => current.includes(href))).toBe(true)
    expect(original).toEqual(current.filter((href) => href !== '/projects' && href !== '/build' && href !== '/dashboard' && href !== '/calendar'))
  })

  it('includes the builder and portfolio index, never an individual project', () => {
    expect(vnextNavItemsFor('mobile').map((i) => i.href)).toEqual([
      '/dashboard', '/atlas', '/chat', '/build', '/projects', '/approvals', '/agent-activity', '/calendar', '/memory',
    ])
    expect(vnextNavItemsFor('mobile').map((i) => i.href).filter((href) => href.startsWith('/projects/'))).toEqual([])
  })

  it('uses the already-implemented, scoped project index', () => {
    const index = read('app/(platform)/projects/page.tsx')
    expect(index).toContain('loadAtlasHomeViewModel()')
    expect(index).toContain('composeAtlasRailCards(model.projects)')
    expect(index).toContain('<ProjectCoverGallery cards={cards} projectsAvailable={projectsAvailable} />')
  })

  it('renders one actual, tappable Projekt link in the mobile header', () => {
    const markup = renderToStaticMarkup(createElement(AtlasMobileNav))
    expect(markup).toMatch(/href="\/projects"[^>]*>Projekt<\/a>/)
    expect(markup.match(/href="\/projects"/g)).toHaveLength(1)
  })
})

describe('mobile nav · identity is now canonical', () => {
  it('uses the desktop labels, including the portfolio quick jump', () => {
    expect(vnextNavItemsFor('mobile').map((i) => i.label)).toEqual([
      'Översikt', 'Atlas', 'Chat', 'Bygg med Atlas', 'Projekt', 'Granskningar', 'Aktivitet', 'Kalender', 'Minne',
    ])
  })

  it('shows Minne rather than a separate Knowledge identity', () => {
    const memory = vnextNavItemsFor('mobile').find((i) => i.href === '/memory')
    expect(memory?.label).toBe('Minne')
    // The alias still exists in the registry — C6 retires the LABEL, it does not
    // invent or delete a destination.
    expect(resolveDestination('knowledge')?.href).toBe('/memory')
  })

  it('labels match desktop for every shared destination', () => {
    // The whole point: one identity per destination across both surfaces.
    const desktop = new Map(vnextNavItemsFor('desktop').map((i) => [i.href, i.label]))
    for (const item of vnextNavItemsFor('mobile')) {
      expect(item.label).toBe(desktop.get(item.href))
    }
  })
})

describe('mobile nav · scope was not broadened', () => {
  it('excludes every desktop-only destination', () => {
    const mobile = new Set(vnextNavItemsFor('mobile').map((i) => i.href))
    for (const href of [
      '/planning', '/atlas/marketing', '/atlas/content',
      '/revenue', '/system', '/settings', '/intelligence/graph',
    ]) {
      expect(mobile.has(href)).toBe(false)
    }
  })

  it('adds no Manager and no individual project routes', () => {
    const hrefs = vnextNavItemsFor('mobile').map((i) => i.href)
    expect(hrefs).not.toContain('/manager')
    expect(hrefs).toContain('/projects')
    expect(hrefs.some((h) => h.startsWith('/projects/'))).toBe(false)
  })

  it('stays a strict subset of desktop', () => {
    const desktop = new Set(vnextNavItemsFor('desktop').map((i) => i.href))
    const mobile = vnextNavItemsFor('mobile')
    for (const item of mobile) expect(desktop.has(item.href)).toBe(true)
    expect(mobile.length).toBeLessThan(desktop.size)
  })
})

describe('mobile nav · the component consumes the model', () => {
  it('imports the canonical model and no longer builds its own list', () => {
    expect(MOBILE).toContain("from '@/lib/nav/vnext-nav'")
    expect(MOBILE).toContain("vnextNavItemsFor('mobile')")
    expect(MOBILE).not.toContain('resolveDestination')
  })

  it('renders no project list of its own', () => {
    // C6 froze this list in place because project navigation was out of its
    // scope. C.7 removes it: ProjectRail is the canonical project surface and
    // sits on the same page, so the menu copy was a second path to the same
    // destinations rather than the only one.
    //
    // Asserted by absence of the rendering path AND of the data that fed it,
    // so a future edit cannot reintroduce it under a different shape.
    expect(MOBILE_CODE).not.toContain('projects.map')
    expect(MOBILE_CODE).not.toContain('AtlasHomeProjectSummary')
    expect(MOBILE_CODE).not.toMatch(/\bprojects\b/)
    expect(MOBILE_CODE).not.toContain('/projects')
  })

  it('leaves ProjectRail owning project selection on the same page', () => {
    // Removing the duplicate is only safe while the canonical surface is still
    // mounted beside it and still receives its data.
    const home = read('components/platform/vnext/AtlasHomeVNext.tsx')
    expect(home).toContain('<ProjectRail')
    // The rail takes composed cards rather than a bare project array since
    // first-party system workspaces joined it, but the authorized project data
    // still reaches it and nothing else feeds project selection.
    expect(home).toMatch(/composeAtlasRailCards\(\s*model\.projects(?:\s*,|\s*\))/)
    expect(home).toContain('<AtlasMobileNav')
    // And the mobile nav is no longer handed project data at all.
    expect(home).not.toMatch(/<AtlasMobileNav[^>]*projects=/)
  })

  it('leaves project-route workspace context alone', () => {
    // Active-project context belongs to the sidebar, which derives it from the
    // pathname. AtlasMobileNav mounts only on Atlas Home and never took part.
    const sidebar = read('components/platform/Sidebar.tsx')
    expect(sidebar).toContain('const activeSlug = pathname.match(/\\/projects\\/([^/]+)/)?.[1]')
    expect(sidebar).toContain('shouldRenderProjectSection')
  })

  it('leaves legacy project navigation unchanged', () => {
    expect(LEGACY_PROJECT_NAV.length).toBeGreaterThan(0)
    expect(shouldRenderGlobalProjectList('legacy')).toBe(true)
    expect(shouldRenderGlobalProjectList('vnext')).toBe(false)
  })

  it('does not reach for the desktop surface', () => {
    expect(MOBILE).not.toContain("vnextNavItemsFor('desktop')")
    expect(MOBILE).not.toContain('vnextNavGroupsFor')
  })

  it('renders no group headings — mobile stays a flat quick-jump list', () => {
    expect(MOBILE).not.toContain('section.label')
    expect(MOBILE).not.toContain('VNEXT_NAV')
  })
})
