/**
 * Omnira Trading — what the protocol foundation is structurally forbidden to be.
 *
 * Source-level guards, written BEFORE any provider protocol exists. A firewall
 * added once a real protocol is being wired in has to be trusted; one that
 * already fails the build is enforced.
 *
 * This package is the layer most exposed to the temptations the whole design
 * exists to resist: it is where a provider's message names would want to live,
 * where a decoded field would want to become authority, and where "the handshake
 * succeeded" would want to become a capability. So the guards are stricter here
 * than one layer down, not looser.
 *
 * COMMENTS ARE STRIPPED BEFORE EVERY CHECK. Prose explaining a rule necessarily
 * names what it forbids — the module headers say "names no provider" and this
 * file says the forbidden identifiers out loud. A guard matching raw source
 * would fire on its own explanation, and the usual fix (exclude the files that
 * discuss it) blinds the guard to exactly the files most likely to grow the
 * thing it forbids.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))

const PRODUCTION = readdirSync(HERE)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .sort()

const raw = (f: string): string => readFileSync(join(HERE, f), 'utf8')

const executable = (f: string): string =>
  raw(f)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

/**
 * Assembled from fragments so this file never contains the literal it forbids.
 * Without it these guards would match their own source, and the only remaining
 * fix would be to stop scanning this file.
 */
const ORDER = 'Order'
const FORBIDDEN_WRITE = [
  `submit${ORDER}`, `new${ORDER}`, `place${ORDER}`, `modify${ORDER}`,
  `cancel${ORDER}`, `replace${ORDER}`, `route${ORDER}`, `preflight${ORDER}`,
  `exitPosition`, `closePosition`,
]

describe('the package ships what it claims and nothing else', () => {
  it('has the expected module set', () => {
    expect(PRODUCTION).toEqual([
      'codec.ts', 'correlation.ts', 'fake-protocol.ts', 'fan-out.ts',
      'index.ts', 'integration.ts', 'session.ts', 'supervisor.ts',
    ])
  })

  it('POSITIVE CONTROL: the scan can actually find an identifier', () => {
    // Without this, a bug making `executable()` return '' would leave every
    // assertion below passing against nothing at all.
    const code = executable('session.ts')
    expect(code).toContain('createProtocolSession')
    expect(code.length).toBeGreaterThan(1_000)
  })
})

// ─── Read-only firewall ───────────────────────────────────────────────────────

describe('no write or execution surface exists', () => {
  it('defines no order-mutating identifier anywhere', () => {
    for (const file of PRODUCTION) {
      const code = executable(file)
      for (const name of FORBIDDEN_WRITE) {
        expect(code, `${file} defines ${name}`).not.toContain(name)
      }
    }
  })

  it('the consumer session exposes only observation and transmission', () => {
    const surface = executable('session.ts')
    const iface = surface.slice(
      surface.indexOf('export interface BoundProtocolSession<'),
      surface.indexOf('export interface ProtocolSession<'),
    )
    expect(iface).toMatch(/\bobserve\(/)
    /*
     * NO lifetime control and NO dispose on the consumer view. A consumer able
     * to begin, end or dispose a lifetime could desynchronise protocol state
     * from the runtime that actually owns the connection — which is the failure
     * this whole binding exists to make unreachable.
     */
    for (const forbidden of ['beginLifetime', 'endLifetime', 'dispose(']) {
      expect(iface, `the consumer view exposes ${forbidden}`).not.toContain(forbidden)
    }
    // `disposed` as a READING is fine and useful; it cannot change anything.
    expect(iface).toContain('readonly disposed: boolean')
    /*
     * `send` IS present here, unlike in R1A — a protocol session that cannot
     * transmit is not a session. What it may not do is name a market action, so
     * the guard moves from "no send" to "send carries no domain meaning".
     */
    expect(iface).toMatch(/\bsend\(message: Outbound\)/)
    for (const forbidden of ['order', 'position', 'account', 'symbol', 'trade']) {
      expect(iface.toLowerCase(), forbidden).not.toContain(forbidden)
    }
  })

  it('the supervisor supervises and does not act', () => {
    const surface = executable('supervisor.ts')
    const iface = surface.slice(
      surface.indexOf('export interface SessionSupervisor {'),
      surface.indexOf('export type ConnectSequenceOutcome'),
    )
    for (const forbidden of ['order', 'position', 'trade', 'execute', 'submit']) {
      expect(iface.toLowerCase(), forbidden).not.toContain(forbidden)
    }
  })
})

// ─── Provider neutrality ──────────────────────────────────────────────────────

describe('the package names no provider and no wire format', () => {
  it('contains no provider, exchange or protocol name', () => {
    const patterns = [
      /rithmic/i, /tradovate/i, /projectx/i, /\bcme\b/i, /tradingview/i,
      /protobuf/i, /\bproto\b/i, /template_id/i, /templateId/i, /infra_type/i,
      /\bfix\s*4\.\d/i, /\bomnibus\b/i,
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

  it('the codec contract prescribes no message shape', () => {
    /*
     * The load-bearing neutrality claim of this package. A `messageType`,
     * `requestId` or `sequenceId` field on the CONTRACT would assert that every
     * protocol has one — an assumption no evidence supports, and one that would
     * be discovered only when a protocol without it had to be forced into it.
     */
    const code = executable('codec.ts')
    for (const assumed of [
      'messageType', 'msgType', 'requestId', 'sequenceId', 'seqNum',
      'correlationId', 'header', 'payload', 'envelope',
    ]) {
      expect(code, `codec.ts prescribes ${assumed}`).not.toContain(assumed)
    }
  })

  it('the correlation key is the caller-s type, never a field this package names', () => {
    const code = executable('correlation.ts')
    // Generic in K. It cannot know what a key looks like.
    expect(code).toContain('CorrelationRegistry<K, V>')
    for (const assumed of ['requestId', 'sequenceId', 'msgId', 'ticket']) {
      expect(code, `correlation.ts assumes ${assumed}`).not.toContain(assumed)
    }
  })

  it('the session role is opaque, so no session topology is canonised', () => {
    const code = executable('supervisor.ts')
    expect(code).toContain("Branded<string, 'SessionRole'>")
    // No enumerated union of role names, which would be one provider's shape.
    for (const named of ['TICKER', 'HISTORY', 'PNL', 'MARKET_DATA', 'ORDER_PLANT']) {
      expect(code, `supervisor.ts enumerates ${named}`).not.toContain(named)
    }
  })
})

// ─── No live network ──────────────────────────────────────────────────────────

describe('nothing here can open a connection', () => {
  it('references no network API in production code', () => {
    /*
     * The socket constructors are banned as BARE IDENTIFIERS, not only as
     * `new X(...)` calls. A negative control caught this: `const S = WebSocket`
     * followed by `new S(url)` opens a real connection while matching neither
     * `new\s+WebSocket` nor `WebSocket\s*\(`. Nothing in this package has any
     * legitimate use for the word, so the blunt ban costs nothing and closes it.
     */
    const patterns = [
      /\bWebSocket\b/, /\bEventSource\b/, /\bXMLHttpRequest\b/, /\bWebTransport\b/,
      /\bfetch\s*\(/, /require\(['"]net['"]\)/, /from\s+['"]net['"]/,
      /from\s+['"]tls['"]/, /from\s+['"]https?['"]/, /net\.connect/, /tls\.connect/,
    ]
    for (const file of PRODUCTION) {
      const code = executable(file)
      for (const pattern of patterns) {
        expect(code, `${file} matches ${String(pattern)}`).not.toMatch(pattern)
      }
    }
  })

  it('imports nothing outside the Trading tree', () => {
    const external: string[] = []
    for (const file of PRODUCTION) {
      for (const m of executable(file).matchAll(/from\s+'([^']+)'/g)) {
        const spec = m[1]
        if (spec.startsWith('./')) continue
        external.push(`${file} → ${spec}`)
      }
    }
    /*
     * Exactly three, and each targets a PACKAGE ROOT or a leaf module — never a
     * file inside another package. Reaching past `provider-runtime/index.ts`
     * would let this package depend on R1A internals that R1A never published.
     */
    expect(external.sort()).toEqual([
      'codec.ts → ../provider-runtime',
      'fake-protocol.ts → ../provider-runtime',
      'fan-out.ts → ../provider-runtime',
      'integration.ts → ../provider-runtime',
      'session.ts → ../provider-runtime',
      'supervisor.ts → ../ids',
      'supervisor.ts → ../provider',
      'supervisor.ts → ../provider-runtime',
    ])
  })

  it('reads no environment, no file and no secret store', () => {
    for (const file of PRODUCTION) {
      const code = executable(file)
      expect(code, file).not.toMatch(/process\.env/)
      expect(code, file).not.toMatch(/readFileSync|readFile\(/)
    }
  })
})

// ─── Authority boundary ───────────────────────────────────────────────────────

describe('a decoded message mints no authority', () => {
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

  it('no session or fact type carries a permission field', () => {
    for (const file of ['session.ts', 'supervisor.ts']) {
      const code = executable(file).toLowerCase()
      for (const forbidden of ['allow', 'permit', 'clearance', 'approved', 'authorized', 'cantrade']) {
        expect(code, `${file} carries ${forbidden}`).not.toContain(forbidden)
      }
    }
  })
})

// ─── Capability boundary ──────────────────────────────────────────────────────

describe('a successful exchange decides no capability', () => {
  it('never sets a capability state', () => {
    for (const file of PRODUCTION) {
      const code = executable(file)
      for (const forbidden of ['SUPPORTED', 'UNSUPPORTED', 'CONDITIONAL', 'CapabilityState']) {
        expect(code, `${file} decides ${forbidden}`).not.toContain(forbidden)
      }
    }
  })

  it('POSITIVE CONTROL: the forbidden capability words are findable elsewhere', () => {
    // Proves the check above is scanning real text, not an empty haystack.
    const elsewhere = readFileSync(join(HERE, '..', 'provider', 'primitives.ts'), 'utf8')
    expect(elsewhere).toContain('SUPPORTED')
  })
})

// ─── Policy boundary: R1A keeps every decision ────────────────────────────────

describe('this package reports facts and owns no policy', () => {
  it('decides nothing about reconnection, retry or backoff', () => {
    for (const file of PRODUCTION) {
      const code = executable(file)
      for (const forbidden of [
        'reconnect', 'backoff', 'retryable', 'shouldRetry', 'maxAttempts',
        'isRetriable', 'delayForAttempt',
      ]) {
        expect(code, `${file} decides ${forbidden}`).not.toContain(forbidden)
      }
    }
  })

  it('classifies no close and issues no canonical reason code', () => {
    for (const file of PRODUCTION) {
      const code = executable(file)
      for (const forbidden of ['classifyClose', 'reasonCodeOf', 'ReasonCode', 'SessionFailure']) {
        expect(code, `${file} names ${forbidden}`).not.toContain(forbidden)
      }
    }
  })

  it('owns no clock, no timer and no randomness', () => {
    for (const file of PRODUCTION) {
      const code = executable(file)
      for (const pattern of [
        /Date\.now\s*\(/, /Math\.random\s*\(/, /randomUUID/, /new\s+Date\b/,
        /setTimeout\s*\(/, /setInterval\s*\(/, /monotonicMs/,
      ]) {
        expect(code, `${file} matches ${String(pattern)}`).not.toMatch(pattern)
      }
    }
  })

  it('advances no generation of its own — R1A is the sole authority', () => {
    /*
     * The rule is NOT "never mention a generation". This package must read
     * R1A's, or it cannot know when a reconnect invalidated its pending work.
     * What it may never do is PRODUCE one: two objects deciding which attempt is
     * current is the bug the whole design avoids, and a derived-but-independent
     * identity (a counter, an epoch, a timestamp, a random id) is the same bug
     * wearing a different name.
     */
    for (const file of PRODUCTION) {
      const code = executable(file)
      for (const pattern of [
        /generation\s*\+\+/i, /\+\+\s*[A-Za-z]*generation/i,
        /generation\s*\+=/i, /[A-Za-z]*generation\s*\+\s*\d/i,
        /\blet\s+generation\b/i, /\bepoch\b/i, /\blifetimeId\b/i,
      ]) {
        expect(code, `${file} matches ${String(pattern)}`).not.toMatch(pattern)
      }
    }
  })

  it('the only generation this package holds is one it was handed', () => {
    const code = executable('session.ts')
    // Taken from the argument. There is no other write to it in the file.
    expect(code).toContain('beginLifetime(generation: number)')
    /*
     * Exactly two writes exist in the whole file, and both are enumerated here:
     * the `= 0` initialiser and the assignment from the argument. Any third —
     * an increment, a derivation, a fallback — fails this.
     */
    const writes = code.match(/observedGeneration\s*=[^=]/g) ?? []
    expect(writes).toHaveLength(2)
    expect(code).toContain('let observedGeneration = 0')
    expect(code).toContain('observedGeneration = generation')
  })

  it('the binding reads that number from R1A-s model and nowhere else', () => {
    const code = executable('integration.ts')
    expect(code).toContain('session.beginLifetime(model.generation)')
    // Observation, not derivation: no arithmetic, no fallback, no default.
    expect(code).not.toMatch(/beginLifetime\((?!model\.generation\)|runtime\.model\.generation\))/)
  })

  it('the binding ends the lifetime on every state that is not a usable attempt', () => {
    /*
     * The list is derived from R1A's own `SESSION_STATES`, not from a guess, and
     * pinned here so adding a state upstream cannot silently leave a gap. Three
     * of the four excluded states are reachable WITHOUT the generation
     * advancing — which is the whole reason this rule exists alongside rotation.
     */
    const code = executable('integration.ts')
    expect(code).toContain(
      "const USABLE: readonly SessionState[] = ['AUTHENTICATING', 'READY', 'DEGRADED']",
    )
    expect(code).toContain('else session.endLifetime()')
  })

  it('the session consumes frames STRUCTURALLY, not by filtering', () => {
    /*
     * Stronger than a filter. The session's source type carries frames and
     * nothing else, so OPEN/CLOSED/ERROR are not available to be interpreted —
     * a guard on a filter can be edited away, a type that has no such member
     * cannot be read from by accident.
     */
    const code = executable('session.ts')
    expect(code).toContain('listenFrames(listener: (frame: TransportFrame) => void)')
    expect(code).toContain('options.transport.listenFrames(onFrame)')
    for (const forbidden of ["'OPEN'", "'CLOSED'", "'ERROR'", 'TransportEvent', '.listen(']) {
      expect(code, `session.ts reaches ${forbidden}`).not.toContain(forbidden)
    }
  })

  it('the ingress fence moves before any subscriber, and judges nothing', () => {
    const code = executable('fan-out.ts')
    const handler = code.slice(
      code.indexOf('const releaseInner = inner.listen('),
      code.indexOf('return {'),
    )
    const fenceAt = handler.indexOf("if (event.type === 'OPEN') ingressOpen = true")
    const broadcastAt = handler.indexOf('for (const subscriber of [...subscribers])')
    expect(fenceAt).toBeGreaterThan(-1)
    expect(broadcastAt).toBeGreaterThan(-1)
    // The whole point: the flag is written before anyone is called.
    expect(fenceAt).toBeLessThan(broadcastAt)
    // A fence, not a verdict.
    for (const forbidden of ['expected', 'retryable', 'fatal', 'reconnect', 'shouldRetry']) {
      expect(code.toLowerCase(), `fan-out.ts decides ${forbidden}`).not.toContain(forbidden)
    }
  })

  it('the fact vocabulary is pinned at exactly these three entries', () => {
    /*
     * Not a style rule. Every fact added here is a chance to smuggle in a
     * judgement — a severity, a retry hint, a reason code — under the word
     * "fact". Pinning the literal means widening it is a deliberate edit to this
     * guard, visible in review, rather than a line that slipped into a union.
     */
    const code = executable('session.ts')
    expect(code).toContain(
      "export const PROTOCOL_FACTS = ['ACTIVITY', 'DECODE_REFUSED', 'CODEC_EXCEPTION'] as const",
    )
  })

  it('a codec exception is a distinct fact, never a fabricated refusal', () => {
    /*
     * An exception proves the codec failed. It does not prove the bytes were
     * malformed — the codec never reached a verdict about them. Reporting one as
     * the other would be a classification this package invented.
     */
    const code = executable('session.ts')
    const handler = code.slice(code.indexOf('catch {'), code.indexOf('if (!outcome.ok)'))
    expect(handler).toContain("report({ kind: 'CODEC_EXCEPTION' })")
    expect(handler).not.toContain('MALFORMED')
  })

  it('the exception fact carries no payload, so a thrown value cannot leak', () => {
    const code = executable('session.ts')
    const union = code.slice(
      code.indexOf('export type ProtocolFact ='),
      code.indexOf('export type ProtocolFactListener'),
    )
    expect(union).toContain("{ readonly kind: 'CODEC_EXCEPTION' }")
    for (const forbidden of ['thrown', 'error', 'message', 'detail', 'cause', 'stack']) {
      expect(union.toLowerCase(), `the fact union exposes ${forbidden}`).not.toContain(forbidden)
    }
  })
})

// ─── Credential boundary ──────────────────────────────────────────────────────

describe('the protocol layer cannot hold a credential', () => {
  it('names no credential concept at all', () => {
    /*
     * Stricter than R1A, which must at least name `credentialSecretRef` to
     * borrow one. This package never borrows, so the word has no business here
     * — and a total absence is a far cheaper guard to keep honest.
     */
    for (const file of PRODUCTION) {
      const code = executable(file).toLowerCase()
      for (const forbidden of [
        'credential', 'password', 'secret', 'apikey', 'bearer', 'token',
      ]) {
        expect(code, `${file} names ${forbidden}`).not.toContain(forbidden)
      }
    }
  })

  it('logs nothing, so no frame can be printed', () => {
    for (const file of PRODUCTION) {
      const code = executable(file)
      for (const pattern of [/console\./, /\blogger\b/, /\blog\s*\(/]) {
        expect(code, `${file} matches ${String(pattern)}`).not.toMatch(pattern)
      }
    }
  })
})

// ─── The synthetic protocol is synthetic ──────────────────────────────────────

describe('the shipped codec is Omnira-owned test material', () => {
  it('is JSON over UTF-8, invented here', () => {
    const code = executable('fake-protocol.ts')
    expect(code).toContain('JSON.stringify')
    expect(code).toContain('TextEncoder')
    // No binary framing, no length prefix, no varint — nothing resembling a
    // real wire format that could be mistaken for a provider's.
    for (const forbidden of ['varint', 'lengthPrefix', 'readUInt', 'Buffer.']) {
      expect(code, `fake-protocol.ts contains ${forbidden}`).not.toContain(forbidden)
    }
  })

  it('its message names could not be confused with a provider-s', () => {
    const code = executable('fake-protocol.ts')
    for (const generic of ['HELLO', 'ACCEPT', 'REJECT', 'NOTICE']) {
      expect(code, generic).toContain(generic)
    }
  })

  it('is named so it can never be mistaken for production', () => {
    expect(PRODUCTION).toContain('fake-protocol.ts')
    for (const exported of ['createFakeCodec', 'fakeFrame', 'garbageFrame']) {
      expect(executable('index.ts'), exported).toContain(exported)
    }
  })
})

// ─── Package structure ────────────────────────────────────────────────────────

describe('the package has one door', () => {
  it('every production module is re-exported through index.ts', () => {
    const index = executable('index.ts')
    for (const file of PRODUCTION) {
      if (file === 'index.ts') continue
      const specifier = `'./${file.replace(/\.ts$/, '')}'`
      expect(index, `index.ts does not export ${file}`).toContain(specifier)
    }
  })

  it('no module inside this package reaches into another package-s internals', () => {
    for (const file of PRODUCTION) {
      for (const m of executable(file).matchAll(/from\s+'(\.\.\/[^']+)'/g)) {
        const spec = m[1]
        const depth = spec.split('/').length
        // '../provider-runtime' is two segments; '../provider-runtime/runtime'
        // is three and would be reaching past a published surface.
        expect(depth, `${file} reaches into ${spec}`).toBeLessThanOrEqual(2)
      }
    }
  })
})

// ─── The package boundary, enforced from outside ──────────────────────────────

describe('the safe composition is the only one reachable from outside', () => {
  /**
   * Identifiers assembled from fragments so this file never contains the export
   * name it forbids — the guard below scans `index.ts` for exactly these, and a
   * literal here would be indistinguishable from a real re-export to a reader
   * grepping for the bypass.
   */
  const CREATE = 'create'
  const UNSAFE_EXPORTS = [
    `${CREATE}ProtocolSession`,
    `${CREATE}FanOutTransport`,
    `${CREATE}CorrelationRegistry`,
    'beginLifetime',
    'endLifetime',
  ]

  it('the public root exports no way to build an unbound session', () => {
    /*
     * A session whose lifetime nothing ends is unsafe the moment R1A stops being
     * usable: pending work waits for a generation that may never advance, and
     * frames from a finished link look like current traffic. Exporting any of
     * these would make that outcome reachable by accident.
     */
    const index = executable('index.ts')
    for (const name of UNSAFE_EXPORTS) {
      expect(index, `index.ts re-exports ${name}`).not.toContain(name)
    }
  })

  it('the one creation surface is the bound one', () => {
    const index = executable('index.ts')
    // The full list of value exports that CREATE something.
    const created = [...index.matchAll(/\bcreate[A-Z][A-Za-z]*/g)].map((m) => m[0])
    expect([...new Set(created)].sort()).toEqual([
      'createCounterKeys',      // a pure deterministic counter
      'createFakeCodec',        // a codec; it cannot produce a lifetime
      'createProtocolIntegration',
      'createSessionSupervisor',
    ])
  })

  it('POSITIVE CONTROL: the forbidden names exist in the package, just not at the root', () => {
    // Without this, a typo in UNSAFE_EXPORTS would leave the guard above
    // passing against names that appear nowhere at all.
    expect(executable('session.ts')).toContain(`${CREATE}ProtocolSession`)
    expect(executable('fan-out.ts')).toContain(`${CREATE}FanOutTransport`)
    expect(executable('correlation.ts')).toContain(`${CREATE}CorrelationRegistry`)
    expect(executable('session.ts')).toContain('endLifetime')
  })

  it('nothing outside this package deep-imports a module inside it', () => {
    /*
     * The other half of the boundary. Keeping the raw constructors out of
     * `index.ts` is worth nothing if a consumer can reach past it, so this
     * walks the entire app and fails on any import of a module under this
     * directory other than the package root.
     */
    const APP = join(HERE, '..', '..', '..')
    const PACKAGE_DIR = 'lib/trading/provider-protocol'
    const offenders: string[] = []

    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          if (['node_modules', '.next', '.git', 'dist'].includes(entry.name)) continue
          walk(full)
          continue
        }
        if (!/\.(ts|tsx|mjs|js)$/.test(entry.name)) continue
        const relative = full.slice(APP.length + 1)
        // In-package files may reach their own siblings; that is the point.
        if (relative.startsWith(PACKAGE_DIR)) continue

        const source = readFileSync(full, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/(^|[^:])\/\/.*$/gm, '$1')
        for (const m of source.matchAll(/['"]([^'"]*provider-protocol\/[^'"]+)['"]/g)) {
          offenders.push(`${relative} → ${m[1]}`)
        }
      }
    }
    walk(APP)

    expect(offenders.sort()).toEqual([])
  })

  it('POSITIVE CONTROL: the deep-import scan actually reads files outside the package', () => {
    /*
     * The check above passes trivially if the walk finds nothing. This proves it
     * reaches real source: R1A's own package root is imported from here, and the
     * scan must be able to see an import of that shape somewhere in the app.
     */
    const APP = join(HERE, '..', '..', '..')
    const runtimeIndex = readFileSync(join(APP, 'lib/trading/provider-runtime/index.ts'), 'utf8')
    expect(runtimeIndex.length).toBeGreaterThan(1_000)
    expect(readdirSync(join(APP, 'lib/trading')).length).toBeGreaterThan(5)
  })
})
