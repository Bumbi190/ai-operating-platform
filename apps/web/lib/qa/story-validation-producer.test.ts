/**
 * lib/qa/story-validation-producer.test.ts — Phase 2B-3A.
 *
 * `story_structurally_valid` gets a producer, and the producer is a SECOND
 * action rather than a second claim by the first one.
 *
 * The properties under test are the ones that make that split worth having:
 * one action still answers one check; the validated story is chosen by identity
 * and never by recency; the handler proves structure without holding a database
 * handle; and a failing validator can never produce a passing row.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'

import { validateMonthlyStoryHandler, VALIDATE_MONTHLY_STORY_CHECK }
  from '@/lib/workflows/handlers/validate-monthly-story'
import {
  projectGeneratedStoryTarget, storyMatchesTarget, GENERATED_STORY_CHECK,
  type GeneratedStoryTarget,
} from '@/lib/workflows/story/generated-target'
import { computeStoryContentHash } from '@/lib/workflows/story/hash'
import { composeMonthlyBrief, computeMonthlyBriefHash } from '@/lib/workflows/brief/compose'
import { readStoryRequirements } from '@/lib/workflows/story/requirements'
import { findVendoredDefinition } from '@/lib/workflows/definitions'
import { ACTION_REGISTRY, isGovernedEffectEnabled } from '@/lib/workflows/action-registry'
import { checkAnsweredBy, discoverReadOnlyActions } from '@/lib/workflows/action-discovery'
import { executableActionKinds } from '@/lib/workflows/action-executor'
import { ensureReadOnlyActionRuns } from '@/lib/workflows/action-scheduling'
import { computeEvidenceTargetHash } from '@/lib/workflows/attestation'
import { FAMILJE_STUNDEN_CHECKS, findCheck }
  from '@/lib/workflows/adapters/familje-stunden/checks'
import type { StoryPage, StoryV1 } from '@/lib/workflows/story/types'
import type { WorkflowEvidence } from '@/lib/workflows/types'

/**
 * Source as the compiler sees it.
 *
 * Every guard below asks what the CODE does. Read raw, they would trip on the
 * prose that explains why a thing is absent — `store.ts` says "deliberately NOT
 * a readLatestStory", and a guard that fails on that sentence is measuring the
 * documentation, not the design.
 */
function code(relPath: string): string {
  return readFileSync(join(process.cwd(), relPath), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

const DEF_KEY = 'familje-stunden.monthly-release'
const STATE = 'content_generation'
const MONTH = '2026-10'
const INSTANCE = 'inst-1'
const NOW = '2026-09-06T09:00:00.000Z'

const canon = () => findVendoredDefinition(DEF_KEY, 2)!.spec.canonical as Record<string, unknown>
const brief = () => composeMonthlyBrief(canon(), MONTH, { defKey: DEF_KEY, defVersion: 2 })
const briefHash = () => computeMonthlyBriefHash(brief())
const reqs = () => readStoryRequirements(canon())

/** A structurally valid saga: cover + 16 content + closing. */
function story(over: Partial<StoryV1> = {}): StoryV1 {
  const pages: StoryPage[] = [
    { page_number: 1, role: 'cover', text: 'Nova och stjärnvinden.' },
  ]
  for (let i = 2; i <= 17; i++) {
    pages.push({ page_number: i, role: 'content', text: 'Nova tittade ut. Pling blinkade.' })
  }
  pages.push({ page_number: 18, role: 'closing', text: 'God natt, Nova.' })
  return {
    schema: 'omnira.story', version: 1,
    workflow_instance_id: INSTANCE,
    month_key: MONTH,
    generated_from_brief_hash: briefHash(),
    story_contract_version: reqs().storyContractVersion,
    character_contract_refs: reqs().characterRefs,
    title: 'Nova och stjärnvinden',
    pages,
    ...over,
  } as StoryV1
}

function evidence(over: Partial<WorkflowEvidence> = {}): WorkflowEvidence {
  const s = story()
  return {
    id: 'ev-1', instance_id: INSTANCE, state: STATE,
    check_key: GENERATED_STORY_CHECK, result: 'pass', source: 'automated',
    detail: {
      story_content_hash: computeStoryContentHash(s),
      brief_hash: briefHash(),
      story_contract_version: reqs().storyContractVersion,
      month_key: MONTH,
    },
    recorded_at: '2026-09-06T08:00:00.000Z',
    producer: null, producer_type: null, observed_at: null,
    payload_hash: null, target_hash: 'a'.repeat(64), attestation: {},
    ...over,
  } as WorkflowEvidence
}

const targetFor = (s: StoryV1): GeneratedStoryTarget => ({
  storyContentHash: computeStoryContentHash(s),
  briefHash: s.generated_from_brief_hash,
  storyContractVersion: s.story_contract_version,
  monthKey: s.month_key,
})

// ── A fake database, enough to drive the real scheduler ────────────────────
const FS_INSTANCE_ID = '00000000-0000-4000-8000-0000000005f0'
const FS_DEF_ID = '00000000-0000-4000-8000-0000000005de'
const fsSpec = JSON.parse(readFileSync(
  join(process.cwd(), `lib/workflows/definitions/${DEF_KEY}.v2.json`), 'utf8'))
const fsInstance = {
  id: FS_INSTANCE_ID, def_id: FS_DEF_ID, def_key: DEF_KEY, def_version: 2,
  def_hash: 'a'.repeat(64), project_id: '00000000-0000-4000-8000-0000000000b1',
  instance_key: MONTH, current_state: STATE, status: 'active',
  wake_at: null, last_tick_at: null, last_tick_outcome: null,
  created_at: '2026-01-01T00:00:00.000Z', closed_at: null,
}
const pinFor = (checkKey: string) => computeEvidenceTargetHash({
  instance: fsInstance as never, spec: fsSpec, state: STATE,
  checkKey, sourceCommit: null, artifactManifestHash: null,
})
const PIN_GENERATED = pinFor('story_generated')
const PIN_VALID = pinFor('story_structurally_valid')

const evRow = (checkKey: string, result: string, targetHash: string | null) => ({
  id: `ev-${checkKey}`, instance_id: FS_INSTANCE_ID, state: STATE, check_key: checkKey,
  result, source: 'automated', detail: {}, recorded_at: '2026-09-06T08:00:00.000Z',
  producer: null, producer_type: null, observed_at: null, payload_hash: null,
  target_hash: targetHash, attestation: {},
})

function schedulerDb(f: { evidence?: unknown[]; priorRuns?: unknown[] }) {
  const inserted: { table: string; row: Record<string, unknown> }[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resolve = (q: Record<string, any>) => {
    switch (q._table) {
      case 'workflow_instances': return { data: fsInstance, error: null }
      case 'projects': return { data: { execution_paused: false }, error: null }
      case 'workflow_defs':
        return { data: { id: FS_DEF_ID, def_key: DEF_KEY, version: 2, spec: fsSpec,
                         def_hash: 'a'.repeat(64) }, error: null }
      case 'workflow_evidence': return { data: f.evidence ?? [], error: null }
      case 'runs': return { data: f.priorRuns ?? [], error: null }
      default: return { data: null, error: null }
    }
  }
  const db = { from(table: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: Record<string, any> = { _table: table }
    const self = () => q
    q.select = self; q.eq = self; q.not = self; q.order = self; q.limit = self
    q.insert = (r: Record<string, unknown>) => { inserted.push({ table, row: r }); return q }
    q.maybeSingle = async () => resolve(q)
    q.single = async () => resolve(q)
    q.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
      Promise.resolve(resolve(q)).then(ok, bad)
    return q
  } }
  return { db, inserted }
}

function handlerInput(over: Record<string, unknown> = {}) {
  const s = story()
  return {
    instanceKey: MONTH, state: STATE, defKey: DEF_KEY, defVersion: 2, now: NOW,
    readGeneratedStory: async () => ({
      ok: true as const, target: targetFor(s), story: s, storedHash: computeStoryContentHash(s),
    }),
    ...over,
  } as never
}

// ── A. Which story, and how it is chosen ────────────────────────────────────

describe('A. the target comes from evidence, never from recency', () => {
  it('A1 — projects the identity the generation action recorded', () => {
    const p = projectGeneratedStoryTarget([evidence()], STATE)
    expect(p.ok).toBe(true)
    if (!p.ok) return
    expect(p.target.storyContentHash).toBe(computeStoryContentHash(story()))
    expect(p.target.briefHash).toBe(briefHash())
    expect(p.target.monthKey).toBe(MONTH)
  })

  it('A2 — a regeneration moves the target to the newest generated fact', () => {
    const older = evidence({ id: 'ev-old', recorded_at: '2026-09-01T00:00:00.000Z' })
    const newer = evidence({
      id: 'ev-new', recorded_at: '2026-09-06T08:30:00.000Z',
      detail: { ...evidence().detail, story_content_hash: 'b'.repeat(64) },
    })
    // Order shuffled: the rule is recorded_at, not array position.
    const p = projectGeneratedStoryTarget([newer, older], STATE)
    expect(p.ok).toBe(true)
    if (p.ok) expect(p.target.storyContentHash).toBe('b'.repeat(64))
  })

  it('A3 — no generated fact means no target, not a guess', () => {
    const p = projectGeneratedStoryTarget([], STATE)
    expect(p.ok).toBe(false)
    if (!p.ok) expect(p.refusal).toBe('no_generated_story_evidence')
  })

  it('A4 — a FAILED generation names no story to validate', () => {
    const p = projectGeneratedStoryTarget([evidence({ result: 'fail' })], STATE)
    expect(p.ok).toBe(false)
    if (!p.ok) expect(p.refusal).toBe('no_generated_story_evidence')
  })

  it('A5 — an ATTESTED row cannot point the validator at bytes of its choosing', () => {
    // `story_generated` is declared automated-only; this refuses to depend on
    // that being enforced elsewhere.
    const p = projectGeneratedStoryTarget([evidence({ source: 'attested' })], STATE)
    expect(p.ok).toBe(false)
  })

  it('A6 — evidence from another state is not this state\'s target', () => {
    const p = projectGeneratedStoryTarget([evidence({ state: 'planning' })], STATE)
    expect(p.ok).toBe(false)
  })

  it('A7 — a malformed detail is refused, and says which field', () => {
    for (const field of ['story_content_hash', 'brief_hash', 'story_contract_version', 'month_key']) {
      const d = { ...evidence().detail } as Record<string, unknown>
      delete d[field]
      const p = projectGeneratedStoryTarget([evidence({ detail: d })], STATE)
      expect(p.ok, field).toBe(false)
      if (!p.ok) {
        expect(p.refusal).toBe('generated_evidence_detail_malformed')
        expect(p.detail).toContain(field)
      }
    }
  })

  it('A8 — a hash that is not a hash is refused, not coerced', () => {
    const p = projectGeneratedStoryTarget(
      [evidence({ detail: { ...evidence().detail, story_content_hash: 'latest' } })], STATE)
    expect(p.ok).toBe(false)
  })

  it('A9 — MUTATION: no "latest story" accessor exists on any path', () => {
    for (const f of ['lib/workflows/story/store.ts',
                     'lib/workflows/story/generated-target.ts',
                     'lib/workflows/handlers/validate-monthly-story.ts',
                     'lib/workflows/action-executor.ts']) {
      const src = code(f)
      expect(src, f).not.toMatch(/readLatestStory/)
      // Nor a revision-ordered pick, which is the same mistake wearing a number.
      expect(src, f).not.toMatch(/order\(\s*['"]revision_number/)
    }
  })
})

// ── B. Is this story the one that was named ─────────────────────────────────

describe('B. identity is verified, not assumed', () => {
  it('B1 — the named story matches', () => {
    const s = story()
    expect(storyMatchesTarget(s, computeStoryContentHash(s), targetFor(s), INSTANCE)).toBeNull()
  })

  it('B2 — every field of the identity is load-bearing', () => {
    const s = story()
    const h = computeStoryContentHash(s)
    const t = targetFor(s)
    expect(storyMatchesTarget(s, h, t, 'another-instance')).toBe('instance_mismatch')
    expect(storyMatchesTarget(s, 'c'.repeat(64), t, INSTANCE)).toBe('content_hash_mismatch')
    expect(storyMatchesTarget(s, h, { ...t, briefHash: 'd'.repeat(64) }, INSTANCE))
      .toBe('brief_hash_mismatch')
    expect(storyMatchesTarget(s, h, { ...t, storyContractVersion: '9.9' }, INSTANCE))
      .toBe('contract_version_mismatch')
    expect(storyMatchesTarget(s, h, { ...t, monthKey: '2026-11' }, INSTANCE))
      .toBe('month_mismatch')
  })

  it('B3 — story A cannot be validated under story B\'s identity', () => {
    const a = story()
    const b = story({ title: 'En annan saga' })
    expect(computeStoryContentHash(a)).not.toBe(computeStoryContentHash(b))
    // Story A's bytes, story B's declared identity.
    expect(storyMatchesTarget(a, computeStoryContentHash(a), targetFor(b), INSTANCE))
      .toBe('content_hash_mismatch')
  })
})

// ── C. The handler ──────────────────────────────────────────────────────────

describe('C. the validation observation', () => {
  it('C1 — a valid story passes, bound to its exact hash', async () => {
    const out = await validateMonthlyStoryHandler(handlerInput())
    expect(out.result).toBe('pass')
    expect(out.checkKey).toBe('story_structurally_valid')
    expect(out.detail.story_content_hash).toBe(computeStoryContentHash(story()))
    expect(out.detail.brief_hash).toBe(briefHash())
    expect(out.detail.failures).toBe('none')
    // Nothing external was consulted. That is the point of this action.
    expect(out.authoritativeSystem).toBeNull()
  })

  it('C2 — an INVALID story fails; it never passes', async () => {
    // Over the hard maximum on one content page; everything else untouched.
    const pages = story().pages.map((p, i) =>
      i === 5 ? { ...p, text: 'En. Två. Tre. Fyra. Fem.' } : p)
    const bad = story({ pages })
    const out = await validateMonthlyStoryHandler(handlerInput({
      readGeneratedStory: async () => ({
        ok: true as const, target: targetFor(bad), story: bad,
        storedHash: computeStoryContentHash(bad),
      }),
    }))
    expect(out.result).toBe('fail')
    expect(out.result).not.toBe('pass')
    expect(Number(out.detail.failure_count)).toBeGreaterThan(0)
    expect(String(out.detail.failures)).toContain('sentence')
  })

  it('C3 — no story to validate is BLOCKED, never a pass', async () => {
    const out = await validateMonthlyStoryHandler(handlerInput({
      readGeneratedStory: async () => ({
        ok: false as const, refusal: 'story_not_found', detail: 'no stored story' }),
    }))
    expect(out.result).toBe('blocked')
    expect(out.detail.error_kind).toBe('story_not_found')
  })

  it('C4 — an unwired capability is an ERROR, never a pass', async () => {
    const out = await validateMonthlyStoryHandler(handlerInput({ readGeneratedStory: undefined }))
    expect(out.result).toBe('error')
    expect(out.detail.error_kind).toBe('read_capability_missing')
  })

  it('C5 — a story that is not the named one is refused', async () => {
    const a = story()
    const b = story({ title: 'En annan saga' })
    const out = await validateMonthlyStoryHandler(handlerInput({
      // Story A's bytes handed back under story B's identity.
      readGeneratedStory: async () => ({
        ok: true as const, target: targetFor(b), story: a,
        storedHash: computeStoryContentHash(a),
      }),
    }))
    expect(out.result).toBe('error')
    expect(out.detail.error_kind).toBe('content_hash_mismatch')
  })

  it('C6 — a brief that has drifted blocks rather than fails', async () => {
    const drifted = story({ generated_from_brief_hash: 'e'.repeat(64) })
    const out = await validateMonthlyStoryHandler(handlerInput({
      readGeneratedStory: async () => ({
        ok: true as const, target: targetFor(drifted), story: drifted,
        storedHash: computeStoryContentHash(drifted),
      }),
    }))
    // "I cannot judge this" — not "this is invalid".
    expect(out.result).toBe('blocked')
    expect(out.detail.error_kind).toBe('brief_drifted')
  })

  it('C7 — an unvendored definition errors before judging anything', async () => {
    const out = await validateMonthlyStoryHandler(handlerInput({ defVersion: 99 }))
    expect(out.result).toBe('error')
    expect(out.detail.error_kind).toBe('definition_not_vendored')
  })

  it('C8 — the detail carries facts, never the saga text', async () => {
    const out = await validateMonthlyStoryHandler(handlerInput())
    const blob = JSON.stringify(out.detail)
    expect(blob).not.toContain('Nova tittade ut')
    expect(blob).not.toContain('God natt')
    for (const v of Object.values(out.detail)) {
      expect(['string', 'number', 'boolean', 'object']).toContain(typeof v)
    }
  })

  it('C9 — MUTATION: the handler holds no database handle and writes nothing', () => {
    const src = code('lib/workflows/handlers/validate-monthly-story.ts')
    expect(src).not.toMatch(/createAdminClient|createClient|from\('/)
    expect(src).not.toMatch(/recordEvidence/)
    expect(src).not.toMatch(/insert|update|delete|upsert/)
    // And it does not reach the network.
    expect(src).not.toMatch(/fetch\(|axios|https?:\/\//)
  })

  it('C10 — MUTATION: it reuses the canonical validator, not a copy', () => {
    const src = code('lib/workflows/handlers/validate-monthly-story.ts')
    expect(src).toMatch(/import \{ validateStory \} from '\.\.\/story\/validate'/)
    // No second opinion about structure, and no subjective judgement at all.
    expect(src).not.toMatch(/countSentences|pages\.length !==|role !==/)
    for (const word of ['charm', 'quality', 'age_appropriate', 'tone', 'voice', 'sentiment']) {
      expect(src.toLowerCase()).not.toContain(word)
    }
  })
})

// ── D. One action, one check ────────────────────────────────────────────────

describe('D. the 1:1 invariant survived', () => {
  it('D1 — declared READ_ONLY, read-only family, at content_generation', () => {
    const m = ACTION_REGISTRY.validate_monthly_story
    expect(m.action_class).toBe('READ_ONLY')
    expect(m.executor_family).toBe('read_only_observation')
    expect(m.placements).toEqual([{ def_key: DEF_KEY, state: STATE }])
    expect(isGovernedEffectEnabled('validate_monthly_story')).toBe(false)
  })

  it('D2 — it answers exactly one check, and not the neighbouring ones', () => {
    expect(checkAnsweredBy('validate_monthly_story')).toBe(VALIDATE_MONTHLY_STORY_CHECK)
    expect(checkAnsweredBy('validate_monthly_story')).toBe('story_structurally_valid')
    expect(checkAnsweredBy('validate_monthly_story')).not.toBe('story_generated')
    expect(checkAnsweredBy('validate_monthly_story')).not.toBe('story_content_approved')
    // And generation still answers only its own.
    expect(checkAnsweredBy('generate_monthly_story')).toBe('story_generated')
  })

  it('D3 — no check is answered by two actions', () => {
    const mapped = Object.keys(ACTION_REGISTRY)
      .map(k => checkAnsweredBy(k)).filter((c): c is string => c !== null)
    expect(new Set(mapped).size).toBe(mapped.length)
  })

  it('D4 — the approval remains a human\'s, attested-only', () => {
    const approval = findCheck('approval_content', 'story_content_approved')
    expect(approval?.allowed_provenance).toEqual(['attested'])
    // No action may answer it.
    for (const k of Object.keys(ACTION_REGISTRY)) {
      expect(checkAnsweredBy(k), k).not.toBe('story_content_approved')
    }
  })

  it('D5 — both story facts are automated-only and required', () => {
    for (const key of ['story_generated', 'story_structurally_valid']) {
      const c = FAMILJE_STUNDEN_CHECKS.find(x => x.check_key === key && x.state === STATE)
      expect(c, key).toBeDefined()
      expect(c!.allowed_provenance, key).toEqual(['automated'])
      expect(c!.required, key).toBe(true)
    }
  })

  it('D6 — the executable surface grew by one, and it is READ_ONLY', () => {
    const kinds = executableActionKinds()
    expect(kinds).toContain('validate_monthly_story')
    for (const k of kinds) {
      expect(ACTION_REGISTRY[k as keyof typeof ACTION_REGISTRY].action_class, k).toBe('READ_ONLY')
    }
  })

  it('D7 — no Familje-Stunden effect became enabled', () => {
    for (const k of ['apply_release_gate_migration', 'generate_page_audio',
                     'send_release_newsletter', 'upload_protected_artifacts']) {
      expect(isGovernedEffectEnabled(k), k).toBe(false)
      expect(ACTION_REGISTRY[k as keyof typeof ACTION_REGISTRY].executor_family, k)
        .toBe('not_executable')
    }
  })
})

// ── E. Discovery and scheduling ─────────────────────────────────────────────

describe('E. it becomes schedulable through the existing lane', () => {
  it('E1 — discovered at content_generation; generation is not', () => {
    const found = discoverReadOnlyActions(DEF_KEY, STATE).map(a => a.actionKind)
    expect(found).toEqual(['validate_monthly_story'])
    // The governed effect is deliberately invisible to the read-only scheduler.
    expect(found).not.toContain('generate_monthly_story')
  })

  it('E2 — it carries the check the scheduler asks about', () => {
    const found = discoverReadOnlyActions(DEF_KEY, STATE)
    expect(found[0].checkKey).toBe('story_structurally_valid')
    expect(found[0].actionClass).toBe('READ_ONLY')
  })

  it('E3 — MUTATION: no second scheduler was introduced', () => {
    const src = code('lib/workflows/action-scheduling.ts')
    // One discovery call, one creation site — unchanged by this phase.
    expect(src.match(/discoverReadOnlyActions\(/g)?.length).toBe(1)
    expect(src.match(/createWorkflowActionRun\(/g)?.length).toBe(1)
  })

  it('E3b — a satisfied check creates NO new run: it cannot spin', async () => {
    // Behavioural, not a source scan. A guard that merely MENTIONS
    // `already_satisfied` survives being disabled with `if (false && …)`; only
    // running the scheduler proves the effect. Without this, repeated ticks
    // after a successful validation would create a run every time.
    const { db, inserted } = schedulerDb({
      evidence: [
        evRow('story_generated', 'pass', PIN_GENERATED),
        evRow('story_structurally_valid', 'pass', PIN_VALID),
      ],
    })
    const decisions = await ensureReadOnlyActionRuns(db as never, fsInstance as never)
    const d = decisions.find(x => x.actionKind === 'validate_monthly_story')
    expect(d?.outcome).toBe('already_satisfied')
    expect(inserted.filter(i => i.table === 'runs')).toHaveLength(0)
  })

  it('E3c — and it is the SATISFIED evidence that stops it, not a blanket refusal', async () => {
    // The other half of E3b. Without the satisfying row the outcome is something
    // else entirely, which is what proves E3b was produced by the guard rather
    // than by scheduling being broken.
    //
    // It is not `created` here: `content_generation` also requires
    // `story_page_count`, a pre-existing ATTESTED artifact check from the
    // runbook that no automation may answer. So the honest assertion is the
    // discriminating one — the satisfied path short-circuits at the evidence
    // stage, and the unsatisfied path does not.
    const { db, inserted } = schedulerDb({
      evidence: [evRow('story_generated', 'pass', PIN_GENERATED)],
    })
    const decisions = await ensureReadOnlyActionRuns(db as never, fsInstance as never)
    const d = decisions.find(x => x.actionKind === 'validate_monthly_story')
    expect(d?.outcome).not.toBe('already_satisfied')
    expect(d?.blockingCheckKeys).toContain('story_page_count')
    // Still no run — blocked, not spinning.
    expect(inserted.filter(i => i.table === 'runs')).toHaveLength(0)
  })

  it('E3d — the attested page-count check is NOT answerable by automation', () => {
    // Named explicitly because it sits at the same state and gates the same
    // work. It predates this phase and stays a human/runbook attestation.
    const c = FAMILJE_STUNDEN_CHECKS.find(
      x => x.check_key === 'story_page_count' && x.state === STATE)
    expect(c?.allowed_provenance).toEqual(['attested'])
    for (const k of Object.keys(ACTION_REGISTRY)) {
      expect(checkAnsweredBy(k), k).not.toBe('story_page_count')
    }
  })

  it('E4 — MUTATION: action-executor.ts is still the sole evidence writer', () => {
    const src = code('lib/workflows/action-executor.ts')
    expect(src.match(/await recordEvidence\(/g)?.length).toBe(2)
    const others = ['lib/workflows/handlers/validate-monthly-story.ts',
                    'lib/workflows/story/generated-target.ts',
                    'lib/workflows/effect/story-handler.ts']
    for (const f of others) {
      expect(code(f), f).not.toMatch(/recordEvidence/)
    }
  })

  it('E5 — MUTATION: the read capability is narrow, not a table handle', () => {
    const src = code('lib/workflows/handlers/types.ts')
    // A closure returning one answer — never a client the handler could steer.
    expect(src).toMatch(/readGeneratedStory\?: \(\) => Promise<GeneratedStoryRead>/)
    // `db?:` is a database handle just as much as `db:` is — the optional form
    // is how one would actually be slipped in. Both are refused, along with any
    // client type or `any` escape hatch.
    expect(src).not.toMatch(/\bdb\??\s*:/)
    expect(src).not.toMatch(/SupabaseClient|AnyDb|: any\b/)
    // Every field on the contract is a scalar, a closure, or a typed union.
    expect(src).not.toMatch(/client|supabase|from\(/i)
    // The executor resolves it by exact hash, never by scanning.
    const exec = code('lib/workflows/action-executor.ts')
    expect(exec).toMatch(/readStoryByHash\(/)
  })
})

// ── F. The three facts agree on one story ───────────────────────────────────

describe('F. content_generation facts bind to one hash', () => {
  it('F1 — generation and validation name the same story', async () => {
    const s = story()
    const h = computeStoryContentHash(s)
    const gen = projectGeneratedStoryTarget([evidence()], STATE)
    expect(gen.ok).toBe(true)
    const val = await validateMonthlyStoryHandler(handlerInput())
    if (gen.ok) expect(val.detail.story_content_hash).toBe(gen.target.storyContentHash)
    expect(val.detail.story_content_hash).toBe(h)
  })

  it('F2 — a regenerated story requires fresh validation', async () => {
    const a = story()
    const b = story({ title: 'Nova och månskuggan' })
    const hb = computeStoryContentHash(b)
    expect(computeStoryContentHash(a)).not.toBe(hb)

    // Evidence now names B. A validation of A is about a hash the workflow no
    // longer points at — nothing has to remember to invalidate it.
    const gen = projectGeneratedStoryTarget([
      evidence(),
      evidence({ id: 'ev-2', recorded_at: '2026-09-06T08:45:00.000Z',
        detail: { ...evidence().detail, story_content_hash: hb } }),
    ], STATE)
    expect(gen.ok).toBe(true)
    if (gen.ok) expect(gen.target.storyContentHash).toBe(hb)

    const validationOfA = await validateMonthlyStoryHandler(handlerInput())
    expect(validationOfA.detail.story_content_hash).not.toBe(hb)
  })

  it('F3 — a validation row can never be read as an approval', async () => {
    const out = await validateMonthlyStoryHandler(handlerInput())
    expect(out.checkKey).not.toBe('story_content_approved')
    // The executor hardcodes `source: 'automated'` for handler evidence, so this
    // row cannot acquire a producer and masquerade as an Editor's decision.
    const exec = code('lib/workflows/action-executor.ts')
    expect(exec.match(/source: 'automated'/g)?.length).toBe(2)
  })

  it('F4 — the validator version travels with the verdict', async () => {
    const out = await validateMonthlyStoryHandler(handlerInput())
    expect(String(out.detail.validator_version)).toMatch(/^\d+\.\d+$/)
  })
})
