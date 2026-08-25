import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Shared theme token contract.
 *
 * Two rules in globals.css are load-bearing in ways that are invisible at the
 * call site, so they get pinned here rather than trusted to review.
 *
 * 1. `.text-secondary` is claimed by two systems. Tailwind emits it from the
 *    `secondary` theme colour — a dark SURFACE token — while Omnira uses the
 *    same name for a readable text token. Both are single classes, so for a
 *    long time only source order decided the winner. A reorder would have
 *    flipped ~118 usages across the app to near-black text with no error.
 *    The custom rule therefore has to win on SPECIFICITY, not position.
 *
 * 2. `.eyebrow-accent` used to hard-code legacy indigo, which meant it stayed
 *    indigo under the vNext generation. It now reads the accent contract, whose
 *    default must remain byte-identical to the old literal.
 */

const CSS = readFileSync(
  resolve(__dirname, '../../app/globals.css'),
  'utf8',
)

/** The custom rule, captured with its selector. */
function customTextSecondaryRule(): { selector: string; body: string } {
  const match = CSS.match(/([^{}\n]*\.text-secondary)\s*\{([^}]*--omnira-text-2[^}]*)\}/)
  if (!match) throw new Error('custom .text-secondary rule not found in globals.css')
  return { selector: match[1].trim(), body: match[2].trim() }
}

describe('theme tokens · .text-secondary must win on specificity', () => {
  it('still maps to the readable Omnira text token', () => {
    expect(customTextSecondaryRule().body).toContain('var(--omnira-text-2)')
  })

  it('is NOT a bare single-class selector', () => {
    // A bare `.text-secondary` ties with Tailwind's utility, which is exactly
    // the regression this suite exists to prevent.
    const { selector } = customTextSecondaryRule()
    expect(selector).not.toBe('.text-secondary')
  })

  it('carries a qualifier that outranks a plain utility class', () => {
    const { selector } = customTextSecondaryRule()
    // Anything ahead of the class — `:root`, `html`, a doubled class — lifts the
    // rule above (0,1,0). The mechanism may change; the ranking may not.
    const qualifier = selector.replace(/\.text-secondary$/, '').trim()
    expect(qualifier.length).toBeGreaterThan(0)
  })

  it('does not reach for !important', () => {
    expect(customTextSecondaryRule().body).not.toContain('!important')
  })

  it('leaves the shadcn surface semantics alone', () => {
    // These belong to Tailwind/shadcn; globals.css must not redefine them.
    expect(CSS).not.toMatch(/^\s*\.bg-secondary\s*\{/m)
    expect(CSS).not.toMatch(/^\s*\.text-secondary-foreground\s*\{/m)
  })
})

describe('theme tokens · .eyebrow-accent follows the generation', () => {
  function eyebrowAccentBody(): string {
    const match = CSS.match(/\.eyebrow-accent\s*\{([^}]*)\}/)
    if (!match) throw new Error('.eyebrow-accent not found in globals.css')
    return match[1].trim()
  }

  it('reads the accent contract instead of a hard-coded colour', () => {
    const body = eyebrowAccentBody()
    expect(body).toContain('--os-accent-tint-rgb')
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}/)
    expect(body).not.toMatch(/rgba?\(\s*165\s*,/)
  })

  it('keeps its 0.75 alpha, distinct from .os-eyebrow-accent', () => {
    expect(eyebrowAccentBody()).toContain('0.75')
    const os = CSS.match(/\.os-eyebrow-accent\s*\{([^}]*)\}/)
    expect(os?.[1]).toContain('0.7')
    expect(os?.[1]).not.toContain('0.75')
  })

  it('the accent default still renders the exact legacy colour', () => {
    // indigo-300 is #a5b4fc === rgb(165 180 252). If this default ever drifts,
    // every legacy eyebrow silently changes hue.
    const decl = CSS.match(/--os-accent-tint-rgb:\s*([^;]+);/)
    expect(decl?.[1].trim()).toBe('165 180 252')
  })
})

describe('theme tokens · component defaults must not defeat call-site utilities', () => {
  /**
   * `.display-hero` and `.display-section` are component DEFAULTS. They used to
   * live in `@layer utilities` next to Tailwind's generated ones, where only
   * source order decided — and being authored later they beat every call site.
   * ExecutiveAssistant asked for `text-[22px] leading-tight` and rendered
   * 40px/0.98, which is what clipped its gradient-filled heading.
   *
   * The rule pinned here is the layer, not a byte offset: a components-layer
   * rule is always emitted ahead of utilities, so utilities win by cascade
   * order regardless of where anyone writes them in the file.
   */
  function layerOf(selector: string): string | null {
    // Walk the file tracking the nearest enclosing @layer at brace depth 0.
    let depth = 0
    let layer: string | null = null
    let layerDepth = -1
    for (const raw of CSS.split('\n')) {
      const line = raw.trim()
      const opened = (raw.match(/\{/g) ?? []).length
      const closed = (raw.match(/\}/g) ?? []).length
      const at = line.match(/^@layer\s+([a-z]+)\s*\{/)
      if (at) { layer = at[1]; layerDepth = depth }
      if (line.startsWith(selector) && /\{\s*$/.test(line)) return layer
      depth += opened - closed
      if (layer !== null && depth <= layerDepth) { layer = null; layerDepth = -1 }
    }
    return null
  }

  it('places the editorial display defaults in the components layer', () => {
    expect(layerOf('.display-hero')).toBe('components')
    expect(layerOf('.display-section')).toBe('components')
  })

  it('never returns them to the utilities layer', () => {
    // The exact regression: same layer as the generated utilities means source
    // order decides, and these rules would silently win again.
    expect(layerOf('.display-hero')).not.toBe('utilities')
    expect(layerOf('.display-section')).not.toBe('utilities')
  })

  it('keeps the default values unchanged', () => {
    // M2A moved these rules; it did not retune them. /system has no size
    // utility and still relies on the default.
    const hero = CSS.match(/\.display-hero\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(hero).toContain('clamp(40px, 5.2vw, 68px)')
    expect(hero).toContain('line-height: 0.98')
    const section = CSS.match(/\.display-section\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(section).toContain('clamp(22px, 1.8vw, 30px)')
  })

  it('does not reach for !important or a specificity bump instead', () => {
    const hero = CSS.match(/\.display-hero\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(hero).not.toContain('!important')
    // A qualified selector would defeat utilities just as badly as the old order.
    expect(CSS).not.toMatch(/^\s*[^\s{]+\s+\.display-hero\s*\{/m)
  })

  it('every call site that sets a size still expresses one', () => {
    // Guards the other half: the fix is only meaningful while the call sites
    // actually carry the utilities they intend to win with.
    const sites: Array<[string, string[]]> = [
      ['app/(platform)/chat/ExecutiveAssistant.tsx', ['text-[22px]', 'leading-tight']],
      ['app/(platform)/agent-activity/page.tsx', ['text-[26px]', 'md:text-[30px]']],
      ['components/platform/os/DashboardHero.tsx', ['text-[26px]', 'md:text-[32px]']],
    ]
    for (const [rel, utils] of sites) {
      const src = readFileSync(resolve(__dirname, '../..', rel), 'utf8')
      for (const util of utils) expect(src).toContain(util)
    }
  })
})

describe('theme tokens · the ambiguous utility is not reintroduced', () => {
  /**
   * Scans the same trees Tailwind scans. Checking globals.css alone would prove
   * nothing — these forms never lived there; they live at call sites.
   *
   * Every reference to the class names below is assembled from fragments rather
   * than spelled out. Tailwind scans lib/**\/*.ts including comments, so writing
   * either name literally in this file would regenerate the very utilities the
   * test exists to keep out of the bundle. That is not hypothetical: it happened
   * twice while this was being written.
   */
  const ROOTS = ['app', 'components', 'lib']

  function sourceFiles(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const full = resolve(dir, entry.name)
      if (entry.isDirectory()) out.push(...sourceFiles(full))
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full)
    }
    return out
  }

  const FILES = ROOTS.flatMap((r) => sourceFiles(resolve(__dirname, '../..', r)))

  function offendersFor(needle: string): string[] {
    return FILES.filter((f) => readFileSync(f, 'utf8').includes(needle))
      .map((f) => f.split('/apps/web/')[1] ?? f)
  }

  it('scans a realistic number of source files', () => {
    // Guards the guard: a broken walker would make every assertion below vacuous.
    expect(FILES.length).toBeGreaterThan(200)
  })

  it('nothing uses the important-modifier form', () => {
    // Beats the :root specificity fix by construction, so it silently resolves
    // to the dark surface token. This is what broke the CommandBar eyebrow.
    expect(offendersFor('!' + 'text-secondary')).toEqual([])
  })

  it('nothing uses the group-hover variant form', () => {
    // Emitted at (0,3,0), above the :root rule. This is what broke the Sidebar
    // chevron hover.
    expect(offendersFor('group-hover:' + 'text-secondary')).toEqual([])
  })

  it('no other variant of the ambiguous name sneaks back in', () => {
    const bare = 'text-' + 'secondary'
    const offenders: string[] = []
    for (const file of FILES) {
      for (const m of readFileSync(file, 'utf8').matchAll(/([a-z-]+:)+text-secondary\b/g)) {
        offenders.push(`${file.split('/apps/web/')[1]}: ${m[0]}`)
      }
    }
    // Plain `text-secondary` is fine — the :root rule covers it. Any *variant*
    // of it is not, because variants outrank that rule.
    expect(bare).toBe('text-secondary')
    expect(offenders).toEqual([])
  })
})
