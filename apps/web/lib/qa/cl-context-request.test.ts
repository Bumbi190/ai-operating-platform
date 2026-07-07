/**
 * Cognitive Loop v1.0 — Stage 0, Commit 1: ContextRequest / deriveContextRequest.
 *
 * Locks the pure-derivation contract: no I/O, deterministic given its input,
 * states shape only (canonical §6.1/§6.3). Isolation degrade-path (an
 * untrusted projectId falling back to global scope) is covered explicitly —
 * this module must never widen the caller's project access.
 */
import { describe, it, expect } from 'vitest'
import { deriveContextRequest, type Turn } from '@/lib/atlas/context/request'

const NOW = '2026-07-01T12:00:00.000Z'

function baseTurn(overrides: Partial<Turn> = {}): Turn {
  return {
    trigger: 'operator',
    allowedProjectIds: ['proj-1', 'proj-2'],
    now: NOW,
    ...overrides,
  }
}

describe('deriveContextRequest — modality', () => {
  it('derives chat for a non-voice operator turn', () => {
    expect(deriveContextRequest(baseTurn()).modality).toBe('chat')
  })
  it('derives voice for a voice operator turn', () => {
    expect(deriveContextRequest(baseTurn({ voice: true })).modality).toBe('voice')
  })
  it('derives scheduled regardless of the voice flag', () => {
    expect(deriveContextRequest(baseTurn({ trigger: 'scheduled', voice: true })).modality).toBe('scheduled')
  })
})

describe('deriveContextRequest — scope + isolation', () => {
  it('is global scope when no projectId is given', () => {
    const req = deriveContextRequest(baseTurn())
    expect(req.scope).toBe('global')
    expect(req.projectId).toBeNull()
  })
  it('is project scope when projectId is within the allow-list', () => {
    const req = deriveContextRequest(baseTurn({ projectId: 'proj-1' }))
    expect(req.scope).toBe('project')
    expect(req.projectId).toBe('proj-1')
  })
  it('degrades to global scope when projectId is outside the allow-list (never widens access)', () => {
    const req = deriveContextRequest(baseTurn({ projectId: 'not-allowed' }))
    expect(req.scope).toBe('global')
    expect(req.projectId).toBeNull()
  })
})

describe('deriveContextRequest — output budget (canonical §6.4: shape, not content)', () => {
  it('defaults voice to a small ceiling', () => {
    expect(deriveContextRequest(baseTurn({ voice: true })).outputBudget).toBe(150)
  })
  it('defaults chat to a fuller ceiling', () => {
    expect(deriveContextRequest(baseTurn()).outputBudget).toBe(4096)
  })
  it('defaults scheduled to its own ceiling', () => {
    expect(deriveContextRequest(baseTurn({ trigger: 'scheduled' })).outputBudget).toBe(8192)
  })
  it('honors an explicit override', () => {
    expect(deriveContextRequest(baseTurn({ outputBudget: 999 })).outputBudget).toBe(999)
  })
})

describe('deriveContextRequest — window', () => {
  it('defaults to a 7-day trailing window ending now', () => {
    const req = deriveContextRequest(baseTurn())
    expect(req.window.until).toBe(NOW)
    expect(req.window.since).toBe('2026-06-24T12:00:00.000Z')
  })
  it('honors an explicit window override', () => {
    const window = { since: '2026-01-01T00:00:00.000Z', until: '2026-01-02T00:00:00.000Z' }
    expect(deriveContextRequest(baseTurn({ window })).window).toEqual(window)
  })
})

describe('deriveContextRequest — intents + view (shape passthrough, no selection)', () => {
  it('defaults to all four EI business intents', () => {
    const req = deriveContextRequest(baseTurn())
    expect(req.intents).toEqual(['revenue', 'audience', 'content_performance', 'agent_activity'])
  })
  it('honors a narrowed intent set', () => {
    const req = deriveContextRequest(baseTurn({ intents: ['revenue'] }))
    expect(req.intents).toEqual(['revenue'])
  })
  it('passes the view envelope through verbatim (normalization is the ③ reader\'s job, not this module\'s)', () => {
    const view = { pathname: '/revenue' }
    const req = deriveContextRequest(baseTurn({ view }))
    expect(req.view).toBe(view)
  })
  it('defaults view to null when absent', () => {
    expect(deriveContextRequest(baseTurn()).view).toBeNull()
  })
})

describe('deriveContextRequest — purity', () => {
  it('is deterministic given identical input', () => {
    const turn = baseTurn({ projectId: 'proj-1', voice: true })
    expect(deriveContextRequest(turn)).toEqual(deriveContextRequest(turn))
  })
})
