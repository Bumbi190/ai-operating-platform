/**
 * lib/qa/executive-authority-entrypoint.test.ts — EI-S1.6B
 *
 * EI-S1.5B found Authorization V1, Decision Ledger V1 and Mission Brief V1
 * fully implemented and completely unreachable: no route, server action, script
 * or UI could call their principal-write boundaries, so four FM.2 capabilities
 * were not exercisable. These tests hold the seam that closes that gap.
 *
 * The seam's whole risk is that an HTTP adapter re-opens what the domain closed.
 * So the tests are weighted toward what the caller must NOT be able to do:
 * forge the clock, name their own authority target, spoof a principal, or learn
 * whether a row they cannot see exists.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO_ROOT = resolve(__dirname, '../../../..')
const ROUTE_DIR = resolve(REPO_ROOT, 'apps/web/app/api/atlas/executive')

// ── Domain doubles ────────────────────────────────────────────────────────────
// The domain boundaries are exercised by their own suites; here they are
// recording spies, so we can assert EXACTLY what the adapter forwarded.

const H = vi.hoisted(() => {
  const calls: { fn: string; args: any }[] = []
  const record = (fn: string, result: any = { status: 'ok', state: { id: 'x' } }) =>
    vi.fn(async (args: any) => { calls.push({ fn, args }); return result })

  const PREPARED = {
    status: 'ok',
    binding: {
      projectId: '11111111-1111-4111-8111-111111111111',
      target: { targetType: 'decision', targetId: 'd-1', versionHash: 'a'.repeat(64) },
      actionKind: 'decision.approve',
    },
  }
  const MPREPARED = {
    status: 'ok',
    binding: {
      projectId: '11111111-1111-4111-8111-111111111111',
      target: { targetType: 'mission', targetId: 'm-1', versionHash: 'b'.repeat(64) },
      actionKind: 'mission.activate',
    },
  }

  return {
    calls, PREPARED, MPREPARED,
    authz: {
      requestAuthorization: record('requestAuthorization'),
      grantAuthorization: record('grantAuthorization'),
      grantAuthorizationWithConditions: record('grantAuthorizationWithConditions'),
      denyAuthorization: record('denyAuthorization'),
      revokeAuthorization: record('revokeAuthorization'),
    },
    decision: {
      prepareDecisionAct: vi.fn(async (args: any) => { calls.push({ fn: 'prepareDecisionAct', args }); return PREPARED }),
      proposeDecision: record('proposeDecision'),
      approveDecision: record('approveDecision'),
      rejectDecision: record('rejectDecision'),
      observeOutcome: record('observeOutcome'),
      recordDecisionReview: record('recordDecisionReview'),
      completeDecision: record('completeDecision'),
    },
    mission: {
      prepareMissionAct: vi.fn(async (args: any) => { calls.push({ fn: 'prepareMissionAct', args }); return MPREPARED }),
      openMission: record('openMission'),
      proposeMission: record('proposeMission'),
      approveMission: record('approveMission'),
      activateMission: record('activateMission'),
      cancelMission: record('cancelMission'),
      pauseMission: record('pauseMission'),
      resumeMission: record('resumeMission'),
      closeMission: record('closeMission'),
      recordMissionEvidence: record('recordMissionEvidence'),
      reviewMission: record('reviewMission'),
    },
  }
})

const { calls, PREPARED, MPREPARED, decision, mission } = H

vi.mock('@/lib/atlas/authorization/principal-write', () => H.authz)
vi.mock('@/lib/atlas/decision-ledger/principal-write', () => H.decision)
vi.mock('@/lib/atlas/mission/principal-write', () => H.mission)

import { POST as authorizationRoute } from '@/app/api/atlas/executive/authorization/route'
import { POST as decisionRoute } from '@/app/api/atlas/executive/decision/route'
import { POST as missionRoute } from '@/app/api/atlas/executive/mission/route'
import { RESERVED_FIELDS } from '@/lib/atlas/executive/http'

// ── Request helpers ───────────────────────────────────────────────────────────

const HOST = 'omnira.example'
const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'

function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`https://${HOST}/api/atlas/executive/x`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: `https://${HOST}`, host: HOST, ...headers },
    body: JSON.stringify(body),
  })
}

const argsFor = (fn: string) => calls.filter(c => c.fn === fn).map(c => c.args)

beforeEach(() => { calls.length = 0 })

// ── Same-origin gate ──────────────────────────────────────────────────────────

describe('EI-S1.6B — same-origin gate', () => {
  const routes: [string, (r: Request) => Promise<Response>][] = [
    ['authorization', authorizationRoute], ['decision', decisionRoute], ['mission', missionRoute],
  ]

  for (const [name, route] of routes) {
    it(`${name}: allows a same-origin request through to the domain`, async () => {
      const res = await route(req({ action: 'nope' }))
      // Reaches action validation rather than being refused at the edge.
      expect(res.status).toBe(400)
    })

    it(`${name}: rejects a missing Origin`, async () => {
      const r = new Request(`https://${HOST}/x`, {
        method: 'POST', headers: { 'content-type': 'application/json', host: HOST },
        body: JSON.stringify({ action: 'grant' }),
      })
      expect((await route(r)).status).toBe(403)
    })

    it(`${name}: rejects a malformed Origin`, async () => {
      expect((await route(req({ action: 'grant' }, { origin: 'not-a-url' }))).status).toBe(403)
      expect((await route(req({ action: 'grant' }, { origin: 'javascript:alert(1)' }))).status).toBe(403)
    })

    it(`${name}: rejects a cross-origin request`, async () => {
      expect((await route(req({ action: 'grant' }, { origin: 'https://evil.example' }))).status).toBe(403)
    })

    it(`${name}: refuses at the edge before touching the domain`, async () => {
      await route(req({ action: 'grant', authorizationId: UUID_A }, { origin: 'https://evil.example' }))
      expect(calls).toEqual([])
    })
  }

  it('honours the forwarded host behind the proxy', async () => {
    const r = new Request('https://internal.vercel/x', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: `https://${HOST}`, host: 'internal.vercel', 'x-forwarded-host': HOST,
      },
      body: JSON.stringify({ action: 'nope' }),
    })
    expect((await authorizationRoute(r)).status).toBe(400)
  })
})

// ── Reserved fields ───────────────────────────────────────────────────────────

describe('EI-S1.6B — the HTTP caller cannot supply privileged fields', () => {
  /**
   * `now` is the sharpest of these: it is a plain JSON string and it feeds
   * `isAuthorizationEffective(..., { now })`, so a forged clock could make an
   * expired grant look effective. The others substitute the ledger, fake the
   * project mode, fake capability proof, spoof the principal, or hand the
   * caller back control of the authority binding.
   */
  const cases: [string, unknown][] = [
    ['now', '2030-01-01T00:00:00.000Z'],
    ['store', {}],
    ['projectMode', 'operational'],
    ['availability', {}],
    ['principalId', 'someone-else'],
    ['userId', 'someone-else'],
    ['ownerId', 'someone-else'],
    ['actorId', 'someone-else'],
    ['humanId', 'someone-else'],
    ['target', { targetType: 'decision', targetId: 'x', versionHash: 'f'.repeat(64) }],
    ['authority', { actionKind: 'spend', description: 'anything' }],
    ['targetType', 'decision'],
    ['targetId', 'x'],
    ['versionHash', 'f'.repeat(64)],
    ['actionKind', 'spend'],
    ['binding', { projectId: UUID_A }],
  ]

  for (const [field, value] of cases) {
    it(`rejects \`${field}\` on every Executive route`, async () => {
      for (const route of [authorizationRoute, decisionRoute, missionRoute]) {
        const res = await route(req({ action: 'grant', authorizationId: UUID_A, [field]: value }))
        expect(res.status).toBe(400)
        expect((await res.json()).detail).toBe(`reserved_field:${field}`)
      }
      expect(calls, 'nothing may reach the domain').toEqual([])
    })
  }

  it('covers every reserved name with a case', () => {
    expect(new Set(cases.map(c => c[0]))).toEqual(new Set(RESERVED_FIELDS))
  })

  it('forwards only allowlisted keys — no body spread survives', async () => {
    await authorizationRoute(req({
      action: 'grant',
      authorizationId: UUID_A,
      expiresAt: '2030-01-01T00:00:00.000Z',
      reason: 'why',
      smuggled: 'nope',
      anotherUnknown: { deep: true },
    }))
    const [args] = argsFor('grantAuthorization')
    expect(Object.keys(args).sort()).toEqual(['authorizationId', 'expiresAt', 'reason'])
    expect(args).not.toHaveProperty('smuggled')
    expect(args).not.toHaveProperty('anotherUnknown')
    expect(args).not.toHaveProperty('action')
  })
})

// ── Authorization route ───────────────────────────────────────────────────────

describe('EI-S1.6B — authorization route', () => {
  it('reaches each REQUIRED lifecycle act', async () => {
    const base = { authorizationId: UUID_A, expiresAt: '2030-01-01T00:00:00.000Z', reason: 'r' }
    await authorizationRoute(req({ ...base, action: 'grant' }))
    await authorizationRoute(req({ ...base, action: 'grant_with_conditions', conditions: [] }))
    await authorizationRoute(req({ ...base, action: 'deny' }))
    await authorizationRoute(req({ ...base, action: 'revoke' }))
    expect(calls.map(c => c.fn)).toEqual([
      'grantAuthorization', 'grantAuthorizationWithConditions', 'denyAuthorization', 'revokeAuthorization',
    ])
  })

  it('does not expose raw authorization creation', () => {
    const src = readFileSync(resolve(ROUTE_DIR, 'authorization/route.ts'), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    expect(code).not.toContain('requestAuthorization')
    expect(code).not.toContain('supersedeAuthorization')
  })

  it('requires a bounded expiry on a grant (§27.319)', async () => {
    const res = await authorizationRoute(req({ action: 'grant', authorizationId: UUID_A }))
    expect(res.status).toBe(400)
    expect((await res.json()).detail).toBe('expiresAt_required')
    expect(calls).toEqual([])
  })

  it('rejects an unknown action', async () => {
    const res = await authorizationRoute(req({ action: 'supersede', authorizationId: UUID_A }))
    expect(res.status).toBe(400)
    expect((await res.json()).detail).toBe('unknown_action')
    expect(calls).toEqual([])
  })

  it('rejects a malformed id before the domain', async () => {
    expect((await authorizationRoute(req({ action: 'revoke', authorizationId: 'not-a-uuid' }))).status).toBe(400)
    expect(calls).toEqual([])
  })
})

// ── Server-atomic authorization request ───────────────────────────────────────

describe('EI-S1.6B — purpose-scoped authorization is server-atomic', () => {
  it('Decision: derives the binding server-side and requests in the same call', async () => {
    const res = await decisionRoute(req({
      action: 'request_authorization', purpose: 'approve', decisionId: UUID_B,
      rationale: 'because', review: { trigger: 'time', description: 'q', dueAt: null },
      effectiveAt: '2027-01-01T00:00:00.000Z',
    }))
    expect(res.status).toBe(200)
    expect(calls.map(c => c.fn)).toEqual(['prepareDecisionAct', 'requestAuthorization'])

    const [sent] = argsFor('requestAuthorization')
    expect(sent.projectId).toBe(PREPARED.binding.projectId)
    expect(sent.target).toEqual(PREPARED.binding.target)
    expect(sent.authority.actionKind).toBe(PREPARED.binding.actionKind)
  })

  it('Decision: the description is server-derived, never caller text', async () => {
    await decisionRoute(req({
      action: 'request_authorization', purpose: 'reject', decisionId: UUID_B, reason: 'no',
      description: 'ATTACKER SUPPLIED',
    }))
    const [sent] = argsFor('requestAuthorization')
    expect(sent.authority.description).toBe('Executive Decision: reject')
  })

  it('Mission: derives the binding server-side and requests in the same call', async () => {
    const res = await missionRoute(req({
      action: 'request_authorization', purpose: 'activate', missionId: UUID_B,
    }))
    expect(res.status).toBe(200)
    expect(calls.map(c => c.fn)).toEqual(['prepareMissionAct', 'requestAuthorization'])
    const [sent] = argsFor('requestAuthorization')
    expect(sent.target).toEqual(MPREPARED.binding.target)
    expect(sent.authority.description).toBe('Executive Mission: activate')
  })

  /**
   * The authority actually requested must equal the PREPARED binding exactly,
   * even when the body is stuffed with plausible-looking extras. An earlier
   * version of this suite only checked the happy path, and a mutant that let an
   * unlisted field override `actionKind` survived: the fallback kept the happy
   * path correct. Hostile input is the only way to see it.
   */
  it('ignores unlisted fields when composing the authorization request', async () => {
    await decisionRoute(req({
      action: 'request_authorization', purpose: 'reject', decisionId: UUID_B, reason: 'no',
      wanted: 'spend', kind: 'spend', act: 'spend', purposeOverride: 'spend',
      projectId: '99999999-9999-4999-8999-999999999999',
      description: 'attacker', expiresAt: '2099-01-01T00:00:00.000Z',
    }))
    const [sent] = argsFor('requestAuthorization')
    expect(sent).toEqual({
      projectId: PREPARED.binding.projectId,
      target: PREPARED.binding.target,
      authority: { actionKind: PREPARED.binding.actionKind, description: 'Executive Decision: reject' },
    })
  })

  it('Mission: ignores unlisted fields when composing the authorization request', async () => {
    await missionRoute(req({
      action: 'request_authorization', purpose: 'cancel', missionId: UUID_B, reason: 'stop',
      wanted: 'spend', kind: 'spend', projectId: '99999999-9999-4999-8999-999999999999',
    }))
    const [sent] = argsFor('requestAuthorization')
    expect(sent).toEqual({
      projectId: MPREPARED.binding.projectId,
      target: MPREPARED.binding.target,
      authority: { actionKind: MPREPARED.binding.actionKind, description: 'Executive Mission: cancel' },
    })
  })

  it('never returns a caller-reusable authority payload', async () => {
    const res = await decisionRoute(req({
      action: 'request_authorization', purpose: 'reject', decisionId: UUID_B, reason: 'no',
    }))
    const body = await res.json()
    const text = JSON.stringify(body)
    expect(text).not.toContain('versionHash')
    expect(text).not.toContain('actionKind')
    expect(body).not.toHaveProperty('binding')
    expect(body).not.toHaveProperty('target')
  })

  it('never requests authorization when preparation refuses', async () => {
    decision.prepareDecisionAct.mockResolvedValueOnce({ status: 'not_permitted', binding: null } as any)
    const res = await decisionRoute(req({
      action: 'request_authorization', purpose: 'reject', decisionId: UUID_B, reason: 'no',
    }))
    expect(res.status).toBe(404)
    expect(argsFor('requestAuthorization')).toEqual([])
  })

  it('forwards no authorizationId into preparation', async () => {
    await decisionRoute(req({
      action: 'request_authorization', purpose: 'reject', decisionId: UUID_B, reason: 'no',
      authorizationId: UUID_A,
    }))
    const [prep] = argsFor('prepareDecisionAct')
    expect(prep).not.toHaveProperty('authorizationId')
  })

  it('rejects an unsupported authority purpose', async () => {
    for (const purpose of ['amend', 'supersede', 'defer', 'reverse']) {
      const res = await decisionRoute(req({ action: 'request_authorization', purpose, decisionId: UUID_B }))
      expect(res.status).toBe(400)
    }
    for (const purpose of ['amend', 'supersede', 'fail', 'archive']) {
      const res = await missionRoute(req({ action: 'request_authorization', purpose, missionId: UUID_B }))
      expect(res.status).toBe(400)
    }
    expect(calls).toEqual([])
  })
})

// ── Decision + Mission acts ───────────────────────────────────────────────────

describe('EI-S1.6B — REQUIRED acts reach their domain boundary', () => {
  it('Decision: all six', async () => {
    const d = UUID_B
    await decisionRoute(req({ action: 'propose', projectId: UUID_A, title: 't', statement: 's', materiality: ['strategy'] }))
    await decisionRoute(req({ action: 'approve', decisionId: d, authorizationId: UUID_A, rationale: 'r', review: { trigger: 'time', description: 'x', dueAt: null }, effectiveAt: '2027-01-01T00:00:00.000Z' }))
    await decisionRoute(req({ action: 'reject', decisionId: d, authorizationId: UUID_A, reason: 'no' }))
    await decisionRoute(req({ action: 'review', decisionId: d, reviewNote: 'note' }))
    await decisionRoute(req({ action: 'outcome', decisionId: d, outcome: { status: 'succeeded', summary: 's', observedAt: '2027-01-01T00:00:00.000Z', evidence: [] } }))
    await decisionRoute(req({ action: 'complete', decisionId: d, reason: 'done' }))
    expect(calls.map(c => c.fn)).toEqual([
      'proposeDecision', 'approveDecision', 'rejectDecision',
      'recordDecisionReview', 'observeOutcome', 'completeDecision',
    ])
  })

  it('Mission: all ten', async () => {
    const m = UUID_B
    await missionRoute(req({ action: 'open', projectId: UUID_A, title: 't', objective: 'o', missionType: 'delivery', executiveOwner: 'atlas' }))
    await missionRoute(req({ action: 'propose', missionId: m }))
    await missionRoute(req({ action: 'approve', missionId: m, authorizationId: UUID_A }))
    await missionRoute(req({ action: 'activate', missionId: m, authorizationId: UUID_A }))
    await missionRoute(req({ action: 'cancel', missionId: m, authorizationId: UUID_A, reason: 'stop' }))
    await missionRoute(req({ action: 'pause', missionId: m, reason: 'hold' }))
    await missionRoute(req({ action: 'resume', missionId: m }))
    await missionRoute(req({ action: 'close', missionId: m, closure: { outcomeType: 'achieved', outcomeSummary: 's', criteriaMet: [], limitations: [] } }))
    await missionRoute(req({ action: 'evidence', missionId: m, evidence: { kind: 'log', reference: 'r', label: 'l', observedAt: '2027-01-01T00:00:00.000Z', scope: 'p' } }))
    await missionRoute(req({ action: 'review', missionId: m, reviewNote: 'note' }))
    expect(calls.map(c => c.fn)).toEqual([
      'openMission', 'proposeMission', 'approveMission', 'activateMission', 'cancelMission',
      'pauseMission', 'resumeMission', 'closeMission', 'recordMissionEvidence', 'reviewMission',
    ])
  })

  it('preserves the draft/proposed distinction rather than inventing a status', async () => {
    await decisionRoute(req({ action: 'propose', projectId: UUID_A, title: 't', statement: 's', materiality: ['strategy'], asDraft: true }))
    expect(argsFor('proposeDecision')[0].asDraft).toBe(true)
    calls.length = 0
    await missionRoute(req({ action: 'open', projectId: UUID_A, title: 't', objective: 'o', missionType: 'd', executiveOwner: 'a', asDraft: true }))
    expect(argsFor('openMission')[0].asDraft).toBe(true)
  })

  it('rejects deferred acts as unknown', async () => {
    for (const action of ['defer', 'amend', 'reverse', 'supersede']) {
      expect((await decisionRoute(req({ action, decisionId: UUID_B }))).status).toBe(400)
    }
    for (const action of ['amend', 'supersede', 'fail', 'archive', 'progress', 'blocker', 'dependency', 'gateResolve']) {
      expect((await missionRoute(req({ action, missionId: UUID_B }))).status).toBe(400)
    }
    expect(calls).toEqual([])
  })

  it('requires an authorizationId on every authority-bearing act', async () => {
    expect((await decisionRoute(req({ action: 'approve', decisionId: UUID_B, rationale: 'r', review: {}, effectiveAt: '2027-01-01T00:00:00.000Z' }))).status).toBe(400)
    expect((await missionRoute(req({ action: 'activate', missionId: UUID_B }))).status).toBe(400)
    expect(calls).toEqual([])
  })
})

// ── Information leak ──────────────────────────────────────────────────────────

describe('EI-S1.6B — unknown and foreign are indistinguishable', () => {
  it('returns a byte-identical 404 for not_permitted and project_denied', async () => {
    decision.approveDecision.mockResolvedValueOnce({ status: 'not_permitted', state: null } as any)
    const unknown = await decisionRoute(req({ action: 'approve', decisionId: UUID_B, authorizationId: UUID_A, rationale: 'r', review: { trigger: 'time', description: 'x', dueAt: null }, effectiveAt: '2027-01-01T00:00:00.000Z' }))

    decision.approveDecision.mockResolvedValueOnce({ status: 'project_denied', state: null } as any)
    const foreign = await decisionRoute(req({ action: 'approve', decisionId: UUID_B, authorizationId: UUID_A, rationale: 'r', review: { trigger: 'time', description: 'x', dueAt: null }, effectiveAt: '2027-01-01T00:00:00.000Z' }))

    expect(unknown.status).toBe(404)
    expect(foreign.status).toBe(404)
    expect(await unknown.text()).toBe(await foreign.text())
  })

  it('leaks nothing about existence, ownership or scope', async () => {
    decision.approveDecision.mockResolvedValueOnce({
      status: 'not_permitted', state: null, detail: 'row exists in project 9999 owned by someone-else',
    } as any)
    const res = await decisionRoute(req({ action: 'approve', decisionId: UUID_B, authorizationId: UUID_A, rationale: 'r', review: { trigger: 'time', description: 'x', dueAt: null }, effectiveAt: '2027-01-01T00:00:00.000Z' }))
    const text = await res.text()
    expect(text).toBe('{"error":"Not found"}')
    for (const leak of ['exists', 'project', 'owner', '9999', 'someone-else']) {
      expect(text).not.toContain(leak)
    }
  })

  it('maps each domain refusal without echoing storage text', async () => {
    const cases: [string, number][] = [
      ['no_principal', 401], ['invalid_request', 400], ['authority_not_effective', 403],
      ['authority_principal_mismatch', 403], ['invalid_lifecycle', 409], ['conflict', 409],
      ['activation_incomplete', 422], ['integrity_violation', 500], ['unavailable', 503],
    ]
    for (const [status, http] of cases) {
      mission.activateMission.mockResolvedValueOnce({
        status, state: null, detail: 'ERROR: relation "atlas_mission_ledger" ... at line 42',
      } as any)
      const res = await missionRoute(req({ action: 'activate', missionId: UUID_B, authorizationId: UUID_A }))
      expect(res.status, status).toBe(http)
      const text = await res.text()
      expect(text).not.toContain('relation')
      expect(text).not.toContain('line 42')
    }
  })
})

// ── Structural: no execution, no direct ledger writes ─────────────────────────

describe('EI-S1.6B — the routes cannot execute anything', () => {
  const files = ['authorization/route.ts', 'decision/route.ts', 'mission/route.ts']
  const codeOf = (f: string) =>
    readFileSync(resolve(ROUTE_DIR, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')

  it('writes to no Executive ledger table directly', () => {
    for (const f of files) {
      const code = codeOf(f)
      for (const table of ['atlas_authorizations', 'atlas_decision_ledger', 'atlas_mission_ledger']) {
        expect(code, `${f} must go through principal-write`).not.toContain(table)
      }
      expect(code).not.toMatch(/createAdminClient|\.from\(|\.insert\(|\.update\(/)
    }
  })

  it('imports no runner, dispatcher, publisher or spending path', () => {
    for (const f of files) {
      const code = codeOf(f)
      for (const forbidden of [
        'lib/ai/manager', 'manager_tasks', 'claim_runs', 'executeWorkflow', 'invokeTool',
        'stripe', 'publish', 'workpackage', 'delegation', 'runs/execute', 'runs/drain',
      ]) {
        expect(code.toLowerCase(), `${f} :: ${forbidden}`).not.toContain(forbidden.toLowerCase())
      }
    }
  })

  it('imports only the sanctioned domain boundaries', () => {
    for (const f of files) {
      const imports = codeOf(f).match(/from '([^']+)'/g) ?? []
      for (const imp of imports) {
        expect(imp).toMatch(
          /next\/server|atlas\/(authorization|decision-ledger|mission)\/principal-write|atlas\/executive\/http/,
        )
      }
    }
  })

  it('Mission activate appends lifecycle state and creates nothing else', async () => {
    await missionRoute(req({ action: 'activate', missionId: UUID_B, authorizationId: UUID_A }))
    expect(calls.map(c => c.fn)).toEqual(['activateMission'])
    expect(argsFor('activateMission')[0]).toEqual({ missionId: UUID_B, authorizationId: UUID_A })
  })

  it('leaves the Manager route and Delegation/Work Package reachability unchanged', () => {
    const manager = readFileSync(resolve(REPO_ROOT, 'apps/web/app/api/manager/route.ts'), 'utf8')
    for (const act of ['prepare_delegation', 'assign_work_package', 'read_work_package']) {
      expect(manager).toContain(act)
    }
    // Executive authority never moved into the Manager route.
    for (const sym of ['approveDecision', 'activateMission', 'grantAuthorization']) {
      expect(manager).not.toContain(sym)
    }
  })
})
