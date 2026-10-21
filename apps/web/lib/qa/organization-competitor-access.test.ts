import { describe, expect, it, vi } from 'vitest'
import { authorizeOrganizationCompetitorAction } from '@/lib/auth/organization-competitor-access'
import { HANDLARBORSEN_PROJECT_ID, HANDLARBORSEN_PROJECT_SLUG } from '@/lib/atlas/collectors/handlarborsen-marketplace'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

const project = { id: HANDLARBORSEN_PROJECT_ID, slug: HANDLARBORSEN_PROJECT_SLUG, name: 'Handlarbörsen' }
const collaborator = { active: true as const, role: 'collaborator' as const }
const denied = { active: false as const, role: null }
const owner = { active: true as const, role: 'owner' as const }
const user = { id: '11111111-1111-4111-8111-111111111111' }
const foreign = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function harness(config: {
  sessionUser?: typeof user | null
  role?: typeof collaborator | typeof owner | typeof denied
  ids?: string[]
  project?: typeof project | null
  projectError?: boolean
  scopeError?: boolean
} = {}) {
  const session = { auth: { getUser: vi.fn(async () => ({
    data: { user: config.sessionUser === undefined ? user : config.sessionUser },
    error: null,
  })) } }
  const selectProject = vi.fn(async () => ({
    data: config.project === undefined ? project : config.project,
    error: config.projectError ? { message: 'read failed' } : null,
  }))
  const from = vi.fn((_table: string) => ({
    select: vi.fn(() => ({ eq: () => ({ eq: () => ({ maybeSingle: selectProject }) }) })),
  }))
  const db = { from }
  const scope = vi.fn(async () => {
    if (config.scopeError) throw Error('membership source unavailable')
    return {
      role: config.role ?? collaborator,
      projectIds: config.ids ?? [HANDLARBORSEN_PROJECT_ID],
    }
  })
  const deps = { session: async () => session, admin: () => db, scope }
  return { deps, session, scope, from, selectProject }
}

describe('organization Handlarbörsen competitor delegation', () => {
  it('denies a missing session before membership or any admin query', async () => {
    const h = harness({ sessionUser: null })
    expect(await authorizeOrganizationCompetitorAction('record_competitor_evidence', h.deps as any))
      .toEqual({ ok: false, status: 'unauthorized' })
    expect(h.scope).not.toHaveBeenCalled()
    expect(h.from).not.toHaveBeenCalled()
  })
  it('allows an active collaborator to view and manually record evidence for canonical Handlarbörsen', async () => {
    const h = harness()
    for (const action of ['view_competitors', 'record_competitor_evidence'] as const) {
      const result = await authorizeOrganizationCompetitorAction(action, h.deps as any)
      expect(result.ok).toBe(true)
    }
    expect(h.from).toHaveBeenCalledTimes(2)
    expect(h.from).toHaveBeenNthCalledWith(1, 'projects')
    expect(h.scope).toHaveBeenCalledTimes(2)
  })
  it('never confuses the Owner organizational UI with the delegated collaborator write path', async () => {
    const h = harness({ role: owner })
    expect(await authorizeOrganizationCompetitorAction('record_competitor_evidence', h.deps as any))
      .toEqual({ ok: false, status: 'forbidden' })
    expect(h.from).not.toHaveBeenCalled()
  })
  it('blocks revoked membership and membership query failures', async () => {
    for (const config of [{ role: denied }, { scopeError: true }]) {
      const h = harness(config as any)
      const response = await authorizeOrganizationCompetitorAction('view_competitors', h.deps as any)
      expect(response.ok).toBe(false)
      expect(h.from).not.toHaveBeenCalled()
    }
  })
  it('blocks organizations where Handlarbörsen is outside the scoped Owner project IDs', async () => {
    for (const ids of [[], [foreign]]) {
      const h = harness({ ids })
      expect(await authorizeOrganizationCompetitorAction('record_competitor_evidence', h.deps as any))
        .toEqual({ ok: false, status: 'forbidden' })
      expect(h.from).not.toHaveBeenCalled()
    }
  })
  it('fails closed for lookalike projects, missing data and permission drift', async () => {
    for (const candidate of [
      null, { ...project, id: foreign }, { ...project, slug: 'other' },
      { ...project, name: 'Lookalike' },
    ]) {
      const h = harness({ project: candidate })
      expect(await authorizeOrganizationCompetitorAction('view_competitors', h.deps as any))
        .toEqual({ ok: false, status: 'forbidden' })
    }
    const h = harness({ projectError: true })
    expect(await authorizeOrganizationCompetitorAction('record_competitor_evidence', h.deps as any))
      .toEqual({ ok: false, status: 'forbidden' })
  })
  it('rejects non-declared actions', async () => {
    const h = harness()
    expect(await authorizeOrganizationCompetitorAction('approve' as any, h.deps as any))
      .toEqual({ ok: false, status: 'forbidden' })
    expect(h.session.auth.getUser).not.toHaveBeenCalled()
  })
})
