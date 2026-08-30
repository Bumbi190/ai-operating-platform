/**
 * Import discipline for the bridge, and for the two packages it bridges.
 *
 * THE THREE STATEMENTS THAT MUST HOLD TOGETHER
 * ────────────────────────────────────────────
 *     provider/               MUST NOT import replay/
 *     replay/                 MUST NOT import provider/
 *     provider-normalization/ MAY import both, and nothing else may
 *
 * The third is a permission, and a permission is only safe while the first two
 * still hold. So all three are proven here, in one place, against the real
 * import statements rather than against prose — a package that quietly started
 * importing its counterpart would otherwise look exactly like one that had not.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const TRADING_ROOT = resolve(HERE, '..')
const PROVIDER_DIR = join(TRADING_ROOT, 'provider')
const REPLAY_DIR = join(TRADING_ROOT, 'replay')

function packageFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name) => join(dir, name))
}

const BRIDGE_FILES = packageFiles(HERE)
const PROVIDER_FILES = packageFiles(PROVIDER_DIR)
const REPLAY_FILES = packageFiles(REPLAY_DIR)

/** Source with comments stripped — the prose names rules it must not be judged by. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function importSpecifiers(file: string): string[] {
  const text = code(file)
  const pattern = /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?[\s\S]*?\s*from\s+['"]([^'"]+)['"]/g
  return [...text.matchAll(pattern)].map((match) => match[1])
}

describe('the bridge has files, and they are the ones under test', () => {
  it('found the three packages', () => {
    expect(BRIDGE_FILES.length).toBeGreaterThanOrEqual(5)
    expect(PROVIDER_FILES.length).toBeGreaterThanOrEqual(3)
    expect(REPLAY_FILES.length).toBeGreaterThanOrEqual(8)
  })
})

describe('the two owned packages stay separate', () => {
  it('provider/ never imports replay/', () => {
    for (const file of PROVIDER_FILES) {
      for (const specifier of importSpecifiers(file)) {
        expect(specifier, `${file} imports ${specifier}`).not.toMatch(/(^|\/)replay(\/|$)/)
      }
    }
  })

  it('replay/ never imports provider/', () => {
    for (const file of REPLAY_FILES) {
      for (const specifier of importSpecifiers(file)) {
        expect(specifier, `${file} imports ${specifier}`).not.toMatch(/(^|\/)provider(\/|$)/)
      }
    }
  })

  it('neither imports the bridge, which would invert the dependency', () => {
    for (const file of [...PROVIDER_FILES, ...REPLAY_FILES]) {
      for (const specifier of importSpecifiers(file)) {
        expect(specifier, `${file} imports ${specifier}`)
          .not.toMatch(/provider-normalization/)
      }
    }
  })
})

describe('the bridge is the one package allowed to see both sides', () => {
  it('actually imports both, or it is not bridging anything', () => {
    const all = BRIDGE_FILES.flatMap(importSpecifiers)
    expect(all.some((s) => /(^|\/)provider$/.test(s))).toBe(true)
    expect(all.some((s) => /(^|\/)replay$/.test(s))).toBe(true)
  })

  it('never reaches lib/trading/internal, in any form', () => {
    for (const file of BRIDGE_FILES) {
      for (const specifier of importSpecifiers(file)) {
        expect(specifier, `${file} imports ${specifier}`)
          .not.toMatch(/(^|\/)internal(\/|$)/)
      }
    }
  })

  it('imports only known sibling packages', () => {
    const siblings = new Set<string>()
    for (const file of BRIDGE_FILES) {
      for (const specifier of importSpecifiers(file)) {
        if (specifier.startsWith('../')) siblings.add(specifier)
      }
    }
    expect([...siblings].sort()).toEqual([
      '../decimal', '../environment', '../ids', '../market-view', '../provider', '../replay',
    ])
  })

  it('is not re-exported from the public @/lib/trading barrel', () => {
    const barrel = readFileSync(join(TRADING_ROOT, 'index.ts'), 'utf8')
    expect(barrel).not.toMatch(/provider-normalization/)
  })
})

describe('Stage 1.8b-B boundaries', () => {
  const sources = () => BRIDGE_FILES.map((file) => ({ file, text: code(file) }))

  it('makes no network call of any kind', () => {
    for (const { file, text } of sources()) {
      for (const pattern of [
        /\bfetch\s*\(/, /XMLHttpRequest/, /new\s+WebSocket/, /sendBeacon/, /\baxios\b/,
        /https?:\/\//,
      ]) {
        expect(text, `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('names no real provider, protocol or credential', () => {
    for (const { file, text } of sources()) {
      for (const pattern of [
        /rithmic/i, /tradovate/i, /projectx/i, /protobuf/i, /apiKey/, /api_key/,
        /\bcredential/i, /\bsecret\b/i, /process\.env/,
      ]) {
        expect(text, `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('contains no order path', () => {
    for (const { file, text } of sources()) {
      for (const pattern of [
        /submitOrder/, /modifyOrder/, /cancelOrder/, /placeOrder/, /sendOrder/,
        /preflightOrder/, /createOrder/, /replaceOrder/, /\bflatten\b/, /closePosition/,
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

  it('reads no clock and draws no random value', () => {
    for (const { file, text } of sources()) {
      for (const pattern of [
        /Date\.now\s*\(/, /Math\.random\s*\(/, /randomUUID/, /new Date\s*\(/,
        /performance\.now/, /setTimeout/, /setInterval/,
      ]) {
        expect(text, `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('performs no float conversion on a provider value', () => {
    for (const { file, text } of sources()) {
      for (const pattern of [/\bparseFloat\s*\(/, /\bparseInt\s*\(/, /\bNumber\s*\(/]) {
        expect(text, `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('implements no symbol, rollover or front-month inference', () => {
    for (const { file, text } of sources()) {
      for (const pattern of [
        /startsWith\s*\(/, /endsWith\s*\(/, /\.match\s*\(/, /new RegExp/,
        /frontMonth/i, /rollover/i, /continuousContract/i,
      ]) {
        expect(text, `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('derives no lifecycle by diffing snapshots', () => {
    for (const { file, text } of sources()) {
      for (const pattern of [
        /previousSnapshot/, /priorSnapshot/, /lastSnapshot/, /diffPositions/,
        /previousFrame/,
      ]) {
        expect(text, `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('applies no freshness threshold', () => {
    for (const { file, text } of sources()) {
      for (const pattern of [
        /STALE_AFTER/, /FRESHNESS_THRESHOLD/, /thresholdMs/, /maxAgeMs/, /ageMs\s*>/,
      ]) {
        expect(text, `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('never uses the reader helper that collapses two states into one', () => {
    for (const { file, text } of sources()) {
      expect(text, `${file} uses observedOrNull`).not.toMatch(/observedOrNull/)
    }
  })

  it('offers no way to declare an origin other than FIXTURE', () => {
    for (const { file, text } of sources()) {
      expect(text, `${file} names LIVE`).not.toMatch(/['"]LIVE['"]/)
      expect(text, `${file} names SIMULATION`).not.toMatch(/['"]SIMULATION['"]/)
    }
  })
})
