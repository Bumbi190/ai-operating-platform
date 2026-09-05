/**
 * The generation-bound expected manifest hash.
 *
 * Two defects, fixed together. The first was the deployment-global env var. The
 * second only appears once you read the state order:
 *
 *     10. edge_deploy      ← the expectation is attested here
 *     11. frontend_deploy  ← every release-identity consumer lives here
 *
 * The release identity does not lock until a `frontend_deploy` check consumes
 * it. So a manifest attested for PR 59 would sit there reported BOUND after the
 * release was legitimately corrected to PR 72 — the gate saying YES about a
 * release that no longer exists. That sequence is test K below, and it is the
 * reason this file exists in this shape.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  projectManifestBinding, evidenceMatchesGeneration, sameGeneration,
  MANIFEST_BINDING_CHECKS, MANIFEST_BINDING_STATE, MANIFEST_IDENTITY_CONSUMERS,
  type ReleaseGeneration,
} from '../workflows/bundle/manifest-binding'
import { checkDeployedManifestMatchesExpected } from '../workflows/adapters/familje-stunden/deployed-source'
import { projectMonthReleaseBundle } from '../workflows/bundle/project'
import { loadVendoredDefinitions, FAMILJE_STUNDEN_MONTHLY_RELEASE } from '../workflows/definitions'
import { FAMILJE_STUNDEN_CHECKS } from '../workflows/adapters/familje-stunden/checks'
import { GITHUB_BINDING_CHECKS, GITHUB_BINDING_STATE } from '../workflows/bundle/github-binding'
import type { WorkflowDef, WorkflowEvidence, WorkflowInstance, WorkflowTransition } from '../workflows/types'

const MAN_A = 'a'.repeat(64)
const MAN_B = 'b'.repeat(64)
const MAN_C = 'c'.repeat(64)
const SHA_A = '1'.repeat(40)
const SHA_B = '2'.repeat(40)
const GEN_A: ReleaseGeneration = { pr_number: 59, expected_merge_sha: SHA_A }
const GEN_B: ReleaseGeneration = { pr_number: 72, expected_merge_sha: SHA_B }
const NOW = '2026-09-05T12:00:00.000Z'
const T = (n: number) => `2026-09-0${n}T00:00:00.000Z`

const attest = (sha: string, gen: ReleaseGeneration, at: string): WorkflowEvidence => ({
  id: `man-${at}-${sha.slice(0, 4)}`, instance_id: 'i', state: MANIFEST_BINDING_STATE,
  check_key: MANIFEST_BINDING_CHECKS.expectedSha, result: 'pass', source: 'attested',
  detail: { value: {
    expected_manifest_sha256: sha,
    release_pr_number: gen.pr_number,
    expected_merge_sha: gen.expected_merge_sha,
  } },
  recorded_at: at, producer: 'editor', producer_type: 'human', observed_at: at,
  payload_hash: null, target_hash: null, attestation: {},
} as unknown as WorkflowEvidence)

/** Evidence from the check that CONSUMES the expectation, naming its generation. */
const consume = (gen: ReleaseGeneration, at: string, key = 'deployed_manifest_matches_expected'): WorkflowEvidence => ({
  id: `use-${key}-${at}`, instance_id: 'i', state: MANIFEST_BINDING_STATE, check_key: key,
  result: 'pass', source: 'automated',
  detail: { release_pr_number: gen.pr_number, release_merge_sha: gen.expected_merge_sha },
  recorded_at: at, producer: null, producer_type: null, observed_at: at,
  payload_hash: null, target_hash: null, attestation: {},
} as unknown as WorkflowEvidence)

const bind = (evidence: WorkflowEvidence[], release: ReleaseGeneration | null) =>
  projectManifestBinding({ evidence, release })

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

// ── K. THE DANGEROUS SEQUENCE ────────────────────────────────────────────────

describe('K. the reproduced bug, now closed', () => {
  it('a manifest attested for generation A is NOT bound for generation B', () => {
    const timeline = [
      attest(MAN_A, GEN_A, T(2)),          // 2. manifest for A
      consume(GEN_A, T(3)),                // 3. verified at edge_deploy for A
    ]
    // 1-3: everything is fine while the release is still A.
    const asA = bind(timeline, GEN_A)
    expect(asA.binding_status).toBe('BOUND')
    expect(asA.expected_manifest_sha256).toBe(MAN_A)

    // 4-5: the release is legitimately corrected to B before its own lock.
    const asB = bind(timeline, GEN_B)
    expect(asB.binding_status).toBe('CONFLICTED')
    expect(asB.expected_manifest_sha256).toBeNull()
    expect(asB.rejected_rebind?.reason).toBe('RELEASE_GENERATION_CHANGED')
    expect(asB.rejected_rebind?.release).toEqual(GEN_A)

    // 6-7: a fresh attestation for B restores BOUND, and A is untouched.
    const withB = bind([...timeline, attest(MAN_B, GEN_B, T(4))], GEN_B)
    expect(withB.binding_status).toBe('BOUND')
    expect(withB.expected_manifest_sha256).toBe(MAN_B)
    expect(withB.release).toEqual(GEN_B)
    expect(bind([...timeline, attest(MAN_B, GEN_B, T(4))], GEN_A).expected_manifest_sha256).toBe(MAN_A)

    // 7b: generation-A verification evidence cannot satisfy B.
    expect(evidenceMatchesGeneration(consume(GEN_A, T(3)), GEN_B)).toBe(false)
    expect(evidenceMatchesGeneration(consume(GEN_B, T(5)), GEN_B)).toBe(true)
  })
})

// ── 1-11. GENERATION IDENTITY AND LIFECYCLE ──────────────────────────────────

describe('1-11. one inseparable generation', () => {
  it('1/2. the attestation carries the exact release pair, and cannot be mixed', () => {
    const b = bind([attest(MAN_A, GEN_A, T(1))], GEN_A)
    expect(b.release).toEqual(GEN_A)
    // Every field travels in ONE evidence value, so no arrangement of rows can
    // pair a hash from one generation with an identity from another.
    for (const partial of [
      { expected_manifest_sha256: MAN_A, release_pr_number: 59 },          // no merge sha
      { expected_manifest_sha256: MAN_A, expected_merge_sha: SHA_A },      // no pr
      { release_pr_number: 59, expected_merge_sha: SHA_A },                // no manifest
      MAN_A,                                                              // legacy bare string
    ]) {
      const row = { ...attest(MAN_A, GEN_A, T(1)), detail: { value: partial } } as WorkflowEvidence
      expect(bind([row], GEN_A).binding_status, JSON.stringify(partial)).not.toBe('BOUND')
    }
  })

  it('3. current generation + its manifest → BOUND', () => {
    const b = bind([attest(MAN_A, GEN_A, T(1))], GEN_A)
    expect(b.binding_status).toBe('BOUND')
    expect(b.generations).toBe(1)
  })

  it('4/5. the old manifest becomes non-authoritative and cannot satisfy the new release', () => {
    const b = bind([attest(MAN_A, GEN_A, T(1))], GEN_B)
    expect(b.binding_status).toBe('CONFLICTED')
    expect(b.expected_manifest_sha256).toBeNull()
  })

  it('6/7. re-attesting for B restores BOUND, and A stays in history', () => {
    const evidence = [attest(MAN_A, GEN_A, T(1)), attest(MAN_B, GEN_B, T(2))]
    expect(bind(evidence, GEN_B).expected_manifest_sha256).toBe(MAN_B)
    expect(bind(evidence, GEN_A).expected_manifest_sha256).toBe(MAN_A)   // preserved
  })

  it('8. same generation, post-consumption hash change → CONFLICTED', () => {
    const b = bind([attest(MAN_A, GEN_A, T(1)), consume(GEN_A, T(2)), attest(MAN_C, GEN_A, T(3))], GEN_A)
    expect(b.binding_status).toBe('CONFLICTED')
    expect(b.expected_manifest_sha256).toBe(MAN_A)          // the verified one survives
    expect(b.rejected_rebind?.reason).toBe('AFTER_DOWNSTREAM_RELIANCE')
    expect(b.rejected_rebind?.expected_manifest_sha256).toBe(MAN_C)
  })

  it('8b. the lock is PER GENERATION — A being consumed does not freeze B', () => {
    // The instance must not brick merely because A was already verified.
    const evidence = [attest(MAN_A, GEN_A, T(1)), consume(GEN_A, T(2)), attest(MAN_B, GEN_B, T(3))]
    const b = bind(evidence, GEN_B)
    expect(b.binding_status).toBe('BOUND')
    expect(b.locked_at).toBeNull()          // nothing has consumed B yet
    // And a correction WITHIN B is still allowed until B itself is consumed.
    expect(bind([...evidence, attest(MAN_C, GEN_B, T(4))], GEN_B).expected_manifest_sha256).toBe(MAN_C)
  })

  it('9. an identical same-generation restatement is idempotent', () => {
    const b = bind([attest(MAN_A, GEN_A, T(1)), consume(GEN_A, T(2)),
                    attest(MAN_A.toUpperCase(), GEN_A, T(3))], GEN_A)
    expect(b.binding_status).toBe('BOUND')
    expect(b.generations).toBe(1)
  })

  it('10. same-timestamp ambiguity fails closed', () => {
    const b = bind([attest(MAN_A, GEN_A, T(1)), attest(MAN_C, GEN_A, T(2)), consume(GEN_A, T(2))], GEN_A)
    expect(b.expected_manifest_sha256).toBe(MAN_A)
    expect(b.binding_status).toBe('CONFLICTED')
  })

  it('11. with no usable release generation nothing can be BOUND', () => {
    // The GitHub identity is MISSING/INVALID/CONFLICTED → release is null.
    // PR #184 owns that lifecycle; this only refuses to invent one.
    const b = bind([attest(MAN_A, GEN_A, T(1))], null)
    expect(b.binding_status).toBe('CONFLICTED')
    expect(b.expected_manifest_sha256).toBeNull()
    expect(sameGeneration(GEN_A, null)).toBe(false)
    expect(sameGeneration(null, null)).toBe(false)
  })

  it('11b. an invalid newest attestation is INVALID, and MISSING stays MISSING', () => {
    const row = { ...attest(MAN_A, GEN_A, T(1)), detail: { value: { expected_manifest_sha256: 'nope',
      release_pr_number: 59, expected_merge_sha: SHA_A } } } as WorkflowEvidence
    expect(bind([row], GEN_A).binding_status).toBe('INVALID')
    expect(bind([], GEN_A).binding_status).toBe('MISSING')
    expect(bind([consume(GEN_A, T(1))], GEN_A).binding_status).toBe('MISSING')
  })
})

// ── 12-17. THE approval_release RE-CHECK ─────────────────────────────────────

describe('12-17. re-verified against the FINAL release generation', () => {
  const at = (state: string) => FAMILJE_STUNDEN_CHECKS
    .filter(c => c.check_key === 'deployed_manifest_matches_expected' && c.state === state)

  it('12/15. it is declared at approval_release AND still at edge_deploy', () => {
    expect(at('approval_release')).toHaveLength(1)
    expect(at('edge_deploy')).toHaveLength(1)
  })

  it('13/14. the new placement keeps automated-only provenance and severity', () => {
    const edge = at('edge_deploy')[0]
    const approval = at('approval_release')[0]
    expect([...approval.allowed_provenance]).toEqual(['automated'])
    expect(approval.required).toBe(edge.required)
    expect(approval.binds_artifacts).toBe(edge.binds_artifacts)
  })

  it('16/17. only generation-B evidence can satisfy the check for generation B', () => {
    expect(evidenceMatchesGeneration(consume(GEN_A, T(1)), GEN_B)).toBe(false)
    expect(evidenceMatchesGeneration(consume(GEN_B, T(1)), GEN_B)).toBe(true)
    // Evidence that names no generation at all cannot satisfy any of them.
    const anonymous = { ...consume(GEN_B, T(1)), detail: {} } as WorkflowEvidence
    expect(evidenceMatchesGeneration(anonymous, GEN_B)).toBe(false)
  })

  it('16b. the check RECORDS the generation it verified', () => {
    const e = checkDeployedManifestMatchesExpected([], {
      expected_manifest_sha256: MAN_A,
      release_pr_number: GEN_A.pr_number, release_merge_sha: GEN_A.expected_merge_sha,
    }, NOW)
    expect(e.detail.release_pr_number).toBe(59)
    expect(e.detail.release_merge_sha).toBe(SHA_A)
    // A row that did not record it is unusable rather than assumed current.
    expect(evidenceMatchesGeneration(
      { detail: e.detail } as unknown as WorkflowEvidence, GEN_A)).toBe(true)
  })
})

// ── 18-22. AUTHORITY, PURITY, SURFACE ────────────────────────────────────────

describe('18-22. the expectation stays independent of the observed side', () => {
  const SRC = 'lib/workflows/bundle/manifest-binding.ts'
  const src = readFileSync(join(process.cwd(), SRC), 'utf8')
  const code = src.split('\n')
    .filter(l => { const t = l.trim(); return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*') })
    .join('\n')

  it('18. NEGATIVE CONTROL — the deployment-global env var is not a fallback', () => {
    vi.stubEnv('FAMILJE_STUNDEN_EXPECTED_MANIFEST_SHA256', MAN_A)
    expect(bind([], GEN_A).binding_status).toBe('MISSING')
    expect(bind([], GEN_A).expected_manifest_sha256).toBeNull()
    expect(code).not.toContain('process.env')
    const e = checkDeployedManifestMatchesExpected([], null, NOW)
    expect(e.result).toBe('blocked')
    expect(e.detail.reason).toBe('EXPECTED_MANIFEST_NOT_BOUND')
  })

  it('19/20. runtime self-report and deployed source cannot establish the expectation', () => {
    for (const forbidden of ['fetch(', 'api.supabase.com', 'MANAGEMENT', 'readDeployedFunction',
                             'readAllConsumers', 'readFileSync', 'createHash', 'import(', 'require(']) {
      expect(code, forbidden).not.toContain(forbidden)
    }
    const imports = [...src.matchAll(/^import\s[\s\S]*?from\s+'([^']+)'/gm)].map(m => m[1])
    expect(imports).toEqual(['../types'])
  })

  it('21/22. projection is network-free and adds no Supabase surface', () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    vi.stubEnv('FAMILJE_STUNDEN_MANAGEMENT_TOKEN', 'must-not-be-read')
    const b = bundle([attest(MAN_A, GEN_A, T(1)), ...githubRows(GEN_A, T(1))])
    expect(spy).not.toHaveBeenCalled()
    expect(JSON.stringify(b)).not.toContain('must-not-be-read')
    const proj = readFileSync(join(process.cwd(), 'lib/workflows/bundle/project.ts'), 'utf8')
    expect(proj).not.toContain('FAMILJE_STUNDEN_MANAGEMENT_TOKEN')
    expect(proj).not.toContain('readDeployedFunction')
  })

  it('M. the bundle explains BOUND vs CONFLICTED', () => {
    const bound = bundle([...githubRows(GEN_A, T(1)), attest(MAN_A, GEN_A, T(2))]).technical.manifest
    expect(bound.binding_status).toBe('BOUND')
    expect(bound.expected_manifest_sha256).toBe(MAN_A)
    expect(bound.release_pr_number).toBe(59)

    // The release moved; the stale expectation and the reason are both visible.
    const moved = bundle([...githubRows(GEN_A, T(1)), attest(MAN_A, GEN_A, T(2)),
                          ...githubRows(GEN_B, T(3))]).technical.manifest
    expect(moved.binding_status).toBe('CONFLICTED')
    expect(moved.rejected_expected_manifest_sha256).toBe(MAN_A)
    expect(moved.rejected_reason).toBe('RELEASE_GENERATION_CHANGED')
  })

  it('N. no deployed-source check became executable, at either placement', () => {
    const b = bundle([...githubRows(GEN_A, T(1)), attest(MAN_A, GEN_A, T(2))])
    const expected: [string, string, string][] = [
      ['shared_manifest_consumers_in_sync', 'edge_deploy', 'MANUAL_PRIVILEGED_VERIFICATION'],
      ['deployed_manifest_matches_expected', 'edge_deploy', 'UNREACHABLE'],
      ['deployed_manifest_matches_expected', 'approval_release', 'UNREACHABLE'],
      ['sign_protected_asset_source_current', 'edge_deploy', 'UNREACHABLE'],
      ['get_protected_ebook_source_current', 'edge_deploy', 'UNREACHABLE'],
    ]
    for (const [key, state, reach] of expected) {
      const c = b.checks.find(x => x.check_key === key && x.state === state)!
      expect(c, `${key}@${state}`).toBeDefined()
      expect(c.reachability, `${key}@${state}`).toBe(reach)
      expect(c.status, `${key}@${state}`).toBe('NOT_EXERCISED')
    }
    const disc = readFileSync(join(process.cwd(), 'lib/workflows/action-discovery.ts'), 'utf8')
    for (const [key] of expected) expect(disc).not.toContain(`'${key}'`)
  })

  it('readiness does not improve because an expectation was bound', () => {
    const without = bundle(githubRows(GEN_A, T(1)))
    const bound = bundle([...githubRows(GEN_A, T(1)), attest(MAN_A, GEN_A, T(2))])
    expect(bound.readiness.product).toBe('BLOCKED')
    expect(bound.readiness.blockers.map(x => x.code).sort())
      .toEqual(without.readiness.blockers.map(x => x.code).sort())
  })
})

// ── helpers ──────────────────────────────────────────────────────────────────

function githubRows(gen: ReleaseGeneration, at: string): WorkflowEvidence[] {
  const mk = (key: string, value: unknown): WorkflowEvidence => ({
    id: `gh-${key}-${at}`, instance_id: 'i', state: GITHUB_BINDING_STATE, check_key: key,
    result: 'pass', source: 'attested', detail: { value }, recorded_at: at,
    producer: 'editor', producer_type: 'human', observed_at: at,
    payload_hash: null, target_hash: null, attestation: {},
  } as unknown as WorkflowEvidence)
  return [
    mk(GITHUB_BINDING_CHECKS.prNumber, gen.pr_number),
    mk(GITHUB_BINDING_CHECKS.expectedMergeSha, gen.expected_merge_sha),
  ]
}

function bundle(evidence: WorkflowEvidence[]) {
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
    declaredChecks: FAMILJE_STUNDEN_CHECKS,
    githubRepository: 'Bumbi190/familje-stunden-v2', now: NOW,
  })
}

export { MANIFEST_IDENTITY_CONSUMERS }
