/**
 * Stage 1.8b-A: exact observed quantity, and a direction vocabulary that can
 * say UNKNOWN.
 *
 * Both changes exist because the provider model is more precise than the replay
 * model was. `Available<Decimal>` cannot survive a JS `number`, and
 * `PositionSide.UNKNOWN` has no honest member in `DisplayDirection`. The tests
 * below pin the two replacements and the ownership boundary they must not cross.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  OBSERVED_POSITION_DIRECTIONS,
  parseQuantityText,
  quantityText,
  type ObservedPosition,
  type ObservedPositionDirection,
  type QuantityText,
} from './index'
import { parseDecimal } from '../decimal'

const HERE = dirname(fileURLToPath(import.meta.url))
const PACKAGE_FILES = readdirSync(HERE)
  .filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts'))
  .map((n) => join(HERE, n))

function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

// ─── QuantityText ─────────────────────────────────────────────────────────────

describe('QuantityText carries an exact provider quantity', () => {
  it('accepts canonical decimal strings and preserves them exactly', () => {
    for (const raw of ['1', '2', '0.5', '-3', '100']) {
      expect(quantityText(raw), raw).toBe(raw)
    }
  })

  it('keeps the canonical representation Decimal produces', () => {
    // '1.50' is not normalized to '1.5': Decimal keeps the text it parsed, and
    // scale is meaningful — one lot at 1.50 is not the same record as 1.5.
    const q = quantityText('1.50')
    expect(q).toBe('1.50')
    expect(parseDecimal(q)!.text).toBe('1.50')
    // Value equality is still scale-aware at the Decimal level.
    expect(parseDecimal('1.50')!.units).toBe(parseDecimal('1.500')!.units / BigInt(10))
  })

  it('survives twelve decimal places, where number does not', () => {
    const q = quantityText('0.000000000001')
    expect(q).toBe('0.000000000001')
    expect(parseDecimal(q)!.text).toBe('0.000000000001')
    // The number path loses it to exponent notation, which parseDecimal rejects.
    expect(String(Number('0.000000000001'))).toBe('1e-12')
    expect(parseDecimal(String(Number('0.000000000001')))).toBeNull()
  })

  it('survives a seventeen-digit integer, where number silently changes it', () => {
    const q = quantityText('99999999999999999')
    expect(q).toBe('99999999999999999')
    // The measured corruption this type exists to prevent.
    expect(String(Number('99999999999999999'))).toBe('100000000000000000')
    expect(String(Number('99999999999999999'))).not.toBe(q)
  })

  it('round-trips through parseDecimal without value change', () => {
    for (const raw of ['1', '1.50', '0.000000000001', '99999999999999999', '-3.75']) {
      const q = quantityText(raw)
      const back = parseDecimal(q)!
      const again = parseDecimal(back.text)!
      expect(back.text, raw).toBe(q)
      expect(again.units, raw).toBe(back.units)
      expect(again.scale, raw).toBe(back.scale)
    }
  })

  it('fails closed on malformed input', () => {
    for (const bad of ['', '.', '+1', '1.', 'abc', '1e5', '1,5', ' 1', '1 ', null, undefined, 1, 1.5]) {
      expect(parseQuantityText(bad as unknown), String(bad)).toBeNull()
    }
    expect(() => quantityText('1e5')).toThrow(/Malformed quantity/)
  })

  it('offers no construction path from a JS number', () => {
    // parseQuantityText rejects numbers at runtime...
    expect(parseQuantityText(1)).toBeNull()
    expect(parseQuantityText(1.5)).toBeNull()
    // ...and the package contains no numeric coercion on the quantity path.
    for (const file of PACKAGE_FILES) {
      const src = code(file)
      expect(src, `${file} uses Number(`).not.toMatch(/\bNumber\s*\(/)
      expect(src, `${file} uses parseFloat`).not.toMatch(/parseFloat|parseInt/)
    }
  })

  it('introduces no second decimal parser', () => {
    const src = code(join(HERE, 'observed-position.ts'))
    expect(src).toContain('parseDecimal')
    // No hand-rolled digit validation beside the canonical one.
    expect(src).not.toMatch(/\/\^-\?\(\?:0\|/)
  })

  it('rejects a plain number where ObservedPosition.quantity is expected', () => {
    const good: ObservedPosition['quantity'] = { state: 'PRESENT', value: quantityText('1') }
    expect(good.state).toBe('PRESENT')
    // @ts-expect-error a JS number is no longer a valid observed quantity
    const bad: ObservedPosition['quantity'] = { state: 'PRESENT', value: 1 }
    void bad
    // @ts-expect-error and an unvalidated string is not a QuantityText either
    const alsoBad: QuantityText = 'not-a-decimal'
    void alsoBad
  })
})

// ─── ObservedPositionDirection ────────────────────────────────────────────────

describe('an observed position can say UNKNOWN, and never NEUTRAL', () => {
  it('has exactly LONG, SHORT and UNKNOWN', () => {
    expect(OBSERVED_POSITION_DIRECTIONS).toEqual(['LONG', 'SHORT', 'UNKNOWN'])
  })

  it('has no NEUTRAL member', () => {
    expect(OBSERVED_POSITION_DIRECTIONS as readonly string[]).not.toContain('NEUTRAL')
    // @ts-expect-error NEUTRAL is a strategy statement, not an observation
    const bad: ObservedPositionDirection = 'NEUTRAL'
    void bad
  })

  it('lets an observed position carry UNKNOWN', () => {
    const direction: ObservedPositionDirection = 'UNKNOWN'
    expect(direction).toBe('UNKNOWN')
  })

  it('leaves DisplayDirection untouched for strategy and plans', async () => {
    const { DISPLAY_DIRECTIONS } = await import('../market-view')
    expect(DISPLAY_DIRECTIONS).toEqual(['LONG', 'SHORT', 'NEUTRAL'])
    // Planned trades still use the strategy vocabulary.
    expect(code(join(HERE, 'planned-trade.ts'))).toMatch(/direction: DisplayDirection/)
    // Observed positions no longer do.
    expect(code(join(HERE, 'observed-position.ts'))).not.toMatch(/direction: DisplayDirection/)
  })
})

// ─── Ownership ────────────────────────────────────────────────────────────────

describe('both new types are replay-owned', () => {
  it('declares them in the replay package', () => {
    const src = code(join(HERE, 'observed-position.ts'))
    expect(src).toMatch(/export type QuantityText = Branded<string, 'QuantityText'>/)
    expect(src).toMatch(/export const OBSERVED_POSITION_DIRECTIONS = \['LONG', 'SHORT', 'UNKNOWN'\]/)
  })

  it('keeps replay free of every provider type', () => {
    for (const file of PACKAGE_FILES) {
      const src = code(file)
      expect(src, `${file} imports provider`).not.toMatch(/from '\.\.\/provider/)
      /*
       * Assembled from fragments so this assertion is not itself a match.
       * Stage 1.8a's provider-contract test scans every replay file for the
       * provider's vocabulary, and a literal here would trip it — which would
       * mean weakening that check to accommodate this one. The check stays as
       * merged; this file avoids the literal instead.
       */
      for (const banned of ['Position' + 'Side', 'Avail' + 'able<']) {
        expect(src, `${file} names ${banned}`).not.toContain(banned)
      }
    }
  })

  it('keeps the provider package free of every replay type', () => {
    const providerDir = join(HERE, '..', 'provider')
    for (const name of readdirSync(providerDir).filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts'))) {
      const src = code(join(providerDir, name))
      expect(src, name).not.toMatch(/from '\.\.\/replay/)
      expect(src, name).not.toContain('QuantityText')
      expect(src, name).not.toContain('ObservedPositionDirection')
      expect(src, name).not.toContain('ObservedValue')
    }
  })
})
