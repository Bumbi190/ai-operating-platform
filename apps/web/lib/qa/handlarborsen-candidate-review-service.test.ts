import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assembleCandidateReviews, candidateReviewEnabled,
  createCandidateReviewService, safeCandidateReviewCommand,
  type CandidateReviewDependencies,
} from '@/lib/atlas/project-analytics/handlarborsen-candidate-review-service'
import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/collectors/handlarborsen-marketplace'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/auth/organization-project-read', () => ({ resolveOrganizationReadScope: vi.fn() }))
vi.mock('@/lib/os/project-command-center', () => ({
  isHandlarborsenProject: (p: any) => p?.id === '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'
    && p.slug === 'handlarborsen' && p.name === 'Handlarbörsen',
}))
vi.mock('@/lib/atlas/project-analytics/handlarborsen-competitor-memory-service', () => ({
  candidateMemoryEnabled: (env: Record<string,string>) => env.HANDLARBORSEN_CANDIDATE_MEMORY_ENABLED === 'true',
}))

const actor = '11111111-1111-4111-8111-111111111111'
const owner = '22222222-2222-4222-8222-222222222222'
const host = 'tradingsolutions.se'
const now = new Date('2026-10-17T08:00:00.000Z')
const requestId = '33333333-3333-4333-8333-333333333333'
const command = { host, status: 'interesting' as const, requestId }
const evidence = {
  project_id: HANDLARBORSEN_PROJECT_ID,
  host,
  actor_id: actor,
  request_id: requestId,
  id: 1,
  status: 'interesting',
  occurred_at: '2026-10-17T07:01:00+00:00',
}
const project = { id: HANDLARBORSEN_PROJECT_ID, slug: 'handlarborsen', name: 'Handlarbörsen', owner_id: owner }
const collaborator = { active: true as const, role: 'collaborator' as const }
const ownerRole = { active: true as const, role: 'owner' as const }

function setup(opts: {
  enabled?: boolean; memoryEnabled?: boolean; session?: boolean; role?: typeof collaborator|typeof ownerRole
  scopeIds?: string[]; candidates?: unknown[]; decisions?: unknown[]; project?: typeof project | null
  projectError?: boolean; candidateError?: boolean; decisionError?: boolean
} = {}) {
  const auth = vi.fn(async () => ({ data: { user: opts.session === false ? null : { id: opts.role?.role === 'owner' ? owner : actor } }, error: null }))
  const session = vi.fn(async () => ({ auth: { getUser: auth } }))
  const scope = vi.fn(async () => ({
    role: opts.role ?? collaborator,
    projectIds: opts.scopeIds ?? [HANDLARBORSEN_PROJECT_ID],
  }))
  const projectRead = vi.fn(async () => ({
    data: opts.project === undefined ? project : opts.project,
    error: opts.projectError ? { message: 'fail' } : null,
  }))
  const candidatesRead = vi.fn(async () => ({
    data: opts.candidates ?? [{ project_id: HANDLARBORSEN_PROJECT_ID, host }],
    error: opts.candidateError ? { message: 'fail' } : null,
  }))
  const decisionsRead = vi.fn(async () => ({
    data: opts.decisions ?? [],
    error: opts.decisionError ? { message: 'fail' } : null,
  }))
  const rpc = vi.fn(async () => ({ data: [{ outcome: 'saved', current_status: 'interesting', decision_id: 1 }], error: null }))
  const from = vi.fn((table: string) => {
    if (table === 'projects') return {
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: projectRead }) }) }),
    }
    if (table === 'handlarborsen_competitor_candidates') return {
      select: () => ({ eq: () => ({ order: () => ({ limit: candidatesRead }) }) }),
    }
    if (table === 'handlarborsen_competitor_review_decisions') return {
      select: () => ({ eq: () => ({ order: () => ({ limit: decisionsRead }) }) }),
    }
    throw Error('invalid service table ' + table)
  })
  const admin = vi.fn(() => ({ from, rpc }))
  const deps = {
    session, admin, scope, now: () => now,
    env: {
      HANDLARBORSEN_CANDIDATE_REVIEW_ENABLED: opts.enabled === false ? 'false' : 'true',
      HANDLARBORSEN_CANDIDATE_MEMORY_ENABLED: opts.memoryEnabled === false ? 'false' : 'true',
    },
  } as unknown as CandidateReviewDependencies
  return { deps, service: createCandidateReviewService(deps), auth, scope, admin, from,
    projectRead, candidatesRead, decisionsRead, rpc }
}

describe('Handlarbörsen P2 human review decisions (offline)', () => {
  it('keeps feature OFF without either explicit flag and does not open any session', async () => {
    for (const options of [{ enabled: false }, { memoryEnabled: false }]) {
      const h = setup(options)
      expect(await h.service.load()).toEqual({ status: 'disabled' })
      expect(await h.service.decide(command)).toEqual({ status: 'disabled' })
      expect(h.auth).not.toHaveBeenCalled()
    }
    expect(candidateReviewEnabled({ NODE_ENV: 'test', HANDLARBORSEN_CANDIDATE_REVIEW_ENABLED: 'true' })).toBe(false)
  })

  it('accepts only a fixed canonical host, four exact statuses and one UUIDv4 idempotency key', () => {
    expect(safeCandidateReviewCommand(command)).toEqual(command)
    for (const bad of [
      null, {}, { ...command, status: 'approve_execution' },
      { ...command, host: 'www.tradingsolutions.se' },
      { ...command, host: 'https://tradingsolutions.se/' },
      { ...command, host: 'example.se/?x=1' },
      { ...command, requestId: 'not-a-uuid' },
      { ...command, projectId: HANDLARBORSEN_PROJECT_ID },
      { ...command, userId: actor },
      { ...command, html: '<script>' },
    ]) expect(safeCandidateReviewCommand(bad)).toBeNull()
  })

  it('rejects absent session, revoked membership and foreign project before project-scoped read/write', async () => {
    for (const options of [
      { session: false }, { scopeIds: [] }, { scopeIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] },
      { role: { active: false, role: null } as any }, { project: { ...project, slug: 'wrong' } },
      { projectError: true },
    ]) {
      const h = setup(options)
      const result = await h.service.decide(command)
      expect(result.status === 'unauthorized' || result.status === 'forbidden').toBe(true)
      expect(h.rpc).not.toHaveBeenCalled()
      if (options.session === false || options.scopeIds || options.role) expect(h.from).not.toHaveBeenCalled()
    }
  })

  it('authenticates both owner and collaborator while always deriving actor identity server-side', async () => {
    for (const role of [collaborator, ownerRole]) {
      const h = setup({ role })
      expect(await h.service.decide(command)).toEqual({ status: 'saved', decidedStatus: 'interesting' })
      expect(h.rpc).toHaveBeenCalledWith('handlarborsen_decide_candidate_review_v1', {
        p_project_id: HANDLARBORSEN_PROJECT_ID,
        p_host: host, p_status: 'interesting', p_request_id: requestId,
        p_actor_id: role.role === 'owner' ? owner : actor,
      })
    }
  })

  it('denies even the organization owner when live projects.owner_id does not match them', async () => {
    const h = setup({ role: ownerRole, project: { ...project, owner_id: actor } })
    expect(await h.service.decide(command)).toEqual({ status: 'forbidden' })
    expect(h.rpc).not.toHaveBeenCalled()
  })

  it('returns no success on invalid stored candidate list, SQL errors or unexpected RPC result', async () => {
    for (const opts of [{ candidateError: true }, { decisions: [{ ...evidence, project_id: 'foreign' }] }]) {
      const h = setup(opts)
      const result = await h.service.load()
      expect(result.status === 'unavailable' || result.status === 'invalid').toBe(true)
    }
    const h = setup()
    h.rpc.mockResolvedValueOnce({ data: [{ outcome: 'saved', current_status: 'ignored', decision_id: 1 }], error: null })
    expect(await h.service.decide(command)).toEqual({ status: 'unavailable' })
  })

  it('represents all candidate statuses from immutable sequence history and counts only pending/interesting', () => {
    const second = 'another-marketplace.se'
    const rows = [
      evidence,
      { ...evidence, id: 2, host: second, request_id: '44444444-4444-4444-8444-444444444444', status: 'reviewed' },
      { ...evidence, id: 3, host, request_id: '55555555-5555-4555-8555-555555555555', status: 'ignored' },
      { ...evidence, id: 4, host, request_id: '66666666-6666-4666-8666-666666666666', status: 'pending' },
    ]
    const x = assembleCandidateReviews([host,second],rows,now)
    expect(x.status).toBe('ok')
    if (x.status !== 'ok') return
    expect(x.awaitingReview).toBe(1)
    expect(x.entries[0]).toMatchObject({
      host, status: 'pending', totalDecisions: 3,
    })
    expect(x.entries[0].history.map(y => y.status)).toEqual(['pending','ignored','interesting'])
    expect(x.entries[1].status).toBe('reviewed')
  })

  it('fails closed on duplicate event ID, forged project, unsupported state, unknown host and time in future', () => {
    for (const rows of [
      [evidence,evidence],
      [{ ...evidence, project_id: 'foreign' }],
      [{ ...evidence, status: 'published' }],
      [{ ...evidence, host: 'unknown-competitor.se' }],
      [{ ...evidence, occurred_at: '2099-01-01T00:00:00.000Z' }],
    ]) {
      expect(assembleCandidateReviews([host],rows,now)).toEqual({ status: 'invalid' })
    }
  })

  it('accepts replayed and no-change SQL outcomes without producing a new write itself', async () => {
    for (const status of ['unchanged','already_applied'] as const) {
      const h = setup()
      h.rpc.mockResolvedValueOnce({
        data: [{ outcome: status, current_status: 'interesting', decision_id: 1 }],
        error: null,
      })
      expect(await h.service.decide(command)).toEqual({ status, decidedStatus: 'interesting' })
      expect(h.rpc).toHaveBeenCalledTimes(1)
    }
  })
})
