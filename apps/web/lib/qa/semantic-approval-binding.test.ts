/**
 * lib/qa/semantic-approval-binding.test.ts — Phase 2B-0.6.
 *
 * Two things are proven here, and the second matters more than the first:
 *
 *   1. the story approval target is bound to CONTENT, not to time;
 *   2. adding it changed nothing about how a historical authorization is
 *      computed, matched or refused.
 *
 * The legacy fixture below is a regression pin. If it ever moves, an
 * already-consumed authorization has silently acquired a new meaning.
 */

import { describe, it, expect } from 'vitest'
import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'

import { findVendoredDefinition } from '@/lib/workflows/definitions'
import { composeMonthlyBrief, computeMonthlyBriefHash } from '@/lib/workflows/brief/compose'
import {
  workflowGateTargetPayload, computeWorkflowGateTarget, WORKFLOW_GATE_TARGET_TYPE,
} from '@/lib/workflows/gate'
import { canonicalTargetVersionHash } from '@/lib/atlas/authorization/build'
import {
  computeStoryApprovalTarget, storyApprovalTargetPayload, storyApprovalTargetId,
  storyFactsAgree, WORKFLOW_STORY_APPROVAL_TARGET_TYPE,
  WORKFLOW_STORY_APPROVAL_ACTION_KIND, STORY_APPROVAL_TARGET_SCHEMA,
} from '@/lib/workflows/approval/story-approval-target'
import {
  STORY_APPROVAL_CHECKS, STORY_EVIDENCE_PAYLOAD_FIELDS, STORY_EVIDENCE_COMMON_FIELD,
} from '@/lib/workflows/approval/story-identity'
import { FAMILJE_STUNDEN_CHECKS } from '@/lib/workflows/adapters/familje-stunden/checks'
import { ACTION_REGISTRY } from '@/lib/workflows/action-registry'

const DEF_KEY = 'familje-stunden.monthly-release'
const v2 = () => findVendoredDefinition(DEF_KEY, 2)!
const MONTH = '2026-10'
const ID2 = { defKey: DEF_KEY, defVersion: 2 }
const H = (seed: string) => createHash('sha256').update(seed).digest('hex')

const BASE = {
  instanceId: 'inst-1', state: 'approval_content',
  storyContentHash: H('story-A'), briefHash: H('brief-1'), storyContractVersion: '1.0',
}

// ── A. The brief is complete ────────────────────────────────────────────────

describe('MonthlyBriefV1 carries every generator-facing requirement', () => {
  const brief = () => composeMonthlyBrief(v2().spec.canonical, MONTH, ID2)
  const canon = () => v2().spec.canonical as Record<string, any>

  it('language comes from canonical, not from an assumption', () => {
    expect(brief().language).toBe('sv')
    expect(brief().language).toBe(canon().language)
  })

  it('audience comes from canonical', () => {
    expect(brief().audience).toEqual({ min_age: 3, max_age: 8 })
    expect(brief().audience.min_age).toBe(canon().audience.min_age)
    expect(brief().audience.max_age).toBe(canon().audience.max_age)
  })

  it('the Swedish prose description is NOT carried into the hashed payload', () => {
    // Rewording a human label must not change the identity of a requirement that
    // has not moved.
    expect(canon().audience.description).toBeTruthy()
    expect(JSON.stringify(brief().audience)).not.toMatch(/barn|cirka/)
  })

  it('MUTATION — language is hash-bound', () => {
    const base = computeMonthlyBriefHash(brief())
    const other = composeMonthlyBrief({ ...canon(), language: 'en' }, MONTH, ID2)
    expect(computeMonthlyBriefHash(other)).not.toBe(base)
  })

  it('MUTATION — audience is hash-bound', () => {
    const base = computeMonthlyBriefHash(brief())
    const wider = composeMonthlyBrief(
      { ...canon(), audience: { min_age: 3, max_age: 10 } }, MONTH, ID2)
    expect(computeMonthlyBriefHash(wider)).not.toBe(base)
  })

  it('MUTATION — page_structure is still hash-bound', () => {
    const base = computeMonthlyBriefHash(brief())
    const resplit = composeMonthlyBrief({
      ...canon(),
      page_structure: { total_pages: 18, cover_pages: 2, content_pages: 15, closing_pages: 1 },
    }, MONTH, ID2)
    expect(computeMonthlyBriefHash(resplit)).not.toBe(base)
  })

  it('composition stays deterministic', () => {
    expect(computeMonthlyBriefHash(brief())).toBe(computeMonthlyBriefHash(brief()))
  })

  it('refuses a missing or inverted audience rather than repairing it', () => {
    for (const bad of [
      { ...canon(), audience: undefined },
      { ...canon(), audience: { min_age: 8, max_age: 3 } },
      { ...canon(), audience: { min_age: 3 } },
      { ...canon(), language: '' },
    ]) {
      expect(() => composeMonthlyBrief(bad, MONTH, ID2)).toThrow()
    }
  })

  it('the payload is declared FROZEN', () => {
    const src = readFileSync(join(process.cwd(), 'lib/workflows/brief/types.ts'), 'utf8')
    expect(src).toMatch(/MONTHLY_BRIEF_V1_FROZEN_AFTER/)
  })
})

// ── B. Semantic story approval target ───────────────────────────────────────

describe('the story approval target binds content, not time', () => {
  it('MUTATION — a different story is a different target', () => {
    const a = computeStoryApprovalTarget(BASE)
    const b = computeStoryApprovalTarget({ ...BASE, storyContentHash: H('story-B') })
    expect(a.versionHash).not.toBe(b.versionHash)
    expect(a.targetId).not.toBe(b.targetId)
  })

  it('MUTATION — same instant, editor, instance, state and brief still separate', () => {
    // The payload contains no timestamp at all, so "recorded at the same moment"
    // is not even expressible. This is the collision Phase 2B-0.5 recorded.
    const payload = storyApprovalTargetPayload(BASE)
    expect(JSON.stringify(payload)).not.toMatch(/recorded_at|timestamp|_at"/)
    const a = computeStoryApprovalTarget(BASE)
    const b = computeStoryApprovalTarget({ ...BASE, storyContentHash: H('story-B') })
    expect(a.versionHash).not.toBe(b.versionHash)
  })

  it('MUTATION — a different brief is a different target', () => {
    const a = computeStoryApprovalTarget(BASE)
    const b = computeStoryApprovalTarget({ ...BASE, briefHash: H('brief-2') })
    expect(a.versionHash).not.toBe(b.versionHash)
  })

  it('a different story contract version is a different target', () => {
    const a = computeStoryApprovalTarget(BASE)
    const b = computeStoryApprovalTarget({ ...BASE, storyContractVersion: '2.0' })
    expect(a.versionHash).not.toBe(b.versionHash)
  })

  it('MUTATION — identity does not depend on operator-assigned labels', () => {
    // story_id and story_version are ours to assign. Binding them would let a
    // rename invalidate a valid approval, and a reused number collide two stories.
    const payload = storyApprovalTargetPayload(BASE)
    expect(Object.keys(payload)).not.toContain('story_id')
    expect(Object.keys(payload)).not.toContain('story_version')
  })

  it('the content hash is in the target id, so SQL can check it without hashing', () => {
    expect(storyApprovalTargetId('i', 's', BASE.storyContentHash))
      .toBe(`i:s:${BASE.storyContentHash}`)
    expect(computeStoryApprovalTarget(BASE).targetId).toContain(BASE.storyContentHash)
  })

  it('is deterministic and refuses malformed hashes', () => {
    expect(computeStoryApprovalTarget(BASE).versionHash)
      .toBe(computeStoryApprovalTarget(BASE).versionHash)
    expect(() => computeStoryApprovalTarget({ ...BASE, storyContentHash: 'nope' })).toThrow()
    expect(() => computeStoryApprovalTarget({ ...BASE, briefHash: '' })).toThrow()
  })

  it('carries its own schema version, so a future meaning change is explicit', () => {
    expect(storyApprovalTargetPayload(BASE).schema).toBe(STORY_APPROVAL_TARGET_SCHEMA)
  })
})

// ── C. Forward-only compatibility ───────────────────────────────────────────

describe('nothing about historical authorization changed', () => {
  /**
   * REGRESSION PIN. Computed from the shipped implementation at Phase 2B-0.6.
   * A change here means an already-consumed authorization target now means
   * something else.
   */
  const LEGACY_GATE_TARGET_HASH =
    '3c8d8b749db891299b31b184a5e2028ef2ca2d704eb8e4c6b1753436f45d9c36'

  const legacyInput = () => ({
    instance: {
      id: 'inst-legacy', project_id: 'proj-1', def_key: DEF_KEY, def_version: 2,
      def_hash: v2().def_hash, instance_key: MONTH,
    },
    spec: v2().spec, state: 'approval_content',
    evidence: [] as never, declaredCheckKeys: [] as string[],
  })

  it('MUTATION — the legacy gate target hash is byte-identical', () => {
    expect(canonicalTargetVersionHash(workflowGateTargetPayload(legacyInput())))
      .toBe(LEGACY_GATE_TARGET_HASH)
  })

  /**
   * A SECOND pin, with evidence present.
   *
   * The empty-evidence pin above cannot see a change to the evidence FACT shape —
   * a deliberate falsification proved exactly that, by binding `payload_hash`
   * into each fact and leaving the first pin green. This fixture closes that
   * hole: it is the shape a real consumed authorization actually had.
   */
  const LEGACY_GATE_TARGET_HASH_WITH_EVIDENCE =
    'c44e3d1559f7a4698e3c94ef7f9c5db277f60bad1f3358f81dca8ba39f4f8ae8'

  const legacyWithEvidence = () => ({
    instance: {
      id: 'inst-legacy', project_id: 'proj-1', def_key: DEF_KEY, def_version: 2,
      def_hash: v2().def_hash, instance_key: MONTH,
    },
    spec: v2().spec, state: 'planning',
    evidence: [{
      id: 'e1', instance_id: 'inst-legacy', state: 'planning',
      check_key: 'release_instant_computed', result: 'pass', source: 'automated',
      detail: {}, recorded_at: '2026-08-30T18:16:02.158316Z',
      producer: null, producer_type: null, observed_at: '2026-08-30T18:16:02.158316Z',
      payload_hash: 'p1', target_hash: null, attestation: null,
    }] as never,
    declaredCheckKeys: ['release_instant_computed'],
  })

  it('MUTATION — the legacy hash is byte-identical WITH evidence present', () => {
    expect(canonicalTargetVersionHash(workflowGateTargetPayload(legacyWithEvidence())))
      .toBe(LEGACY_GATE_TARGET_HASH_WITH_EVIDENCE)
  })

  it('MUTATION — an evidence fact still carries exactly four fields', () => {
    // Adding one — payload_hash being the obvious candidate — would make every
    // historical gate authorization mean something new.
    const p = workflowGateTargetPayload(legacyWithEvidence()) as
      { evidence: Record<string, unknown>[] }
    expect(Object.keys(p.evidence[0]).sort())
      .toEqual(['check_key', 'recorded_at', 'result', 'source'])
  })

  it('the legacy gate payload gained no new keys', () => {
    expect(Object.keys(workflowGateTargetPayload(legacyInput())).sort()).toEqual([
      'def_hash', 'def_key', 'def_version', 'evidence', 'gate', 'instance_id',
      'instance_key', 'kind', 'project_id', 'requested_action', 'state_inputs',
    ])
  })

  it('MUTATION — the gate payload still binds no content hash', () => {
    // Stated as a fact, not a wish: this is exactly why the new target exists.
    expect(JSON.stringify(workflowGateTargetPayload(legacyInput())))
      .not.toMatch(/story_content_hash|payload_hash/)
  })

  it('the two target types are distinct, so neither can satisfy the other', () => {
    expect(WORKFLOW_STORY_APPROVAL_TARGET_TYPE).not.toBe(WORKFLOW_GATE_TARGET_TYPE)
    expect(computeWorkflowGateTarget(legacyInput()).targetType).toBe(WORKFLOW_GATE_TARGET_TYPE)
    expect(computeStoryApprovalTarget(BASE).targetType)
      .toBe(WORKFLOW_STORY_APPROVAL_TARGET_TYPE)
  })

  it('MUTATION — sameTarget requires the type to match, so grants cannot cross', async () => {
    const { sameTarget } = await import('@/lib/atlas/authorization/derive') as
      { sameTarget?: (a: unknown, b: unknown) => boolean }
    const gate = computeWorkflowGateTarget(legacyInput())
    const story = computeStoryApprovalTarget(BASE)
    if (typeof sameTarget === 'function') {
      expect(sameTarget(gate, story)).toBe(false)
    }
    // Independent of the helper's export shape, the discriminators differ.
    expect(gate.targetType).not.toBe(story.targetType)
  })

  it('legacy consumers ignore the new type by construction', () => {
    const auth = readFileSync(join(process.cwd(), 'lib/workflows/authorization.ts'), 'utf8')
    const rearm = readFileSync(join(process.cwd(), 'lib/workflows/rearm.ts'), 'utf8')
    expect(auth).toMatch(/targetType !== WORKFLOW_GATE_TARGET_TYPE\) continue/)
    expect(rearm).toMatch(/targetType !== WORKFLOW_GATE_TARGET_TYPE/)
  })

  it('the new action kind is its own purpose', () => {
    expect(WORKFLOW_STORY_APPROVAL_ACTION_KIND).toBe('workflow.story.approve')
    expect(WORKFLOW_STORY_APPROVAL_ACTION_KIND).not.toBe('workflow.gate.advance')
  })
})

// ── D. Cross-check and evidence payloads ────────────────────────────────────

describe('all three facts must name the same story', () => {
  it('agreement requires one hash across generation, validation and approval', () => {
    const h = H('story-A')
    expect(storyFactsAgree({
      generatedHash: h, structurallyValidatedHash: h, approvedHash: h })).toBe(true)
  })

  it('MUTATION — a story regenerated after validation cannot be approved through', () => {
    const a = H('story-A'), b = H('story-B')
    expect(storyFactsAgree({
      generatedHash: b, structurallyValidatedHash: a, approvedHash: a })).toBe(false)
    expect(storyFactsAgree({
      generatedHash: a, structurallyValidatedHash: a, approvedHash: b })).toBe(false)
    expect(storyFactsAgree({
      generatedHash: a, structurallyValidatedHash: b, approvedHash: a })).toBe(false)
  })

  it('every evidence payload names the story', () => {
    for (const [key, fields] of Object.entries(STORY_EVIDENCE_PAYLOAD_FIELDS)) {
      expect(fields, key).toContain(STORY_EVIDENCE_COMMON_FIELD)
    }
  })

  it('no evidence payload uses a timestamp as identity', () => {
    for (const [key, fields] of Object.entries(STORY_EVIDENCE_PAYLOAD_FIELDS)) {
      for (const f of fields) expect(f, key).not.toMatch(/recorded_at|_at$|timestamp/)
    }
  })

  it('the Editor identity is not copied into evidence', () => {
    // It lives on the authorization event. A second copy is a second answer.
    expect(STORY_EVIDENCE_PAYLOAD_FIELDS.story_content_approved)
      .not.toContain('editor_id')
  })
})

// ── E. Provenance separation and deferral ───────────────────────────────────

describe('the provenance split is unchanged, and nothing was wired live', () => {
  it('MUTATION — a human cannot manufacture story_generated', () => {
    const c = STORY_APPROVAL_CHECKS.find(x => x.check_key === 'story_generated')!
    expect(c.allowed_provenance).toEqual(['automated'])
  })

  it('MUTATION — automation cannot manufacture story_content_approved', () => {
    const c = STORY_APPROVAL_CHECKS.find(x => x.check_key === 'story_content_approved')!
    expect(c.allowed_provenance).toEqual(['attested'])
  })

  it('MUTATION — no story check is declared live', () => {
    for (const c of STORY_APPROVAL_CHECKS) {
      expect(FAMILJE_STUNDEN_CHECKS.some(d => d.check_key === c.check_key), c.check_key)
        .toBe(false)
    }
  })

  it('approval_content still declares zero checks — activation is StoryV1 work', () => {
    expect(FAMILJE_STUNDEN_CHECKS.filter(c => c.state === 'approval_content')).toHaveLength(0)
  })

  it('MUTATION — no Familje-Stunden effectful action is executable', () => {
    // Phase 2B-1 widened ExecutorFamily deliberately. The property this pin was
    // really protecting — that no product write became runnable — is asserted
    // directly rather than through the shape of a type.
    for (const kind of ['apply_release_gate_migration', 'generate_page_audio',
                        'send_release_newsletter', 'upload_protected_artifacts'] as const) {
      expect(ACTION_REGISTRY[kind].executor_family, kind).toBe('not_executable')
    }
  })

  it('the approval primitive is wired to nothing', () => {
    const consumers = ['lib/workflows/action-executor.ts', 'lib/workflows/advance.ts',
                       'lib/workflows/authorization.ts', 'lib/workflows/gate.ts']
    for (const f of consumers) {
      const src = readFileSync(join(process.cwd(), f), 'utf8')
      expect(src, f).not.toMatch(/story-approval-target|computeStoryApprovalTarget/)
    }
  })
})
