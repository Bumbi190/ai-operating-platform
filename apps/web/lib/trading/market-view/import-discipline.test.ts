/**
 * Import discipline for the market-view package.
 *
 * Two invariants have to hold at once, and they pull in opposite directions:
 *
 *  1. Nothing client-reachable may drag a Node builtin into the browser bundle.
 *     `lib/trading/ids.ts` imports `node:crypto` for `newId()`, and the public
 *     `@/lib/trading` barrel re-exports that as a value — so importing the
 *     barrel for values from here breaks the production build. This is not a
 *     hypothetical: it failed `next build` before the imports were changed.
 *
 *  2. Nothing here may reach execution authority. `lib/trading/internal/` holds
 *     issuance and the execution gate, and this package must not be able to
 *     touch either.
 *
 * The resolution is that `market-view/` lives INSIDE `lib/trading/`, so its
 * siblings are its normal neighbours — the "import only from `@/lib/trading`"
 * rule governs code outside the package. Values come from the leaf modules that
 * carry no Node dependency (`../time`, `../decimal`); everything else is
 * type-only and erased at compile time.
 *
 * The strongest assertion below walks the whole transitive VALUE-import closure
 * and proves no `node:` builtin is reachable — not by reasoning about one file,
 * but by following every edge.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const TRADING_ROOT = resolve(HERE, '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name) => join(dir, name))
}

const PACKAGE_FILES = sourceFiles(HERE)

/** Source with comments stripped — the prose here describes the rules it breaks. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

interface ImportRecord {
  readonly specifier: string
  /** True for `import type` / `export type`, which emit nothing at runtime. */
  readonly typeOnly: boolean
}

/**
 * Every import and re-export in a file.
 *
 * `import type X` and `export type { … } from` are recorded as type-only. An
 * inline `import { type A, b }` still counts as a value import, because `b`
 * survives — which is the conservative reading and the one that matters for
 * bundling.
 *
 * THE CLAUSE IS MATCHED BY SHAPE, AND THAT IS LOAD-BEARING.
 *
 * An earlier version matched a lazy middle that merely excluded `=` and `;`.
 * That was enough to stop a type ALIAS (`export type PriceText = …`) from
 * starting a false match, and not enough for anything else: `export function
 * priceMagnitude(value: PriceText): number { return Number(value) }` contains
 * neither character, so the lazy middle ran straight past it to the next
 * `from '…'` anywhere below — reporting a re-export against the wrong
 * specifier, and reporting a TYPE-only re-export as a value import.
 *
 * A false value import is the safe direction, but the same mechanism consumes
 * the real clause that followed, so the record for that line is fabricated
 * rather than read. A guard whose evidence is fabricated proves nothing.
 *
 * So the clause is now matched against the only three shapes a real import or
 * re-export clause can take — a braced list, a star alias, or a bare
 * identifier optionally followed by a braced list. Every declaration keyword
 * fails all three and can no longer start a match.
 */
function imports(file: string): ImportRecord[] {
  const text = code(file)
  const clause = /\{[^{}]*\}|\*\s+as\s+[A-Za-z_$][\w$]*|[A-Za-z_$][\w$]*(?:\s*,\s*\{[^{}]*\})?/
  const pattern = new RegExp(
    String.raw`(?:^|\n)\s*(import|export)\s+(type\s+)?(${clause.source})\s*from\s+['"]([^'"]+)['"]`,
    'g',
  )
  return [...text.matchAll(pattern)].map((match) => ({
    specifier: match[4],
    typeOnly: Boolean(match[2]),
  }))
}

function valueImports(file: string): string[] {
  return imports(file).filter((entry) => !entry.typeOnly).map((entry) => entry.specifier)
}

// ─── The two hard rules ───────────────────────────────────────────────────────

describe('market-view import discipline', () => {
  it('has files to check', () => {
    // Guards against a silently empty scan making every assertion below vacuous.
    expect(PACKAGE_FILES.length).toBeGreaterThanOrEqual(8)
  })

  it('never reaches lib/trading/internal, in any form', () => {
    for (const file of PACKAGE_FILES) {
      for (const entry of imports(file)) {
        expect(entry.specifier, `${file} imports ${entry.specifier}`).not.toMatch(/(^|\/)internal(\/|$)/)
      }
    }
  })

  it('never value-imports the public @/lib/trading barrel', () => {
    // The barrel re-exports `newId`, which is the `node:crypto` carrier. The one
    // reference to it in this package is a type-only re-export in index.ts.
    for (const file of PACKAGE_FILES) {
      expect(valueImports(file), file).not.toContain('@/lib/trading')
    }
    const barrelRefs = imports(join(HERE, 'index.ts')).filter((e) => e.specifier === '@/lib/trading')
    expect(barrelRefs).toHaveLength(1)
    expect(barrelRefs[0].typeOnly).toBe(true)
  })

  it('never value-imports ../ids — the node:crypto carrier', () => {
    for (const file of PACKAGE_FILES) {
      expect(valueImports(file), file).not.toContain('../ids')
    }
  })

  it('takes values only from the leaf modules that carry no Node dependency', () => {
    const siblingValueImports = new Set<string>()
    for (const file of PACKAGE_FILES) {
      for (const specifier of valueImports(file)) {
        if (specifier.startsWith('../')) siblingValueImports.add(specifier)
      }
    }
    /*
     * Three vocabularies have now moved down out of this presentation package,
     * each for the same reason: Canonical v1.0 makes roots, timeframes and
     * exact prices DOMAIN values, and a domain module cannot depend on a
     * presentation package without inverting the dependency direction.
     *
     * `../decimal` left this list in GATE-08C-2B — not because the dependency
     * went away, but because it moved one hop further out. `../market-price`
     * value-imports it now, so the closure below still reaches `decimal.ts`
     * and asserts it, which is the check that actually matters.
     */
    expect([...siblingValueImports].sort()).toEqual([
      '../market-instrument', '../market-price', '../market-timeframe', '../time',
    ])
  })
})

// ─── The transitive proof ─────────────────────────────────────────────────────

/** Resolve a relative specifier to a file on disk, or null if it leaves lib/trading. */
function resolveLocal(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null
  const base = resolve(dirname(fromFile), specifier)
  for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
    try {
      readFileSync(candidate, 'utf8')
      return candidate
    } catch {
      // not this shape
    }
  }
  return null
}

describe('no Node builtin is reachable at runtime from the market-view package', () => {
  it('proves it across the whole transitive value-import closure', () => {
    const seen = new Set<string>()
    const queue = [...PACKAGE_FILES]
    const offenders: string[] = []

    while (queue.length > 0) {
      const file = queue.pop() as string
      if (seen.has(file)) continue
      seen.add(file)

      for (const entry of imports(file)) {
        if (entry.typeOnly) continue
        if (/^node:/.test(entry.specifier)) {
          offenders.push(`${file} → ${entry.specifier}`)
          continue
        }
        const next = resolveLocal(file, entry.specifier)
        if (next !== null) queue.push(next)
      }
    }

    expect(offenders).toEqual([])
    // The walk must actually have left the package, or it proves nothing.
    expect([...seen].some((f) => f.startsWith(TRADING_ROOT) && !f.startsWith(HERE))).toBe(true)
    expect([...seen].some((f) => f.endsWith('/time.ts'))).toBe(true)
    expect([...seen].some((f) => f.endsWith('/decimal.ts'))).toBe(true)
    expect([...seen].some((f) => f.endsWith('/market-instrument.ts'))).toBe(true)
    expect([...seen].some((f) => f.endsWith('/market-timeframe.ts'))).toBe(true)
    // Reached through `../market-price`, which is what keeps `decimal.ts` above
    // in the closure after it stopped being a direct edge from this package.
    expect([...seen].some((f) => f.endsWith('/market-price.ts'))).toBe(true)
    // ids.ts is where node:crypto lives. Reaching it would mean the closure
    // includes the carrier, even if this particular walk found no `node:` edge.
    expect([...seen].some((f) => f.endsWith('/ids.ts'))).toBe(false)
  })

  it('confirms ids.ts really is the carrier, so the test above is not vacuous', () => {
    expect(code(join(TRADING_ROOT, 'ids.ts'))).toMatch(/from 'node:crypto'/)
  })
})
