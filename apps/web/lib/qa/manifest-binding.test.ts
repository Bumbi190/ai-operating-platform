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
import { evaluateCheck } from '../workflows/evidence-consumption'
import { computeEvidenceTargetHash } from '../workflows/attestation'
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
  check_key: MANIFEST_BINDING_CHECKS.expectedSourceSha, result: 'pass', source: 'attested',
  detail: { value: {
    expected_manifest_source_sha256: sha,
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
    expect(asA.expected_manifest_source_sha256).toBe(MAN_A)

    // 4-5: the release is legitimately corrected to B before its own lock.
    const asB = bind(timeline, GEN_B)
    expect(asB.binding_status).toBe('CONFLICTED')
    expect(asB.expected_manifest_source_sha256).toBeNull()
    expect(asB.rejected_rebind?.reason).toBe('RELEASE_GENERATION_CHANGED')
    expect(asB.rejected_rebind?.release).toEqual(GEN_A)

    // 6-7: a fresh attestation for B restores BOUND, and A is untouched.
    const withB = bind([...timeline, attest(MAN_B, GEN_B, T(4))], GEN_B)
    expect(withB.binding_status).toBe('BOUND')
    expect(withB.expected_manifest_source_sha256).toBe(MAN_B)
    expect(withB.release).toEqual(GEN_B)
    expect(bind([...timeline, attest(MAN_B, GEN_B, T(4))], GEN_A).expected_manifest_source_sha256).toBe(MAN_A)

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
      { expected_manifest_source_sha256: MAN_A, release_pr_number: 59 },          // no merge sha
      { expected_manifest_source_sha256: MAN_A, expected_merge_sha: SHA_A },      // no pr
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
    expect(b.expected_manifest_source_sha256).toBeNull()
  })

  it('6/7. re-attesting for B restores BOUND, and A stays in history', () => {
    const evidence = [attest(MAN_A, GEN_A, T(1)), attest(MAN_B, GEN_B, T(2))]
    expect(bind(evidence, GEN_B).expected_manifest_source_sha256).toBe(MAN_B)
    expect(bind(evidence, GEN_A).expected_manifest_source_sha256).toBe(MAN_A)   // preserved
  })

  it('8. same generation, post-consumption hash change → CONFLICTED', () => {
    const b = bind([attest(MAN_A, GEN_A, T(1)), consume(GEN_A, T(2)), attest(MAN_C, GEN_A, T(3))], GEN_A)
    expect(b.binding_status).toBe('CONFLICTED')
    expect(b.expected_manifest_source_sha256).toBe(MAN_A)          // the verified one survives
    expect(b.rejected_rebind?.reason).toBe('AFTER_DOWNSTREAM_RELIANCE')
    expect(b.rejected_rebind?.expected_manifest_source_sha256).toBe(MAN_C)
  })

  it('8b. the lock is PER GENERATION — A being consumed does not freeze B', () => {
    // The instance must not brick merely because A was already verified.
    const evidence = [attest(MAN_A, GEN_A, T(1)), consume(GEN_A, T(2)), attest(MAN_B, GEN_B, T(3))]
    const b = bind(evidence, GEN_B)
    expect(b.binding_status).toBe('BOUND')
    expect(b.locked_at).toBeNull()          // nothing has consumed B yet
    // And a correction WITHIN B is still allowed until B itself is consumed.
    expect(bind([...evidence, attest(MAN_C, GEN_B, T(4))], GEN_B).expected_manifest_source_sha256).toBe(MAN_C)
  })

  it('9. an identical same-generation restatement is idempotent', () => {
    const b = bind([attest(MAN_A, GEN_A, T(1)), consume(GEN_A, T(2)),
                    attest(MAN_A.toUpperCase(), GEN_A, T(3))], GEN_A)
    expect(b.binding_status).toBe('BOUND')
    expect(b.generations).toBe(1)
  })

  it('10. same-timestamp ambiguity fails closed', () => {
    const b = bind([attest(MAN_A, GEN_A, T(1)), attest(MAN_C, GEN_A, T(2)), consume(GEN_A, T(2))], GEN_A)
    expect(b.expected_manifest_source_sha256).toBe(MAN_A)
    expect(b.binding_status).toBe('CONFLICTED')
  })

  it('11. with no usable release generation nothing can be BOUND', () => {
    // The GitHub identity is MISSING/INVALID/CONFLICTED → release is null.
    // PR #184 owns that lifecycle; this only refuses to invent one.
    const b = bind([attest(MAN_A, GEN_A, T(1))], null)
    expect(b.binding_status).toBe('CONFLICTED')
    expect(b.expected_manifest_source_sha256).toBeNull()
    expect(sameGeneration(GEN_A, null)).toBe(false)
    expect(sameGeneration(null, null)).toBe(false)
  })

  it('11b. an invalid newest attestation is INVALID, and MISSING stays MISSING', () => {
    const row = { ...attest(MAN_A, GEN_A, T(1)), detail: { value: { expected_manifest_source_sha256: 'nope',
      release_pr_number: 59, expected_merge_sha: SHA_A } } } as WorkflowEvidence
    expect(bind([row], GEN_A).binding_status).toBe('INVALID')
    expect(bind([], GEN_A).binding_status).toBe('MISSING')
    expect(bind([consume(GEN_A, T(1))], GEN_A).binding_status).toBe('MISSING')
  })
})

// ── B. SAME-GENERATION CONFLICT IS STICKY ────────────────────────────────────

describe('B. a post-reliance conflict taints its generation permanently', () => {
  const consumed = [attest(MAN_A, GEN_A, T(1)), consume(GEN_A, T(2))]

  it('restating the ORIGINAL hash does not clear the conflict', () => {
    // H1 -> consumed -> H2 (conflict) -> H1 again. The last row is a perfectly
    // ordinary, valid, idempotent-looking restatement of the value that was
    // actually verified. It must not launder the conflict away: append-only
    // evidence records what happened, and what happened is that somebody tried
    // to change a verified expectation.
    const b = bind([...consumed, attest(MAN_C, GEN_A, T(3)), attest(MAN_A, GEN_A, T(4))], GEN_A)
    expect(b.binding_status).toBe('CONFLICTED')
    expect(b.rejected_rebind?.reason).toBe('AFTER_DOWNSTREAM_RELIANCE')
    expect(b.expected_manifest_source_sha256).toBe(MAN_A)   // the verified one still answers
  })

  it('repeating the CONFLICTING hash does not newest-wins it into BOUND', () => {
    const b = bind([...consumed, attest(MAN_C, GEN_A, T(3)), attest(MAN_C, GEN_A, T(4))], GEN_A)
    expect(b.binding_status).toBe('CONFLICTED')
    expect(b.expected_manifest_source_sha256).toBe(MAN_A)
  })

  it('a third distinct hash does not resolve it either', () => {
    const MAN_D = 'd'.repeat(64)
    const b = bind([...consumed, attest(MAN_C, GEN_A, T(3)), attest(MAN_D, GEN_A, T(4))], GEN_A)
    expect(b.binding_status).toBe('CONFLICTED')
  })

  it('and the taint survives a detour through another generation and back', () => {
    // A conflicts, the release legitimately moves to B, then legitimately
    // returns to A. Re-deriving A must reach the same verdict it always had:
    // the conflicting row is still in the history.
    const b = bind([...consumed, attest(MAN_C, GEN_A, T(3)), attest(MAN_B, GEN_B, T(4))], GEN_A)
    expect(b.binding_status).toBe('CONFLICTED')
    // Meanwhile B, which never had a conflict, is cleanly BOUND.
    const asB = bind([...consumed, attest(MAN_C, GEN_A, T(3)), attest(MAN_B, GEN_B, T(4))], GEN_B)
    expect(asB.binding_status).toBe('BOUND')
    expect(asB.expected_manifest_source_sha256).toBe(MAN_B)
  })

  it('RELEASE_GENERATION_CHANGED stays recoverable — the two are not the same', () => {
    // The distinction the sticky rule must not destroy: a stale generation is
    // fixed by attesting for the current one; a violated generation is not.
    const stale = bind([attest(MAN_A, GEN_A, T(1))], GEN_B)
    expect(stale.rejected_rebind?.reason).toBe('RELEASE_GENERATION_CHANGED')
    const recovered = bind([attest(MAN_A, GEN_A, T(1)), attest(MAN_B, GEN_B, T(2))], GEN_B)
    expect(recovered.binding_status).toBe('BOUND')
  })
})

// ── C. A → B → A REPLAY ──────────────────────────────────────────────────────

describe('C. old evidence cannot be replayed into a later placement', () => {
  it('an edge_deploy row cannot satisfy the approval_release placement', () => {
    // The mechanism is the evidence target pin, which includes the STATE. A row
    // recorded at edge_deploy is bound to edge_deploy's target; the
    // approval_release placement computes a different target and the row reads
    // as STALE, not satisfied — so a first visit to generation A cannot answer
    // the final pre-release re-check even when A is current again.
    const edgeTarget = 'edge-target-hash'
    const approvalTarget = 'approval-target-hash'
    const rowAtEdge = {
      ...consume(GEN_A, T(3)), target_hash: edgeTarget,
    } as WorkflowEvidence

    const declared = FAMILJE_STUNDEN_CHECKS.find(
      c => c.check_key === 'deployed_manifest_matches_expected' && c.state === 'approval_release')!
    const verdict = evaluateCheck(declared, declared.check_key, [rowAtEdge], approvalTarget)
    expect(verdict.satisfies).toBe(false)
    expect(verdict.satisfaction).toBe('stale')

    // The same row DOES satisfy its own placement, which is what makes the
    // previous assertion about the placement rather than about the row.
    const atEdge = FAMILJE_STUNDEN_CHECKS.find(
      c => c.check_key === 'deployed_manifest_matches_expected' && c.state === 'edge_deploy')!
    expect(evaluateCheck(atEdge, atEdge.check_key, [rowAtEdge], edgeTarget).satisfies).toBe(true)
  })

  it('the state is part of the evidence target, so the two placements differ', () => {
    const v = loadVendoredDefinitions().find(d => d.def_key === FAMILJE_STUNDEN_MONTHLY_RELEASE)!
    const inst = {
      id: 'i', def_id: 'd', def_key: FAMILJE_STUNDEN_MONTHLY_RELEASE, def_version: v.version,
      def_hash: 'h', project_id: 'p', instance_key: '2099-01', current_state: 'edge_deploy',
      status: 'active', wake_at: null, last_tick_at: null, last_tick_outcome: null,
      created_at: NOW, closed_at: null,
    } as WorkflowInstance
    const target = (state: string) => computeEvidenceTargetHash({
      instance: inst, spec: v.spec, state,
      checkKey: 'deployed_manifest_matches_expected',
      sourceCommit: null, artifactManifestHash: null,
    })
    expect(target('edge_deploy')).not.toBe(target('approval_release'))
  })

  it('and generation identity is checked on top of the placement', () => {
    // Two independent gates: the row must belong to this placement AND name the
    // current generation. Neither substitutes for the other.
    expect(evidenceMatchesGeneration(consume(GEN_A, T(3)), GEN_A)).toBe(true)
    expect(evidenceMatchesGeneration(consume(GEN_A, T(3)), GEN_B)).toBe(false)
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
      expected_manifest_source_sha256: MAN_A,
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
    expect(bind([], GEN_A).expected_manifest_source_sha256).toBeNull()
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
    expect(bound.expected_manifest_source_sha256).toBe(MAN_A)
    expect(bound.release_pr_number).toBe(59)

    // The release moved; the stale expectation and the reason are both visible.
    const moved = bundle([...githubRows(GEN_A, T(1)), attest(MAN_A, GEN_A, T(2)),
                          ...githubRows(GEN_B, T(3))]).technical.manifest
    expect(moved.binding_status).toBe('CONFLICTED')
    expect(moved.rejected_expected_manifest_source_sha256).toBe(MAN_A)
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

// ── N. THE OLD NAME IS GONE, NOT ALIASED ─────────────────────────────────────

describe('N. the old ambiguous identifier has no authority anywhere', () => {
  const SRC = 'lib/workflows/bundle/manifest-binding.ts'
  const src = readFileSync(join(process.cwd(), SRC), 'utf8')
  const code = src.split('\n')
    .filter(l => { const t = l.trim(); return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*') })
    .join('\n')

  /** An attestation written the OLD way: right value, retired field name. */
  const legacyRow = (sha: string, gen: ReleaseGeneration, at: string): WorkflowEvidence => ({
    ...attest(sha, gen, at),
    detail: { value: {
      expected_manifest_sha256: sha,                 // the retired name
      release_pr_number: gen.pr_number,
      expected_merge_sha: gen.expected_merge_sha,
    } },
  } as unknown as WorkflowEvidence)

  it('1/2. an old-field attestation cannot bind — it names no expectation at all', () => {
    const b = bind([legacyRow(MAN_A, GEN_A, T(1))], GEN_A)
    expect(b.binding_status).toBe('INVALID')
    expect(b.expected_manifest_source_sha256).toBeNull()
    // And it cannot silently ride alongside a valid one either: the newest row
    // is the one validated, so a legacy row landing last invalidates.
    const mixed = bind([attest(MAN_A, GEN_A, T(1)), legacyRow(MAN_B, GEN_A, T(2))], GEN_A)
    expect(mixed.binding_status).toBe('INVALID')
  })

  it('1b. and an old CHECK KEY records nothing this binding will read', () => {
    const wrongKey = {
      ...attest(MAN_A, GEN_A, T(1)), check_key: 'expected_manifest_sha256',
    } as WorkflowEvidence
    expect(bind([wrongKey], GEN_A).binding_status).toBe('MISSING')
  })

  it('3. the retired environment variable is not an authority either', () => {
    vi.stubEnv('FAMILJE_STUNDEN_EXPECTED_MANIFEST_SHA256', MAN_A)
    vi.stubEnv('FAMILJE_STUNDEN_EXPECTED_MANIFEST_SOURCE_SHA256', MAN_A)
    expect(bind([], GEN_A).binding_status).toBe('MISSING')
    expect(code).not.toContain('process.env')
  })

  it('4. NO runtime alias from the old name to the new one exists', () => {
    // A fallback would preserve the ambiguity the rename exists to remove.
    expect(code).not.toContain('expected_manifest_sha256')
    expect(code).not.toMatch(/expected_manifest_sha256\s*(\?\?|\|\|)/)
    expect(code).not.toContain('expectedSha')
  })

  it('5. a semantic digest cannot populate the source-hash domain', () => {
    // Both domains are SHA-256, which is exactly why the name carries the
    // domain. A field named for the other domain is not read.
    const semantic = {
      ...attest(MAN_A, GEN_A, T(1)),
      detail: { value: {
        expected_manifest_semantic_sha256: MAN_A,
        release_pr_number: GEN_A.pr_number,
        expected_merge_sha: GEN_A.expected_merge_sha,
      } },
    } as WorkflowEvidence
    expect(bind([semantic], GEN_A).binding_status).toBe('INVALID')
    expect(code).not.toContain('semantic')
  })
})
