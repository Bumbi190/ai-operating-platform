/**
 * lib/qa/monthly-brief.test.ts — Phase 2A: the canonical Monthly Brief.
 *
 * The brief is an INPUT CONTRACT: every later production state will be measured
 * against it, and a generation action will bind to its hash. So the properties
 * under test are not "does it return an object" but "can anything other than the
 * pinned canonical contract change what it says".
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

import { composeMonthlyBrief, computeMonthlyBriefHash } from '../workflows/brief/compose'
import {
  MONTHLY_BRIEF_SCHEMA, MONTHLY_BRIEF_VERSION, MonthlyBriefContractError,
} from '../workflows/brief/types'
import { composeMonthlyBriefHandler, COMPOSE_MONTHLY_BRIEF_CHECK }
  from '../workflows/handlers/compose-monthly-brief'
import { computeReleaseInstant } from '../workflows/adapters/familje-stunden/instant'
import { findVendoredDefinition } from '../workflows/definitions'
import { ACTION_REGISTRY } from '../workflows/action-registry'
import { executableActionKinds } from '../workflows/action-executor'
import { FAMILJE_STUNDEN_CHECKS } from '../workflows/adapters/familje-stunden/checks'

const DEF_KEY = 'familje-stunden.monthly-release'
// v2 is the first version carrying story authority. v1 declares no page structure
// at all, which is why composition against it is refused — see the suite below.
const DEF_VERSION = 2
const IDENTITY = { defKey: DEF_KEY, defVersion: DEF_VERSION }
const NOW = '2026-09-04T12:00:00.000Z'

const vendored = findVendoredDefinition(DEF_KEY, DEF_VERSION)!
const CANON = vendored.spec.canonical
/** A month the canonical contract actually declares. */
const MONTH = '2026-10'

const composeSrc = readFileSync(join(process.cwd(), 'lib/workflows/brief/compose.ts'), 'utf8')
const handlerSrc = readFileSync(join(process.cwd(), 'lib/workflows/handlers/compose-monthly-brief.ts'), 'utf8')
const typesSrc = readFileSync(join(process.cwd(), 'lib/workflows/brief/types.ts'), 'utf8')

/**
 * Strip comments so a source guard asserts about CODE, not about prose. The
 * modules deliberately DISCUSS the literals and the overrides they refuse to
 * accept, and a guard that could not tell an explanation from an implementation
 * would force the explanations out of the files.
 */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const composeCode = code(composeSrc)
const handlerCode = code(handlerSrc)
const typesCode = code(typesSrc)

// ── Composition against the real contract ───────────────────────────────────

describe('the brief is derived from the canonical contract', () => {
  it('composes a canonical month', () => {
    const b = composeMonthlyBrief(CANON, MONTH, IDENTITY)
    expect(b.schema).toBe(MONTHLY_BRIEF_SCHEMA)
    expect(b.version).toBe(MONTHLY_BRIEF_VERSION)
    expect(b.month_key).toBe(MONTH)
    expect(b.def_key).toBe(DEF_KEY)
    expect(b.def_version).toBe(DEF_VERSION)
  })

  it('reads the theme from the canonical table, not from anywhere else', () => {
    const themes = CANON.year_order_2026 as Record<string, string>
    for (const month of Object.keys(themes)) {
      expect(composeMonthlyBrief(CANON, month, IDENTITY).theme).toBe(themes[month])
    }
  })

  it('reads the page counts from canonical, never a literal in the source', () => {
    const b = composeMonthlyBrief(CANON, MONTH, IDENTITY)
    expect(b.ebook_pages).toBe(CANON.ebook_pages)
    expect(b.page_audio_clips).toBe(CANON.page_audio_clips)
    expect(b.page_structure).toEqual(CANON.page_structure)
    // The number 18 must not be typed into the brief modules at all.
    for (const src of [composeCode, typesCode, handlerCode]) {
      expect(src).not.toMatch(/\b18\b/)
    }
  })

  it('carries the canonical voice contract verbatim, settings included', () => {
    const v = CANON.voice as Record<string, unknown>
    const b = composeMonthlyBrief(CANON, MONTH, IDENTITY)
    expect(b.voice.id).toBe(v.id)
    expect(b.voice.name).toBe(v.name)
    expect(b.voice.model).toBe(v.model)
    expect(b.voice.format).toBe(v.format)
    expect(b.voice.settings).toEqual(v.settings)
    // No voice identity may be retyped in the source.
    expect(composeCode).not.toContain(v.id as string)
    expect(handlerCode).not.toContain(v.id as string)
  })

  it('carries no creative content — requirement, never generated output', () => {
    const b = composeMonthlyBrief(CANON, MONTH, IDENTITY) as unknown as Record<string, unknown>
    for (const forbidden of ['story', 'prompt', 'prompts', 'copy', 'caption',
                             'image_description', 'marketing', 'text', 'pages_text']) {
      expect(Object.keys(b)).not.toContain(forbidden)
    }
    expect(Object.keys(b).sort()).toEqual([
      'def_key', 'def_version', 'ebook_pages', 'month_key', 'page_audio_clips',
      'page_structure', 'release_at_utc', 'schema', 'theme', 'version', 'voice',
    ])
  })
})

// ── Refusals: the contract is never completed by guesswork ───────────────────

describe('a contract that cannot answer is refused, never guessed', () => {
  it('rejects a non-canonical month format', () => {
    for (const bad of ['2026-13', '202610', '2026-1', 'oktober', '', '2026-00', '2026-10-01']) {
      expect(() => composeMonthlyBrief(CANON, bad, IDENTITY)).toThrow(MonthlyBriefContractError)
    }
  })

  it('rejects a well-formed month the theme table does not declare', () => {
    expect(() => composeMonthlyBrief(CANON, '2027-03', IDENTITY))
      .toThrow(/declares no theme/)
    try {
      composeMonthlyBrief(CANON, '2027-03', IDENTITY)
    } catch (e) {
      expect((e as MonthlyBriefContractError).reason).toBe('month_not_in_contract')
    }
  })

  it('refuses rather than picking a winner when the page counts disagree', () => {
    const broken = { ...CANON, page_audio_clips: (CANON.ebook_pages as number) + 1 }
    expect(() => composeMonthlyBrief(broken, MONTH, IDENTITY)).toThrow(/must agree/)
  })

  it('MUTATION — refuses a contract that declares no page structure', () => {
    // Workflow definition v1 is exactly this contract. It has no story authority,
    // so it cannot say how many pages a generator writes, and the composer must
    // refuse rather than reach for `ebook_pages` — which is the TOTAL.
    const v1 = findVendoredDefinition(DEF_KEY, 1)!
    expect(v1.spec.canonical.page_structure).toBeUndefined()
    expect(() => composeMonthlyBrief(v1.spec.canonical, MONTH, { defKey: DEF_KEY, defVersion: 1 }))
      .toThrow(/declares no page structure/)
  })

  it('MUTATION — refuses a page structure whose parts do not sum to the total', () => {
    const broken = {
      ...CANON,
      page_structure: { total_pages: 18, cover_pages: 1, content_pages: 18, closing_pages: 1 },
    }
    expect(() => composeMonthlyBrief(broken, MONTH, IDENTITY)).toThrow(/!= 18/)
  })

  it('MUTATION — refuses when the artefact counts disagree with the total', () => {
    const broken = { ...CANON, ebook_pages: 20, page_audio_clips: 20 }
    expect(() => composeMonthlyBrief(broken, MONTH, IDENTITY)).toThrow(/must equal/)
  })

  it('refuses a missing or malformed canonical field', () => {
    const cases: Record<string, unknown>[] = [
      { ...CANON, year_order_2026: undefined },
      { ...CANON, ebook_pages: '18' },
      { ...CANON, ebook_pages: 0 },
      { ...CANON, ebook_pages: 18.5 },
      { ...CANON, page_structure: undefined },
      { ...CANON, page_structure: { total_pages: 18, cover_pages: 1, content_pages: 16 } },
      { ...CANON, voice: undefined },
      { ...CANON, voice: { ...(CANON.voice as object), settings: undefined } },
      { ...CANON, voice: { ...(CANON.voice as object), id: '' } },
    ]
    for (const c of cases) {
      expect(() => composeMonthlyBrief(c, MONTH, IDENTITY)).toThrow(MonthlyBriefContractError)
    }
  })
})

// ── Determinism and identity ────────────────────────────────────────────────

describe('the brief has a deterministic content identity', () => {
  it('repeated composition is byte-identical', () => {
    const a = composeMonthlyBrief(CANON, MONTH, IDENTITY)
    const b = composeMonthlyBrief(CANON, MONTH, IDENTITY)
    expect(computeMonthlyBriefHash(a)).toBe(computeMonthlyBriefHash(b))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('key order in the canonical block cannot move the hash', () => {
    const reversed = Object.fromEntries(Object.entries(CANON).reverse())
    expect(computeMonthlyBriefHash(composeMonthlyBrief(reversed, MONTH, IDENTITY)))
      .toBe(computeMonthlyBriefHash(composeMonthlyBrief(CANON, MONTH, IDENTITY)))
  })

  it('different months produce different identities', () => {
    const months = Object.keys(CANON.year_order_2026 as Record<string, string>)
    const hashes = months.map(m => computeMonthlyBriefHash(composeMonthlyBrief(CANON, m, IDENTITY)))
    expect(new Set(hashes).size).toBe(months.length)
  })

  it('a changed product requirement changes the identity', () => {
    const base = computeMonthlyBriefHash(composeMonthlyBrief(CANON, MONTH, IDENTITY))
    const bumped = {
      ...CANON, ebook_pages: 20, page_audio_clips: 20,
      page_structure: { total_pages: 20, cover_pages: 1, content_pages: 18, closing_pages: 1 },
    }
    expect(computeMonthlyBriefHash(composeMonthlyBrief(bumped, MONTH, IDENTITY))).not.toBe(base)
  })

  it('the page structure is part of the identity', () => {
    // Two contracts agreeing on every total but splitting the pages differently
    // are different product requirements and must not share a hash.
    const base = computeMonthlyBriefHash(composeMonthlyBrief(CANON, MONTH, IDENTITY))
    const resplit = {
      ...CANON,
      page_structure: { total_pages: 18, cover_pages: 2, content_pages: 15, closing_pages: 1 },
    }
    expect(computeMonthlyBriefHash(composeMonthlyBrief(resplit, MONTH, IDENTITY))).not.toBe(base)
  })

  it('the hash binds schema and version, so a future v2 cannot collide', () => {
    const b = composeMonthlyBrief(CANON, MONTH, IDENTITY)
    const asV2 = { ...b, version: 2 }
    expect(computeMonthlyBriefHash(asV2 as never)).not.toBe(computeMonthlyBriefHash(b))
  })

  it('uses the repository canonicalizer, not a second convention', () => {
    expect(composeCode).toMatch(/from '@\/lib\/atlas\/mission\/binding'/)
    expect(composeCode).toMatch(/createHash\('sha256'\)/)
    expect(composeCode).not.toMatch(/function canonicalJson/)
  })
})

// ── Purity: nothing outside the contract may influence the brief ─────────────

describe('composition is pure', () => {
  it('the composer and handler name no network, env, db, clock or randomness', () => {
    for (const src of [composeCode, handlerCode]) {
      expect(src).not.toMatch(/process\.env/)
      expect(src).not.toMatch(/fetch\(/)
      expect(src).not.toMatch(/createAdminClient|createClient|from\('/)
      expect(src).not.toMatch(/Math\.random/)
      expect(src).not.toMatch(/Date\.now|new Date\(\)/)
    }
  })

  it('no environment variable changes the output', () => {
    const before = computeMonthlyBriefHash(composeMonthlyBrief(CANON, MONTH, IDENTITY))
    const saved = { ...process.env }
    try {
      process.env.MONTHLY_BRIEF_THEME = 'Injected'
      process.env.FAMILJE_STUNDEN_SUPABASE_URL = 'https://example.invalid'
      process.env.TZ = 'America/Los_Angeles'
      expect(computeMonthlyBriefHash(composeMonthlyBrief(CANON, MONTH, IDENTITY))).toBe(before)
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]
      Object.assign(process.env, saved)
    }
  })

  it('the wall clock does not reach the payload', async () => {
    const a = composeMonthlyBrief(CANON, MONTH, IDENTITY)
    await new Promise(r => setTimeout(r, 5))
    const b = composeMonthlyBrief(CANON, MONTH, IDENTITY)
    expect(computeMonthlyBriefHash(a)).toBe(computeMonthlyBriefHash(b))
    expect(JSON.stringify(a)).not.toMatch(/composed_at/)
  })

  it('there is no caller channel for month, theme or product requirements', () => {
    // Exactly three parameters, and the third carries only definition identity.
    expect(composeCode).toMatch(
      /export function composeMonthlyBrief\(\s*canonical: Record<string, unknown>,\s*monthKey: string,\s*identity: \{ defKey: string; defVersion: number \},\s*\)/)
    expect(composeCode).not.toMatch(/overrides?|payload|options\??:/)
  })

  it('the handler takes the month from the instance key alone', () => {
    expect(handlerCode).toMatch(/input\.instanceKey/)
    expect(handlerCode).not.toMatch(/monthKey\s*=\s*(?!input\.instanceKey)/)
    // ReadOnlyHandlerInput carries no payload the caller controls.
    const t = readFileSync(join(process.cwd(), 'lib/workflows/handlers/types.ts'), 'utf8')
    expect(t).not.toMatch(/payload|override/)
  })
})

// ── One release-time rule (Task 9) ──────────────────────────────────────────

describe('planning has exactly one release-time authority', () => {
  it('the brief and compute_release_instant agree byte-for-byte, every month', () => {
    for (const month of Object.keys(CANON.year_order_2026 as Record<string, string>)) {
      expect(composeMonthlyBrief(CANON, month, IDENTITY).release_at_utc)
        .toBe(computeReleaseInstant(month).utc)
    }
  })

  it('the composer derives the instant rather than restating the rule', () => {
    expect(composeCode).toMatch(/computeReleaseInstant/)
    expect(composeCode).not.toMatch(/Europe\/Stockholm/)
    expect(composeCode).not.toMatch(/Intl\./)
  })

  it('DST is respected through the shared function', () => {
    // October is CEST (+02), November is CET (+01) — the case the runbook names.
    expect(composeMonthlyBrief(CANON, '2026-10', IDENTITY).release_at_utc)
      .toBe('2026-09-30T22:00:00.000Z')
    expect(composeMonthlyBrief(CANON, '2026-11', IDENTITY).release_at_utc)
      .toBe('2026-10-31T23:00:00.000Z')
  })
})

// ── The action ──────────────────────────────────────────────────────────────

describe('compose_monthly_brief is a placed, classified action', () => {
  it('is READ_ONLY and executable by the read-only family', () => {
    expect(ACTION_REGISTRY.compose_monthly_brief.action_class).toBe('READ_ONLY')
    expect(ACTION_REGISTRY.compose_monthly_brief.executor_family).toBe('read_only_observation')
    expect(executableActionKinds()).toContain('compose_monthly_brief')
  })

  it('MUTATION — placement is exactly familje-stunden.monthly-release / planning', () => {
    expect(ACTION_REGISTRY.compose_monthly_brief.placements).toEqual([
      { def_key: 'familje-stunden.monthly-release', state: 'planning' },
    ])
  })

  it('is placed in neither the proof nor the probe definition', () => {
    for (const p of ACTION_REGISTRY.compose_monthly_brief.placements) {
      expect(p.def_key).not.toBe('omnira.release-gate-proof')
      expect(p.def_key).not.toBe('omnira.probe-validation')
    }
  })

  it('the executor reaches it through the closed HANDLERS map', () => {
    const exec = readFileSync(join(process.cwd(), 'lib/workflows/action-executor.ts'), 'utf8')
    expect(exec).toMatch(/compose_monthly_brief: composeMonthlyBriefHandler,/)
  })
})

// ── The declared check ──────────────────────────────────────────────────────

describe('monthly_brief_composed is required, automated-only evidence', () => {
  const check = FAMILJE_STUNDEN_CHECKS.find(
    c => c.check_key === 'monthly_brief_composed' && c.state === 'planning')

  it('is declared on planning', () => {
    expect(check).toBeDefined()
  })

  it('MUTATION — is required, so planning cannot advance without it', () => {
    expect(check!.required).toBe(true)
  })

  it('MUTATION — accepts automated provenance only; an attestation cannot satisfy it', () => {
    expect(check!.allowed_provenance).toEqual(['automated'])
    expect(check!.allowed_provenance).not.toContain('attested')
  })

  it('does not bind artifacts — there are no built files, and that path is attested-only', () => {
    expect(check!.binds_artifacts).toBe(false)
  })

  it('the handler answers exactly this check key', () => {
    expect(COMPOSE_MONTHLY_BRIEF_CHECK).toBe('monthly_brief_composed')
  })

  it('the adapter cannot manufacture a pass for it through verifyState', async () => {
    const { familjeStundenAdapter } = await import('../workflows/adapters/familje-stunden')
    const evidence = await familjeStundenAdapter.verifyState({
      state: 'planning', instanceKey: MONTH, now: NOW,
    } as never)
    expect(evidence.some(e => e.check_key === 'monthly_brief_composed')).toBe(false)
  })
})

// ── The handler's observation ───────────────────────────────────────────────

describe('the handler emits a bound, queryable observation', () => {
  it('passes for a canonical month and binds the brief hash', async () => {
    const out = await composeMonthlyBriefHandler({
      instanceKey: MONTH, state: 'planning', defKey: DEF_KEY, defVersion: DEF_VERSION, now: NOW,
    })
    const expected = computeMonthlyBriefHash(composeMonthlyBrief(CANON, MONTH, IDENTITY))
    expect(out.result).toBe('pass')
    expect(out.checkKey).toBe('monthly_brief_composed')
    expect(out.authoritativeSystem).toBeNull()
    expect(out.detail.brief_hash).toBe(expected)
    expect(out.detail.month_key).toBe(MONTH)
    expect(out.detail.theme).toBe((CANON.year_order_2026 as Record<string, string>)[MONTH])
    expect(out.detail.def_hash).toBe(vendored.def_hash)
  })

  it('the detail is scalars only, as the handler contract requires', async () => {
    const out = await composeMonthlyBriefHandler({
      instanceKey: MONTH, state: 'planning', defKey: DEF_KEY, defVersion: DEF_VERSION, now: NOW,
    })
    for (const [k, v] of Object.entries(out.detail)) {
      expect(['string', 'number', 'boolean'], k).toContain(v === null ? 'string' : typeof v)
    }
  })

  it('a month outside the contract fails without inventing a theme', async () => {
    const out = await composeMonthlyBriefHandler({
      instanceKey: '2027-03', state: 'planning', defKey: DEF_KEY, defVersion: DEF_VERSION, now: NOW,
    })
    expect(out.result).toBe('fail')
    expect(out.detail.error_kind).toBe('month_not_in_contract')
    expect(out.detail.brief_hash).toBeUndefined()
  })

  it('a malformed month key never becomes a pass', async () => {
    const out = await composeMonthlyBriefHandler({
      instanceKey: 'not-a-month', state: 'planning', defKey: DEF_KEY, defVersion: DEF_VERSION, now: NOW,
    })
    expect(out.result).toBe('fail')
    expect(out.detail.error_kind).toBe('invalid_month_key')
  })

  it('the same instance key yields the same hash on every call', async () => {
    const call = () => composeMonthlyBriefHandler({
      instanceKey: MONTH, state: 'planning', defKey: DEF_KEY, defVersion: DEF_VERSION, now: NOW,
    })
    expect((await call()).detail.brief_hash).toBe((await call()).detail.brief_hash)
  })
})

// ── Phase boundary: nothing else moved ──────────────────────────────────────

describe('Phase 2A changed nothing outside planning', () => {
  it('the release-gate proof architecture is untouched', () => {
    expect(ACTION_REGISTRY.observe_release_gate.placements).toEqual([
      { def_key: 'familje-stunden.monthly-release', state: 'backend_release_gate' },
      { def_key: 'omnira.release-gate-proof', state: 'proof' },
    ])
  })

  it('the write-capable kinds are still declared non-executable', () => {
    for (const kind of ['apply_release_gate_migration', 'upload_protected_artifacts',
                        'send_release_newsletter', 'generate_page_audio'] as const) {
      expect(ACTION_REGISTRY[kind].executor_family).toBe('not_executable')
    }
  })

  it('the planning human gate is still required', () => {
    const def = JSON.parse(readFileSync(join(process.cwd(),
      'lib/workflows/definitions/familje-stunden.monthly-release.v1.json'), 'utf8'))
    const planning = def.states.find((s: { id: string }) => s.id === 'planning')
    expect(planning.human_gate.required).toBe(true)
    expect(planning.human_gate.approver).toBe('editor')
  })

  it('the brief modules import no media, legacy or n8n surface', () => {
    for (const src of [composeCode, handlerCode, typesCode]) {
      expect(src).not.toMatch(/lib\/media|lib\/ebook|lib\/ai\/runner|n8n/)
    }
  })
})
