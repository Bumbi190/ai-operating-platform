/**
 * Cognitive Loop v1.0 — Stage 0, Commit 5: shadow harness (instrumentation only).
 *
 * Locks the non-invasiveness contract: single-flag arming ('shadow' only —
 * 'on' does NOT arm it), never-throws containment, and a pure diff that
 * reports structure + tokens without ever returning the assembled context
 * to the caller.
 */
import { describe, it, expect, afterEach } from 'vitest'
import {
  isContextShadowEnabled,
  computeShadowDiff,
  runContextShadow,
  type ShadowDiff,
} from '@/lib/atlas/context/shadow'
import { assembleContext } from '@/lib/atlas/context/assembler'
import { VolatilityCache } from '@/lib/atlas/context/volatility-cache'
import type { ContextBlock, ContextReader } from '@/lib/atlas/context/readers'
import type { ContextRequest } from '@/lib/atlas/context/request'

const NOW = '2026-07-02T12:00:00.000Z'

function baseReq(overrides: Partial<ContextRequest> = {}): ContextRequest {
  return {
    scope: 'global', projectId: null, intents: ['revenue'],
    window: { since: '2026-06-25T12:00:00.000Z', until: NOW },
    view: null, modality: 'chat', outputBudget: 4096,
    ...overrides,
  }
}

const stub = (dimension: ContextBlock['dimension'], text: string): ContextReader =>
  async () => ({ dimension, channel: 'soft', text })

async function assembled(readers: Partial<Record<ContextBlock['dimension'], ContextReader>>) {
  return assembleContext(baseReq(), { db: null, allowedProjectIds: ['p1'] }, {
    now: NOW, cache: new VolatilityCache(45_000), readers,
  })
}

// ── Flag (single-switch disable) ──────────────────────────────────────────────

describe('isContextShadowEnabled — only "shadow" arms the harness', () => {
  const prev = process.env.ATLAS_CTX_ASSEMBLER
  afterEach(() => {
    if (prev === undefined) delete process.env.ATLAS_CTX_ASSEMBLER
    else process.env.ATLAS_CTX_ASSEMBLER = prev
  })

  it.each([
    ['shadow', true],
    ['off', false],
    ['on', false],   // Stage-1 value must NOT arm Stage-0 instrumentation
    ['1', false],
  ])('ATLAS_CTX_ASSEMBLER=%s → %s', (value, expected) => {
    process.env.ATLAS_CTX_ASSEMBLER = value
    expect(isContextShadowEnabled()).toBe(expected)
  })

  it('is disarmed when the flag is unset (defaults safe)', () => {
    delete process.env.ATLAS_CTX_ASSEMBLER
    expect(isContextShadowEnabled()).toBe(false)
  })
})

// ── Pure diff ─────────────────────────────────────────────────────────────────

describe('computeShadowDiff — structural mapping', () => {
  it('maps [LIVE LÄGE]/[SENASTE ÅTGÄRDER]/[CURRENT VIEW] to ①/②/③ and flags [BESLUT] as legacy-only (Stage 1)', async () => {
    const a = await assembled({
      operational: stub('operational', '\n\n[LIVE LÄGE — nu]\nKostnad…'),
      activeWork: stub('activeWork', '\n\n[SENASTE ÅTGÄRDER — …]\n- x'),
      view: stub('view', '\n\n[CURRENT VIEW — …]\nPage: Approvals'),
    })
    const d = computeShadowDiff({
      live: '\n\n[LIVE LÄGE — då]\nKostnad…\n\n[BESLUT — gällande operatörsbeslut]\n- y',
      action: '\n\n[SENASTE ÅTGÄRDER — …]\n- x',
      view: '\n\n[CURRENT VIEW — …]\nPage: Approvals',
    }, a, 12)

    expect(d.structural.legacy).toEqual(['[LIVE LÄGE', '[BESLUT', '[SENASTE ÅTGÄRDER', '[CURRENT VIEW'])
    expect(d.structural.assembled).toEqual(['operational', 'activeWork', 'view'])
    expect(d.structural.legacyOnly).toEqual(['[BESLUT'])   // expected until the constraints reader
    expect(d.structural.assembledOnly).toEqual([])
    expect(d.shadowMs).toBe(12)
  })

  it('reports view fidelity: identical when ③ reproduced the legacy block byte-for-byte', async () => {
    const viewText = '\n\n[CURRENT VIEW — …]\nPage: Approvals'
    const a = await assembled({ view: stub('view', viewText) })
    const d = computeShadowDiff({ live: '', action: '', view: viewText }, a, 1)
    expect(d.fidelity.view).toBe('identical')
  })

  it('reports view fidelity: divergent on any byte difference, absent when neither side has a view', async () => {
    const a = await assembled({ view: stub('view', '\n\n[CURRENT VIEW]\nPage: A') })
    expect(computeShadowDiff({ live: '', action: '', view: '\n\n[CURRENT VIEW]\nPage: B' }, a, 1).fidelity.view).toBe('divergent')
    const none = await assembled({})
    expect(computeShadowDiff({ live: '', action: '', view: '' }, none, 1).fidelity.view).toBe('absent')
  })

  it('accepts ② as identical-prefix (activeWork = legacy ledger + [PÅGÅENDE KÖRNINGAR])', async () => {
    const ledger = '\n\n[SENASTE ÅTGÄRDER — …]\n- Delegerade X'
    const a = await assembled({ activeWork: stub('activeWork', ledger + '\n\n[PÅGÅENDE KÖRNINGAR — …]\n- [running] r1') })
    const d = computeShadowDiff({ live: '', action: ledger, view: '' }, a, 1)
    expect(d.fidelity.actionLedger).toBe('identical-prefix')
  })

  it('counts tokens for both sides (shared M4 heuristic)', async () => {
    const a = await assembled({ operational: stub('operational', 'x'.repeat(400)) })
    const d = computeShadowDiff({ live: 'y'.repeat(800), action: '', view: '' }, a, 1)
    expect(d.tokens.operational).toBe(100)
    expect(d.tokens.legacyLive).toBe(200)
  })
})

// ── Containment (never throws, sink receives the diff, context never escapes) ─

describe('runContextShadow — fire-and-forget containment', () => {
  it('delivers a diff to the sink and resolves void (assembled context never escapes)', async () => {
    const diffs: ShadowDiff[] = []
    const result = await runContextShadow({
      db: { from: () => { throw new Error('no real db in this test') } },
      allowedProjectIds: ['p1'],
      voice: false,
      view: null,
      legacy: { live: '', action: '', view: '' },
      sink: d => diffs.push(d),
    })
    expect(result).toBeUndefined()          // nothing usable is returned
    expect(diffs).toHaveLength(1)           // instrumentation happened
    expect(diffs[0].structural.assembled).toEqual([])  // readers degraded to absent on the broken db
  })

  it('never rejects, even when everything inside fails', async () => {
    const evil: any = { from: () => { throw new Error('boom') } }
    const bad = runContextShadow({
      db: evil, allowedProjectIds: null as any, voice: false, view: null,
      legacy: null as any,                   // malformed on purpose
    })
    await expect(bad).resolves.toBeUndefined()
  })
})
