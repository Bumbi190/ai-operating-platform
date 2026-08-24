import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { vnextNavItemsFor } from '@/lib/nav/vnext-nav'
import { resolveDestination } from '@/lib/nav/registry'

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

const MOBILE = readFileSync(
  resolve(__dirname, '../../components/platform/vnext/AtlasMobileNav.tsx'),
  'utf8',
)

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

  it('keeps its project links untouched', () => {
    // Project navigation is explicitly out of C6's scope.
    expect(MOBILE).toContain('projects.map')
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
