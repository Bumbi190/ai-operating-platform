/**
 * PR9h — validating Omnira's external READ_ONLY capability without corrupting
 * the canonical monthly workflow.
 *
 * The probe is declared for Familje-Stunden's `approval_release`, which is
 * thirteen human gates away and cannot be faked. So the same act is ALSO
 * declared in an Omnira-authored validation workflow — one classification, two
 * placements — and the capability is proven there through the real scheduler,
 * run, executor and evidence path.
 */

import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ACTION_REGISTRY, assertRegistryMatchesDefinition, isExecutableReadOnly } from '../workflows/action-registry'
import { discoverReadOnlyActions } from '../workflows/action-discovery'
import { executableActionKinds, nonExecutableActionKinds } from '../workflows/action-executor'
import { loadVendoredDefinitions } from '../workflows/definitions'
import { probeValidationAdapter, PROBE_CHECK } from '../workflows/adapters/probe-validation'
import { findAdapter } from '../workflows/adapters/registry'

const FS = 'familje-stunden.monthly-release'
const VAL = 'omnira.probe-validation'
const handlerSrc = readFileSync(
  join(process.cwd(), 'lib/workflows/handlers/probe-anonymous-protected-access.ts'), 'utf8')
const defJson = JSON.parse(readFileSync(
  join(process.cwd(), 'lib/workflows/definitions/omnira.probe-validation.v1.json'), 'utf8'))

// ── Definition ──────────────────────────────────────────────────────────────

describe('the validation definition', () => {
  const def = () => loadVendoredDefinitions().find(d => d.def_key === VAL)!

  it('parses, is hash-bound and pins its own file', () => {
    expect(def()).toBeDefined()
    expect(def().def_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(def().version).toBe(1)
    expect(def().spec.initial_state).toBe('probe')
  })

  it('MUTATION — provenance says authored_here, never Familje-Stunden', () => {
    // Presenting an Omnira capability test as a product process would make the
    // audit trail lie about who owns it.
    expect(def().provenance).toBe('authored_here')
    expect(def().source_repo).toBe('ai-operating-platform')
    expect(def().source_repo).not.toContain('familje-stunden')
    const fs = loadVendoredDefinitions().find(d => d.def_key === FS)!
    expect(fs.provenance).toBe('vendored_upstream')
  })

  it('MUTATION — it must never gain a human gate', () => {
    // A gate here would imply an approval this workflow has no business asking
    // for, and would make the validation depend on a human decision.
    for (const s of defJson.states) expect(s.human_gate.required, s.id).toBe(false)
  })

  it('MUTATION — it declares exactly one automated action, and it is the probe', () => {
    const withActions = defJson.states.filter((s: { automated_actions: string[] }) => s.automated_actions.length > 0)
    expect(withActions).toHaveLength(1)
    expect(withActions[0].id).toBe('probe')
    const kinds = Object.entries(ACTION_REGISTRY)
      .filter(([, m]) => m.placements.some(p => p.def_key === VAL))
      .map(([k]) => k)
    expect(kinds).toEqual(['probe_anonymous_protected_access'])
  })

  it('MUTATION — no write-capable kind may ever be placed in it', () => {
    for (const [kind, meta] of Object.entries(ACTION_REGISTRY)) {
      if (meta.placements.some(p => p.def_key === VAL)) {
        expect(meta.action_class, kind).toBe('READ_ONLY')
      }
    }
  })

  it('is a two-state chain that terminates', () => {
    expect(defJson.states.map((s: { id: string }) => s.id)).toEqual(['probe', 'complete'])
    expect(defJson.states[1].next_state).toBeNull()
  })
})

// ── Placements ──────────────────────────────────────────────────────────────

describe('multi-placement registry', () => {
  const probe = ACTION_REGISTRY.probe_anonymous_protected_access

  it('MUTATION — the Familje-Stunden placement is preserved, not replaced', () => {
    expect(probe.placements).toEqual([
      { def_key: FS, state: 'approval_release' },
      { def_key: VAL, state: 'probe' },
    ])
  })

  it('MUTATION — classification is single, not per placement', () => {
    // A kind that were READ_ONLY in one workflow and a write in another would
    // make the class a property of context; every guard downstream reads it.
    expect(probe.action_class).toBe('READ_ONLY')
    expect(Object.keys(probe)).not.toContain('def_key')
    expect(Object.keys(probe)).not.toContain('state')
    expect(JSON.stringify(probe.placements)).not.toMatch(/action_class|executor_family/)
  })

  it('discovery matches EXACT (def_key, state), never one loosely', () => {
    expect(discoverReadOnlyActions(VAL, 'probe').map(a => a.actionKind))
      .toEqual(['probe_anonymous_protected_access'])
    expect(discoverReadOnlyActions(FS, 'approval_release').map(a => a.actionKind))
      .toEqual(['probe_anonymous_protected_access'])
    // Cross-product must NOT match.
    expect(discoverReadOnlyActions(VAL, 'approval_release')).toEqual([])
    expect(discoverReadOnlyActions(FS, 'probe')).toEqual([])
    expect(discoverReadOnlyActions(VAL, 'complete')).toEqual([])
  })

  it('the canonical FS planning placement is untouched', () => {
    expect(discoverReadOnlyActions(FS, 'planning').map(a => a.actionKind))
      .toEqual(['compute_release_instant'])
  })

  it('every placement resolves against a real vendored state', () => {
    expect(assertRegistryMatchesDefinition()).toEqual([])
  })
})

// ── Executor ────────────────────────────────────────────────────────────────

describe('executor widening', () => {
  it('exactly ten READ_ONLY kinds are executable — no eleventh', () => {
    // Phase 1B raised the third: observe_release_gate. The property this pins is
    // not the number but that every executable kind is READ_ONLY, which the
    // HANDLERS type enforces; the count is the tripwire that a new one arrived
    // through review rather than as a side effect.
    expect(executableActionKinds()).toEqual([
      'compose_monthly_brief', 'compute_release_instant',
      'observe_github_merge_sha_match', 'observe_github_pr_checks_green',
      'observe_github_pr_merged', 'observe_release_gate',
      'observe_vercel_deploy_sha_match', 'observe_vercel_production_alias',
      'observe_vercel_production_ready',
      'probe_anonymous_protected_access',
    ])
  })

  it('MUTATION — every write-capable kind stays not_executable', () => {
    expect(nonExecutableActionKinds().sort()).toEqual([
      'apply_release_gate_migration', 'generate_page_audio',
      'send_release_newsletter', 'upload_protected_artifacts',
    ])
    for (const k of nonExecutableActionKinds()) expect(isExecutableReadOnly(k)).toBe(false)
  })

  it('the probe is executable and READ_ONLY', () => {
    expect(isExecutableReadOnly('probe_anonymous_protected_access')).toBe(true)
    expect(ACTION_REGISTRY.probe_anonymous_protected_access.action_class).toBe('READ_ONLY')
  })
})

// ── Handler ─────────────────────────────────────────────────────────────────

describe('the handler wraps, and cannot become a general fetch', () => {
  it('MUTATION — no caller-supplied URL, host or path', () => {
    expect(handlerSrc).not.toMatch(/input\.(url|host|endpoint|path)/)
    expect(handlerSrc).not.toMatch(/fetch\(/)          // it never fetches directly
    // Exactly three things are forwarded, and none can move the request: the
    // instance key (echoed into the body and the audit detail only), the
    // timestamp, and — since G3C-3A — the governance callback the adapter must
    // call before each outbound request. The base URL still comes from
    // configuration inside the adapter, never from a caller.
    expect(handlerSrc).toMatch(
      /checkAnonymousProtectedAccessDenied\(\s*input\.instanceKey,\s*input\.now,\s*input\.beforeAttempt\)/)
  })

  it('does not reimplement classification', () => {
    // The verdict comes from the adapter, whole. `summarize()` counts 2xx for
    // the audit DETAIL, which is not a decision — so the assertion targets the
    // decision itself: `result` is only ever `evidence.result`, and the 401
    // boundary that defines a pass appears nowhere here.
    expect(handlerSrc).toMatch(/result: evidence\.result as ReadOnlyResult/)
    expect([...handlerSrc.matchAll(/^\s*result:/gm)]).toHaveLength(1)
    // `denied_401` is an audit COUNT, not a verdict — so the guard is that no
    // 401 comparison ever feeds `result`.
    expect(handlerSrc).not.toMatch(/result[^\n]*401/)
    expect(handlerSrc).not.toMatch(/result:\s*'(pass|fail|blocked|error)'/)
  })

  it('MUTATION — 403 is never a pass', async () => {
    const { checkAnonymousProtectedAccessDenied } = await import('../workflows/adapters/familje-stunden')
    const src = readFileSync(join(process.cwd(),
      'lib/workflows/adapters/familje-stunden/index.ts'), 'utf8')
    expect(typeof checkAnonymousProtectedAccessDenied).toBe('function')
    expect(src).toMatch(/a\.status === 401/)
    expect(src).not.toMatch(/status === 401 \|\| .*status === 403/)
    expect(src).toMatch(/unexpected_status/)
  })

  it('reports only safe scalars — never a response body', () => {
    expect(handlerSrc).toMatch(/never a response body/)
    expect(handlerSrc).not.toMatch(/res\.text\(\)|\.body/)
  })
})

// ── Zero network when unconfigured ──────────────────────────────────────────

describe('missing config costs nothing', () => {
  it('MUTATION — with the URL absent, fetch is never called', async () => {
    const prev = process.env.FAMILJE_STUNDEN_SUPABASE_URL
    delete process.env.FAMILJE_STUNDEN_SUPABASE_URL
    const spy = vi.spyOn(globalThis, 'fetch')
    try {
      const { probeAnonymousProtectedAccessHandler } =
        await import('../workflows/handlers/probe-anonymous-protected-access')
      const out = await probeAnonymousProtectedAccessHandler({
        instanceKey: 'validation-1', state: 'probe',
        defKey: VAL, defVersion: 1, now: '2026-08-31T00:00:00.000Z',
      })
      expect(spy).not.toHaveBeenCalled()          // ← the whole point
      expect(out.result).toBe('blocked')
      expect(out.checkKey).toBe(PROBE_CHECK)
      expect(out.detail.missing_config).toBe('FAMILJE_STUNDEN_SUPABASE_URL')
      expect(out.detail.attempts).toBe(0)
      expect(out.result).not.toBe('pass')          // never a false pass
    } finally {
      spy.mockRestore()
      if (prev === undefined) delete process.env.FAMILJE_STUNDEN_SUPABASE_URL
      else process.env.FAMILJE_STUNDEN_SUPABASE_URL = prev
    }
  })

  it('the adapter returns before building any request', () => {
    const src = readFileSync(join(process.cwd(),
      'lib/workflows/adapters/familje-stunden/index.ts'), 'utf8')
    const fn = src.slice(src.indexOf('export async function checkAnonymousProtectedAccessDenied'))
    const guard = fn.indexOf('if (!baseUrl)')
    const firstProbe = fn.indexOf('await probe(')
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(firstProbe)
  })
})

// ── Evidence model ──────────────────────────────────────────────────────────

describe('the result is a DECLARED check', () => {
  it('the validation adapter declares the probe check for its state', () => {
    const checks = probeValidationAdapter.attestableChecks()
    expect(checks).toHaveLength(1)
    expect(checks[0]).toMatchObject({
      check_key: PROBE_CHECK, state: 'probe',
      allowed_provenance: ['automated'], required: true,
    })
  })

  it('MUTATION — no attestation may satisfy it', () => {
    expect(probeValidationAdapter.attestableChecks()[0].allowed_provenance).toEqual(['automated'])
  })

  it('the adapter is reachable by def_key', () => {
    expect(findAdapter(VAL)?.defKey).toBe(VAL)
    expect(findAdapter(FS)?.defKey).toBe(FS)
  })

  it('reuses the SAME probe function as Familje-Stunden — no second copy', async () => {
    const adapterSrc = readFileSync(join(process.cwd(),
      'lib/workflows/adapters/probe-validation/index.ts'), 'utf8')
    expect(adapterSrc).toMatch(/import \{[\s\S]*checkAnonymousProtectedAccessDenied[\s\S]*\} from '\.\.\/familje-stunden'/)
    expect(adapterSrc).not.toMatch(/fetch\(/)
  })
})

// ── Canonical isolation ─────────────────────────────────────────────────────

describe('the canonical Familje-Stunden workflow is untouched', () => {
  it('MUTATION — its def_hash is unchanged', () => {
    const fs = loadVendoredDefinitions().find(d => d.def_key === FS)!
    expect(fs.def_hash).toBe('eef18502d2de6aa9017b63a7b174f00638fd3dbc9ae74575d13f3040b0dd5f2c')
    expect(fs.source_sha256).toBe('88d9cc31fe57181e974d1e37c8968eee40bc8cc11e1745fe0a85205e98fa1bed')
  })

  it('still has 19 states, 13 gate-required', () => {
    const fs = loadVendoredDefinitions().find(d => d.def_key === FS)!
    expect(fs.spec.states).toHaveLength(19)
    expect(fs.spec.states.filter(s => s.human_gate.required === true)).toHaveLength(13)
  })

  it('no classification changed except the probe becoming executable', () => {
    expect(ACTION_REGISTRY.compute_release_instant.action_class).toBe('READ_ONLY')
    expect(ACTION_REGISTRY.compute_release_instant.executor_family).toBe('read_only_observation')
    expect(ACTION_REGISTRY.upload_protected_artifacts.action_class).toBe('MATERIAL_WRITE')
    expect(ACTION_REGISTRY.send_release_newsletter.action_class).toBe('EXTERNAL_COMMUNICATION')
    expect(ACTION_REGISTRY.generate_page_audio.action_class).toBe('FINANCIAL')
  })

  it('the validation workflow cannot reach any Familje-Stunden state', () => {
    for (const s of ['approval_release', 'protected_upload', 'newsletter', 'planning']) {
      expect(discoverReadOnlyActions(VAL, s)).toEqual([])
    }
  })
})
