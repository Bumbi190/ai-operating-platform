import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { vnextNavItemsFor } from '@/lib/nav/vnext-nav'
import { resolveDestination } from '@/lib/nav/registry'
import { LEGACY_PROJECT_NAV } from '@/lib/nav/legacy-nav'
import { shouldRenderGlobalProjectList } from '@/lib/nav/sidebar-visibility'

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
 * What this suite guards is that reconciliation is all that happened: the same
 * five destinations, in the same order, with the model — not the component —
 * deciding which are mobile.
 */

const read = (rel: string) => readFileSync(resolve(__dirname, '../..', rel), 'utf8')

const MOBILE = read('components/platform/vnext/AtlasMobileNav.tsx')

describe('mobile nav · destinations are unchanged', () => {
  it('renders the same five destinations, in the same order, as before C6', () => {
    // The pre-C6 list, resolved exactly as the component used to build it.
    const before = ['atlas', 'chat', 'approvals', 'activity', 'knowledge']
      .map((id) => resolveDestination(id as never)?.href)
    expect(vnextNavItemsFor('mobile').map((i) => i.href)).toEqual(before)
  })

  it('is exactly the five approved mobile entries', () => {
    expect(vnextNavItemsFor('mobile').map((i) => i.href)).toEqual([
      '/atlas', '/chat', '/approvals', '/agent-activity', '/memory',
    ])
  })

  it('adds no new route', () => {
    for (const item of vnextNavItemsFor('mobile')) {
      expect(resolveDestination(item.id as never)?.href ?? item.href).toBe(item.href)
    }
  })
})

describe('mobile nav · identity is now canonical', () => {
  it('uses the desktop labels, retiring the registry English ones', () => {
    expect(vnextNavItemsFor('mobile').map((i) => i.label)).toEqual([
      'Atlas', 'Chat', 'Granskningar', 'Aktivitet', 'Minne',
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

  it('adds no Manager and no project route', () => {
    const hrefs = vnextNavItemsFor('mobile').map((i) => i.href)
    expect(hrefs).not.toContain('/manager')
    expect(hrefs.some((h) => h.startsWith('/projects'))).toBe(false)
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
    expect(MOBILE).not.toContain('projects.map')
    expect(MOBILE).not.toContain('AtlasHomeProjectSummary')
    expect(MOBILE).not.toMatch(/\bprojects\b/)
    expect(MOBILE).not.toContain('/projects')
  })

  it('leaves ProjectRail owning project selection on the same page', () => {
    // Removing the duplicate is only safe while the canonical surface is still
    // mounted beside it and still receives its data.
    const home = read('components/platform/vnext/AtlasHomeVNext.tsx')
    expect(home).toContain('<ProjectRail')
    expect(home).toContain('projects={model.projects}')
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
