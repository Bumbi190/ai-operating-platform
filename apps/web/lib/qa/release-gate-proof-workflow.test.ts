/**
 * lib/qa/release-gate-proof-workflow.test.ts — Phase 1B-2.
 *
 * `omnira.release-gate-proof` is a dedicated READ_ONLY verification workflow.
 * It exists to establish one fact nothing else can: that the deployed Omnira
 * runtime holds a `FAMILJE_STUNDEN_VERIFY_KEY` the remote actually accepts. A
 * local check proves only that a string is set, and the release placement at
 * `backend_release_gate` is nine human gates away.
 *
 * ── WHY IT IS ITS OWN DEFINITION ───────────────────────────────────────────
 * An earlier attempt hosted the action on `omnira.probe-validation`. That
 * definition's adapter states its instance key "is not a month here" and that it
 * "has no calendar"; `observe_release_gate` requires the key to BE a canonical
 * month. One key cannot mean both, and forcing it broke nine seam tests.
 *
 * OFFLINE. `globalThis.fetch` is a throwing spy, so a test that acquired a
 * network path fails instead of reaching Familje-Stunden.
 */

import { describe, it, expect, afterAll, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const realFetch = globalThis.fetch
const fetchTripwire = vi.fn(() => { throw new Error('a test reached the network') })
globalThis.fetch = fetchTripwire as unknown as typeof fetch
afterAll(() => { globalThis.fetch = realFetch })

import { ACTION_REGISTRY, assertRegistryMatchesDefinition, isExecutableReadOnly }
  from '@/lib/workflows/action-registry'
import { discoverReadOnlyActions, registeredActionsAt } from '@/lib/workflows/action-discovery'
import { loadVendoredDefinitions } from '@/lib/workflows/definitions'
import { findAdapter } from '@/lib/workflows/adapters/registry'
import {
  RELEASE_GATE_PROOF_CHECK, RELEASE_GATE_PROOF_CHECKS,
  RELEASE_GATE_PROOF_DEF_KEY, RELEASE_GATE_PROOF_STATE,
} from '@/lib/workflows/adapters/release-gate-proof'

const PROOF: string = RELEASE_GATE_PROOF_DEF_KEY
const PROBE: string = 'omnira.probe-validation'
const FS: string = 'familje-stunden.monthly-release'
const def = () => loadVendoredDefinitions().find(d => d.def_key === PROOF)!
/**
 * `source_path` is repo-relative while vitest runs from `apps/web`, so the two
 * are joined through the repo root rather than the working directory.
 */
const REPO_ROOT = join(process.cwd(), '..', '..')
const defFile = () => join(REPO_ROOT, def().source_path)

// ═════════════════════════════════════════════════════════════════════════════
// The definition contract
// ═════════════════════════════════════════════════════════════════════════════

describe('the proof definition is vendored, minimal and read-only', () => {
  it('is vendored as authored_here, not attributed to Familje-Stunden', () => {
    expect(def()).toBeDefined()
    expect(def().provenance).toBe('authored_here')
    expect(def().source_repo).toBe('ai-operating-platform')
    expect(def().version).toBe(1)
  })

  it('the vendored file matches its pinned source hash', () => {
    const sha = require('node:crypto').createHash('sha256')
      .update(readFileSync(defFile())).digest('hex')
    expect(def().source_sha256).toBe(sha)
  })

  it('has exactly the two lifecycle states: proof → complete', () => {
    expect(def().spec.states.map(s => s.id)).toEqual(['proof', 'complete'])
    const proof = def().spec.states.find(s => s.id === 'proof')!
    expect(proof.next_state).toBe('complete')
    expect(def().spec.states.find(s => s.id === 'complete')!.next_state).toBeNull()
  })

  it('MUTATION — it must never gain a human gate', () => {
    for (const s of def().spec.states) expect(s.human_gate.required, s.id).toBe(false)
  })

  it('the proof state declares automated work, the terminal state declares none', () => {
    expect(def().spec.states.find(s => s.id === 'proof')!.automated_actions.length).toBe(1)
    expect(def().spec.states.find(s => s.id === 'complete')!.automated_actions).toEqual([])
  })

  it('the registry and every vendored definition still agree', () => {
    expect(assertRegistryMatchesDefinition()).toEqual([])
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// C + D · the check contract
// ═════════════════════════════════════════════════════════════════════════════

describe('C–D · the adapter declares exactly the check the action answers', () => {
  it('C · the proof adapter declares release_gate_exists at the proof state', () => {
    const adapter = findAdapter(PROOF)!
    expect(adapter).toBeDefined()
    expect(adapter.attestableChecks().map(c => c.check_key)).toEqual([RELEASE_GATE_PROOF_CHECK])
    expect(RELEASE_GATE_PROOF_CHECK).toBe('release_gate_exists')
    expect(RELEASE_GATE_PROOF_CHECKS[0].state).toBe(RELEASE_GATE_PROOF_STATE)
  })

  it('D · the discovered action answers that exact check', () => {
    const [found] = discoverReadOnlyActions(PROOF, 'proof')
    expect(found.actionKind).toBe('observe_release_gate')
    expect(found.checkKey).toBe(RELEASE_GATE_PROOF_CHECK)
  })

  it('the check is REQUIRED and automated-only — a proof cannot complete without it', () => {
    const c = RELEASE_GATE_PROOF_CHECKS[0]
    expect(c.required).toBe(true)
    expect(c.allowed_provenance).toEqual(['automated'])
    expect(c.binds_artifacts).toBe(false)
  })

  it('the check key is REUSED, not renamed — a proof alias would not be discovered', () => {
    const fsChecks = findAdapter(FS)!.attestableChecks().map(c => c.check_key)
    expect(fsChecks).toContain(RELEASE_GATE_PROOF_CHECK)
  })

  it('the adapter declares a check it cannot answer at scheduler time', () => {
    const adapter = findAdapter(PROOF)!
    // `attestableChecks` says what the definition REQUIRES; `verifiableStates`
    // says what the tick can OBSERVE. For this proof the two differ on purpose.
    expect(adapter.attestableChecks().map(c => c.check_key)).toEqual([RELEASE_GATE_PROOF_CHECK])
    expect(adapter.verifiableStates()).toEqual([])
  })
})

const NOW = '2026-09-03T00:00:00.000Z'

// ═════════════════════════════════════════════════════════════════════════════
// A + B · input authority
// ═════════════════════════════════════════════════════════════════════════════

describe('A–B · the instance key IS the month, and a bad one never reaches the wire', () => {
  it('A · a canonical proof key discovers the observation', () => {
    expect(discoverReadOnlyActions(PROOF, 'proof').map(a => a.actionKind))
      .toEqual(['observe_release_gate'])
  })

  it('B · a non-canonical key refuses LOCALLY in the observation itself', async () => {
    // Asserted against `observeReleaseGate` directly, because that is what the
    // executor's handler calls. The month check stands in front of the
    // credential: no key is read, no connection opened.
    const { observeReleaseGate } = await import('@/lib/workflows/adapters/familje-stunden')
    const ev = await observeReleaseGate('invalid', NOW)
    expect(ev.result).not.toBe('pass')
    expect(ev.detail.reason).toBe('INVALID_MONTH_KEY')
    expect(ev.authoritative_system).toBeNull()
    expect(fetchTripwire).not.toHaveBeenCalled()
  })

  it('B2 · a CANONICAL key gets past the month check toward the request path', async () => {
    // Config is absent in tests, so it stops at the credential gate — which is
    // strictly AFTER the month check and strictly BEFORE any connection.
    const { observeReleaseGate } = await import('@/lib/workflows/adapters/familje-stunden')
    const ev = await observeReleaseGate('2099-01', NOW)
    expect(ev.detail.reason).not.toBe('INVALID_MONTH_KEY')
    expect(fetchTripwire).not.toHaveBeenCalled()
  })

  it('there is no second input channel — the handler reads only instanceKey', () => {
    const handler = readFileSync(
      join(process.cwd(), 'lib/workflows/handlers/observe-release-gate.ts'), 'utf8')
    expect(handler).toMatch(/observeReleaseGate\(input\.instanceKey/)
    expect(handler).not.toMatch(/input\.(payload|params|args|month)/)
  })

  it('the definition states the month contract in its own canonical block', () => {
    const raw = JSON.parse(readFileSync(defFile(), 'utf8'))
    expect(Object.keys(raw.canonical)).toContain('instance_key_is_a_month')
    expect(raw.canonical.not_a_release).toMatch(/advances no Familje-Stunden state/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// E + F + G · the seam the runtime will use
// ═════════════════════════════════════════════════════════════════════════════

describe('E–G · every fact tick → run → drain → executor depends on lines up', () => {
  it('E · discovery yields a schedulable READ_ONLY candidate for the proof state', () => {
    const [c] = discoverReadOnlyActions(PROOF, 'proof')
    expect(c.actionClass).toBe('READ_ONLY')
    // The scheduler refuses a discovered action whose check the adapter does not
    // declare — the exact failure that sank the probe-validation attempt.
    expect(findAdapter(PROOF)!.attestableChecks().map(x => x.check_key)).toContain(c.checkKey)
  })

  it('F · the executor can resolve a handler for it through the normal gates', () => {
    const meta = ACTION_REGISTRY.observe_release_gate
    expect(meta.executor_family).toBe('read_only_observation')   // gate 2
    expect(meta.action_class).toBe('READ_ONLY')                  // gates 3-4
    expect(isExecutableReadOnly('observe_release_gate')).toBe(true)
    const executor = readFileSync(
      join(process.cwd(), 'lib/workflows/action-executor.ts'), 'utf8')
    expect(executor).toMatch(/observe_release_gate:\s*observeReleaseGateHandler/)
  })

  it('G · evidence binds because the declared check and the answered check match', () => {
    const declared = findAdapter(PROOF)!.attestableChecks()
      .filter(c => c.state === 'proof' && c.required).map(c => c.check_key)
    const answered = discoverReadOnlyActions(PROOF, 'proof').map(a => a.checkKey)
    expect(declared).toEqual(answered)
  })

  it('the executor was NOT special-cased for this definition', () => {
    const strip = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
    for (const f of ['lib/workflows/action-executor.ts', 'lib/workflows/action-scheduling.ts',
                     'lib/workflows/action-discovery.ts']) {
      expect(strip(f), f).not.toMatch(/release-gate-proof/)
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// H + I + J · nothing writeable, nothing else changed
// ═════════════════════════════════════════════════════════════════════════════

describe('H–J · blast radius', () => {
  it('H · no write-capable action is discoverable on the proof definition', () => {
    for (const state of def().spec.states.map(s => s.id)) {
      for (const a of discoverReadOnlyActions(PROOF, state)) {
        expect(ACTION_REGISTRY[a.actionKind].action_class).toBe('READ_ONLY')
      }
      for (const kind of registeredActionsAt(PROOF, state)) {
        expect(ACTION_REGISTRY[kind as keyof typeof ACTION_REGISTRY].action_class,
          `${kind} @ ${state}`).toBe('READ_ONLY')
      }
    }
  })

  it('H2 · the known dangerous kinds are nowhere near it', () => {
    for (const kind of ['upload_protected_artifacts', 'apply_release_gate_migration',
                        'send_release_newsletter', 'generate_page_audio'] as const) {
      expect(ACTION_REGISTRY[kind].executor_family).toBe('not_executable')
      expect(ACTION_REGISTRY[kind].placements.some(p => (p.def_key as string) === PROOF)).toBe(false)
    }
  })

  it('I · probe-validation behaviour is unchanged', () => {
    expect(discoverReadOnlyActions(PROBE, 'probe').map(a => a.actionKind))
      .toEqual(['probe_anonymous_protected_access'])
    expect(discoverReadOnlyActions(PROBE, 'complete')).toEqual([])
    const onProbe = Object.entries(ACTION_REGISTRY)
      .filter(([, m]) => m.placements.some(p => (p.def_key as string) === PROBE))
      .map(([k]) => k).sort()
    expect(onProbe).toEqual(['probe_anonymous_protected_access'])
  })

  it('J · monthly-release behaviour is unchanged', () => {
    expect(discoverReadOnlyActions(FS, 'backend_release_gate').map(a => a.actionKind))
      .toEqual(['observe_release_gate'])
    expect(discoverReadOnlyActions(FS, 'planning').map(a => a.actionKind))
      .toEqual(['compute_release_instant'])
    expect(discoverReadOnlyActions(FS, 'approval_release').map(a => a.actionKind))
      .toEqual(['probe_anonymous_protected_access'])
    // Cross-product must not match.
    expect(discoverReadOnlyActions(FS, 'proof')).toEqual([])
    expect(discoverReadOnlyActions(PROOF, 'backend_release_gate')).toEqual([])
  })

  it('the definition is INERT — registerable only by an explicit operator act', () => {
    const admin = readFileSync(join(process.cwd(), 'app/api/workflows/admin/route.ts'), 'utf8')
    expect(admin).toMatch(/'omnira\.release-gate-proof',/)
    // Registration creates no instance, and nothing runs at deploy time.
    expect(admin).toMatch(/Creates NO instance/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// TASK 11 · STRUCTURAL GUARD
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The seven ways this could drift, pinned as EXACT sets.
 *
 * `toContain` would pass while someone adds a third placement or a second
 * hosted kind, which is precisely the drift worth catching. Each expectation
 * below is falsifiable by a one-line edit to the registry, and each was
 * falsified once during review.
 */
describe('11 · structural guard on the proof workflow', () => {
  type Placement = { def_key: string; state: string }
  const allPlacements = (): Placement[] =>
    Object.values(ACTION_REGISTRY).flatMap(m => [...m.placements] as Placement[])

  it('1 · the proof definition has exactly the intended states', () => {
    expect(def().spec.states.map(s => s.id)).toEqual(['proof', 'complete'])
  })

  it('2 · exactly ONE executable action placement exists on it', () => {
    const onProof = Object.entries(ACTION_REGISTRY)
      .filter(([, m]) => m.placements.some(p => (p.def_key as string) === PROOF))
      .map(([k]) => k).sort()
    expect(onProof).toEqual(['observe_release_gate'])
  })

  it('2b · and on exactly ONE state of it', () => {
    expect([...new Set(allPlacements().filter(p => p.def_key === PROOF).map(p => p.state))])
      .toEqual(['proof'])
  })

  it('3 · that action is READ_ONLY and executable', () => {
    expect(ACTION_REGISTRY.observe_release_gate.action_class).toBe('READ_ONLY')
    expect(ACTION_REGISTRY.observe_release_gate.executor_family).toBe('read_only_observation')
  })

  it('4 · NO non-READ_ONLY kind may be placed on the proof definition', () => {
    for (const [kind, meta] of Object.entries(ACTION_REGISTRY)) {
      if (!meta.placements.some(p => (p.def_key as string) === PROOF)) continue
      expect(meta.action_class, kind).toBe('READ_ONLY')
      expect(meta.executor_family, kind).toBe('read_only_observation')
    }
  })

  it('5 · the Familje-Stunden placement remains exactly backend_release_gate', () => {
    expect(ACTION_REGISTRY.observe_release_gate.placements.filter(p => (p.def_key as string) === FS))
      .toEqual([{ def_key: FS, state: 'backend_release_gate' }])
  })

  it('5b · observe_release_gate has EXACTLY the two reviewed placements', () => {
    expect([...ACTION_REGISTRY.observe_release_gate.placements]
      .map(p => `${p.def_key}/${p.state}`).sort())
      .toEqual(['familje-stunden.monthly-release/backend_release_gate',
                'omnira.release-gate-proof/proof'])
  })

  it('6 · the probe-validation placement set is untouched', () => {
    expect([...ACTION_REGISTRY.probe_anonymous_protected_access.placements]
      .map(p => `${p.def_key}/${p.state}`).sort())
      .toEqual(['familje-stunden.monthly-release/approval_release',
                'omnira.probe-validation/probe'])
    expect(allPlacements().filter(p => p.def_key === PROBE).map(p => p.state)).toEqual(['probe'])
  })

  it('7 · input authority stays instance_key/month — no alternate channel', () => {
    const strip = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
    // The observation now lives solely in the handler, so the month contract is
    // asserted there — and the adapter is asserted to introduce no channel.
    expect(strip('lib/workflows/handlers/observe-release-gate.ts'))
      .toMatch(/observeReleaseGate\(input\.instanceKey/)
    const adapter = strip('lib/workflows/adapters/release-gate-proof/index.ts')
    expect(adapter).not.toMatch(/process\.env/)
    expect(adapter).not.toMatch(/month_key\s*[:=]/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// TASK 4/5 GUARD · exactly ONE authenticated remote read per proof execution
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The contract this pins, and why it is safe — both read out of `schedule.ts`
 * rather than assumed:
 *
 *   "Verification may only ever make an outcome WORSE. … What it can never do,
 *    in any branch, is turn something into an advance."
 *
 * So `verifyState` output can only downgrade. What SATISFIES the required check
 * is recorded `workflow_evidence`, and `recordEvidence` is reachable from
 * exactly one module: the action executor, after a bound and fenced run.
 * A scheduler-time observation would therefore be a second credentialed request
 * whose answer nothing reads.
 */
describe('single-remote-read authority', () => {
  const strip = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

  it('the proof adapter performs NO remote observation', () => {
    const body = strip('lib/workflows/adapters/release-gate-proof/index.ts')
    expect(body).not.toMatch(/observeReleaseGate\s*\(/)
    expect(body).not.toMatch(/fetch\s*\(/)
  })

  it('verifyState returns nothing, and therefore asserts nothing', async () => {
    const adapter = findAdapter(PROOF)!
    for (const state of ['proof', 'complete', 'anything']) {
      expect(await adapter.verifyState({ state, instanceKey: '2099-01', now: NOW })).toEqual([])
    }
    expect(fetchTripwire).not.toHaveBeenCalled()
  })

  it('MUTATION — it may never manufacture a PASS for the required check', () => {
    const body = strip('lib/workflows/adapters/release-gate-proof/index.ts')
    // No literal result, and no evidence object, can be built here.
    expect(body).not.toMatch(/result:\s*'pass'/)
    expect(body).not.toMatch(/check_key:\s*RELEASE_GATE_PROOF_CHECK[\s\S]{0,120}result:/)
  })

  it('the ONLY writer of AUTOMATED evidence is the executor', () => {
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process')
    let out = ''
    try {
      out = execFileSync('grep', ['-rl', 'recordEvidence(',
        `${process.cwd()}/lib`, `${process.cwd()}/app`], { encoding: 'utf8' })
    } catch { /* none */ }
    const writers = out.trim().split('\n').filter(Boolean)
      .filter(f => !f.includes('/qa/'))
      .map(f => f.slice(f.indexOf('/apps/web/') + '/apps/web/'.length)).sort()
    // store.ts DEFINES it. action-executor.ts writes automated observations.
    // The evidence route writes human ATTESTATIONS and can never write this
    // check — see the assertion below.
    expect(writers).toEqual([
      'app/api/workflows/evidence/route.ts',
      'lib/workflows/action-executor.ts',
      'lib/workflows/store.ts',
    ])
  })

  it('the required proof check can NEVER be attested by a human', () => {
    // The operator evidence route refuses a check whose declared provenance does
    // not include 'attested'. So the proof cannot be satisfied by anyone typing
    // it in — only by the real remote response reaching the executor.
    expect(RELEASE_GATE_PROOF_CHECKS[0].allowed_provenance).toEqual(['automated'])
    const route = readFileSync(
      join(process.cwd(), 'app/api/workflows/evidence/route.ts'), 'utf8')
    expect(route).toMatch(/allowed_provenance\.includes\('attested'\)/)
  })

  it('the tick never records evidence of its own', () => {
    expect(strip('lib/workflows/tick.ts')).not.toMatch(/recordEvidence/)
  })

  it('the handler remains the sole remote authority for this action', () => {
    const executor = strip('lib/workflows/action-executor.ts')
    expect(executor).toMatch(/observe_release_gate:\s*observeReleaseGateHandler/)
    const handler = strip('lib/workflows/handlers/observe-release-gate.ts')
    expect(handler).toMatch(/observeReleaseGate\(input\.instanceKey/)
  })
})
