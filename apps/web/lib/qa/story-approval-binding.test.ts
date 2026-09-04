/**
 * lib/qa/story-approval-binding.test.ts — Phase 2B-0.5.
 *
 * Two prerequisites for paid story generation, proven rather than assumed:
 *
 *   A. the brief's page semantics are unambiguous, so "18" can never be read as
 *      "write 18 content pages";
 *   B. the approval gap is real, understood, and cannot be closed by accident.
 *
 * The approval suite deliberately documents a WEAKNESS. These tests pass today
 * because the defect exists; they are the record of what Phase 2B must fix, and
 * they fail the moment someone believes it is already fixed.
 */

import { describe, it, expect } from 'vitest'
import { createHash } from 'crypto'

import { findVendoredDefinition } from '@/lib/workflows/definitions'
import { composeMonthlyBrief, computeMonthlyBriefHash } from '@/lib/workflows/brief/compose'
import { workflowGateTargetPayload } from '@/lib/workflows/gate'
import { canonicalJson } from '@/lib/atlas/mission/binding'
import {
  STORY_APPROVAL_CHECKS, STORY_IDENTITY_DISTINGUISHING_FIELDS,
  STORY_APPROVAL_PREREQUISITES, type StoryApprovalSubject,
} from '@/lib/workflows/approval/story-identity'
import { FAMILJE_STUNDEN_CHECKS } from '@/lib/workflows/adapters/familje-stunden/checks'
import { ACTION_REGISTRY } from '@/lib/workflows/action-registry'

const DEF_KEY = 'familje-stunden.monthly-release'
const v1 = () => findVendoredDefinition(DEF_KEY, 1)!
const v2 = () => findVendoredDefinition(DEF_KEY, 2)!
const MONTH = '2026-10'
const ID2 = { defKey: DEF_KEY, defVersion: 2 }

// ── A. Page semantics ───────────────────────────────────────────────────────

describe('the brief states page structure, never an ambiguous count', () => {
  const brief = () => composeMonthlyBrief(v2().spec.canonical, MONTH, ID2)

  it('MUTATION — 18 total = 1 cover + 16 content + 1 closing', () => {
    const p = brief().page_structure
    expect(p).toEqual({ total_pages: 18, cover_pages: 1, content_pages: 16, closing_pages: 1 })
    expect(p.cover_pages + p.content_pages + p.closing_pages).toBe(p.total_pages)
  })

  it('MUTATION — the generator-facing count is 16, and it is not the total', () => {
    // The whole defect in one assertion: a consumer asking "how many pages do I
    // write" gets 16, and cannot reach 18 by asking the same question.
    const p = brief().page_structure
    expect(p.content_pages).toBe(16)
    expect(p.content_pages).not.toBe(p.total_pages)
  })

  it('MUTATION — the ambiguous page_count field is gone', () => {
    expect(Object.keys(brief())).not.toContain('page_count')
  })

  it('the artefact counts are the TOTAL, and say so by agreeing with it', () => {
    const b = brief()
    expect(b.ebook_pages).toBe(b.page_structure.total_pages)
    expect(b.page_audio_clips).toBe(b.page_structure.total_pages)
  })

  it('October and November themes are unchanged by this correction', () => {
    expect(brief().theme).toBe('Rymdmånaden')
    expect(composeMonthlyBrief(v2().spec.canonical, '2026-11', ID2).theme)
      .toBe('Löv- & Skuggmånaden')
  })
})

// ── A2. Identity consequences ───────────────────────────────────────────────

describe('the page structure is part of the brief identity', () => {
  const canon = () => v2().spec.canonical as Record<string, unknown>

  it('composition stays deterministic', () => {
    const a = computeMonthlyBriefHash(composeMonthlyBrief(canon(), MONTH, ID2))
    const b = computeMonthlyBriefHash(composeMonthlyBrief(canon(), MONTH, ID2))
    expect(a).toBe(b)
  })

  it('MUTATION — a different page split is a different brief', () => {
    const base = computeMonthlyBriefHash(composeMonthlyBrief(canon(), MONTH, ID2))
    const resplit = {
      ...canon(),
      page_structure: { total_pages: 18, cover_pages: 2, content_pages: 15, closing_pages: 1 },
    }
    expect(computeMonthlyBriefHash(composeMonthlyBrief(resplit, MONTH, ID2))).not.toBe(base)
  })

  it('no production brief identity exists to be reinterpreted', () => {
    // The versioning decision rests on this: the schema stayed at v1 because
    // nothing has ever been composed in production. Proven at the time from
    // workflow_evidence (0 rows for monthly_brief_composed, 0 details carrying a
    // brief_hash) and from runs (0 compose_monthly_brief). What this test can
    // hold is the source-side half: nothing outside the brief module and the
    // executor consumes the payload, so there is no other reader to break.
    expect(ACTION_REGISTRY.compose_monthly_brief.placements).toEqual([
      { def_key: DEF_KEY, state: 'planning' },
    ])
  })
})

// ── A3. A contract without story authority must refuse ──────────────────────

describe('only a contract that declares page structure can brief a generator', () => {
  it('MUTATION — v1 declares none, so composing against it is refused', () => {
    expect((v1().spec.canonical as Record<string, unknown>).page_structure).toBeUndefined()
    expect(() => composeMonthlyBrief(v1().spec.canonical, MONTH, { defKey: DEF_KEY, defVersion: 1 }))
      .toThrow(/declares no page structure/)
  })

  it('the refusal is a refusal, not a fallback to ebook_pages', () => {
    // Deriving content_pages from ebook_pages is the original defect wearing a
    // different hat: it would silently produce 18 where 16 belongs.
    try {
      composeMonthlyBrief(v1().spec.canonical, MONTH, { defKey: DEF_KEY, defVersion: 1 })
      throw new Error('should have refused')
    } catch (e) {
      expect((e as Error).message).not.toMatch(/should have refused/)
    }
  })
})

// ── B. The approval gap, documented ─────────────────────────────────────────

describe('approval_content binds no story identity today — the gap Phase 2B must close', () => {
  const instance = {
    id: 'inst-1', project_id: 'proj-1', def_key: DEF_KEY, def_version: 2,
    def_hash: v2().def_hash, instance_key: MONTH,
  }
  const evidenceRow = (check_key: string, payload_hash: string, recorded_at: string) => ({
    id: 'e-' + payload_hash, instance_id: 'inst-1', state: 'approval_content',
    check_key, result: 'pass', source: 'automated', detail: {}, recorded_at,
    producer: null, producer_type: null, observed_at: recorded_at,
    payload_hash, target_hash: null, attestation: null,
  })
  const target = (evidence: unknown[], declared: string[]) =>
    createHash('sha256').update(canonicalJson(workflowGateTargetPayload({
      instance, spec: v2().spec, state: 'approval_content',
      evidence: evidence as never, declaredCheckKeys: declared,
    }))).digest('hex')

  it('approval_content declares zero checks', () => {
    expect(FAMILJE_STUNDEN_CHECKS.filter(c => c.state === 'approval_content')).toHaveLength(0)
  })

  it('MUTATION — DEFECT: two different stories produce the SAME gate target', () => {
    // With no declared checks the evidence filter keeps nothing, so an Editor's
    // grant at approval_content is indifferent to which story exists. This is the
    // failure "approval of Story A must never authorize Story B" names.
    const storyA = [evidenceRow('story_generated', 'aaa', '2026-09-04T10:00:00.000Z')]
    const storyB = [evidenceRow('story_generated', 'bbb', '2026-09-04T11:00:00.000Z')]
    expect(target(storyA, [])).toBe(target(storyB, []))
  })

  it('the mechanism that WOULD fix it already works — it is simply not declared', () => {
    // Declare the check and the same two stories separate immediately. Phase 2B
    // needs no new approval subsystem, only a declared check and something real
    // to record against it.
    const storyA = [evidenceRow('story_generated', 'aaa', '2026-09-04T10:00:00.000Z')]
    const storyB = [evidenceRow('story_generated', 'bbb', '2026-09-04T11:00:00.000Z')]
    expect(target(storyA, ['story_generated'])).not.toBe(target(storyB, ['story_generated']))
  })

  it('the existing binding is TEMPORAL, not semantic — a known limitation', () => {
    // The gate binds {check_key, result, source, recorded_at}. It does NOT bind
    // payload_hash, so two different stories recorded at the SAME instant collide.
    // Phase 2B must not rely on recorded_at alone.
    const t = '2026-09-04T10:00:00.000Z'
    const a = [evidenceRow('story_generated', 'aaa', t)]
    const b = [evidenceRow('story_generated', 'bbb', t)]
    expect(target(a, ['story_generated'])).toBe(target(b, ['story_generated']))
  })
})

// ── B2. The declared contract ───────────────────────────────────────────────

describe('the story approval contract is declared, not yet wired', () => {
  it('content hash and instance are what distinguish two stories', () => {
    expect([...STORY_IDENTITY_DISTINGUISHING_FIELDS])
      .toEqual(['story_content_hash', 'workflow_instance_id'])
  })

  it('the subject carries the brief and contract it was judged against', () => {
    const subject: StoryApprovalSubject = {
      story_content_hash: 'h', workflow_instance_id: 'i',
      generated_from_brief_hash: 'b', story_contract_version: '1.0',
      story_version: 1, story_id: 's',
    }
    expect(Object.keys(subject).sort()).toEqual([
      'generated_from_brief_hash', 'story_contract_version', 'story_content_hash',
      'story_id', 'story_version', 'workflow_instance_id',
    ].sort())
  })

  it('MUTATION — a human may never manufacture generated or structural facts', () => {
    for (const key of ['story_generated', 'story_structurally_valid']) {
      const c = STORY_APPROVAL_CHECKS.find(x => x.check_key === key)!
      expect(c.allowed_provenance, key).toEqual(['automated'])
      expect(c.allowed_provenance, key).not.toContain('attested')
    }
  })

  it('MUTATION — automated evidence may never manufacture human approval', () => {
    const c = STORY_APPROVAL_CHECKS.find(x => x.check_key === 'story_content_approved')!
    expect(c.allowed_provenance).toEqual(['attested'])
    expect(c.allowed_provenance).not.toContain('automated')
    expect(c.state).toBe('approval_content')
  })

  it('MUTATION — none of them is declared live yet, because none can be satisfied', () => {
    // A REQUIRED check nothing can satisfy is a deadlock, not a safeguard. They
    // become real when StoryV1 does.
    for (const c of STORY_APPROVAL_CHECKS) {
      expect(FAMILJE_STUNDEN_CHECKS.some(d => d.check_key === c.check_key), c.check_key)
        .toBe(false)
    }
    expect(STORY_APPROVAL_PREREQUISITES.length).toBeGreaterThan(0)
  })
})

// ── C. Nothing else moved ───────────────────────────────────────────────────

describe('Phase 2B-0.5 changed no execution surface', () => {
  it('ExecutorFamily is unchanged — still two values', () => {
    const src = require('fs').readFileSync(
      require('path').join(process.cwd(), 'lib/workflows/action-registry.ts'), 'utf8')
    expect(src).toMatch(
      /export type ExecutorFamily = 'read_only_observation' \| 'not_executable'/)
  })

  it('no FINANCIAL or write action became executable', () => {
    for (const kind of ['apply_release_gate_migration', 'upload_protected_artifacts',
                        'send_release_newsletter', 'generate_page_audio'] as const) {
      expect(ACTION_REGISTRY[kind].executor_family).toBe('not_executable')
    }
  })

  it('the release-gate proof placement is untouched', () => {
    expect(ACTION_REGISTRY.observe_release_gate.placements).toEqual([
      { def_key: DEF_KEY, state: 'backend_release_gate' },
      { def_key: 'omnira.release-gate-proof', state: 'proof' },
    ])
  })

  it('v1 def_hash is unchanged — the registered production row still matches', () => {
    expect(v1().def_hash)
      .toBe('eef18502d2de6aa9017b63a7b174f00638fd3dbc9ae74575d13f3040b0dd5f2c')
  })

  it('the human gates on both approval states are still required', () => {
    for (const id of ['content_generation', 'approval_content']) {
      const s = v2().spec.states.find(x => x.id === id)!
      expect(s.human_gate.required, id).toBe(true)
      expect(s.human_gate.approver, id).toBe('editor')
    }
  })
})
