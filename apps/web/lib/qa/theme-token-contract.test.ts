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
