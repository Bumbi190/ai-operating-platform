/**
 * lib/qa/story-provider-wiring.test.ts — Phase 2B-3.
 *
 * The real provider and the real handler, offline.
 *
 * Only `getAnthropic` is replaced. Everything else runs: the instruction is
 * really rendered, the response is really parsed, the story is really bound and
 * normalised, the revision is really persisted and the validator really judges
 * it. What is mocked is the network, not the logic — a suite that mocked the
 * handler's own steps would prove only that the mocks agree with each other.
 *
 * NOTHING here reaches Anthropic. `getAnthropic` is replaced before the modules
 * under test are imported, so there is no path from this file to a paid call.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// ── The only mock: the client itself ────────────────────────────────────────
const getAnthropicSpy = vi.fn()
/** What the fake client's `messages.create` will do next. */
let respond: (params: Record<string, unknown>) => Promise<unknown> = async () => ({
  content: [{ type: 'text', text: JSON.stringify(goodStory()) }],
})
const createSpy = vi.fn()

vi.mock('@/lib/ai/anthropic', () => ({
  getAnthropic: (ctx: Record<string, unknown>) => {
    getAnthropicSpy(ctx)
    return {
      messages: {
        create: (params: Record<string, unknown>) => {
          createSpy(params)
          return respond(params)
        },
      },
    }
  },
}))

const { generateMonthlyStoryHandler, GENERATE_MONTHLY_STORY_CHECK } =
  await import('@/lib/workflows/effect/story-handler')
const { anthropicStoryProvider, STORY_MODEL, STORY_MAX_TOKENS } =
  await import('@/lib/workflows/story/anthropic-provider')
const { readStoryRequirements, StoryRequirementsError } =
  await import('@/lib/workflows/story/requirements')
const { buildStoryPromptContract } = await import('@/lib/workflows/story/prompt')
const { composeMonthlyBrief, computeMonthlyBriefHash } =
  await import('@/lib/workflows/brief/compose')
const { findVendoredDefinition } = await import('@/lib/workflows/definitions')
const { ProviderNotDispatchedError } = await import('@/lib/cost/governed-spend')
const { computeStoryContentHash } = await import('@/lib/workflows/story/hash')
const { EFFECT_HANDLERS } = await import('@/lib/workflows/effect/effect-handlers')
const { GOVERNED_EFFECT_ENABLED_KINDS } = await import('@/lib/workflows/action-registry')
const { checkAnsweredBy } = await import('@/lib/workflows/action-discovery')
const { spendBoundaryOwnerFor } = await import('@/lib/workflows/effect/spend-boundary')

const DEF_KEY = 'familje-stunden.monthly-release'
const MONTH = '2026-10'
const INSTANCE_ID = 'inst-story-1'
const IDEM = 'idem-run-abc'
const canon = () => findVendoredDefinition(DEF_KEY, 2)!.spec.canonical as Record<string, unknown>
const brief = () => composeMonthlyBrief(canon(), MONTH, { defKey: DEF_KEY, defVersion: 2 })
const reqs = () => readStoryRequirements(canon())

/** 18 pages: cover + 16 content + closing, each within the sentence bound. */
function goodStory() {
  const pages: { page_number: number; role: string; text: string }[] = [
    { page_number: 1, role: 'cover', text: 'Nova och stjärnvinden.' },
  ]
  for (let i = 2; i <= 17; i++) {
    pages.push({ page_number: i, role: 'content', text: `Nova tittade ut. Pling blinkade.` })
  }
  pages.push({ page_number: 18, role: 'closing', text: 'God natt, Nova.' })
  return { title: 'Nova och stjärnvinden', pages }
}

// ── A fake `workflow_stories` table ─────────────────────────────────────────
function makeDb(opts: { failInsert?: boolean } = {}) {
  const rows: Record<string, unknown>[] = []
  const db = {
    from: (table: string) => {
      if (table !== 'workflow_stories') throw new Error(`unexpected table ${table}`)
      return {
        select: (_cols: string, o?: { count?: string; head?: boolean }) => {
          const filters: Record<string, unknown> = {}
          const chain: Record<string, unknown> = {
            eq: (k: string, v: unknown) => { filters[k] = v; return chain },
            maybeSingle: async () => ({
              data: rows.find(r => Object.entries(filters).every(([k, v]) => r[k] === v)) ?? null,
            }),
            single: async () => ({ data: rows[rows.length - 1], error: null }),
            then: undefined,
          }
          if (o?.count) {
            // `select('id', { count, head })` is awaited directly.
            return Object.assign(
              Promise.resolve({
                count: rows.filter(r =>
                  Object.entries(filters).every(([k, v]) => r[k] === v)).length,
              }),
              chain)
          }
          return chain
        },
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              if (opts.failInsert) return { data: null, error: { message: 'insert refused' } }
              const stored = { id: `row-${rows.length + 1}`, ...row }
              rows.push(stored)
              return { data: stored, error: null }
            },
          }),
        }),
      }
    },
  }
  return { db: db as never, rows }
}

function handlerInput(over: Record<string, unknown> = {}) {
  return {
    runId: 'run-1', claimId: 'claim-1', projectId: 'proj-1',
    instanceId: INSTANCE_ID, instanceKey: MONTH, state: 'content_generation',
    defKey: DEF_KEY, defVersion: 2, defHash: 'd'.repeat(64),
    targetVersionHash: 't'.repeat(64), attemptGroup: 'grp-1',
    idempotencyKey: IDEM,
    execution: { context: 'AUTONOMOUS', scope: { kind: 'project', projectId: 'proj-1' } },
    now: '2026-09-05T10:00:00.000Z',
    db: makeDb().db,
    beforeDispatch: async () => {},
    ...over,
  } as never
}

beforeEach(() => {
  getAnthropicSpy.mockClear(); createSpy.mockClear()
  respond = async () => ({ content: [{ type: 'text', text: JSON.stringify(goodStory()) }] })
})

// ── A. The provider ─────────────────────────────────────────────────────────

describe('A. the Anthropic story provider', () => {
  const contract = () => buildStoryPromptContract({
    brief: brief(), storyContractVersion: reqs().storyContractVersion,
    characterRefs: reqs().characterRefs,
    maxContentSentences: reqs().maxContentSentences,
    targetSentencesMin: reqs().targetSentencesMin,
    targetSentencesMax: reqs().targetSentencesMax,
  })
  const provider = () => anthropicStoryProvider({
    projectId: 'proj-1', execution: { context: 'AUTONOMOUS', scope: {} } as never,
    idempotencyKey: IDEM, runId: 'run-1',
  })

  it('A1 — goes through getAnthropic, exactly once', async () => {
    await provider().generate(contract())
    expect(getAnthropicSpy).toHaveBeenCalledTimes(1)
    expect(createSpy).toHaveBeenCalledTimes(1)
  })

  it('A2 — carries the run identity as the reservation key', async () => {
    await provider().generate(contract())
    const ctx = getAnthropicSpy.mock.calls[0][0]
    // The whole point of 2B-2.6: the client's own reservation is keyed by THIS
    // run, so a retry of one intent cannot take a second reservation.
    expect(ctx.idempotencyKey).toBe(IDEM)
    expect(ctx.runId).toBe('run-1')
    expect(ctx.execution).toBeDefined()
    expect(ctx.project).toEqual({ projectId: 'proj-1' })
    expect(ctx.operation).toBe('generate_monthly_story')
  })

  it('A3 — uses the model from the closed map, with a bounded output', async () => {
    await provider().generate(contract())
    const p = createSpy.mock.calls[0][0]
    expect(p.model).toBe('claude-sonnet-4-6')
    expect(STORY_MODEL).toBe('claude-sonnet-4-6')
    expect(p.max_tokens).toBe(STORY_MAX_TOKENS)
  })

  it('A4 — awaits beforeDispatch BEFORE the irreversible call', async () => {
    const order: string[] = []
    createSpy.mockImplementation(() => order.push('dispatch'))
    await provider().generate(contract(), async () => { order.push('checkpoint') })
    expect(order).toEqual(['checkpoint', 'dispatch'])
    createSpy.mockImplementation(() => {})
  })

  it('A5 — a refusing checkpoint stops the dispatch entirely', async () => {
    await expect(provider().generate(contract(), async () => { throw new Error('STOPPED') }))
      .rejects.toThrow('STOPPED')
    expect(createSpy).not.toHaveBeenCalled()
  })

  it('A6 — every contract value reaches the instruction', async () => {
    await provider().generate(contract())
    const text = String(createSpy.mock.calls[0][0].messages[0].content)
    const c = contract()
    expect(text).toContain(c.month_key)
    expect(text).toContain(c.theme)
    expect(text).toContain(String(c.structure.total_pages))
    expect(text).toContain(String(c.structure.content_pages))
    expect(text).toContain(String(c.audience.min_age))
    expect(text).toContain(String(c.content_page_sentences.hard_max))
    for (const rule of c.required_rules) expect(text).toContain(rule)
    for (const ref of c.character_contract_refs) {
      expect(text).toContain(ref.contract_path)
      expect(text).toContain(ref.contract_version)
    }
  })

  it('A7 — unwraps a fenced JSON block', async () => {
    respond = async () => ({
      content: [{ type: 'text', text: '```json\n' + JSON.stringify(goodStory()) + '\n```' }],
    })
    const raw = await provider().generate(contract())
    expect((raw as { title: string }).title).toBe('Nova och stjärnvinden')
  })

  it('A8 — unparseable output is handed back, never repaired', async () => {
    respond = async () => ({ content: [{ type: 'text', text: 'Det var en gång…' }] })
    const raw = await provider().generate(contract())
    // A string, not an invented object. Normalisation refuses it downstream.
    expect(typeof raw).toBe('string')
  })
})

// ── B. The handler ──────────────────────────────────────────────────────────

describe('B. the governed story handler', () => {
  it('B1 — happy path: confirmed, persisted, and the reservation is proved', async () => {
    const { db, rows } = makeDb()
    const out = await generateMonthlyStoryHandler(handlerInput({ db }))
    expect(out.observation).toBe('remote_confirmed')
    expect(out.provablyNotApplied).toBe(false)
    expect(out.checkKey).toBe('story_generated')
    // The ownership claim the executor verifies against the run's identity.
    expect(out.spendReservedUnderKey).toBe(IDEM)
    expect(rows).toHaveLength(1)
    expect(rows[0].story_content_hash).toBe(out.remoteOperationId)
    expect(out.evidenceDetail?.structurally_valid).toBe(true)
  })

  it('B2 — the story is bound locally; the provider cannot name its own binding', async () => {
    respond = async () => ({
      content: [{
        type: 'text',
        text: JSON.stringify({
          ...goodStory(),
          // All forged. None may survive.
          workflow_instance_id: 'someone-elses-instance',
          month_key: '2099-12',
          generated_from_brief_hash: 'f'.repeat(64),
          story_contract_version: '99.0',
        }),
      }],
    })
    const { db, rows } = makeDb()
    await generateMonthlyStoryHandler(handlerInput({ db }))
    const stored = rows[0].story as Record<string, unknown>
    expect(stored.workflow_instance_id).toBe(INSTANCE_ID)
    expect(stored.month_key).toBe(MONTH)
    expect(stored.generated_from_brief_hash).toBe(computeMonthlyBriefHash(brief()))
    expect(stored.story_contract_version).toBe(reqs().storyContractVersion)
  })

  it('B3 — an unusable answer is a confirmed failure, not an ambiguity', async () => {
    respond = async () => ({ content: [{ type: 'text', text: 'inte en saga' }] })
    const { db, rows } = makeDb()
    const out = await generateMonthlyStoryHandler(handlerInput({ db }))
    expect(out.observation).toBe('remote_rejected')
    // It WAS billed, so it is not provably unapplied — the boundary must settle.
    expect(out.provablyNotApplied).toBe(false)
    expect(out.spendReservedUnderKey).toBe(IDEM)
    expect(rows).toHaveLength(0)
    expect(out.evidenceDetail?.story_persisted).toBe(false)
  })

  it('B4 — a proven non-dispatch releases and claims nothing', async () => {
    respond = async () => { throw new ProviderNotDispatchedError('bad request', 'anthropic') }
    const { db, rows } = makeDb()
    const out = await generateMonthlyStoryHandler(handlerInput({ db }))
    expect(out.observation).toBe('not_dispatched')
    expect(out.provablyNotApplied).toBe(true)
    // Nothing was reserved that this handler must prove.
    expect(out.spendReservedUnderKey).toBeUndefined()
    expect(rows).toHaveLength(0)
  })

  it('B5 — an unclassified throw is ambiguity, never a clean failure', async () => {
    respond = async () => { throw new Error('socket hang up') }
    const { db } = makeDb()
    const out = await generateMonthlyStoryHandler(handlerInput({ db }))
    // response_lost ⇒ UNKNOWN ⇒ reconciliation, never an automatic retry.
    expect(out.observation).toBe('response_lost')
    expect(out.provablyNotApplied).toBe(false)
    expect(out.spendReservedUnderKey).toBe(IDEM)
  })

  it('B6 — generated but unstorable is its own outcome', async () => {
    const { db } = makeDb({ failInsert: true })
    const out = await generateMonthlyStoryHandler(handlerInput({ db }))
    expect(out.observation).toBe('confirmed_evidence_failed')
    expect(out.provablyNotApplied).toBe(false)
    expect(out.evidenceDetail?.error_kind).toBe('persist_failed')
  })

  it('B7 — a structurally INVALID story is still persisted, and says so', async () => {
    const bad = goodStory()
    bad.pages[5].text = 'En. Två. Tre. Fyra. Fem.'      // over the hard max
    respond = async () => ({ content: [{ type: 'text', text: JSON.stringify(bad) }] })
    const { db, rows } = makeDb()
    const out = await generateMonthlyStoryHandler(handlerInput({ db }))
    // The dispatch succeeded and we paid for it: the revision is kept.
    expect(out.observation).toBe('remote_confirmed')
    expect(rows).toHaveLength(1)
    expect(out.evidenceDetail?.structurally_valid).toBe(false)
    expect(String(out.evidenceDetail?.validation_failures)).toContain('sentence')
  })

  it('B8 — it never claims story_structurally_valid, whatever the verdict', async () => {
    const { db } = makeDb()
    const ok = await generateMonthlyStoryHandler(handlerInput({ db }))
    expect(ok.checkKey).toBe('story_generated')
    expect(ok.checkKey).not.toBe('story_structurally_valid')
    // And the executor could not record it under this run even if it tried:
    // an automated row is bound to the ONE check its action kind answers.
    expect(checkAnsweredBy('generate_monthly_story')).toBe('story_generated')
  })

  it('B9 — identical bytes do not create a second revision', async () => {
    const { db, rows } = makeDb()
    const a = await generateMonthlyStoryHandler(handlerInput({ db }))
    const b = await generateMonthlyStoryHandler(handlerInput({ db }))
    expect(rows).toHaveLength(1)
    expect(b.remoteOperationId).toBe(a.remoteOperationId)
    expect(b.evidenceDetail?.story_revision_created).toBe(false)
    expect(b.observation).toBe('remote_confirmed')
  })

  it('B10 — a contract that yields no requirements never reaches the provider', async () => {
    const { db } = makeDb()
    // v1 has no story contract; composing a v2 brief from it must refuse.
    const out = await generateMonthlyStoryHandler(handlerInput({ db, defVersion: 1 }))
    expect(out.observation).toBe('not_dispatched')
    expect(out.provablyNotApplied).toBe(true)
    expect(createSpy).not.toHaveBeenCalled()
  })

  it('B11 — an unvendored definition never reaches the provider', async () => {
    const { db } = makeDb()
    const out = await generateMonthlyStoryHandler(handlerInput({ db, defVersion: 99 }))
    expect(out.observation).toBe('not_dispatched')
    expect(out.evidenceDetail?.error_kind).toBe('definition_not_vendored')
    expect(createSpy).not.toHaveBeenCalled()
  })

  it('B12 — a month the contract does not name never reaches the provider', async () => {
    const { db } = makeDb()
    const out = await generateMonthlyStoryHandler(handlerInput({ db, instanceKey: '2031-04' }))
    expect(out.observation).toBe('not_dispatched')
    expect(out.provablyNotApplied).toBe(true)
    expect(createSpy).not.toHaveBeenCalled()
  })

  it('B13 — a stop committing before dispatch is a REFUSAL, not an ambiguity', async () => {
    // The defect this caught: the stop was classified as `response_lost`, which
    // means "we may have spent money and cannot say what happened". It also
    // claimed a reservation that was never taken. A governance STOP must cost
    // nothing and open no reconciliation.
    const { db, rows } = makeDb()
    const stop = async () => { throw new Error('governed effect halted before dispatch: stopped') }
    const out = await generateMonthlyStoryHandler(handlerInput({ db, beforeDispatch: stop }))
    expect(out.observation).toBe('not_dispatched')
    expect(out.provablyNotApplied).toBe(true)
    expect(out.spendReservedUnderKey).toBeUndefined()
    expect(out.evidenceDetail?.error_kind).toBe('halted_before_dispatch')
    expect(createSpy).not.toHaveBeenCalled()
    expect(rows).toHaveLength(0)
  })

  it('B13b — a client that cannot be built is also a refusal, not an ambiguity', async () => {
    // `getAnthropic` throwing (a missing credential, a governance refusal)
    // happens AFTER the checkpoint and BEFORE any request. Both sides of that
    // line are proved here, because only the second may claim spend.
    getAnthropicSpy.mockImplementationOnce(() => { throw new Error('no credential') })
    const { db, rows } = makeDb()
    const out = await generateMonthlyStoryHandler(handlerInput({ db }))
    expect(out.observation).toBe('not_dispatched')
    expect(out.provablyNotApplied).toBe(true)
    expect(out.spendReservedUnderKey).toBeUndefined()
    expect(rows).toHaveLength(0)
  })

  it('B14 — the persisted provenance names the real provider and model', async () => {
    const { db, rows } = makeDb()
    await generateMonthlyStoryHandler(handlerInput({ db }))
    expect(rows[0].provider).toBe('anthropic')
    expect(rows[0].model).toBe('claude-sonnet-4-6')
    expect(rows[0].run_id).toBe('run-1')
    expect(rows[0].status).toBe('candidate')
  })

  it('B15 — the stored hash is recomputable from the stored story', async () => {
    const { db, rows } = makeDb()
    await generateMonthlyStoryHandler(handlerInput({ db }))
    expect(computeStoryContentHash(rows[0].story as never))
      .toBe(rows[0].story_content_hash)
  })
})

// ── C. The requirements reader ──────────────────────────────────────────────

describe('C. story requirements come from the pinned contract', () => {
  it('C1 — reads the real v2 contract', () => {
    const r = reqs()
    expect(r.storyContractVersion).toBe('1.0')
    expect(r.maxContentSentences).toBe(3)
    expect(r.characterRefs.map(c => c.character).sort()).toEqual(['nova', 'pling'])
  })

  it('C2 — refuses rather than defaulting, for every key it reads', () => {
    const base = canon()
    const broken: Record<string, unknown>[] = [
      { ...base, story_contract: undefined },
      { ...base, story_contract: { path: 'x' } },
      { ...base, character_contracts: [] },
      { ...base, character_contracts: [{ character: 'nova' }] },
      { ...base, content_page_text: undefined },
      { ...base, content_page_text: { target_sentences_min: 1, target_sentences_max: 2 } },
      // Incoherent: a target range that exceeds its own hard maximum.
      { ...base, content_page_text: { target_sentences_min: 1, target_sentences_max: 5, hard_max_sentences: 3 } },
      { ...base, content_page_text: { target_sentences_min: 3, target_sentences_max: 1, hard_max_sentences: 3 } },
    ]
    for (const c of broken) {
      expect(() => readStoryRequirements(c), JSON.stringify(c.content_page_text ?? c.story_contract))
        .toThrow(StoryRequirementsError)
    }
  })
})

// ── D. The wiring ───────────────────────────────────────────────────────────

describe('D. exactly one effect was enabled', () => {
  it('D1 — the handler map matches the allowlist', () => {
    expect(Object.keys(EFFECT_HANDLERS).sort())
      .toEqual([...GOVERNED_EFFECT_ENABLED_KINDS].sort())
  })

  it('D2 — the adapter owns the boundary, and the executor takes nothing', () => {
    expect(spendBoundaryOwnerFor('generate_monthly_story')).toBe('trusted_adapter')
  })

  it('D3 — the check constant and the map agree', () => {
    expect(GENERATE_MONTHLY_STORY_CHECK).toBe('story_generated')
    expect(checkAnsweredBy('generate_monthly_story')).toBe(GENERATE_MONTHLY_STORY_CHECK)
  })

  it('D4 — MUTATION: no second Anthropic door was cut', () => {
    for (const f of ['lib/workflows/story/anthropic-provider.ts',
                     'lib/workflows/effect/story-handler.ts']) {
      const src = readFileSync(join(process.cwd(), f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      expect(src, f).not.toMatch(/new Anthropic\s*\(/)
      expect(src, f).not.toMatch(/withGovernedSpend\s*\(/)
      expect(src, f).not.toMatch(/provablyNotBilled/)
      expect(src, f).not.toMatch(/process\.env\.ANTHROPIC/)
    }
  })

  it('D5 — MUTATION: the model is not caller- or env-configurable', () => {
    const src = readFileSync(
      join(process.cwd(), 'lib/workflows/story/anthropic-provider.ts'), 'utf8')
    expect(src).toMatch(/export const STORY_MODEL = 'claude-sonnet-4-6' as const/)
    expect(src).not.toMatch(/model:\s*(input|ctx|opts)\./)
  })
})
