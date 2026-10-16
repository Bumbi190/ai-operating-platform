import { describe, expect, it, vi } from 'vitest'
import {
  createCandidateMemoryService, candidateDigest,
  type CandidateMemoryDependencies,
} from '@/lib/atlas/project-analytics/handlarborsen-competitor-memory-service'
import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/collectors/handlarborsen-marketplace'
import { MANUALLY_REVIEWED_DISCOVERY_LEADS } from '@/lib/atlas/project-analytics/handlarborsen-competitor-discovery-leads'

vi.mock('@/lib/auth/project-access', () => ({ resolveProjectAccess: vi.fn() }))
vi.mock('@/lib/project/get-project', () => ({ getProjectBySlug: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

const actor = '11111111-1111-4111-8111-111111111111'
const clock = new Date('2026-10-15T11:00:00.000Z')
const lead = MANUALLY_REVIEWED_DISCOVERY_LEADS[0]
const project = {
  id: HANDLARBORSEN_PROJECT_ID, slug: 'handlarborsen', name: 'Handlarbörsen',
  color: '#000000', settings: {}, executionPaused: false, pausedAt: null, pausedReason: null,
}
function makeRow() {
  return {
    project_id: HANDLARBORSEN_PROJECT_ID,
    host: 'tradingsolutions.se',
    name: lead.name, official_url: lead.officialUrl,
    observed_on: lead.observedOn, relevance: lead.relevance,
    provenance: lead.provenance,
    evidence_digest: candidateDigest(lead),
    first_seen_at: '2026-10-15T10:30:00+00:00',
  }
}

function harness(rows: any[] = [], enabled = true) {
  const stored = [...rows]
  const read = vi.fn(async () => ({ data: [...stored], error: null as any }))
  const insert = vi.fn((payload: any[], opts: any) => ({
    select: vi.fn(async () => {
      if (stored.length) return { data: [], error: null }
      stored.push(...payload.map(x => ({ ...x, first_seen_at: clock.toISOString() })))
      return { data: payload.map(x => ({ host: x.host })), error: null }
    }),
  }))
  const from = vi.fn((table: string) => {
    if (table === 'projects') return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({
        data: { id: HANDLARBORSEN_PROJECT_ID, slug: 'handlarborsen', owner_id: actor }, error: null,
      }) }) }),
    }
    if (table === 'handlarborsen_competitor_candidates') return {
      select: () => ({ eq: () => ({ order: () => ({ limit: read }) }) }),
      upsert: insert,
    }
    throw Error('unexpected table ' + table)
  })
  const access = vi.fn(async () => ({ ok: true as const, userId: actor, allowedProjectIds: [project.id] }))
  const getProject = vi.fn(async () => project)
  const deps = {
    access, project: getProject, db: () => ({ from }), now: () => clock,
    env: { HANDLARBORSEN_CANDIDATE_MEMORY_ENABLED: String(enabled) },
    leads: MANUALLY_REVIEWED_DISCOVERY_LEADS,
  } as unknown as CandidateMemoryDependencies
  return { service: createCandidateMemoryService(deps), deps, access, getProject, from, read, insert, stored }
}

describe('Handlarbörsen permanent competitor candidate memory P1 (fail-closed)', () => {
  it('does not access session, project, db or storage when flag is off', async () => {
    const h = harness([], false)
    expect(await h.service.load()).toEqual({ status: 'disabled' })
    expect(await h.service.saveReviewedLead()).toEqual({ status: 'disabled' })
    expect(h.access).not.toHaveBeenCalled()
    expect(h.from).not.toHaveBeenCalled()
  })
  it('denies missing session before any admin DB or scan', async () => {
    const h = harness()
    h.access.mockResolvedValueOnce({ ok: false, response: { status: 401 } } as any)
    expect(await h.service.saveReviewedLead()).toEqual({ status: 'unauthorized' })
    expect(h.from).not.toHaveBeenCalled()
  })
  it('denies project view collaborators without owner authority', async () => {
    const h = harness()
    h.access.mockResolvedValueOnce({
      ok: true, userId: 'read-only-viewer', allowedProjectIds: [project.id],
    })
    expect(await h.service.saveReviewedLead()).toEqual({ status: 'forbidden' })
    expect(h.insert).not.toHaveBeenCalled()
  })
  it('denies another-project access before privileged DB access', async () => {
    const h = harness()
    h.access.mockResolvedValueOnce({ ok: true, userId: actor, allowedProjectIds: [] })
    expect(await h.service.saveReviewedLead()).toEqual({ status: 'forbidden' })
    expect(h.from).not.toHaveBeenCalled()
  })
  it('saves a single fixed, official candidate with project lock, hash and ignore-duplicates', async () => {
    const h = harness()
    expect(await h.service.saveReviewedLead()).toEqual({ status: 'saved', count: 1 })
    expect(h.insert).toHaveBeenCalledOnce()
    const [rows, options] = h.insert.mock.calls[0] as any
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      project_id: HANDLARBORSEN_PROJECT_ID,
      host: 'tradingsolutions.se',
      name: lead.name,
      evidence_digest: candidateDigest(lead),
    })
    expect(options).toEqual({ onConflict: 'project_id,host', ignoreDuplicates: true })
    expect(await h.service.saveReviewedLead()).toEqual({ status: 'already_recorded', count: 0 })
    expect(h.insert).toHaveBeenCalledTimes(1)
  })
  it('accepts a narrowly authorized collaborator without reusing owner access on candidate data', async () => {
    const h = harness([makeRow()])
    const delegated = vi.fn(async () => ({ ok: true as const, db: { from: h.from } as any }))
    const service = createCandidateMemoryService(h.deps, delegated)
    expect((await service.load()).status).toBe('ok')
    expect(await service.saveReviewedLead()).toEqual({ status: 'already_recorded', count: 0 })
    expect(delegated).toHaveBeenCalledTimes(2)
    expect(h.access).not.toHaveBeenCalled()
    expect(h.insert).not.toHaveBeenCalled()
  })
  it('denies revoked collaborator authorization before any database read or write', async () => {
    const h = harness()
    const service = createCandidateMemoryService(h.deps, async () => ({ ok: false, status: 'forbidden' }))
    expect(await service.saveReviewedLead()).toEqual({ status: 'forbidden' })
    expect(h.from).not.toHaveBeenCalled()
    expect(h.insert).not.toHaveBeenCalled()
  })
  it('reads real persisted evidence and derives one review-only candidate without notifying', async () => {
    const h = harness([makeRow()])
    const result = await h.service.load()
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.awaitingReview).toBe(1)
    expect(result.candidates[0]).toMatchObject({
      host: 'tradingsolutions.se',
      firstSeenAt: '2026-10-15T10:30:00.000Z',
      lifecycle: 'candidate_for_review',
      foundedRecently: 'not_verified',
      executable: false,
    })
  })
  it('fails closed on a tampered digest, foreign project and duplicate records', async () => {
    for (const rows of [
      [{ ...makeRow(), evidence_digest: '0'.repeat(64) }],
      [{ ...makeRow(), project_id: 'foreign' }],
      [makeRow(), makeRow()],
      [{ ...makeRow(), official_url: 'https://evil.example/' }],
    ]) {
      const h = harness(rows)
      expect(await h.service.load()).toEqual({ status: 'unavailable' })
    }
  })
  it('refuses invalid official-only seed data and does not write', async () => {
    const h = harness()
    h.deps.leads = [{
      ...lead, officialUrl: 'http://unsafe.example/',
    }] as any
    expect(await h.service.saveReviewedLead()).toEqual({ status: 'invalid' })
    expect(h.insert).not.toHaveBeenCalled()
  })
  it('does not overwrite an earlier candidate when database wins a race', async () => {
    const h = harness()
    h.insert.mockImplementationOnce(() => ({
      select: vi.fn(async () => ({ data: [], error: null })),
    }))
    expect(await h.service.saveReviewedLead()).toEqual({ status: 'already_recorded', count: 0 })
  })
  it('returns unavailable and does not insert when a read fails', async () => {
    const h = harness()
    h.read.mockResolvedValueOnce({ data: null as any, error: { message: 'table unavailable' } })
    expect(await h.service.saveReviewedLead()).toEqual({ status: 'unavailable' })
    expect(h.insert).not.toHaveBeenCalled()
  })
})
