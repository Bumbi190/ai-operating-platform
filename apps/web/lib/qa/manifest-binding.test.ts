/**
 * The instance-bound expected manifest hash.
 *
 * Third removal of the same defect class, after `FAMILJE_STUNDEN_RELEASE_PR`
 * and `FAMILJE_STUNDEN_EXPECTED_MERGE_SHA`: a deployment-global value answering
 * for a month it does not belong to.
 *
 * The load-bearing tests are the ones about where the expectation may NOT come
 * from. `deployed_manifest_matches_expected` exists because a merged shared file
 * is not a deployed shared file — so an expectation derived from the deployed
 * function, from a runtime self-report, or from whatever the repository says at
 * verification time reduces the check to production equalling itself.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  projectManifestBinding, MANIFEST_BINDING_CHECKS, MANIFEST_BINDING_STATE,
  MANIFEST_IDENTITY_CONSUMERS,
} from '../workflows/bundle/manifest-binding'
import { checkDeployedManifestMatchesExpected } from '../workflows/adapters/familje-stunden/deployed-source'
import { projectMonthReleaseBundle } from '../workflows/bundle/project'
import { loadVendoredDefinitions, FAMILJE_STUNDEN_MONTHLY_RELEASE } from '../workflows/definitions'
import { FAMILJE_STUNDEN_CHECKS } from '../workflows/adapters/familje-stunden/checks'
import type { WorkflowDef, WorkflowEvidence, WorkflowInstance, WorkflowTransition } from '../workflows/types'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)
const NOW = '2026-09-05T12:00:00.000Z'
const T1 = '2026-09-01T00:00:00.000Z'
const T2 = '2026-09-02T00:00:00.000Z'
const T3 = '2026-09-03T00:00:00.000Z'

const row = (value: unknown, at: string, key = MANIFEST_BINDING_CHECKS.expectedSha): WorkflowEvidence => ({
  id: `${key}-${at}-${String(value).slice(0, 8)}`, instance_id: 'i',
  state: MANIFEST_BINDING_STATE, check_key: key, result: 'pass', source: 'attested',
  detail: { value }, recorded_at: at, producer: 'editor', producer_type: 'human',
  observed_at: at, payload_hash: null, target_hash: null, attestation: {},
} as unknown as WorkflowEvidence)

/** Evidence from a check that CONSUMES the expectation — the lock. */
const use = (at: string, key = 'deployed_manifest_matches_expected'): WorkflowEvidence => ({
  id: `${key}-${at}`, instance_id: 'i', state: MANIFEST_BINDING_STATE, check_key: key,
  result: 'fail', source: 'automated', detail: {}, recorded_at: at,
  producer: null, producer_type: null, observed_at: at,
  payload_hash: null, target_hash: null, attestation: {},
} as unknown as WorkflowEvidence)

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

// ── 1-6. IDENTITY AND VALIDATION ─────────────────────────────────────────────

describe('1-6. the expectation is one instance-bound value', () => {
  it('1. a valid SHA-256 becomes BOUND', () => {
    const b = projectManifestBinding([row(A, T1)])
    expect(b.binding_status).toBe('BOUND')
    expect(b.expected_manifest_sha256).toBe(A)
    expect(b.generations).toBe(1)
  })

  it('2. a malformed value is INVALID, never a silent BOUND', () => {
    for (const bad of ['abc', A.slice(0, 63), `${A}0`, 'g'.repeat(64), 42, null, {}, '']) {
      const b = projectManifestBinding([row(bad, T1)])
      expect(b.binding_status, JSON.stringify(bad)).not.toBe('BOUND')
      expect(b.expected_manifest_sha256, JSON.stringify(bad)).toBeNull()
    }
    expect(projectManifestBinding([row('abc', T1)]).invalid_fields)
      .toEqual([MANIFEST_BINDING_CHECKS.expectedSha])
  })

  it('3. no evidence is MISSING', () => {
    const b = projectManifestBinding([])
    expect(b.binding_status).toBe('MISSING')
    expect(b.expected_manifest_sha256).toBeNull()
    expect(b.generations).toBe(0)
  })

  it('4. case and whitespace normalize deterministically', () => {
    const upper = projectManifestBinding([row(A.toUpperCase(), T1)])
    expect(upper.binding_status).toBe('BOUND')
    expect(upper.expected_manifest_sha256).toBe(A)      // lowercase, always

    // And a re-attestation in the other case is a RESTATEMENT, not a new
    // generation — and after the lock, not a conflict either. Letter case must
    // never block a release.
    const restated = projectManifestBinding([row(A, T1), use(T2), row(A.toUpperCase(), T3)])
    expect(restated.binding_status).toBe('BOUND')
    expect(restated.generations).toBe(1)
    expect(projectManifestBinding([row(`  ${A}  `, T1)]).expected_manifest_sha256).toBe(A)
  })

  it('5. a complete correction BEFORE the lock replaces the expectation', () => {
    const b = projectManifestBinding([row(A, T1), row(B, T2)])
    expect(b.binding_status).toBe('BOUND')
    expect(b.expected_manifest_sha256).toBe(B)
    expect(b.generations).toBe(2)
  })

  it('6. a malformed replacement cannot fabricate BOUND from the old value', () => {
    const b = projectManifestBinding([row(A, T1), row('nonsense', T2)])
    expect(b.binding_status).toBe('INVALID')
    // The previous value does not get to look authoritative behind a bad one.
    expect(b.invalid_fields).toEqual([MANIFEST_BINDING_CHECKS.expectedSha])
  })
})

// ── 7-10. LOCK AND CONFLICT ──────────────────────────────────────────────────

describe('7-10. once relied upon, the expectation cannot change', () => {
  it('7. the first consuming evidence locks it', () => {
    const b = projectManifestBinding([row(A, T1), use(T2)])
    expect(b.locked_at).toBe(T2)
    expect(b.locked_by).toBe('deployed_manifest_matches_expected')
  })

  it('7b. ONLY a check that reads the expectation locks it', () => {
    // The other three edge_deploy checks never read the expected hash:
    // consumers-in-sync compares consumers to each other, and the two
    // source_current checks read status/version/verify_jwt. Locking on those
    // would refuse a legitimate correction on evidence that never used it.
    expect([...MANIFEST_IDENTITY_CONSUMERS]).toEqual(['deployed_manifest_matches_expected'])
    for (const key of ['shared_manifest_consumers_in_sync', 'sign_protected_asset_source_current',
                       'get_protected_ebook_source_current']) {
      const b = projectManifestBinding([row(A, T1), use(T2, key), row(B, T3)])
      expect(b.locked_at, key).toBeNull()
      expect(b.binding_status, key).toBe('BOUND')
      expect(b.expected_manifest_sha256, key).toBe(B)   // correction still allowed
    }
  })

  it('8. a post-lock replacement is CONFLICTED, not applied', () => {
    const b = projectManifestBinding([row(A, T1), use(T2), row(B, T3)])
    expect(b.binding_status).toBe('CONFLICTED')
    expect(b.expected_manifest_sha256).toBe(A)          // the locked one survives
    expect(b.generations).toBe(1)
  })

  it('9. the refused value stays visible for audit', () => {
    const b = projectManifestBinding([row(A, T1), use(T2), row(B, T3)])
    expect(b.rejected_rebind).toEqual({
      expected_manifest_sha256: B, recorded_at: T3, reason: 'AFTER_DOWNSTREAM_RELIANCE',
    })
  })

  it('10. newest-wins cannot smuggle a later generation past the lock', () => {
    // Three attestations with the lock in the middle. The correction at T2
    // landed strictly BEFORE the lock at T2b, so it holds authority; the one
    // after it does not, however new it is.
    const C = 'c'.repeat(64)
    const T2b = '2026-09-02T12:00:00.000Z'
    const b = projectManifestBinding([row(A, T1), row(B, T2), use(T2b), row(C, T3)])
    expect(b.expected_manifest_sha256).toBe(B)
    expect(b.generations).toBe(2)
    expect(b.binding_status).toBe('CONFLICTED')
    expect(b.rejected_rebind?.expected_manifest_sha256).toBe(C)
  })

  it('10b. a rebind recorded AT the lock instant is refused, not resolved', () => {
    // Same timestamp, so the order is genuinely unknown: the attestation may
    // have landed after the check already compared against the old value.
    // Fail closed — a coin flip is not an authority.
    const b = projectManifestBinding([row(A, T1), row(B, T2), use(T2)])
    expect(b.expected_manifest_sha256).toBe(A)
    expect(b.binding_status).toBe('CONFLICTED')
  })
})

// ── 11-14. NO OTHER AUTHORITY MAY SUPPLY IT ──────────────────────────────────

describe('11-14. the expectation cannot come from what it checks', () => {
  const SRC = 'lib/workflows/bundle/manifest-binding.ts'
  const src = readFileSync(join(process.cwd(), SRC), 'utf8')
  const code = src.split('\n')
    .filter(l => { const t = l.trim(); return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*') })
    .join('\n')

  it('11. NEGATIVE CONTROL — the deployment-global env var is not a fallback', () => {
    vi.stubEnv('FAMILJE_STUNDEN_EXPECTED_MANIFEST_SHA256', A)
    expect(projectManifestBinding([]).binding_status).toBe('MISSING')
    expect(projectManifestBinding([]).expected_manifest_sha256).toBeNull()
    // And the module cannot read an environment at all.
    expect(code).not.toContain('process.env')

    // Nor can the consuming check: the expectation is a parameter, and null
    // means null even with the old global set.
    const e = checkDeployedManifestMatchesExpected([], null, NOW)
    expect(e.result).toBe('blocked')
    expect(e.detail.reason).toBe('EXPECTED_MANIFEST_NOT_BOUND')
  })

  it('12/13/14. deployed source, runtime self-report and live repo state cannot populate it', () => {
    // The module has no way to reach any of them: no fetch, no client, no
    // import of a reader, no filesystem. Its only input is instance evidence.
    for (const forbidden of ['fetch(', 'api.supabase.com', 'MANAGEMENT', 'readDeployedFunction',
                             'readAllConsumers', 'readFileSync', 'createHash', 'import(', 'require(']) {
      expect(code, forbidden).not.toContain(forbidden)
    }
    const imports = [...src.matchAll(/^import\s[\s\S]*?from\s+'([^']+)'/gm)].map(m => m[1])
    expect(imports).toEqual(['../types'])   // one type-only import, nothing else
  })

  it('14b. and the check refuses to infer an expectation when none is bound', () => {
    // Two consumers that agree perfectly with each other. Agreement is not an
    // expectation: both could be running the same stale manifest.
    const e = checkDeployedManifestMatchesExpected([], null, NOW)
    expect(e.result).not.toBe('pass')
  })
})

// ── 15-22. BUNDLE, REACHABILITY, READINESS ───────────────────────────────────

describe('15-22. projection stays passive and changes nothing else', () => {
  const bundle = (evidence: WorkflowEvidence[]) => {
    const v = loadVendoredDefinitions().find(d => d.def_key === FAMILJE_STUNDEN_MONTHLY_RELEASE)!
    const def: WorkflowDef = { id: 'd', def_key: v.def_key, version: v.version,
      def_hash: v.def_hash, spec: v.spec, created_at: NOW }
    const instance: WorkflowInstance = {
      id: 'i', def_id: 'd', def_key: FAMILJE_STUNDEN_MONTHLY_RELEASE, def_version: v.version,
      def_hash: 'h', project_id: 'p', instance_key: '2099-01', current_state: 'edge_deploy',
      status: 'active', wake_at: null, last_tick_at: null, last_tick_outcome: null,
      created_at: NOW, closed_at: null }
    const transitions: WorkflowTransition[] = [{ id: 't', seq: 1, instance_id: 'i',
      from_state: null, to_state: 'planning', reason: 't', actor: 't',
      evidence_ref: null, authorization_id: null, occurred_at: NOW }]
    return projectMonthReleaseBundle({
      month_key: '2099-01', def, instance, transitions, evidence,
      declaredChecks: FAMILJE_STUNDEN_CHECKS, now: NOW,
    })
  }

  it('15. the bound expectation reaches the bundle', () => {
    const m = bundle([row(A, T1)]).technical.manifest
    expect(m.expected_manifest_sha256).toBe(A)
    expect(m.binding_status).toBe('BOUND')
    expect(m.generations).toBe(1)
  })

  it('16. missing and conflicted project correctly', () => {
    expect(bundle([]).technical.manifest.binding_status).toBe('MISSING')
    const c = bundle([row(A, T1), use(T2), row(B, T3)]).technical.manifest
    expect(c.binding_status).toBe('CONFLICTED')
    expect(c.expected_manifest_sha256).toBe(A)
    expect(c.rejected_expected_manifest_sha256).toBe(B)
    expect(c.locked_by).toBe('deployed_manifest_matches_expected')
  })

  it('17/18. rendering performs no request and reads no credential', () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    vi.stubEnv('FAMILJE_STUNDEN_MANAGEMENT_TOKEN', 'must-not-be-read')
    const b = bundle([row(A, T1)])
    expect(spy).not.toHaveBeenCalled()
    expect(JSON.stringify(b)).not.toContain('must-not-be-read')
    const proj = readFileSync(join(process.cwd(), 'lib/workflows/bundle/project.ts'), 'utf8')
    expect(proj).not.toContain('FAMILJE_STUNDEN_MANAGEMENT_TOKEN')
    expect(proj).not.toContain('readDeployedFunction')
  })

  it('19. no deployed-source check became EXECUTABLE', () => {
    const b = bundle([row(A, T1)])
    const expected: Record<string, string> = {
      shared_manifest_consumers_in_sync: 'MANUAL_PRIVILEGED_VERIFICATION',
      deployed_manifest_matches_expected: 'UNREACHABLE',
      sign_protected_asset_source_current: 'UNREACHABLE',
      get_protected_ebook_source_current: 'UNREACHABLE',
    }
    for (const [key, reach] of Object.entries(expected)) {
      const c = b.checks.find(x => x.check_key === key && x.state === 'edge_deploy')!
      expect(c.reachability, key).toBe(reach)
      expect(c.status, key).toBe('NOT_EXERCISED')
    }
    // And no observe_* action exists for any of them.
    const disc = readFileSync(join(process.cwd(), 'lib/workflows/action-discovery.ts'), 'utf8')
    for (const key of Object.keys(expected)) expect(disc).not.toContain(`'${key}'`)
  })

  it('20. provenance policy is unchanged for every deployed-source check', () => {
    for (const key of ['shared_manifest_consumers_in_sync', 'deployed_manifest_matches_expected',
                       'sign_protected_asset_source_current', 'get_protected_ebook_source_current']) {
      const c = FAMILJE_STUNDEN_CHECKS.find(x => x.check_key === key && x.state === 'edge_deploy')!
      expect([...c.allowed_provenance], key).toEqual(['automated'])
      expect(c.required, key).toBe(true)
    }
    // The binding itself is attested and NOT required — it is a recorded fact,
    // not a gate, so it adds no new blocker to any month.
    const binding = FAMILJE_STUNDEN_CHECKS.find(
      x => x.check_key === MANIFEST_BINDING_CHECKS.expectedSha)!
    expect([...binding.allowed_provenance]).toEqual(['attested'])
    expect(binding.required).toBe(false)
    expect(binding.state).toBe(MANIFEST_BINDING_STATE)
  })

  it('21. readiness is blocked with or without the expectation, and identically', () => {
    const without = bundle([])
    const bound = bundle([row(A, T1)])
    const conflicted = bundle([row(A, T1), use(T2), row(B, T3)])
    for (const b of [without, bound, conflicted]) expect(b.readiness.product).toBe('BLOCKED')
    // Binding the expectation must not IMPROVE readiness: nothing was verified.
    expect(bound.readiness.blockers.map(x => x.code).sort())
      .toEqual(without.readiness.blockers.map(x => x.code).sort())
  })

  it('22. unrelated workflows are untouched', () => {
    // The binding lives on the Familje-Stunden catalogue only.
    const others = loadVendoredDefinitions().filter(d => d.def_key !== FAMILJE_STUNDEN_MONTHLY_RELEASE)
    expect(others.length).toBeGreaterThan(0)
    const checksSrc = readFileSync(
      join(process.cwd(), 'lib/workflows/adapters/probe-validation/index.ts'), 'utf8')
    expect(checksSrc).not.toContain('expected_manifest_sha256')
    // And an instance with no manifest evidence at all projects MISSING, not a
    // borrowed value from anywhere.
    expect(projectManifestBinding([use(T1)]).binding_status).toBe('MISSING')
  })
})
