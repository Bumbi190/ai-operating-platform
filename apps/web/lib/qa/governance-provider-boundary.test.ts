/**
 * Governance G1 — universal provider spend boundary.
 *
 * Two kinds of test live here and they defend different things.
 *
 * The ESCAPE GUARD walks the real runtime source and fails if any module
 * outside a sanctioned adapter constructs a provider SDK or names a provider
 * hostname. That is the invariant the whole PR exists to establish, and it is
 * the one a future change is most likely to break by accident — someone adds a
 * feature, copies the nearest example, and a 34th ungoverned spend path exists.
 * A guard that could be satisfied by a broad exclusion would be worse than no
 * guard, so the allowlist is exactly four files and is asserted to be exactly
 * those four.
 *
 * The LIFECYCLE tests drive `withGovernedSpend` against a fake reservation layer
 * and assert the ordering properties that make the boundary meaningful: nothing
 * reaches the provider before an allowed reservation, an unresolvable project
 * refuses instead of proceeding, and an ambiguous failure does not hand budget
 * back.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { TEST_AUTONOMOUS_GLOBAL } from './execution-fixtures'

// ── Escape guard ─────────────────────────────────────────────────────────────

const ROOT = process.cwd()
const SCANNED_DIRS = ['app', 'lib']

/**
 * The ONLY files permitted to touch a provider directly. Deliberately a closed
 * list of exact paths rather than a directory or a glob: a directory-shaped
 * exclusion would silently absorb the next file someone adds beside them.
 */
const SANCTIONED = new Set([
  'lib/ai/anthropic.ts',
  'lib/ai/openai-client.ts',
  'lib/media/image-client.ts',
  'lib/media/elevenlabs.ts',
])

/** Runtime source only — tests and fixtures are not billable paths. */
function runtimeFiles(dir: string): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    for (const entry of readdirSync(join(ROOT, d))) {
      const rel = `${d}/${entry}`
      if (statSync(join(ROOT, rel)).isDirectory()) {
        if (entry === 'qa' || entry === 'node_modules' || entry === '__tests__') continue
        walk(rel)
        continue
      }
      if (!/\.(ts|tsx)$/.test(entry)) continue
      if (/\.test\.tsx?$/.test(entry)) continue
      out.push(rel)
    }
  }
  walk(dir)
  return out
}

/** Strip comments so prose about a provider is not mistaken for a call. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
}

const FORBIDDEN: { label: string; re: RegExp }[] = [
  { label: 'Anthropic SDK constructor', re: /new\s+Anthropic\s*\(/ },
  { label: 'OpenAI SDK constructor',    re: /new\s+OpenAI\s*\(/ },
  { label: 'Ideogram hostname',         re: /api\.ideogram\.ai/ },
  { label: 'OpenAI hostname',           re: /api\.openai\.com/ },
  { label: 'ElevenLabs hostname',       re: /api\.elevenlabs\.io/ },
]

describe('provider escape guard', () => {
  const files = SCANNED_DIRS.flatMap(runtimeFiles)

  it('scans a non-trivial amount of runtime source', () => {
    // Guards that silently stop scanning are the classic way this rots.
    expect(files.length).toBeGreaterThan(200)
  })

  it('the allowlist is exactly the four sanctioned adapters', () => {
    expect([...SANCTIONED].sort()).toEqual([
      'lib/ai/anthropic.ts',
      'lib/ai/openai-client.ts',
      'lib/media/elevenlabs.ts',
      'lib/media/image-client.ts',
    ])
  })

  for (const { label, re } of FORBIDDEN) {
    it(`no runtime module outside the boundary contains a ${label}`, () => {
      const offenders = files.filter(f => !SANCTIONED.has(f) && re.test(code(readFileSync(join(ROOT, f), 'utf8'))))
      expect(offenders).toEqual([])
    })
  }

  it('REGRESSION — the guard actually detects a planted escape', () => {
    // If this ever fails, the guard above is proving nothing.
    const planted = `
      import Anthropic from '@anthropic-ai/sdk'
      const c = new Anthropic()
      await fetch('https://api.ideogram.ai/v1/ideogram-v3/generate')
    `
    expect(FORBIDDEN.filter(f => f.re.test(code(planted))).map(f => f.label))
      .toEqual(['Anthropic SDK constructor', 'Ideogram hostname'])
  })

  it('REGRESSION — commented-out provider mentions are not false positives', () => {
    const prose = `
      // we used to call new Anthropic() here
      /* api.ideogram.ai is wrapped by image-client */
    `
    expect(FORBIDDEN.some(f => f.re.test(code(prose)))).toBe(false)
  })
})

// ── Adapters must not send an idempotency key yet (audit F-106) ──────────────

describe('idempotency identity is minted, never hand-rolled', () => {
  // G1 asserted the opposite of the first test below: NO adapter could pass a
  // key, because budget_reserve's replay branch returned before the lock and
  // before the budget read (F-106). G2 closed that, so the tripwire is replaced
  // by the invariant that now matters — a key must come from the canonical
  // helper. A hand-built key that is too broad turns legitimate work into a
  // `replay_settled` refusal, which is a worse failure than not keying at all.
  const CANONICAL = 'lib/cost/spend-identity.ts'

  it('every mint goes through spendIdempotencyKey', () => {
    const minters = [...SANCTIONED, 'lib/media/ideogram.ts', 'app/api/media/cron/step2/route.ts']
    for (const f of minters) {
      const src = code(readFileSync(join(ROOT, f), 'utf8'))
      if (!/idempotencyKey/.test(src)) continue
      // It may FORWARD one it was handed, or MINT one via the helper — never
      // assemble a key literal of its own.
      const mints = /idempotencyKey:\s*`/.test(src) || /idempotencyKey:\s*'/.test(src)
      expect(mints, `${f} builds an idempotency key literal instead of using the helper`).toBe(false)
    }
  })

  it('the canonical helper excludes anything time-varying', () => {
    const src = code(readFileSync(join(ROOT, CANONICAL), 'utf8'))
    expect(src).toMatch(/export function spendIdempotencyKey/)
    for (const forbidden of [/Date\.now\(/, /new Date\(/, /Math\.random/, /randomUUID/]) {
      expect(src).not.toMatch(forbidden)
    }
  })

  it('the key is versioned, so identity semantics can change without collisions', () => {
    expect(code(readFileSync(join(ROOT, CANONICAL), 'utf8'))).toMatch(/`v1:\$\{/)
  })

  it('the primitive still accepts one', () => {
    expect(code(readFileSync(join(ROOT, 'lib/cost/governed-spend.ts'), 'utf8')))
      .toMatch(/idempotencyKey\?: string/)
  })
})

// ── Lifecycle ────────────────────────────────────────────────────────────────

const reserveSpend = vi.fn()
const settleSpend = vi.fn()
const releaseSpend = vi.fn()
const maybeSingle = vi.fn()

vi.mock('@/lib/cost/budget-gate', () => ({
  reserveSpend: (...a: unknown[]) => reserveSpend(...a),
  settleSpend: (...a: unknown[]) => settleSpend(...a),
  releaseSpend: (...a: unknown[]) => releaseSpend(...a),
}))

// G3C-1: the paid boundary now resolves the canonical stop authority immediately
// before dispatch. These suites are about SPEND lifecycle, not stop policy, so
// the authority is stubbed to "clear" — the stop behaviour itself is proven in
// governed-dispatch-stop.test.ts, which stubs it the other way.
vi.mock('@/lib/governance/execution-stop', async (orig) => {
  const actual = await orig<typeof import('@/lib/governance/execution-stop')>()
  return {
    ...actual,
    resolveExecutionStopForContract: async () => ({
      allowed: true, context: 'AUTONOMOUS' as const,
      scopesEvaluated: ['PLATFORM_AUTOMATION' as const],
      resolution: 'RESOLVED' as const,
      globalPaused: false, projectPaused: null, reason: null, observed: null,
    }),
  }
})

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ limit: () => ({ maybeSingle }) }) }) }),
  }),
}))

const allowed = { allowed: true, wouldAllow: true, advisoryOverride: false, reason: 'ok',
  reservationId: 'res-1', budgetSek: 700, committedSek: 0, reservedSek: 0, headroomSek: 700 }
const refused = { ...allowed, allowed: false, wouldAllow: false, reason: 'budget_exceeded',
  reservationId: 'res-2', headroomSek: 0 }

async function boundary() {
  return import('@/lib/cost/governed-spend')
}

describe('withGovernedSpend lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    maybeSingle.mockResolvedValue({ data: { id: 'proj-1' }, error: null })
    reserveSpend.mockResolvedValue(allowed)
    settleSpend.mockResolvedValue(undefined)
    releaseSpend.mockResolvedValue(undefined)
  })

  it('reserves BEFORE the provider is called', async () => {
    const { withGovernedSpend } = await boundary()
    const order: string[] = []
    reserveSpend.mockImplementation(async () => { order.push('reserve'); return allowed })
    await withGovernedSpend(
      { project: { projectId: 'proj-1' }, execution: TEST_AUTONOMOUS_GLOBAL, provider: 'anthropic', operation: 'op', estimatedSek: 1 },
      async () => { order.push('provider'); return 'ok' },
    )
    expect(order).toEqual(['reserve', 'provider'])
  })

  it('settles after a successful call', async () => {
    const { withGovernedSpend } = await boundary()
    await withGovernedSpend(
      { project: { projectId: 'proj-1' }, execution: TEST_AUTONOMOUS_GLOBAL, provider: 'anthropic', operation: 'op', estimatedSek: 2 },
      async () => 'ok',
    )
    expect(settleSpend).toHaveBeenCalledWith('res-1', 2)
    expect(releaseSpend).not.toHaveBeenCalled()
  })

  it('a budget refusal never reaches the provider', async () => {
    const { withGovernedSpend, SpendRefusedError } = await boundary()
    reserveSpend.mockResolvedValue(refused)
    const provider = vi.fn()
    await expect(withGovernedSpend(
      { project: { projectId: 'proj-1' }, execution: TEST_AUTONOMOUS_GLOBAL, provider: 'ideogram', operation: 'op', estimatedSek: 5 },
      provider,
    )).rejects.toBeInstanceOf(SpendRefusedError)
    expect(provider).not.toHaveBeenCalled()
  })

  // ── Fail closed (audit F-002) ──────────────────────────────────────────────

  it('FAIL CLOSED — an unknown project slug refuses instead of spending', async () => {
    const { withGovernedSpend, SpendRefusedError } = await boundary()
    maybeSingle.mockResolvedValue({ data: null, error: null })
    const provider = vi.fn()
    await expect(withGovernedSpend(
      { project: { projectSlug: 'does-not-exist' }, execution: TEST_AUTONOMOUS_GLOBAL, provider: 'anthropic', operation: 'op', estimatedSek: 1 },
      provider,
    )).rejects.toMatchObject({ reason: 'project_unresolved' })
    expect(provider).not.toHaveBeenCalled()
    expect(reserveSpend).not.toHaveBeenCalled()
    expect(SpendRefusedError).toBeTruthy()
  })

  it('FAIL CLOSED — a project lookup ERROR refuses, and is not read as "no project"', async () => {
    const { withGovernedSpend } = await boundary()
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'connection reset' } })
    const provider = vi.fn()
    await expect(withGovernedSpend(
      { project: { projectSlug: 'ai-media-automation' }, execution: TEST_AUTONOMOUS_GLOBAL, provider: 'anthropic', operation: 'op', estimatedSek: 1 },
      provider,
    )).rejects.toMatchObject({ reason: 'project_lookup_failed' })
    expect(provider).not.toHaveBeenCalled()
  })

  it('FAIL CLOSED — an unavailable reservation RPC refuses', async () => {
    const { withGovernedSpend } = await boundary()
    reserveSpend.mockResolvedValue({ ...refused, reason: 'unavailable', reservationId: null })
    const provider = vi.fn()
    await expect(withGovernedSpend(
      { project: { projectId: 'proj-1' }, execution: TEST_AUTONOMOUS_GLOBAL, provider: 'anthropic', operation: 'op', estimatedSek: 1 },
      provider,
    )).rejects.toMatchObject({ reason: 'unavailable' })
    expect(provider).not.toHaveBeenCalled()
  })

  it('FAIL CLOSED — an empty projectId refuses rather than resolving something', async () => {
    const { withGovernedSpend } = await boundary()
    const provider = vi.fn()
    await expect(withGovernedSpend(
      { project: { projectId: '' }, execution: TEST_AUTONOMOUS_GLOBAL, provider: 'anthropic', operation: 'op', estimatedSek: 1 },
      provider,
    )).rejects.toMatchObject({ reason: 'project_unresolved' })
    expect(provider).not.toHaveBeenCalled()
  })

  it('FAIL CLOSED — a non-finite estimate refuses', async () => {
    const { withGovernedSpend } = await boundary()
    const provider = vi.fn()
    await expect(withGovernedSpend(
      { project: { projectId: 'proj-1' }, execution: TEST_AUTONOMOUS_GLOBAL, provider: 'anthropic', operation: 'op', estimatedSek: NaN },
      provider,
    )).rejects.toMatchObject({ reason: 'invalid_estimate' })
    expect(provider).not.toHaveBeenCalled()
  })

  // ── Ambiguity is not a refund ──────────────────────────────────────────────

  it('an AMBIGUOUS failure settles — budget is not handed back for a possible charge', async () => {
    const { withGovernedSpend } = await boundary()
    await expect(withGovernedSpend(
      { project: { projectId: 'proj-1' }, execution: TEST_AUTONOMOUS_GLOBAL, provider: 'anthropic', operation: 'op', estimatedSek: 3 },
      async () => { throw new Error('socket hang up after dispatch') },
    )).rejects.toThrow('socket hang up')
    expect(settleSpend).toHaveBeenCalledWith('res-1', 3)
    expect(releaseSpend).not.toHaveBeenCalled()
  })

  it('a PROVABLY undispatched failure releases, and rethrows the original cause', async () => {
    const { withGovernedSpend, ProviderNotDispatchedError } = await boundary()
    const cause = new Error('401 unauthorized')
    await expect(withGovernedSpend(
      { project: { projectId: 'proj-1' }, execution: TEST_AUTONOMOUS_GLOBAL, provider: 'ideogram', operation: 'op', estimatedSek: 3 },
      async () => { throw new ProviderNotDispatchedError('refused before work', cause) },
    )).rejects.toBe(cause)
    expect(releaseSpend).toHaveBeenCalledWith('res-1')
    expect(settleSpend).not.toHaveBeenCalled()
  })

  it('a PHYSICAL ADMISSION refusal releases, and rethrows the refusal itself', async () => {
    // G3C-3C-A · C8. Admission runs INSIDE the governed callback, after the
    // reservation is held. Nothing left the machine, so the headroom must come
    // back — settling it would bill for a call that was never made, and the
    // pass-through spend fakes used by the adapter suites cannot prove this
    // because they never run this code.
    const { withGovernedSpend } = await boundary()
    const { PhysicalAdmissionRefusedError } = await import('@/lib/governance/execution-signal')
    const refusal = new PhysicalAdmissionRefusedError('CANCELLED', 'openai', 'cancellation requested')
    await expect(withGovernedSpend(
      { project: { projectId: 'proj-1' }, execution: TEST_AUTONOMOUS_GLOBAL, provider: 'openai', operation: 'op', estimatedSek: 3 },
      async () => { throw refusal },
    )).rejects.toBe(refusal)
    expect(releaseSpend, 'the reservation was freed').toHaveBeenCalledWith('res-1')
    expect(settleSpend, 'and never counted as spend').not.toHaveBeenCalled()
  })

  // ── Project attribution ────────────────────────────────────────────────────

  it('two project contexts reserve against DIFFERENT projects', async () => {
    const { withGovernedSpend } = await boundary()
    await withGovernedSpend(
      { project: { projectId: 'proj-a' }, execution: TEST_AUTONOMOUS_GLOBAL, provider: 'elevenlabs', operation: 'op', estimatedSek: 1 },
      async () => 'ok')
    await withGovernedSpend(
      { project: { projectId: 'proj-b' }, execution: TEST_AUTONOMOUS_GLOBAL, provider: 'elevenlabs', operation: 'op', estimatedSek: 1 },
      async () => 'ok')
    expect(reserveSpend.mock.calls.map(c => (c[0] as { projectId: string }).projectId))
      .toEqual(['proj-a', 'proj-b'])
  })

  it('the estimate reaches the reservation unchanged', async () => {
    const { withGovernedSpend } = await boundary()
    await withGovernedSpend(
      { project: { projectId: 'proj-1' }, execution: TEST_AUTONOMOUS_GLOBAL, provider: 'openai', operation: 'speech', estimatedSek: 0.1234 },
      async () => 'ok')
    expect(reserveSpend).toHaveBeenCalledWith(expect.objectContaining({
      estimatedSek: 0.1234, provider: 'openai', operation: 'speech',
    }))
  })
})
