/**
 * lib/qa/story-v1.test.ts — Phase 2B-2: the first governed creative artefact.
 *
 * The properties that matter are about IDENTITY and AUTHORITY: that a story is
 * exactly its words, that an approval of one story can never carry to another,
 * and that a provider answering successfully proves nothing on its own.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'

import { findVendoredDefinition } from '@/lib/workflows/definitions'
import { composeMonthlyBrief, computeMonthlyBriefHash } from '@/lib/workflows/brief/compose'
import { computeStoryContentHash, storyContentPayload } from '@/lib/workflows/story/hash'
import { validateStory, countSentences, STORY_VALIDATOR_VERSION }
  from '@/lib/workflows/story/validate'
import { normalizeStoryResponse } from '@/lib/workflows/story/provider'
import { StoryShapeError, type StoryV1 } from '@/lib/workflows/story/types'
import { buildStoryPromptContract, computeStoryPromptHash, STORY_PROMPT_CONTRACT_VERSION }
  from '@/lib/workflows/story/prompt'
import { fakeStoryProvider, FAKE_STORY_SCENARIOS, type FakeStoryScenario }
  from '@/lib/workflows/story/fake-provider'
import { assessStoryProgression } from '@/lib/workflows/story/progression'
import { computeStoryApprovalTarget } from '@/lib/workflows/approval/story-approval-target'
import { computeExecutionAuthorizationTarget, WORKFLOW_EXECUTION_TARGET_TYPE }
  from '@/lib/workflows/effect/execution-authorization'
import { WORKFLOW_GATE_TARGET_TYPE } from '@/lib/workflows/gate'
import {
  ACTION_REGISTRY, GOVERNED_EFFECT_ENABLED_KINDS, isGovernedEffectEnabled,
  assertRegistryMatchesDefinition,
} from '@/lib/workflows/action-registry'
import { ACTION_CLASS_POLICY } from '@/lib/workflows/action-target'
import { FAMILJE_STUNDEN_CHECKS } from '@/lib/workflows/adapters/familje-stunden/checks'
import { ProviderNotDispatchedError } from '@/lib/cost/governed-spend'

const DEF_KEY = 'familje-stunden.monthly-release'
const MONTH = '2026-10'
const v2 = () => findVendoredDefinition(DEF_KEY, 2)!
const canon = () => v2().spec.canonical as Record<string, any>
const brief = () => composeMonthlyBrief(canon(), MONTH, { defKey: DEF_KEY, defVersion: 2 })
const briefHash = () => computeMonthlyBriefHash(brief())
const MAX_SENT = () => canon().content_page_text.hard_max_sentences as number

const REFS = [
  { character: 'nova', contract_path: 'docs/creative/NOVA_CHARACTER_CONTRACT.md',
    contract_version: '0.1-draft' },
  { character: 'pling', contract_path: 'docs/creative/PLING_CHARACTER_CONTRACT.md',
    contract_version: '0.1-draft' },
]

const promptContract = () => buildStoryPromptContract({
  brief: brief(), storyContractVersion: '1.0', characterRefs: REFS,
  maxContentSentences: MAX_SENT(), targetSentencesMin: 1, targetSentencesMax: 2,
})

const binding = () => ({
  workflowInstanceId: 'inst-1', monthKey: MONTH, briefHash: briefHash(),
  storyContractVersion: '1.0', characterRefs: REFS,
})

async function storyFrom(scenario: FakeStoryScenario): Promise<StoryV1> {
  const raw = await fakeStoryProvider(scenario).generate(promptContract())
  return normalizeStoryResponse(raw, binding())
}

const ctx = () => ({ brief: brief(), briefHash: briefHash(), maxContentSentences: MAX_SENT() })

// ── A. Story identity ───────────────────────────────────────────────────────

describe('a story is exactly its words', () => {
  it('composes and hashes deterministically', async () => {
    const a = await storyFrom('valid')
    const b = await storyFrom('valid')
    expect(computeStoryContentHash(a)).toBe(computeStoryContentHash(b))
  })

  it('MUTATION — changing one page of text changes the identity', async () => {
    const s = await storyFrom('valid')
    const base = computeStoryContentHash(s)
    const edited: StoryV1 = {
      ...s,
      pages: s.pages.map((p, i) => (i === 5 ? { ...p, text: p.text + ' Ett ord till.' } : p)),
    }
    expect(computeStoryContentHash(edited)).not.toBe(base)
  })

  it('MUTATION — changing the title changes the identity', async () => {
    const s = await storyFrom('valid')
    expect(computeStoryContentHash({ ...s, title: 'Annan titel' }))
      .not.toBe(computeStoryContentHash(s))
  })

  it('changing a page ROLE changes the identity, even with identical text', async () => {
    const s = await storyFrom('valid')
    const moved: StoryV1 = {
      ...s, pages: s.pages.map(p => (p.page_number === 2 ? { ...p, role: 'closing' as const } : p)),
    }
    expect(computeStoryContentHash(moved)).not.toBe(computeStoryContentHash(s))
  })

  it('MUTATION — provenance is NOT part of the identity', async () => {
    // A model change that produces identical words must not invalidate an
    // approval: the Editor approved the story, not the machine.
    const s = await storyFrom('valid')
    const payload = storyContentPayload(s)
    for (const forbidden of ['provider', 'model', 'prompt_contract_version',
                             'created_at', 'run_id', 'id', 'revision_number', 'status']) {
      expect(Object.keys(payload), forbidden).not.toContain(forbidden)
    }
  })

  it('page order cannot be changed by reordering the array', async () => {
    const s = await storyFrom('valid')
    const shuffled: StoryV1 = { ...s, pages: [...s.pages].reverse() }
    expect(computeStoryContentHash(shuffled)).toBe(computeStoryContentHash(s))
  })

  it('binds the exact brief and contract it was written against', async () => {
    const s = await storyFrom('valid')
    expect(s.generated_from_brief_hash).toBe(briefHash())
    expect(s.story_contract_version).toBe('1.0')
    expect(s.character_contract_refs.map(r => r.character).sort()).toEqual(['nova', 'pling'])
  })

  it('MUTATION — a different brief produces a different story identity', async () => {
    const s = await storyFrom('valid')
    const other: StoryV1 = { ...s, generated_from_brief_hash: createHash('sha256')
      .update('other').digest('hex') }
    expect(computeStoryContentHash(other)).not.toBe(computeStoryContentHash(s))
  })

  it('carries no character identity, only pinned references', async () => {
    const s = await storyFrom('valid')
    const blob = JSON.stringify(s.character_contract_refs)
    for (const forbidden of [/ponytail|hästsvans/i, /antenn/i, /visor|visir/i, /blue|blå/i]) {
      expect(blob, String(forbidden)).not.toMatch(forbidden)
    }
  })
})

// ── B. Provider output is untrusted ─────────────────────────────────────────

describe('provider success is not story success', () => {
  it('MUTATION — a non-object answer is rejected', async () => {
    const raw = await fakeStoryProvider('malformed_json').generate(promptContract())
    expect(() => normalizeStoryResponse(raw, binding())).toThrow(StoryShapeError)
  })

  it('rejects a malformed page shape rather than coercing it', () => {
    for (const bad of [
      { title: 't', pages: 'no' },
      { title: 't', pages: [{ page_number: 'x', role: 'cover', text: 'a' }] },
      { title: 't', pages: [{ page_number: 1, role: 'nope', text: 'a' }] },
      { title: 't', pages: [{ page_number: 1, role: 'cover', text: 5 }] },
      { pages: [] },
    ]) {
      expect(() => normalizeStoryResponse(bad, binding())).toThrow(StoryShapeError)
    }
  })

  it('MUTATION — the bindings come from us, never from the provider', async () => {
    // A provider that could name its own brief hash could claim to have
    // satisfied requirements it never saw.
    const raw = await fakeStoryProvider('valid').generate(promptContract()) as
      Record<string, unknown>
    const forged = { ...raw, generated_from_brief_hash: 'f'.repeat(64),
                     workflow_instance_id: 'other', story_contract_version: '9.9' }
    const s = normalizeStoryResponse(forged, binding())
    expect(s.generated_from_brief_hash).toBe(briefHash())
    expect(s.workflow_instance_id).toBe('inst-1')
    expect(s.story_contract_version).toBe('1.0')
  })

  it('a well-formed answer can still fail validation', async () => {
    const s = await storyFrom('wrong_page_count')
    const r = validateStory(s, ctx(), computeStoryContentHash(s))
    expect(r.valid).toBe(false)
    expect(r.failures.map(f => f.code)).toContain('page_count_wrong')
  })
})

// ── C. Structural validation ────────────────────────────────────────────────

describe('structural QA checks what a machine can honestly check', () => {
  it('accepts a story that satisfies the contract', async () => {
    const s = await storyFrom('valid')
    const r = validateStory(s, ctx(), computeStoryContentHash(s))
    expect(r.failures, JSON.stringify(r.failures)).toHaveLength(0)
    expect(r.valid).toBe(true)
    expect(r.validatorVersion).toBe(STORY_VALIDATOR_VERSION)
  })

  it('MUTATION — 18 CONTENT pages is rejected', async () => {
    const s = await storyFrom('valid')
    const all: StoryV1 = { ...s, pages: s.pages.map(p => ({ ...p, role: 'content' as const })) }
    const r = validateStory(all, ctx(), computeStoryContentHash(all))
    expect(r.valid).toBe(false)
    expect(r.failures.map(f => f.code)).toContain('role_count_wrong')
  })

  it('MUTATION — 17 or 19 total pages is rejected', async () => {
    const s = await storyFrom('valid')
    for (const pages of [s.pages.slice(0, 17),
                         [...s.pages, { page_number: 19, role: 'content' as const, text: 'X.' }]]) {
      const bad: StoryV1 = { ...s, pages }
      const r = validateStory(bad, ctx(), computeStoryContentHash(bad))
      expect(r.valid).toBe(false)
      expect(r.failures.map(f => f.code)).toContain('page_count_wrong')
    }
  })

  it('MUTATION — more than the canonical maximum sentences is rejected', async () => {
    const s = await storyFrom('too_many_sentences')
    const r = validateStory(s, ctx(), computeStoryContentHash(s))
    expect(r.valid).toBe(false)
    expect(r.failures.map(f => f.code)).toContain('sentences_over_maximum')
  })

  it('MUTATION — an empty title is rejected', async () => {
    const s = await storyFrom('empty_title')
    const r = validateStory(s, ctx(), computeStoryContentHash(s))
    expect(r.valid).toBe(false)
    expect(r.failures.map(f => f.code)).toContain('title_missing')
  })

  it('rejects a declared hash that does not match the content', async () => {
    const s = await storyFrom('valid')
    const r = validateStory(s, ctx(), 'a'.repeat(64))
    expect(r.failures.map(f => f.code)).toContain('content_hash_mismatch')
  })

  it('rejects a story naming a different brief', async () => {
    const s = await storyFrom('valid')
    const wrong: StoryV1 = { ...s, generated_from_brief_hash: 'b'.repeat(64) }
    const r = validateStory(wrong, ctx(), computeStoryContentHash(wrong))
    expect(r.failures.map(f => f.code)).toContain('brief_hash_mismatch')
  })

  it('rejects empty page text, wrong role positions and gaps', async () => {
    const s = await storyFrom('valid')
    const empty: StoryV1 = { ...s,
      pages: s.pages.map((p, i) => (i === 3 ? { ...p, text: '  ' } : p)) }
    expect(validateStory(empty, ctx(), computeStoryContentHash(empty))
      .failures.map(f => f.code)).toContain('page_text_empty')

    const gap: StoryV1 = { ...s,
      pages: s.pages.map((p, i) => (i === 3 ? { ...p, page_number: 99 } : p)) }
    expect(validateStory(gap, ctx(), computeStoryContentHash(gap))
      .failures.map(f => f.code)).toContain('page_numbers_not_contiguous')
  })

  it('counts sentences as a BOUND, and says so', () => {
    expect(countSentences('En mening.')).toBe(1)
    expect(countSentences('Ett. Två. Tre.')).toBe(3)
    expect(countSentences('Hej! Vad kul? Ja...')).toBeGreaterThanOrEqual(3)
    expect(countSentences('   ')).toBe(0)
  })

  it('MUTATION — the validator claims no subjective judgement', () => {
    const src = readFileSync(join(process.cwd(), 'lib/workflows/story/validate.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    for (const forbidden of [/age.?appropriate/i, /quality/i, /charm/i, /tone/i,
                             /in.?character/i, /good\s+swedish/i]) {
      expect(src, String(forbidden)).not.toMatch(forbidden)
    }
  })
})

// ── D. Prompt contract ──────────────────────────────────────────────────────

describe('the prompt renders canon, it never states it', () => {
  it('is deterministic and versioned', () => {
    expect(computeStoryPromptHash(promptContract()))
      .toBe(computeStoryPromptHash(promptContract()))
    expect(promptContract().prompt_contract_version).toBe(STORY_PROMPT_CONTRACT_VERSION)
  })

  it('every product value comes from the brief', () => {
    const c = promptContract()
    const b = brief()
    expect(c.language).toBe(b.language)
    expect(c.audience).toEqual({ min_age: b.audience.min_age, max_age: b.audience.max_age })
    expect(c.structure.content_pages).toBe(b.page_structure.content_pages)
    expect(c.theme).toBe(b.theme)
  })

  it('MUTATION — no product rule is typed into the prompt module', () => {
    const src = readFileSync(join(process.cwd(), 'lib/workflows/story/prompt.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(src).not.toMatch(/\b18\b|\b16\b/)
    expect(src).not.toMatch(/'sv'/)
    expect(src).not.toMatch(/ponytail|hästsvans|antenn/i)
  })

  it('references character identity rather than describing it', () => {
    const c = promptContract()
    expect(c.character_contract_refs).toEqual(REFS)
    expect(JSON.stringify(c)).not.toMatch(/hair|hår|robot|blue|blå/i)
  })

  it('names the rules it requires', () => {
    expect(promptContract().required_rules).toContain('no_forced_moral')
    expect(promptContract().required_rules).toContain('safety_contract')
    expect(promptContract().required_rules).toContain('character_identity_from_contracts_only')
  })
})

// ── E. The generation action ────────────────────────────────────────────────

describe('generation is governed, and not yet enabled', () => {
  it('is FINANCIAL on the class table, not by label', () => {
    expect(ACTION_REGISTRY.generate_monthly_story.action_class).toBe('FINANCIAL')
    const p = ACTION_CLASS_POLICY.FINANCIAL
    expect(p.requiresAuthorization).toBe(true)
    expect(p.requiresSpendEnforcement).toBe(true)
    expect(p.requiresPreCommitRevalidation).toBe(true)
    expect(p.requiresIdempotency).toBe(true)
    expect(p.maxAttempts).toBe(1)
  })

  it('uses the governed-effect family', () => {
    expect(ACTION_REGISTRY.generate_monthly_story.executor_family).toBe('governed_effect')
  })

  it('MUTATION — it is NOT enabled: no real dispatch is authorised yet', () => {
    expect(isGovernedEffectEnabled('generate_monthly_story')).toBe(false)
    expect([...GOVERNED_EFFECT_ENABLED_KINDS]).toEqual(['proof_governed_effect'])
  })

  it('is placed only at content_generation', () => {
    expect(ACTION_REGISTRY.generate_monthly_story.placements).toEqual([
      { def_key: DEF_KEY, state: 'content_generation' },
    ])
  })

  it('the registry still matches every definition — no v3 was needed', () => {
    expect(assertRegistryMatchesDefinition()).toEqual([])
  })

  it('MUTATION — every downstream FS effectful action is still inert', () => {
    for (const k of ['generate_page_audio', 'apply_release_gate_migration',
                     'upload_protected_artifacts', 'send_release_newsletter'] as const) {
      expect(ACTION_REGISTRY[k].executor_family, k).toBe('not_executable')
    }
  })
})

// ── F. Authorization separation ─────────────────────────────────────────────

describe('three different permissions, three different targets', () => {
  const execIn = {
    instanceId: 'inst-1', defKey: DEF_KEY, defVersion: 2, defHash: v2().def_hash,
    state: 'content_generation', actionKind: 'generate_monthly_story',
    actionClass: 'FINANCIAL' as const, targetVersionHash: 'c'.repeat(64),
    attemptGroup: 'grp-1',
  }
  const apprIn = {
    instanceId: 'inst-1', state: 'approval_content', storyContentHash: 'd'.repeat(64),
    briefHash: briefHash(), storyContractVersion: '1.0',
  }

  it('MUTATION — a gate grant cannot execute generation', () => {
    expect(computeExecutionAuthorizationTarget(execIn).targetType)
      .toBe(WORKFLOW_EXECUTION_TARGET_TYPE)
    expect(WORKFLOW_EXECUTION_TARGET_TYPE).not.toBe(WORKFLOW_GATE_TARGET_TYPE)
  })

  it('MUTATION — a story-approval grant cannot execute generation', () => {
    expect(computeStoryApprovalTarget(apprIn).targetType)
      .not.toBe(computeExecutionAuthorizationTarget(execIn).targetType)
  })

  it('MUTATION — an execution grant cannot approve a story', () => {
    const exec = computeExecutionAuthorizationTarget(execIn)
    const appr = computeStoryApprovalTarget(apprIn)
    expect(exec.targetType).not.toBe(appr.targetType)
    expect(exec.versionHash).not.toBe(appr.versionHash)
  })

  it('MUTATION — a changed input identity invalidates the execution grant', () => {
    const a = computeExecutionAuthorizationTarget(execIn)
    const b = computeExecutionAuthorizationTarget({ ...execIn, targetVersionHash: 'e'.repeat(64) })
    expect(a.versionHash).not.toBe(b.versionHash)
  })
})

// ── G. Regeneration safety ──────────────────────────────────────────────────

describe('an approval names one story and only that story', () => {
  const A = 'a'.repeat(64), B = 'b'.repeat(64)

  it('MUTATION — Story B cannot reuse Story A approval', () => {
    const base = { instanceId: 'i', state: 'approval_content',
                   briefHash: briefHash(), storyContractVersion: '1.0' }
    expect(computeStoryApprovalTarget({ ...base, storyContentHash: A }).versionHash)
      .not.toBe(computeStoryApprovalTarget({ ...base, storyContentHash: B }).versionHash)
  })

  it('MUTATION — Story B cannot reuse Story A validation', () => {
    expect(assessStoryProgression({
      generatedHash: B, structurallyValidatedHash: A, approvedHash: A }).mayProgress).toBe(false)
  })

  it('MUTATION — approval of A cannot pass B through the boundary', () => {
    const v = assessStoryProgression({
      generatedHash: B, structurallyValidatedHash: B, approvedHash: A })
    expect(v.mayProgress).toBe(false)
    expect(v.blockers).toContain('story_hash_disagreement')
  })

  it('progresses only when all three name the same story', () => {
    const v = assessStoryProgression({
      generatedHash: A, structurallyValidatedHash: A, approvedHash: A })
    expect(v.mayProgress).toBe(true)
    expect(v.agreedHash).toBe(A)
  })

  it('a missing fact blocks — absence is never satisfaction', () => {
    expect(assessStoryProgression({
      generatedHash: null, structurallyValidatedHash: A, approvedHash: A }).blockers)
      .toContain('story_not_generated')
    expect(assessStoryProgression({
      generatedHash: A, structurallyValidatedHash: A, approvedHash: null }).blockers)
      .toContain('story_not_approved')
  })

  it('MUTATION — there is no latest-story shortcut anywhere', () => {
    // Comments stripped: both modules DISCUSS the shortcut in order to explain
    // why it does not exist, and a guard that cannot tell an explanation from an
    // implementation would force the explanation out of the file.
    const code = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    for (const f of ['lib/workflows/story/store.ts', 'lib/workflows/story/progression.ts']) {
      expect(code(f), f).not.toMatch(/readLatestStory|latestStory|getLatest/)
    }
  })
})

// ── H. Evidence provenance ──────────────────────────────────────────────────

describe('three facts, three parties', () => {
  const find = (k: string, s: string) =>
    FAMILJE_STUNDEN_CHECKS.find(c => c.check_key === k && c.state === s)!

  it('MUTATION — a human cannot attest that a story was generated or is valid', () => {
    for (const k of ['story_generated', 'story_structurally_valid']) {
      const c = find(k, 'content_generation')
      expect(c, k).toBeDefined()
      expect(c.allowed_provenance, k).toEqual(['automated'])
      expect(c.required, k).toBe(true)
    }
  })

  it('MUTATION — automation cannot approve content', () => {
    const c = find('story_content_approved', 'approval_content')
    expect(c).toBeDefined()
    expect(c.allowed_provenance).toEqual(['attested'])
    expect(c.required).toBe(true)
  })

  it('approval_content is no longer a state that binds nothing', () => {
    // Phase 2B-0.5 proved it declared zero checks, so a grant there named no
    // story. It now declares exactly the Editor decision.
    expect(FAMILJE_STUNDEN_CHECKS.filter(c => c.state === 'approval_content')
      .map(c => c.check_key)).toEqual(['story_content_approved'])
  })
})

// ── I. The fake provider is inert ───────────────────────────────────────────

describe('the fake provider costs nothing and reaches nothing', () => {
  const src = () => readFileSync(
    join(process.cwd(), 'lib/workflows/story/fake-provider.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('MUTATION — names no network, credential or provider SDK', () => {
    for (const f of [/fetch\(/, /process\.env/, /anthropic|openai|@ai-sdk/i, /api[_-]?key/i]) {
      expect(src(), String(f)).not.toMatch(f)
    }
  })

  it('covers every failure mode the governance must survive', () => {
    expect([...FAKE_STORY_SCENARIOS].sort()).toEqual([
      'ambiguous_dispatch', 'confirmed_then_persistence_failure', 'empty_title',
      'malformed_json', 'not_dispatched', 'remote_rejected', 'too_many_sentences',
      'valid', 'wrong_page_count',
    ])
  })

  it('MUTATION — only the local refusal claims it was never dispatched', async () => {
    await expect(fakeStoryProvider('not_dispatched').generate(promptContract()))
      .rejects.toBeInstanceOf(ProviderNotDispatchedError)
    // An ambiguous loss must NOT make that claim — it is exactly the case where
    // the remote may have acted.
    await expect(fakeStoryProvider('ambiguous_dispatch').generate(promptContract()))
      .rejects.not.toBeInstanceOf(ProviderNotDispatchedError)
  })

  it('the last refusal chance is awaited before the notional dispatch', async () => {
    let called = false
    await fakeStoryProvider('valid').generate(promptContract(), () => { called = true })
    expect(called).toBe(true)
    await expect(fakeStoryProvider('valid')
      .generate(promptContract(), () => { throw new Error('stopped') })).rejects.toThrow('stopped')
  })
})

// ── J. The store's contract, read from its migration ────────────────────────

describe('the store is append-only by construction', () => {
  const sql = () => readFileSync(join(process.cwd(),
    'supabase/migrations/20260904120000_workflow_stories.sql'), 'utf8')

  it('MUTATION — content and provenance are immutable at the database', () => {
    expect(sql()).toMatch(/workflow_stories_append_only/)
    expect(sql()).toMatch(/story_content_hash is distinct from old\.story_content_hash/)
    expect(sql()).toMatch(/append-only/)
  })

  it('rows are never deleted', () => {
    expect(sql()).toMatch(/workflow_stories_no_delete/)
    expect(sql()).toMatch(/never deleted; supersede instead/)
  })

  it('identity is unique per instance', () => {
    expect(sql()).toMatch(/create unique index[\s\S]*?workflow_stories_identity_idx[\s\S]*?\(workflow_instance_id, story_content_hash\)/)
  })

  it('the store exposes no update-content verb', () => {
    const store = readFileSync(join(process.cwd(), 'lib/workflows/story/store.ts'), 'utf8')
    expect(store).not.toMatch(/updateStory|editStory|replaceStory/)
    // The one update that exists touches status only.
    expect(store).toMatch(/\.update\(\{ status: 'superseded' \}\)/)
  })

  it('the migration is additive — it creates, never drops a table', () => {
    expect(sql()).not.toMatch(/drop table|alter table [a-z_.]+ drop column/i)
  })
})
