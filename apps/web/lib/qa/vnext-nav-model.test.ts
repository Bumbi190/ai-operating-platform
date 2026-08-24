import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  VNEXT_NAV,
  vnextNavGroupsFor,
  vnextNavItems,
  vnextNavItemsFor,
} from '@/lib/nav/vnext-nav'
import { LEGACY_GLOBAL_NAV } from '@/lib/nav/legacy-nav'
import { resolveDestination } from '@/lib/nav/registry'

/**
 * Canonical vNext navigation model.
 *
 * Pins the owner-approved IA, and — more importantly — pins the boundaries the
 * model must not cross: no presentation, no authorization, no legacy coupling,
 * and no renderer wired up yet.
 */

const NAV_SRC = readFileSync(resolve(__dirname, '../nav/vnext-nav.ts'), 'utf8')

describe('vnext nav · approved information architecture', () => {
  it('has the four approved groups in order', () => {
    expect(VNEXT_NAV.map((g) => g.id)).toEqual(['atlas', 'arbete', 'intelligens', 'system'])
    expect(VNEXT_NAV.map((g) => g.label)).toEqual(['Atlas', 'Arbete', 'Intelligens', 'System'])
  })

  it('places every approved destination in its approved group', () => {
    const byGroup = Object.fromEntries(
      VNEXT_NAV.map((g) => [g.id, g.items.map((i) => i.label)]),
    )
    expect(byGroup.atlas).toEqual(['Atlas', 'Chat'])
    expect(byGroup.arbete).toEqual([
      'Granskningar', 'Aktivitet', 'Planering', 'Marknadsgranskning', 'Content Center',
    ])
    expect(byGroup.intelligens).toEqual(['Minne', 'Intelligence Graph', 'Revenue Center'])
    expect(byGroup.system).toEqual(['System', 'Inställningar'])
  })

  it('adds exactly the two destinations legacy could not reach', () => {
    const legacyHrefs = new Set(LEGACY_GLOBAL_NAV.map((i) => i.href))
    const added = vnextNavItems().map((i) => i.href).filter((h) => !legacyHrefs.has(h))
    // /settings was always reachable, but as a footer pill outside the nav model.
    expect(added.sort()).toEqual(['/planning', '/settings', '/system'])
  })

  it('carries no individual project links', () => {
    // ProjectRail is the canonical project surface; duplicating projects here is
    // exactly what Stage C removes.
    for (const item of vnextNavItems()) {
      expect(item.href.startsWith('/projects')).toBe(false)
    }
  })

  it('does not add Manager', () => {
    expect(vnextNavItems().map((i) => i.href)).not.toContain('/manager')
  })

  it('keeps Atlas as the single primary entry', () => {
    expect(vnextNavItems().filter((i) => i.primary).map((i) => i.href)).toEqual(['/atlas'])
  })

  it('uses unique ids and hrefs', () => {
    const items = vnextNavItems()
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
    expect(new Set(items.map((i) => i.href)).size).toBe(items.length)
  })
})

describe('vnext nav · hrefs agree with the destination registry', () => {
  it('matches the registry wherever a destination id exists', () => {
    for (const item of vnextNavItems()) {
      const resolved = resolveDestination(item.id as never)
      if (!resolved) continue // 'system'/'planning' shorthand ids, asserted below
      expect(resolved.href).toBe(item.href)
    }
  })

  it('canonicalizes the knowledge destination to Minne', () => {
    // The registry routes `knowledge` at /memory; mobile surfaced it as
    // "Knowledge" while desktop called the same page "Minne". One identity now.
    const minne = vnextNavItems().find((i) => i.href === '/memory')
    expect(minne?.id).toBe('knowledge')
    expect(minne?.label).toBe('Minne')
    expect(resolveDestination('knowledge')?.href).toBe('/memory')
    expect(vnextNavItems().filter((i) => i.href === '/memory')).toHaveLength(1)
  })
})

describe('vnext nav · surface filtering is layout, not authorization', () => {
  it('desktop shows every item', () => {
    expect(vnextNavItemsFor('desktop')).toHaveLength(vnextNavItems().length)
  })

  it('mobile is a deliberate subset, not a copy', () => {
    const mobile = vnextNavItemsFor('mobile').map((i) => i.href)
    expect(mobile).toEqual(['/atlas', '/chat', '/approvals', '/agent-activity', '/memory'])
    expect(mobile.length).toBeLessThan(vnextNavItems().length)
  })

  it('drops empty groups per surface rather than rendering a bare heading', () => {
    expect(vnextNavGroupsFor('mobile').map((g) => g.id)).toEqual(['atlas', 'arbete', 'intelligens'])
    expect(vnextNavGroupsFor('desktop').map((g) => g.id)).toEqual(VNEXT_NAV.map((g) => g.id))
  })

  it('every mobile item is also a desktop item', () => {
    const desktop = new Set(vnextNavItemsFor('desktop').map((i) => i.href))
    for (const item of vnextNavItemsFor('mobile')) expect(desktop.has(item.href)).toBe(true)
  })

  it('models no permissions, roles or scopes', () => {
    // Navigation visibility must never become an access decision. If a future
    // edit adds these, the boundary has been crossed.
    for (const forbidden of ['permission', 'role', 'authoriz', 'allowed', 'canAccess', 'scope']) {
      expect(NAV_SRC.toLowerCase()).not.toContain(forbidden.toLowerCase() + ':')
    }
  })
})

describe('vnext nav · stays data, and stays unwired', () => {
  it('encodes no presentation', () => {
    expect(NAV_SRC).not.toMatch(/className|text-\[|bg-\[|rgba?\(|#[0-9a-fA-F]{6}/)
  })

  it('is not yet consumed by any renderer', () => {
    // C2 is architecture preparation. The visible switch is C3-C6, each with its
    // own proof; this asserts the foundation shipped without a silent rollout.
    const consumers = ['components/platform/Sidebar.tsx', 'components/platform/vnext/AtlasMobileNav.tsx']
    for (const rel of consumers) {
      const src = readFileSync(resolve(__dirname, '../..', rel), 'utf8')
      expect(src).not.toContain('vnext-nav')
    }
  })

  it('does not import from the legacy definition', () => {
    // Referring to legacy-nav in a comment is fine and useful; importing it
    // would couple the two models so a vNext edit could reach legacy.
    expect(NAV_SRC).not.toMatch(/^\s*import[^\n]*legacy-nav/m)
    expect(LEGACY_GLOBAL_NAV).toHaveLength(9)
  })
})
