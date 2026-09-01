/**
 * Omnira Trading — what the provider runtime is structurally forbidden to be.
 *
 * These are source-level guards, and they exist BEFORE any provider is wired in
 * on purpose. A firewall added after the adapter arrives has to be trusted; a
 * firewall that already fails the build is enforced.
 *
 * COMMENTS ARE STRIPPED BEFORE EVERY CHECK. The prose that explains a rule
 * necessarily names the thing it forbids — this file says "submitOrder" a dozen
 * times, and the module headers say "not Rithmic". A guard that matched raw
 * source would fire on its own explanation, and the usual fix (exclude the
 * files that talk about it) blinds the guard to the very files most likely to
 * grow the thing it forbids.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))

/** Production modules: everything in the package that is not a test. */
const PRODUCTION = readdirSync(HERE)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .sort()

const raw = (f: string): string => readFileSync(join(HERE, f), 'utf8')

const executable = (f: string): string =>
  raw(f)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

/**
 * Identifiers assembled from fragments so this file never contains the literal
 * it forbids. Without this the guards below would match their own source, and
 * the only remaining fix would be to stop scanning this file.
 */
const ORDER = 'Order'
const FORBIDDEN_WRITE = [
  `submit${ORDER}`, `new${ORDER}`, `place${ORDER}`, `modify${ORDER}`,
  `cancel${ORDER}`, `replace${ORDER}`, `route${ORDER}`, `preflight${ORDER}`,
  `exitPosition`, `closePosition`,
]

describe('the package ships production code and a fake, and nothing else', () => {
  it('has the expected module set', () => {
    expect(PRODUCTION).toEqual([
      'failure.ts', 'fake-transport.ts', 'heartbeat.ts', 'index.ts',
      'reconnect.ts', 'redaction.ts', 'runtime.ts', 'scheduler.ts',
      'session-state.ts', 'transport.ts',
    ])
  })
})

// ─── §15 Read-only firewall ───────────────────────────────────────────────────

describe('no write or execution surface exists', () => {
  it('defines no order-mutating identifier anywhere', () => {
    for (const file of PRODUCTION) {
      const code = executable(file)
      for (const name of FORBIDDEN_WRITE) {
        expect(code, `${file} defines ${name}`).not.toContain(name)
      }
    }
  })

  it('POSITIVE CONTROL: the scan can actually find an identifier', () => {
    /*
     * Without this, a bug that made `executable()` return '' would leave every
     * assertion above passing against nothing at all.
     */
    const code = executable('runtime.ts')
    expect(code).toContain('createProviderSessionRuntime')
    expect(code.length).toBeGreaterThan(1_000)
  })

  it('exposes only lifecycle and observation on the runtime', () => {
    const surface = executable('runtime.ts')
    const iface = surface.slice(
      surface.indexOf('export interface ProviderSessionRuntime {'),
      surface.indexOf('export function createProviderSessionRuntime'),
    )
    // connect / disconnect / model / observe. Nothing that acts on a market.
    expect(iface).toMatch(/\bconnect\(/)
    expect(iface).toMatch(/\bdisconnect\(/)
    expect(iface).toMatch(/\bobserve\(/)
    for (const forbidden of ['send(', 'submit', 'order', 'position', 'account']) {
      expect(iface.toLowerCase(), forbidden).not.toContain(forbidden.toLowerCase())
    }
  })
})

// ─── §23 Provider neutrality ──────────────────────────────────────────────────

describe('the runtime names no provider and no protocol', () => {
  it('contains no provider, exchange or wire-format name', () => {
    const patterns = [
      /rithmic/i, /tradovate/i, /projectx/i, /\bcme\b/i, /tradingview/i,
      /protobuf/i, /\bproto\b/i, /template_id/i, /templateId/i, /infra_type/i,
    ]
    for (const file of PRODUCTION) {
      const code = executable(file)
      for (const pattern of patterns) {
        expect(code, `${file} matches ${String(pattern)}`).not.toMatch(pattern)
      }
    }
  })

  it('names no market or account concept', () => {
    for (const file of PRODUCTION) {
      const code = executable(file).toLowerCase()
      for (const concept of ['symbol', 'instrument', 'contract', 'accountid', 'fill', 'quote']) {
        expect(code, `${file} mentions ${concept}`).not.toContain(concept)
      }
    }
  })
})

// ─── §24 No live network ──────────────────────────────────────────────────────

describe('nothing here can open a connection', () => {
  it('references no network API in production code', () => {
    const patterns = [
      /new\s+WebSocket/, /\bWebSocket\s*\(/, /\bfetch\s*\(/, /XMLHttpRequest/,
      /require\(['"]net['"]\)/, /from\s+['"]net['"]/, /from\s+['"]tls['"]/,
      /from\s+['"]https?['"]/, /net\.connect/, /tls\.connect/, /EventSource/,
    ]
    for (const file of PRODUCTION) {
      const code = executable(file)
      for (const pattern of patterns) {
        expect(code, `${file} matches ${String(pattern)}`).not.toMatch(pattern)
      }
    }
  })

  it('the only shipped transport is the in-memory one', () => {
    const fake = executable('fake-transport.ts')
    expect(fake).toContain('createFakeTransport')
    // It fabricates events rather than receiving them from anywhere.
    expect(fake).toContain('emitOpen')
    expect(fake).not.toMatch(/WebSocket|fetch\s*\(|net\.|tls\./)
  })

  it('imports nothing outside the package except Trading types', () => {
    const external: string[] = []
    for (const file of PRODUCTION) {
      for (const m of executable(file).matchAll(/from\s+'([^']+)'/g)) {
        const spec = m[1]
        if (spec.startsWith('./')) continue
        external.push(`${file} → ${spec}`)
      }
    }
    // Only the sibling provider package, for Result/ProviderError/ReasonCode.
    expect(external.sort()).toEqual([
      'failure.ts → ../provider',
      'failure.ts → ../reason-codes',
      'runtime.ts → ../provider',
    ])
  })
})

// ─── §16 Authority boundary ───────────────────────────────────────────────────

describe('connectivity mints no authority', () => {
  it('never names an authority artefact', () => {
    for (const file of PRODUCTION) {
      const code = executable(file)
      for (const artefact of [
        'RiskClearance', 'PropClearance', 'ApprovalGrant', 'ExecutionIntent',
      ]) {
        expect(code, `${file} names ${artefact}`).not.toContain(artefact)
      }
    }
  })

  it('never reaches the module that issues authority', () => {
    for (const file of PRODUCTION) {
      expect(executable(file), file).not.toMatch(/trading\/internal/)
    }
  })

  it('the session model carries no permission field', () => {
    const code = executable('session-state.ts')
    const model = code.slice(
      code.indexOf('export interface SessionModel {'),
      code.indexOf('export function initialSessionModel'),
    )
    for (const forbidden of ['allow', 'permit', 'clearance', 'approved', 'authorized', 'canTrade']) {
      expect(model.toLowerCase(), forbidden).not.toContain(forbidden)
    }
  })
})

// ─── §17 Capability boundary ──────────────────────────────────────────────────

describe('connectivity does not decide capabilities', () => {
  it('never sets a capability state', () => {
    for (const file of PRODUCTION) {
      const code = executable(file)
      for (const forbidden of ['SUPPORTED', 'UNSUPPORTED', 'CONDITIONAL', 'CapabilityState']) {
        expect(code, `${file} decides ${forbidden}`).not.toContain(forbidden)
      }
    }
  })
})

// ─── §10 Runtime clock is not provider time ───────────────────────────────────

describe('the runtime clock cannot become provider time', () => {
  it('never names getProviderTime or ProviderClock', () => {
    for (const file of PRODUCTION) {
      const code = executable(file)
      expect(code, file).not.toContain('getProviderTime')
      expect(code, file).not.toContain('ProviderClock')
      expect(code, file).not.toContain('ProviderTimestamp')
    }
  })

  it('the scheduler exposes only a monotonic reading, never a wall-clock instant', () => {
    const code = executable('scheduler.ts')
    expect(code).toContain('monotonicMs')
    // No Date, no ISO string, nothing convertible to an instant.
    for (const forbidden of ['Date.now', 'new Date', 'toISOString', 'Timestamp']) {
      expect(code, forbidden).not.toContain(forbidden)
    }
  })

  it('no production module reads a wall clock or a random source', () => {
    for (const file of PRODUCTION) {
      const code = executable(file)
      for (const pattern of [/Date\.now\s*\(/, /Math\.random\s*\(/, /randomUUID/, /new\s+Date\b/]) {
        expect(code, `${file} matches ${String(pattern)}`).not.toMatch(pattern)
      }
    }
  })
})

// ─── §6 Credential boundary ───────────────────────────────────────────────────

describe('the runtime cannot hold a credential', () => {
  it('borrows rather than stores', () => {
    const code = executable('runtime.ts')
    expect(code).toContain('borrow')
    // No field on the options or the model could hold a secret value.
    const options = code.slice(
      code.indexOf('export interface ProviderSessionRuntimeOptions {'),
      code.indexOf('export interface ProviderSessionRuntime {'),
    )
    expect(options).toContain('credentialSecretRef')
    for (const forbidden of ['password', 'secretValue', 'token:', 'apiKey']) {
      expect(options, forbidden).not.toContain(forbidden)
    }
  })

  it('reads no environment and no secret store', () => {
    for (const file of PRODUCTION) {
      const code = executable(file)
      expect(code, file).not.toMatch(/process\.env/)
      expect(code, file).not.toMatch(/readFileSync|readFile\(/)
    }
  })

  it('the transport endpoint type has nowhere to put a credential', () => {
    const code = executable('transport.ts')
    const endpoint = code.slice(
      code.indexOf('export interface TransportEndpoint {'),
      code.indexOf('export interface ProviderTransport {'),
    )
    expect(endpoint).toContain('endpoint: string')
    for (const forbidden of ['password', 'token', 'secret', 'credential', 'auth']) {
      expect(endpoint.toLowerCase(), forbidden).not.toContain(forbidden)
    }
  })
})

// ─── §9 Heartbeat has no guessed provider facts ───────────────────────────────

describe('no provider number is guessed', () => {
  it('ships no default heartbeat policy', () => {
    const code = executable('heartbeat.ts')
    expect(code).not.toContain('DEFAULT_HEARTBEAT')
    // The only interval literals live in the obviously-named test helper.
    const beforeTestHelper = code.slice(0, code.indexOf('export function testHeartbeatPolicy'))
    expect(beforeTestHelper).not.toMatch(/\b\d{2,}_?\d*\b/)
  })

  it('marks the reconnect defaults as runtime defaults, not provider facts', () => {
    // The claim lives in the doc comment, so this one reads the raw source.
    expect(raw('reconnect.ts')).toMatch(/NOT provider facts/i)
    expect(executable('reconnect.ts')).toContain('DEFAULT_RECONNECT_POLICY')
  })
})
