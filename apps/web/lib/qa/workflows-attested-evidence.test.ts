/**
 * Attested local evidence.
 *
 * The property everything here protects: an attested PASS is a STATEMENT, and
 * must never be presented as, or silently promoted to, something Omnira
 * observed. So the tests weigh heavily toward refusal — undeclared checks,
 * refused provenance, moved targets, and results that are not passes.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  computeEvidencePayloadHash, computeEvidenceTargetHash, evidenceBinding,
  evidenceTargetPayload, validateEvidencePayload,
} from '@/lib/workflows/attestation'
import { evaluateCheck, summarizeStateEvidence } from '@/lib/workflows/evidence-consumption'
import { FAMILJE_STUNDEN_CHECKS, attestableStates, findCheck } from '@/lib/workflows/adapters/familje-stunden/checks'
import { canonicalTargetVersionHash } from '@/lib/atlas/authorization/build'
import { FAMILJE_STUNDEN_MONTHLY_RELEASE, findVendoredDefinition } from '@/lib/workflows/definitions'
import { PROJECT_API_SCOPES } from '@/lib/auth/project-api-scopes'
import type { WorkflowEvidence, WorkflowInstance, WorkflowSpec } from '@/lib/workflows/types'

const SPEC: WorkflowSpec = findVendoredDefinition(FAMILJE_STUNDEN_MONTHLY_RELEASE, 1)!.spec
const NOW = '2026-10-20T09:00:00.000Z'

const INSTANCE: WorkflowInstance = {
  id: 'i1', def_id: 'd1', def_key: FAMILJE_STUNDEN_MONTHLY_RELEASE, def_version: 1,
  def_hash: 'a'.repeat(64), project_id: 'p1', instance_key: '2026-11',
  current_state: 'local_qa', status: 'active', wake_at: null,
  last_tick_at: null, last_tick_outcome: null,
  created_at: NOW, closed_at: null,
}

const MANIFEST = 'b'.repeat(64)
const target = (over: Partial<Parameters<typeof computeEvidenceTargetHash>[0]> = {}) =>
  computeEvidenceTargetHash({
    instance: INSTANCE, spec: SPEC, state: 'local_qa', checkKey: 'audio_file_count',
    sourceCommit: 'c0ffee', artifactManifestHash: MANIFEST, ...over,
  })

function row(over: Partial<WorkflowEvidence> = {}): WorkflowEvidence {
  return {
    id: 'e1', instance_id: 'i1', state: 'local_qa', check_key: 'audio_file_count',
    result: 'pass', source: 'attested', detail: {}, recorded_at: NOW,
    producer: 'cred-1', producer_type: 'local_agent', observed_at: NOW,
    payload_hash: 'd'.repeat(64), target_hash: target(), attestation: {},
    ...over,
  }
}

const CHECK = findCheck('local_qa', 'audio_file_count')!

// ── C. Target binding ────────────────────────────────────────────────────────

describe('target binding — evidence is about one exact thing', () => {
  it('reuses the canonical hash primitive rather than a fourth canonicalizer', () => {
    expect(target()).toBe(canonicalTargetVersionHash(evidenceTargetPayload({
      instance: INSTANCE, spec: SPEC, state: 'local_qa', checkKey: 'audio_file_count',
      sourceCommit: 'c0ffee', artifactManifestHash: MANIFEST,
    })))
  })

  it('is stable for identical inputs', () => {
    expect(target()).toBe(target())
  })

  it.each([
    ['def_hash', { instance: { ...INSTANCE, def_hash: 'f'.repeat(64) } }],
    ['def_version', { instance: { ...INSTANCE, def_version: 2 } }],
    ['instance', { instance: { ...INSTANCE, id: 'other' } }],
    ['month', { instance: { ...INSTANCE, instance_key: '2026-12' } }],
    ['state', { state: 'ebook_build', checkKey: 'ebook_page_count' }],
    ['check_key', { checkKey: 'audio_decode_ok' }],
    ['source commit', { sourceCommit: 'deadbee' }],
    ['artifact manifest', { artifactManifestHash: 'e'.repeat(64) }],
  ])('a changed %s moves the hash', (_label, over) => {
    expect(target(over as never)).not.toBe(target())
  })

  it('a changed declared input moves the hash', () => {
    const mutated: WorkflowSpec = {
      ...SPEC,
      states: SPEC.states.map(s => s.id === 'local_qa' ? { ...s, inputs: [...s.inputs, 'extra'] } : s),
    }
    expect(target({ spec: mutated } as never)).not.toBe(target())
  })

  it('refuses a state the definition does not declare', () => {
    expect(() => target({ state: 'ghost' } as never)).toThrow(/not declared by/)
  })

  it('binding classifies current, stale and unbound', () => {
    expect(evidenceBinding(target(), target())).toBe('current')
    expect(evidenceBinding('f'.repeat(64), target())).toBe('stale')
    expect(evidenceBinding(null, target())).toBe('unbound')
  })

  it('payload hash makes an identical restatement identical', () => {
    const args = { checkKey: 'audio_file_count', result: 'pass' as const, observedAt: NOW,
                   targetHash: target(), payload: { found: 19 } }
    expect(computeEvidencePayloadHash(args)).toBe(computeEvidencePayloadHash(args))
    expect(computeEvidencePayloadHash({ ...args, payload: { found: 18 } }))
      .not.toBe(computeEvidencePayloadHash(args))
  })
})

// ── Payload safety ───────────────────────────────────────────────────────────

describe('payload safety — no secrets reach an append-only table', () => {
  it.each(['api_key', 'apiKey', 'SECRET', 'password', 'service_role', 'authorization',
    'bearer_token', 'privateKey'])('refuses a key named %s', key => {
    expect(validateEvidencePayload({ [key]: 'x' }).ok).toBe(false)
  })

  it('refuses a credential-shaped key nested deep', () => {
    expect(validateEvidencePayload({ a: { b: { c: { token: 'x' } } } }).ok).toBe(false)
  })

  it('accepts ordinary QA metadata', () => {
    expect(validateEvidencePayload({ expected: 19, found: 19, files: ['page-01.mp3'] }).ok).toBe(true)
  })

  it('bounds size and depth — the table cannot be pruned', () => {
    expect(validateEvidencePayload({ s: 'x'.repeat(4001) }).ok).toBe(false)
    expect(validateEvidencePayload({ a: Array(201).fill(1) }).ok).toBe(false)
    let deep: unknown = 'leaf'
    for (let i = 0; i < 8; i++) deep = { n: deep }
    expect(validateEvidencePayload(deep).ok).toBe(false)
  })
})

// ── F/G. Consumption rules ───────────────────────────────────────────────────

describe('consumption — recorded is not the same as satisfying', () => {
  it('an attested PASS bound to the current target satisfies', () => {
    const v = evaluateCheck(CHECK, 'audio_file_count', [row()], target())
    expect(v.satisfies).toBe(true)
    expect(v.satisfaction).toBe('satisfied')
    expect(v.source).toBe('attested')
    expect(v.producer).toBe('cred-1')
  })

  it('an undeclared check never satisfies', () => {
    expect(evaluateCheck(null, 'made_up', [row({ check_key: 'made_up' })], target()).satisfaction)
      .toBe('undeclared')
  })

  it('no evidence is `absent`, never a pass', () => {
    expect(evaluateCheck(CHECK, 'audio_file_count', [], target()).satisfaction).toBe('absent')
  })

  it.each([
    ['fail', 'failed'], ['blocked', 'blocked'], ['error', 'errored'], ['skipped', 'blocked'],
  ])('result %s yields %s and never satisfies', (result, satisfaction) => {
    const v = evaluateCheck(CHECK, 'audio_file_count',
      [row({ result: result as WorkflowEvidence['result'] })], target())
    expect(v.satisfaction).toBe(satisfaction)
    expect(v.satisfies).toBe(false)
  })

  it('a MOVED target makes prior evidence stale, not absent', () => {
    // "Verified, but against different artefacts" is a different thing to tell
    // an operator than "never verified".
    const v = evaluateCheck(CHECK, 'audio_file_count', [row()], target({ artifactManifestHash: 'e'.repeat(64) } as never))
    expect(v.satisfaction).toBe('stale')
    expect(v.binding).toBe('stale')
    expect(v.satisfies).toBe(false)
  })

  it('a def_hash bump invalidates evidence', () => {
    const v = evaluateCheck(CHECK, 'audio_file_count', [row()],
      target({ instance: { ...INSTANCE, def_hash: 'f'.repeat(64) } } as never))
    expect(v.satisfaction).toBe('stale')
  })

  it('unpinned evidence cannot satisfy a pinned check', () => {
    const v = evaluateCheck(CHECK, 'audio_file_count', [row({ target_hash: null })], target())
    expect(v.satisfaction).toBe('unbound')
    expect(v.satisfies).toBe(false)
  })

  it('ATTESTED evidence is refused for a check Omnira observes itself', () => {
    const observed = findCheck('approval_release', 'anonymous_protected_access_denied')!
    expect(observed.allowed_provenance).toEqual(['automated'])
    const v = evaluateCheck(observed, 'anonymous_protected_access_denied',
      [row({ state: 'approval_release', check_key: 'anonymous_protected_access_denied', source: 'attested' })],
      target({ state: 'approval_release', checkKey: 'anonymous_protected_access_denied' } as never))
    expect(v.satisfaction).toBe('provenance_refused')
    expect(v.satisfies).toBe(false)
  })

  it('AUTOMATED evidence is refused for a check only a producer can make', () => {
    const v = evaluateCheck(CHECK, 'audio_file_count', [row({ source: 'automated' })], target())
    expect(v.satisfaction).toBe('provenance_refused')
  })

  it('the newest permitted, current-target row decides', () => {
    const older = row({ id: 'old', result: 'fail', recorded_at: '2026-10-19T00:00:00.000Z' })
    const newer = row({ id: 'new', result: 'pass', recorded_at: '2026-10-21T00:00:00.000Z' })
    expect(evaluateCheck(CHECK, 'audio_file_count', [older, newer], target()).satisfies).toBe(true)
  })

  it('summarises a whole state without inventing a pass', () => {
    const s = summarizeStateEvidence(FAMILJE_STUNDEN_CHECKS, 'local_qa', [row()], () => target())
    expect(s.satisfied).toEqual(['audio_file_count'])
    expect(s.allSatisfied).toBe(false)          // the other two local_qa checks are absent
    expect(s.hasFailure).toBe(false)
    expect(s.outstanding).toContain('audio_decode_ok:absent')
  })

  it('a state with no declared checks is not "verified"', () => {
    const s = summarizeStateEvidence(FAMILJE_STUNDEN_CHECKS, 'edge_deploy', [], () => target())
    expect(s.allSatisfied).toBe(false)
    expect(s.hasFailure).toBe(false)
  })

  it('a FAIL is surfaced as a real finding', () => {
    const s = summarizeStateEvidence(FAMILJE_STUNDEN_CHECKS, 'local_qa',
      [row({ result: 'fail' })], () => target())
    expect(s.hasFailure).toBe(true)
    expect(s.failing).toEqual(['audio_file_count'])
  })
})

// ── H. Catalogue ─────────────────────────────────────────────────────────────

describe('the Familje-Stunden check catalogue', () => {
  it('declares every check against a state the definition actually has', () => {
    const states = new Set(SPEC.states.map(s => s.id))
    for (const c of FAMILJE_STUNDEN_CHECKS) expect(states.has(c.state), c.check_key).toBe(true)
  })

  it('gives every check exactly one provenance — no check is both', () => {
    for (const c of FAMILJE_STUNDEN_CHECKS) {
      expect(c.allowed_provenance.length, c.check_key).toBe(1)
    }
  })

  it('keeps the endpoint probe automated-only', () => {
    expect(findCheck('approval_release', 'anonymous_protected_access_denied')!.allowed_provenance)
      .toEqual(['automated'])
  })

  it('binds artefact claims to the manifest and repo claims not', () => {
    expect(findCheck('local_qa', 'audio_file_count')!.binds_artifacts).toBe(true)
    expect(findCheck('frontend_deploy', 'typecheck_passed')!.binds_artifacts).toBe(false)
  })

  it('covers the states local QA actually happens in', () => {
    // Phase 2B-2 added the Editor's story decision, which is attested by
    // definition — no machine can make it — so approval_content joins the list.
    expect(attestableStates()).toEqual([
      'approval_content', 'content_generation', 'ebook_build', 'frontend_deploy',
      'local_qa', 'pdf_build', 'protected_upload', 'visual_generation',
    ])
  })

  it('has unique keys per state', () => {
    const keys = FAMILJE_STUNDEN_CHECKS.map(c => `${c.state}:${c.check_key}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

// ── D/E. Producer credential and ingestion surface ───────────────────────────

const SRC = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const CODE = (rel: string) =>
  SRC(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const ROUTE = '../../app/api/workflows/evidence/route.ts'

describe('the ingestion endpoint cannot do anything but record', () => {
  it('demands the narrow scope, through the route-scoped resolver', () => {
    expect(PROJECT_API_SCOPES).toContain('workflow.evidence.write')
    // The route must NOT reach the credential primitive itself — a route that
    // can name its own scope is a route that can name the wrong one.
    expect(CODE(ROUTE)).toMatch(/requireEvidenceProducer\(request\)/)
    expect(CODE(ROUTE)).not.toMatch(/requireProjectApiScope/)
    expect(CODE('../workflows/evidence-auth.ts'))
      .toMatch(/WORKFLOW_EVIDENCE_WRITE_SCOPE = 'workflow\.evidence\.write'/)
  })

  it('never transitions a workflow', () => {
    expect(CODE(ROUTE)).not.toMatch(/appendTransition|workflow_append_transition/)
  })

  it('never touches the authority ledger', () => {
    expect(CODE(ROUTE)).not.toMatch(/atlas_authorizations|requestAuthorization|grantAuthorization/)
  })

  it('never reaches Familje-Stunden', () => {
    const code = CODE(ROUTE)
    expect(code).not.toMatch(/fetch\(|https?:\/\//)
    expect(code).not.toMatch(/FAMILJE_STUNDEN/)
  })

  it('never creates an instance, definition or state', () => {
    expect(CODE(ROUTE)).not.toMatch(/workflow_instantiate|instantiate\(|registerVendoredDefinition/)
  })

  it('computes both hashes server-side and never accepts them from the caller', () => {
    const code = CODE(ROUTE)
    expect(code).toMatch(/computeEvidenceTargetHash\(/)
    expect(code).toMatch(/computeEvidencePayloadHash\(/)
    expect(code).not.toMatch(/body\.(targetHash|payloadHash)/)
  })

  it('forces attested provenance — a producer cannot claim to be Omnira', () => {
    expect(CODE(ROUTE)).toMatch(/source: 'attested'/)
    expect(CODE(ROUTE)).not.toMatch(/source: 'automated'/)
  })

  it('binds the instance to the credential’s own project', () => {
    expect(CODE(ROUTE)).toMatch(/instance\.project_id !== principal\.projectId/)
  })

  it('treats a replay as idempotent rather than a second fact', () => {
    expect(CODE(ROUTE)).toMatch(/duplicate: true/)
  })
})

// ── Mutation tests ───────────────────────────────────────────────────────────

describe('mutant — consumption that ignores the target pin', () => {
  it('would accept evidence for artefacts that no longer exist', () => {
    const mutant = (rows: WorkflowEvidence[]) => rows.some(r => r.result === 'pass')
    const stale = [row()]
    const movedTarget = target({ artifactManifestHash: 'e'.repeat(64) } as never)
    expect(mutant(stale)).toBe(true)
    expect(evaluateCheck(CHECK, 'audio_file_count', stale, movedTarget).satisfies).toBe(false)
  })
})

describe('mutant — consumption that ignores provenance', () => {
  it('would let an attestation stand in for a check Omnira must observe', () => {
    const observed = findCheck('approval_release', 'anonymous_protected_access_denied')!
    const forged = [row({
      state: 'approval_release', check_key: 'anonymous_protected_access_denied', source: 'attested',
      target_hash: target({ state: 'approval_release', checkKey: 'anonymous_protected_access_denied' } as never),
    })]
    const mutant = (rows: WorkflowEvidence[]) => rows.some(r => r.result === 'pass')
    expect(mutant(forged)).toBe(true)
    expect(evaluateCheck(observed, 'anonymous_protected_access_denied', forged,
      target({ state: 'approval_release', checkKey: 'anonymous_protected_access_denied' } as never)).satisfies)
      .toBe(false)
  })
})

describe('automated and attested stay distinguishable end to end', () => {
  it('the row, the verdict and the catalogue all carry provenance', () => {
    const a = evaluateCheck(CHECK, 'audio_file_count', [row({ source: 'attested' })], target())
    expect(a.source).toBe('attested')
    const observed = findCheck('planning', 'release_instant_computed')!
    expect(observed.allowed_provenance).toEqual(['automated'])
  })
})
