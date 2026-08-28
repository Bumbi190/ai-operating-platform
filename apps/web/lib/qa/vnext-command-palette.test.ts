/**
 * Command palette — vNext skin, one implementation.
 *
 * The palette is shared by both generations and is the only ⌘K surface in the
 * platform. So the danger in restyling it is twofold: legacy inheriting the new
 * look (it is the rollback path until PR #82 lands), and the refresh quietly
 * touching search, keyboard or navigation while moving colours around.
 *
 * These tests therefore pin three things: legacy renders exactly the values it
 * shipped with, vNext renders the cyan/teal identity, and the behaviour is
 * literally the same code for both.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const WEB_ROOT = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(WEB_ROOT, p), 'utf8')

const PALETTE = read('components/platform/os/CommandPalette.tsx')
const HOST = read('components/platform/os/CommandPaletteHost.tsx')
const BAR = read('components/platform/os/CommandBar.tsx')
const LAYOUT = read('app/(platform)/layout.tsx')

/** The theme block for one variant, so assertions cannot leak across variants. */
function themeBlock(variant: 'legacy' | 'vnext'): string {
  const start = PALETTE.indexOf(`  ${variant}: {`)
  expect(start, `${variant} theme block present`).toBeGreaterThan(-1)
  const rest = PALETTE.slice(start)
  return rest.slice(0, rest.indexOf('\n  },'))
}

describe('generation separation', () => {
  it('vNext mounts the palette with the vnext variant', () => {
    expect(HOST).toContain('variant="vnext"')
  })

  it('legacy relies on the default, so CommandBar needed no change at all', () => {
    expect(PALETTE).toContain("variant = 'legacy'")
    // Assert on the PROP, not the word — CommandBar has an unrelated Swedish
    // comment ("en minimal variant") that a bare substring check would hit.
    expect(BAR).not.toMatch(/variant\s*=\s*["{]/)
    expect(BAR).toContain('<CommandPalette')
  })

  it('the default is legacy, so any other existing mount is unaffected', () => {
    expect(PALETTE).toMatch(/variant\?:\s*CommandPaletteVariant/)
    expect(PALETTE).toContain("variant = 'legacy'")
  })
})

describe('LEGACY INVARIANT — the old skin is byte-preserved', () => {
  const legacy = themeBlock('legacy')

  it('keeps the exact panel surface and indigo edge it shipped with', () => {
    expect(legacy).toContain('linear-gradient(180deg, rgba(13,16,32,0.98), rgba(8,10,22,0.98))')
    expect(legacy).toContain('1px solid rgba(99,102,241,0.22)')
  })

  it('keeps the exact backdrop, divider, spinner and row treatments', () => {
    expect(legacy).toContain('bg-black/55 backdrop-blur-sm animate-fade-in')
    expect(legacy).toContain('rgba(255,255,255,0.06)')
    expect(legacy).toContain('text-indigo-300')
    expect(legacy).toContain('bg-indigo-500/12')
    expect(legacy).toContain('hover:bg-white/[0.03]')
  })

  it('keeps the exact icon tints, including the gold Ask-Atlas marker', () => {
    expect(legacy).toContain('rgba(255,255,255,0.04)')
    expect(legacy).toContain('#a5b4fc')
    expect(legacy).toContain('rgba(212,165,116,0.14)')
    expect(legacy).toContain('#d4a574')
  })

  it('draws no selection marker, exactly as before', () => {
    expect(legacy).toContain("rowActiveMarker: 'none'")
  })
})

describe('vNEXT — dark glass, cyan/teal, no legacy purple', () => {
  const vnext = themeBlock('vnext')

  it('uses the canonical cyan and teal token values', () => {
    expect(vnext).toMatch(/rgba\(34,\s*211,\s*238/)   // --omnira-cyan  #22d3ee
    expect(vnext).toContain('#67e8f9')                // --omnira-cyan-soft
    expect(vnext).toMatch(/rgba\(45,\s*212,\s*191/)   // --omnira-teal  #2dd4bf
    expect(vnext).toContain('#5eead4')                // --omnira-teal-soft
  })

  it('carries no indigo, violet, purple or gold', () => {
    expect(vnext).not.toMatch(/rgba\(99,\s*102,\s*241/)   // indigo
    expect(vnext).not.toMatch(/rgba\(139,\s*92,\s*246/)   // violet
    expect(vnext).not.toMatch(/#6366f1|#818cf8|#a5b4fc|#8b5cf6|#d4a574/i)
    expect(vnext).not.toMatch(/indigo|violet|purple|fuchsia|pink/i)
  })

  it('is near-black glass with a cyan edge rather than the legacy surface', () => {
    expect(vnext).toContain('rgba(7,14,26,0.985)')
    expect(vnext).toContain('1px solid rgba(34,211,238,0.20)')
    expect(vnext).toContain('boxShadow')
  })

  it('dims the app without a purple tint', () => {
    expect(vnext).toContain('bg-[#01060e]/70')
    expect(vnext).not.toContain('bg-black/55')
  })

  it('keeps the glow restrained — no oversized halo', () => {
    const blurs = [...vnext.matchAll(/\d+px\s+(\d+)px\s+rgba/g)].map(m => Number(m[1]))
    expect(blurs.length).toBeGreaterThan(0)
    expect(Math.max(...blurs)).toBeLessThanOrEqual(72)
  })

  it('does not key off --os-accent, which is generation-scoped', () => {
    expect(PALETTE).not.toMatch(/var\(\s*--os-accent/)
  })
})

describe('selection marker adds no layout shift', () => {
  it('is drawn as an inset shadow, not a border or padding change', () => {
    const vnext = themeBlock('vnext')
    expect(vnext).toMatch(/rowActiveMarker:\s*'inset /)
    // Applied via boxShadow only — nothing that changes box size.
    expect(PALETTE).toContain('{ boxShadow: theme.rowActiveMarker }')
    expect(PALETTE).not.toMatch(/isActive\s*\?\s*'border-l/)
    expect(PALETTE).not.toMatch(/isActive\s*\?\s*'pl-/)
  })
})

describe('BEHAVIOUR INVARIANT — one implementation, untouched', () => {
  it('there is exactly one CommandPalette component', () => {
    expect((PALETTE.match(/export function CommandPalette\b/g) ?? []).length).toBe(1)
  })

  it('keyboard handling is unchanged', () => {
    for (const key of ['Escape', 'ArrowDown', 'ArrowUp', 'Enter']) {
      expect(PALETTE, key).toContain(`e.key === '${key}'`)
    }
    expect(PALETTE).toContain('onKeyDown={onKeyDown}')
  })

  it('search and navigation still come from the registry', () => {
    expect(PALETTE).toContain('searchDestinations(query, { projects })')
    expect(PALETTE).toContain('router.push(row.href)')
  })

  it('the Ask Atlas path is unchanged', () => {
    expect(PALETTE).toContain("row.kind === 'intent'")
    expect(PALETTE).toContain("fetch('/api/conversations'")
    expect(PALETTE).toContain('router.push(`/chat/${conv.id}?send=${encodeURIComponent(query.trim())}`)')
    expect(PALETTE).toContain('No matches. Press Enter to ask Atlas.')
  })

  it('dialog semantics and focus-on-open are unchanged', () => {
    expect(PALETTE).toContain('role="dialog"')
    expect(PALETTE).toContain('aria-modal="true"')
    expect(PALETTE).toContain('aria-label="Command palette"')
    expect(PALETTE).toContain('inputRef.current?.focus()')
  })

  it('keeps the non-colour cue on the selected row', () => {
    // The ⏎ glyph on the active row is an affordance that survives without
    // colour perception.
    expect(PALETTE).toContain('{isActive && !row.hint && <CornerDownLeft')
  })

  it('geometry is shared, so neither generation stretches on ultrawide', () => {
    expect(PALETTE).toContain('max-w-xl')
    expect(PALETTE).toContain('max-h-[52vh]')
    expect(PALETTE).toContain('overflow-y-auto')
    // One panel element, so the sizing cannot diverge per variant.
    expect((PALETTE.match(/max-w-xl/g) ?? []).length).toBe(1)
  })
})

describe('exactly one ⌘K listener per generation', () => {
  it('the host owns one, CommandBar owns one, and only one mounts', () => {
    expect((HOST.match(/addEventListener\('keydown'/g) ?? []).length).toBe(1)
    expect((BAR.match(/addEventListener\('keydown'/g) ?? []).length).toBe(1)
    // The layout picks exactly one of them.
    expect(LAYOUT).toContain('isVNext(uiGeneration) ? (')
    expect((LAYOUT.match(/<CommandPaletteHost/g) ?? []).length).toBe(1)
    expect((LAYOUT.match(/<CommandBar/g) ?? []).length).toBe(1)
  })

  it('no second palette mount was introduced', () => {
    // Line-initial only: the host's own doc comment names `<CommandPalette>` in
    // prose, and a doc mention is not a mount.
    expect((HOST.match(/^\s*<CommandPalette\b/gm) ?? []).length).toBe(1)
    expect((BAR.match(/^\s*<CommandPalette\b/gm) ?? []).length).toBe(1)
  })

  it('no second generation resolver was introduced', () => {
    expect(HOST).not.toContain('resolveUiGeneration')
    expect(PALETTE).not.toContain('resolveUiGeneration')
    expect(PALETTE).not.toContain('usePathname')
  })
})
