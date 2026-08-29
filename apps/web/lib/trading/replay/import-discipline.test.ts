/**
 * Import discipline and boundary proofs for the replay package.
 *
 * Same two invariants Stage 1 pinned, now for a package that is also
 * client-reachable:
 *
 *  1. No Node builtin may reach the browser bundle. `lib/trading/ids.ts` imports
 *     `node:crypto`, and the public `@/lib/trading` barrel re-exports it as a
 *     value, so the barrel is off limits for values from here.
 *  2. Nothing may reach `lib/trading/internal/`, where execution authority is
 *     issued.
 *
 * Plus the Stage 1.5 additions: no provider code, no network, no strategy
 * detector, and no order path.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const TRADING_ROOT = resolve(HERE, '..')

const PACKAGE_FILES = readdirSync(HERE)
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
  .map((name) => join(HERE, name))

/** Source with comments stripped — the prose describes the rules it names. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

interface ImportRecord {
  readonly specifier: string
  readonly typeOnly: boolean
}

function imports(file: string): ImportRecord[] {
  const text = code(file)
  const pattern = /(?:^|\n)\s*(import|export)\s+(type\s+)?([\s\S]*?)\s*from\s+['"]([^'"]+)['"]/g
  return [...text.matchAll(pattern)].map((match) => ({
    specifier: match[4],
    typeOnly: Boolean(match[2]),
  }))
}

function valueImports(file: string): string[] {
  return imports(file).filter((entry) => !entry.typeOnly).map((entry) => entry.specifier)
}

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

describe('replay package import discipline', () => {
  it('has files to check', () => {
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
    for (const file of PACKAGE_FILES) {
      expect(valueImports(file), file).not.toContain('@/lib/trading')
    }
  })

  it('never value-imports ../ids — the node:crypto carrier', () => {
    for (const file of PACKAGE_FILES) {
      expect(valueImports(file), file).not.toContain('../ids')
    }
  })

  it('takes sibling values only from modules with no Node dependency', () => {
    const siblings = new Set<string>()
    for (const file of PACKAGE_FILES) {
      for (const specifier of valueImports(file)) {
        if (specifier.startsWith('../')) siblings.add(specifier)
      }
    }
    // `../events` is Core's journal envelope; it is type-import-only itself, so
    // reusing `canonicalJson` costs nothing at the bundle boundary.
    expect([...siblings].sort()).toEqual(['../events', '../market-view'])
  })
})

describe('no Node builtin is reachable at runtime from the replay package', () => {
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
    // The walk must have left the package, or it proves nothing.
    expect([...seen].some((f) => f.startsWith(TRADING_ROOT) && !f.startsWith(HERE))).toBe(true)
    expect([...seen].some((f) => f.endsWith('/events.ts') && !f.includes('/replay/'))).toBe(true)
    expect([...seen].some((f) => f.endsWith('/ids.ts'))).toBe(false)
  })
})

describe('Stage 1.5 boundaries', () => {
  const sources = () => PACKAGE_FILES.map((file) => ({ file, text: code(file) }))

  it('contains no order path', () => {
    for (const { file, text } of sources()) {
      for (const pattern of [
        /submitOrder/, /modifyOrder/, /cancelOrder/, /placeOrder/, /sendOrder/,
        /preflightOrder/, /createOrder/, /\bbrokerOrderId\b/, /\bclientOrderId\b/,
      ]) {
        expect(text, `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('makes no network or provider call', () => {
    for (const { file, text } of sources()) {
      for (const pattern of [/\bfetch\s*\(/, /XMLHttpRequest/, /new\s+WebSocket/, /sendBeacon/, /\baxios\b/]) {
        expect(text, `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('names no provider, credential or protocol type', () => {
    for (const { file, text } of sources()) {
      for (const pattern of [/rithmic/i, /tradovate/i, /protobuf/i, /apiKey/, /api_key/, /\bcredential/i]) {
        expect(text, `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('implements no strategy detector', () => {
    for (const { file, text } of sources()) {
      for (const pattern of [
        /detectIFVG/, /detectCISD/, /detectSMT/, /detectSweep/, /detectLiquidity/,
        /computeGrade/, /evaluateSetup/, /findEqualHighs/, /equalHighTolerance/,
      ]) {
        expect(text, `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('names no authority constructor', () => {
    for (const { file, text } of sources()) {
      for (const pattern of [
        /issueRiskClearance/, /issuePropClearance/, /issueApprovalGrant/,
        /createExecutionIntent/, /riskClearanceOf/, /openExecutionGate/,
      ]) {
        expect(text, `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('reads no wall clock on a trading-state path', () => {
    // `Date.now()` appears exactly once in the package, in `wallClockEpochMs`,
    // which is documented as presentation-only and is not a `MarketClock`.
    const offenders = sources()
      .filter(({ text }) => /Date\.now\(\)/.test(text))
      .map(({ file }) => file)
    expect(offenders.map((f) => f.split('/').pop())).toEqual(['clock.ts'])
    expect((code(join(HERE, 'clock.ts')).match(/Date\.now\(\)/g) ?? [])).toHaveLength(1)
  })
})
