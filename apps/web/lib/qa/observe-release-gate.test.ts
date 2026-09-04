/**
 * Phase 1B — the release-gate observation and its projection.
 *
 * The gate is FAIL-OPEN, so the failure that matters is not "wrong value" but
 * "answered confidently without knowing". Most of what follows asserts that
 * uncertainty stays uncertain: a timeout, a refusal, an unreadable body and a
 * missing credential must all reach UNKNOWN and block, and none of them may ever
 * become "no row".
 *
 * `fetch` is stubbed per test. No production endpoint is contacted, no real
 * month key is used, and the temporary credential handoff is never read.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { projectMonthReleaseBundle, RELEASE_GATE_MAX_AGE_MS } from '../workflows/bundle/project'
import { loadVendoredDefinitions, FAMILJE_STUNDEN_MONTHLY_RELEASE } from '../workflows/definitions'
import { FAMILJE_STUNDEN_CHECKS } from '../workflows/adapters/familje-stunden/checks'
import { ACTION_REGISTRY, isGovernedEffectEnabled } from '../workflows/action-registry'
import { checkAnsweredBy } from '../workflows/action-discovery'
import type { WorkflowDef, WorkflowEvidence, WorkflowInstance, WorkflowTransition } from '../workflows/types'

const NOW = '2026-09-03T12:00:00.000Z'
// Deliberately NOT a real month: never 2026-09..12.
const MONTH = '2099-01'
const EXPECTED_UTC = '2098-12-31T23:00:00.000Z'
const KEY = 'test-verify-key-must-never-leak'
const BASE = 'https://fs.example.test'

let observeReleaseGate: typeof import('../workflows/adapters/familje-stunden')['observeReleaseGate']

beforeEach(async () => {
  vi.resetModules()
  process.env.FAMILJE_STUNDEN_SUPABASE_URL = BASE
  process.env.FAMILJE_STUNDEN_VERIFY_KEY = KEY
  ;({ observeReleaseGate } = await import('../workflows/adapters/familje-stunden'))
})

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.FAMILJE_STUNDEN_SUPABASE_URL
  delete process.env.FAMILJE_STUNDEN_VERIFY_KEY
})

function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response> | Response) {
  const spy = vi.fn(impl as never)
  vi.stubGlobal('fetch', spy)
  return spy
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// ── The observation ──────────────────────────────────────────────────────────

describe('observation outcomes', () => {
  it('2. row present → pass, carrying the authoritative release_at', async () => {
    stubFetch(() => json({ month_key: MONTH, row_present: true, release_at: EXPECTED_UTC }))
    const e = await observeReleaseGate(MONTH, NOW)
    expect(e.result).toBe('pass')
    expect(e.check_key).toBe('release_gate_exists')
    expect(e.detail.row_present).toBe(true)
    expect(e.detail.release_at).toBe(EXPECTED_UTC)
  })

  it('3. row absent → authoritative fail, never blocked', async () => {
    stubFetch(() => json({ month_key: MONTH, row_present: false, release_at: null }))
    const e = await observeReleaseGate(MONTH, NOW)
    expect(e.result).toBe('fail')            // a finding about the world
    expect(e.failure_kind).toBe('authoritative_fail')
    expect(e.detail.row_present).toBe(false)
  })

  it('4. auth rejection → not pass, and never "no row"', async () => {
    for (const status of [401, 403]) {
      stubFetch(() => new Response('{}', { status }))
      const e = await observeReleaseGate(MONTH, NOW)
      expect(e.result).not.toBe('pass')
      expect(e.result).not.toBe('fail')      // must not look like an absent row
      expect(e.detail.reason).toBe('AUTH_REJECTED')
    }
  })

  it('5. transport failure → blocked, distinguishing timeout from refusal', async () => {
    stubFetch(() => { throw new TypeError('connect ECONNREFUSED') })
    const net = await observeReleaseGate(MONTH, NOW)
    expect(net.result).toBe('blocked')
    expect(net.detail.reason).toBe('TRANSPORT_FAILURE')

    stubFetch(() => { const e = new Error('aborted'); e.name = 'AbortError'; throw e })
    const to = await observeReleaseGate(MONTH, NOW)
    expect(to.result).toBe('blocked')
    expect(to.failure_kind).toBe('network_timeout')
  })

  it('6. server failure → not pass, never "no row"', async () => {
    stubFetch(() => new Response('{}', { status: 502 }))
    const e = await observeReleaseGate(MONTH, NOW)
    expect(e.result).not.toBe('pass')
    expect(e.result).not.toBe('fail')
    expect(e.detail.reason).toBe('REMOTE_SERVER_FAILURE')
  })

  it('7. malformed responses → error, never "no row"', async () => {
    const cases: unknown[] = [
      { month_key: MONTH },                                   // no row_present
      { month_key: MONTH, row_present: 'yes' },               // not a boolean
      { month_key: '2099-02', row_present: true, release_at: EXPECTED_UTC }, // wrong month
      { month_key: MONTH, row_present: true, release_at: 'not-a-date' },
      { month_key: MONTH, row_present: true, release_at: null },
    ]
    for (const body of cases) {
      stubFetch(() => json(body))
      const e = await observeReleaseGate(MONTH, NOW)
      expect(e.result).not.toBe('pass')
      expect(e.result).not.toBe('fail')
    }
  })

  it('8. malformed month_key is rejected before any request', async () => {
    const spy = stubFetch(() => json({}))
    for (const bad of ['oktober', '2026-13', '2026-1', '', 'x']) {
      const e = await observeReleaseGate(bad, NOW)
      expect(e.result).not.toBe('pass')
      expect(e.detail.reason).toBe('INVALID_MONTH_KEY')
    }
    expect(spy).not.toHaveBeenCalled()
  })

  it('1/32. a missing credential blocks before any network attempt', async () => {
    delete process.env.FAMILJE_STUNDEN_VERIFY_KEY
    vi.resetModules()
    const mod = await import('../workflows/adapters/familje-stunden')
    const spy = stubFetch(() => json({}))
    const e = await mod.observeReleaseGate(MONTH, NOW)
    expect(e.result).toBe('blocked')
    expect(e.failure_kind).toBe('credential_missing')
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('9/12. the target is configuration, never input', () => {
  it('month_key cannot influence the URL, and exactly one endpoint is called', async () => {
    const spy = stubFetch(() => json({ month_key: MONTH, row_present: true, release_at: EXPECTED_UTC }))
    await observeReleaseGate(MONTH, NOW)
    expect(spy).toHaveBeenCalledTimes(1)
    const url = String(spy.mock.calls[0][0])
    expect(url).toBe(`${BASE}/functions/v1/observe-release-gate`)
    expect(url.startsWith(BASE)).toBe(true)
  })

  it('an injection-shaped month key never reaches the URL', async () => {
    const spy = stubFetch(() => json({}))
    for (const evil of ['../../evil', 'https://attacker.test/x', '2099-01/../../y', '%2e%2e']) {
      await observeReleaseGate(evil, NOW)
    }
    // All rejected locally; nothing dispatched at all.
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('10/11. the credential never surfaces', () => {
  it('is sent only as the Authorization header and appears in no evidence', async () => {
    const spy = stubFetch(() => json({ month_key: MONTH, row_present: true, release_at: EXPECTED_UTC }))
    const e = await observeReleaseGate(MONTH, NOW)
    const init = spy.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`)
    expect(JSON.stringify(e)).not.toContain(KEY)
    expect(JSON.stringify(e)).not.toContain('Bearer')
  })

  it('never appears in failure evidence either — including thrown errors', async () => {
    const outcomes = [
      () => { throw new Error(`failed to POST ${BASE} with Bearer ${KEY}`) },
      () => new Response('{}', { status: 401 }),
      () => new Response('{}', { status: 500 }),
      () => new Response('not json', { status: 200 }),
    ]
    for (const impl of outcomes) {
      stubFetch(impl as never)
      const e = await observeReleaseGate(MONTH, NOW)
      const s = JSON.stringify(e)
      expect(s).not.toContain(KEY)
      expect(s).not.toContain('Bearer')
    }
  })
})

// ── Registration ─────────────────────────────────────────────────────────────

describe('13-18. the action is READ_ONLY and adds no dangerous capability', () => {
  it('is registered READ_ONLY with an executable read-only family', () => {
    const a = ACTION_REGISTRY.observe_release_gate
    expect(a.action_class).toBe('READ_ONLY')
    expect(a.executor_family).toBe('read_only_observation')
    // TWO placements since Phase 1B-2. The release placement is unchanged; the
    // second is Omnira's dedicated release-gate proof workflow, whose instance
    // key IS the month. Kept EXACT rather than `toContain`: a third placement is
    // a decision, not a detail.
    expect(a.placements).toEqual([
      { def_key: FAMILJE_STUNDEN_MONTHLY_RELEASE, state: 'backend_release_gate' },
      { def_key: 'omnira.release-gate-proof',     state: 'proof' },
    ])
  })

  it('answers exactly the declared check', () => {
    expect(checkAnsweredBy('observe_release_gate')).toBe('release_gate_exists')
    expect(FAMILJE_STUNDEN_CHECKS.some(c => c.check_key === 'release_gate_exists')).toBe(true)
  })

  it('the check is automated-only — it may never be attested', () => {
    const declared = FAMILJE_STUNDEN_CHECKS.filter(c => c.check_key === 'release_gate_exists')
    expect(declared.length).toBeGreaterThan(0)
    for (const c of declared) {
      expect([...c.allowed_provenance]).toEqual(['automated'])
      expect(c.required).toBe(true)
    }
  })

  it('no write, comms or spend action became executable', () => {
    // Phase 2B-1 added a `governed_effect` family. The invariant this test exists
    // for is unchanged and is now stated directly: an effectful kind may only
    // leave `not_executable` by appearing on the governed-effect ALLOWLIST, which
    // holds one deterministic proof action that reaches no product system.
    for (const [kind, meta] of Object.entries(ACTION_REGISTRY)) {
      if (meta.executor_family === 'read_only_observation') {
        expect(meta.action_class, `${kind} is executable`).toBe('READ_ONLY')
      }
      if (meta.action_class !== 'READ_ONLY' && meta.executor_family !== 'not_executable') {
        expect(isGovernedEffectEnabled(kind), `${kind} left inert without an allowlist entry`)
          .toBe(true)
        // and it may not belong to a product workflow
        for (const p of meta.placements) {
          expect(p.def_key, `${kind} is placed on a product definition`)
            .toBe('omnira.execution-proof')
        }
      }
    }
  })

  it('every Familje-Stunden write, comms or spend action is still inert', () => {
    for (const kind of ['apply_release_gate_migration', 'generate_page_audio',
                        'send_release_newsletter', 'upload_protected_artifacts'] as const) {
      expect(ACTION_REGISTRY[kind].executor_family, kind).toBe('not_executable')
    }
  })

  it('31/32. the handler duplicates no access logic and holds no privileged key', () => {
    const src = readFileSync(join(process.cwd(), 'lib/workflows/handlers/observe-release-gate.ts'), 'utf8')
    const code = src.split('\n')
      .filter(l => { const t = l.trim(); return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*') })
      .join('\n')
    for (const forbidden of [
      'can_access_month', 'get_visible_months', 'is_month_released', 'month_releases',
      'SERVICE_ROLE', 'service_role', 'fetch(',
    ]) {
      expect(code, `handler must not contain ${forbidden}`).not.toContain(forbidden)
    }
  })

  it('32. Omnira holds no Familje-Stunden service_role anywhere in the adapter', () => {
    const src = readFileSync(
      join(process.cwd(), 'lib/workflows/adapters/familje-stunden/index.ts'), 'utf8')
    expect(src).not.toContain('SUPABASE_SERVICE_ROLE')
    expect(src).not.toContain('FAMILJE_STUNDEN_SERVICE_ROLE')
  })
})

// ── Projection ───────────────────────────────────────────────────────────────

function realDef(): WorkflowDef {
  const v = loadVendoredDefinitions().find(d => d.def_key === FAMILJE_STUNDEN_MONTHLY_RELEASE)!
  return { id: 'def-1', def_key: v.def_key, version: v.version, def_hash: v.def_hash, spec: v.spec, created_at: NOW }
}
const instance = (over: Partial<WorkflowInstance> = {}): WorkflowInstance => ({
  id: 'inst-1', def_id: 'def-1', def_key: FAMILJE_STUNDEN_MONTHLY_RELEASE, def_version: 1,
  def_hash: 'h', project_id: 'p', instance_key: MONTH, current_state: 'backend_release_gate',
  status: 'active', wake_at: null, last_tick_at: null, last_tick_outcome: null,
  created_at: NOW, closed_at: null, ...over,
})
const transition = (seq: number, to: string, from: string | null): WorkflowTransition => ({
  id: `t-${seq}`, seq, instance_id: 'inst-1', from_state: from, to_state: to,
  reason: 't', actor: 't', evidence_ref: null, authorization_id: null, occurred_at: NOW,
})
function ev(
  check_key: string, state: string, result: WorkflowEvidence['result'],
  detail: Record<string, unknown> = {}, observed_at = NOW,
): WorkflowEvidence {
  return {
    id: `e-${state}-${check_key}-${observed_at}`, instance_id: 'inst-1', state, check_key,
    result, source: 'automated', detail, recorded_at: observed_at,
    producer: 'omnira', producer_type: 'omnira', observed_at,
    payload_hash: null, target_hash: null, attestation: {},
  }
}
const expectedEv = () => ev('release_instant_computed', 'planning', 'pass', { utc: EXPECTED_UTC })

const proj = (evidence: WorkflowEvidence[]) => projectMonthReleaseBundle({
  month_key: MONTH, def: realDef(), instance: instance(),
  transitions: [transition(1, 'planning', null), transition(2, 'backend_release_gate', 'planning')],
  evidence, declaredChecks: FAMILJE_STUNDEN_CHECKS,
  readOnlyAnsweredCheckKeys: ['release_gate_exists', 'anonymous_protected_access_denied', 'release_instant_computed'],
  now: NOW,
})

describe('19-29. bundle projection of the invariant', () => {
  it('19/29. a fresh YES with a matching instant satisfies the invariant', () => {
    const b = proj([
      expectedEv(),
      ev('release_gate_exists', 'backend_release_gate', 'pass', { row_present: true, release_at: EXPECTED_UTC }),
    ])
    expect(b.technical.release_gate_row_present).toBe('YES')
    expect(b.technical.release_gate_release_at).toBe(EXPECTED_UTC)
    expect(b.technical.expected_release_at).toBe(EXPECTED_UTC)
    expect(b.technical.release_at_match).toBe('MATCH')
    expect(b.technical.release_gate_freshness).toBe('fresh')
    for (const code of ['RELEASE_GATE_ROW_MISSING', 'RELEASE_GATE_ROW_UNKNOWN',
                        'RELEASE_AT_MISMATCH', 'RELEASE_GATE_EVIDENCE_STALE']) {
      expect(b.readiness.blockers.some(x => x.code === code), code).toBe(false)
    }
  })

  it('20. a recorded NO blocks readiness', () => {
    const b = proj([expectedEv(),
      ev('release_gate_exists', 'backend_release_gate', 'fail', { row_present: false })])
    expect(b.technical.release_gate_row_present).toBe('NO')
    expect(b.readiness.blockers.some(x => x.code === 'RELEASE_GATE_ROW_MISSING')).toBe(true)
    expect(b.readiness.product).toBe('BLOCKED')
  })

  it('21. a recorded UNKNOWN (blocked/error) blocks readiness', () => {
    for (const r of ['blocked', 'error'] as const) {
      const b = proj([expectedEv(), ev('release_gate_exists', 'backend_release_gate', r)])
      expect(b.technical.release_gate_row_present).toBe('UNKNOWN')
      expect(b.readiness.blockers.some(x => x.code === 'RELEASE_GATE_ROW_UNKNOWN')).toBe(true)
      expect(b.readiness.product).toBe('BLOCKED')
    }
  })

  it('22. missing evidence remains UNKNOWN', () => {
    const b = proj([expectedEv()])
    expect(b.technical.release_gate_row_present).toBe('UNKNOWN')
    expect(b.technical.release_gate_evidence_source).toBeNull()
    expect(b.readiness.product).toBe('BLOCKED')
  })

  it('23/24. deployment, manifest and probe evidence cannot manufacture YES', () => {
    const b = proj([
      expectedEv(),
      ev('vercel_deploy_sha_matches_merge_sha', 'frontend_deploy', 'pass'),
      ev('github_pr_merged', 'frontend_deploy', 'pass'),
      ev('deployed_manifest_matches_expected', 'edge_deploy', 'pass'),
      ev('shared_manifest_consumers_in_sync', 'edge_deploy', 'pass'),
      ev('anonymous_protected_access_denied', 'approval_release', 'pass'),
      ev('protected_upload_preflight_passed', 'protected_upload', 'pass'),
    ])
    expect(b.technical.release_gate_row_present).toBe('UNKNOWN')
    expect(b.readiness.product).toBe('BLOCKED')
  })

  it('25. equivalent instant serialisations MATCH', () => {
    const b = proj([
      ev('release_instant_computed', 'planning', 'pass', { utc: '2098-12-31T23:00:00.000Z' }),
      ev('release_gate_exists', 'backend_release_gate', 'pass',
        { row_present: true, release_at: '2098-12-31T23:00:00+00:00' }),
    ])
    expect(b.technical.release_at_match).toBe('MATCH')
  })

  it('26. a different instant is a MISMATCH and a CRITICAL blocker', () => {
    const b = proj([
      expectedEv(),
      ev('release_gate_exists', 'backend_release_gate', 'pass',
        { row_present: true, release_at: '2099-01-01T00:00:00.000Z' }),
    ])
    expect(b.technical.release_at_match).toBe('MISMATCH')
    const w = b.readiness.blockers.find(x => x.code === 'RELEASE_AT_MISMATCH')
    expect(w).toBeDefined()
    expect(w!.severity).toBe('critical')
    expect(b.readiness.product).toBe('BLOCKED')
  })

  it('27. an unparseable observed release_at blocks rather than guessing', () => {
    const b = proj([
      expectedEv(),
      ev('release_gate_exists', 'backend_release_gate', 'pass',
        { row_present: true, release_at: 'whenever' }),
    ])
    expect(b.technical.release_at_match).toBe('UNKNOWN')
    expect(b.readiness.blockers.some(x => x.code === 'RELEASE_AT_UNVERIFIED')).toBe(true)
    expect(b.readiness.product).toBe('BLOCKED')
  })

  it('28. a stale observation cannot satisfy the invariant', () => {
    const old = new Date(Date.parse(NOW) - RELEASE_GATE_MAX_AGE_MS - 60_000).toISOString()
    const b = proj([
      expectedEv(),
      ev('release_gate_exists', 'backend_release_gate', 'pass',
        { row_present: true, release_at: EXPECTED_UTC }, old),
    ])
    expect(b.technical.release_gate_row_present).toBe('YES')
    expect(b.technical.release_at_match).toBe('MATCH')
    expect(b.technical.release_gate_freshness).toBe('stale')
    expect(b.readiness.blockers.some(x => x.code === 'RELEASE_GATE_EVIDENCE_STALE')).toBe(true)
    expect(b.readiness.product).toBe('BLOCKED')
  })

  it('the newest observation wins when several exist', () => {
    const older = new Date(Date.parse(NOW) - 3600_000).toISOString()
    const b = proj([
      expectedEv(),
      ev('release_gate_exists', 'backend_release_gate', 'fail', { row_present: false }, older),
      ev('release_gate_exists', 'backend_release_gate', 'pass',
        { row_present: true, release_at: EXPECTED_UTC }, NOW),
    ])
    expect(b.technical.release_gate_row_present).toBe('YES')
  })
})

describe('30. the bundle stays passive', () => {
  it('projecting performs no network request', () => {
    const spy = stubFetch(() => json({}))
    proj([expectedEv(), ev('release_gate_exists', 'backend_release_gate', 'pass',
      { row_present: true, release_at: EXPECTED_UTC })])
    expect(spy).not.toHaveBeenCalled()
  })

  it('the projection module still imports nothing executable', () => {
    const src = readFileSync(join(process.cwd(), 'lib/workflows/bundle/project.ts'), 'utf8')
    const imports = [...src.matchAll(/^import\s[\s\S]*?from\s+'([^']+)'/gm)].map(m => m[1])
    expect(imports.sort()).toEqual(
      ['../attestation', '../types', './github-binding', './reachability-policy', './types'])
    expect(src).not.toMatch(/\bfetch\s*\(/)
    expect(src).not.toMatch(/observeReleaseGate/)
    // The fourth import is the reachability POLICY TABLE: a const list of
    // check keys and reasons. Widening this enumeration would weaken the guard
    // unless the newcomer is itself proven inert, so it is checked here too.
    const policy = readFileSync(join(process.cwd(), 'lib/workflows/bundle/reachability-policy.ts'), 'utf8')
    for (const forbidden of ['fetch(', 'process.env', 'import(', 'require(', 'supabase']) {
      expect(policy, forbidden).not.toContain(forbidden)
    }
    // The fifth import is the GitHub release BINDING: a pure reader over
    // instance evidence. Widening the enumeration would weaken the guard unless
    // the newcomer is itself proven inert, so it is checked here too.
    // Comments stripped: the module documents the env vars it refuses to fall
    // back to, and that documentation is worth more than a naive substring match.
    const bindingSrc = readFileSync(join(process.cwd(), 'lib/workflows/bundle/github-binding.ts'), 'utf8')
    const binding = bindingSrc.split('\n')
      .filter(l => { const t = l.trim(); return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*') })
      .join('\n')
    for (const forbidden of ['fetch(', 'process.env', 'import(', 'require(', 'supabase', 'api.github.com']) {
      expect(binding, forbidden).not.toContain(forbidden)
    }

  })

  it('the bundle route still calls no action and no writer', () => {
    const src = readFileSync(join(process.cwd(), 'app/api/workflows/bundle/route.ts'), 'utf8')
    const code = src.split('\n')
      .filter(l => { const t = l.trim(); return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*') })
      .join('\n')
    for (const forbidden of [
      'observeReleaseGate', 'executeWorkflowAction', 'appendTransition',
      'recordEvidence', 'fetch(',
    ]) {
      expect(code).not.toContain(forbidden)
    }
  })
})
