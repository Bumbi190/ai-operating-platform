import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
const projectId = '00000000-0000-4000-8000-000000000001'
const attemptId = '00000000-0000-4000-8000-000000000010'
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true }
    if (specifier === '@/lib/auth/project-access') return {
      url: 'data:text/javascript,export async function resolveProjectAccess(){return globalThis.__phApproved.access}', shortCircuit: true,
    }
    if (specifier === '../authorization/principal-read') return {
      url: 'data:text/javascript,' + encodeURIComponent(`
        export async function resolveAuthorization(id) {
          const f = globalThis.__phApproved
          f.grantReads++
          return f.revokedAfterFetch && f.fetches ? { status: 'ok', state: null, history: [] } : f.authorization
        }`), shortCircuit: true,
    }
    if (specifier === '@/lib/supabase/admin') return {
      url: 'data:text/javascript,' + encodeURIComponent(`
        export function createAdminClient() { return { async rpc(name, args) {
          const f = globalThis.__phApproved
          f.rpc.push({ name, args })
          if (name === 'atlas_posthog_reserve_read') return f.reservation
          return { data: true, error: f.auditError }
        } } }`), shortCircuit: true,
    }
    return next(specifier, context)
  },
})
const { prepareApprovedPosthogRead, readApprovedPosthogDashboards } = await import('../atlas/capability/posthog-approved-read.ts')
const originalFetch = globalThis.fetch
const envKeys = ['POSTHOG_APPROVED_READ_ENABLED','POSTHOG_OMNIRA_PROJECT_ID','POSTHOG_PROJECT_ID','POSTHOG_PERSONAL_API_KEY','POSTHOG_APP_HOST']
const savedEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]))
test.beforeEach(() => {
  Object.assign(process.env, {
    POSTHOG_APPROVED_READ_ENABLED: 'true', POSTHOG_OMNIRA_PROJECT_ID: projectId,
    POSTHOG_PROJECT_ID: '123', POSTHOG_PERSONAL_API_KEY: 'TEST_PRIVATE_KEY', POSTHOG_APP_HOST: 'https://eu.posthog.com',
  })
  globalThis.__phApproved = {
    access: { ok: true, userId: 'human-1', allowedProjectIds: [projectId] },
    authorization: null, reservation: { data: attemptId, error: null }, rpc: [],
    auditError: null, grantReads: 0, fetches: 0, revokedAfterFetch: false,
  }
  globalThis.fetch = async (url, options) => {
    globalThis.__phApproved.fetches++
    assert.equal(url.pathname, '/api/projects/123/dashboards/')
    assert.equal(options.headers.Authorization, 'Bearer TEST_PRIVATE_KEY')
    return Response.json({ results: [{ id: 1, name: 'Pilot' }] })
  }
})
test.after(() => {
  globalThis.fetch = originalFetch
  for (const key of envKeys) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
})
async function approvedRequest() {
  const proposal = await prepareApprovedPosthogRead({ projectId })
  globalThis.__phApproved.authorization = {
    status: 'ok', history: [{ eventId: 'e1' }, { eventId: 'e2' }],
    state: { authorizationId: 'auth-1', principalId: 'human-1', projectId, status: 'granted',
      target: proposal.target, authority: { actionKind: proposal.actionKind }, conditions: [],
      expiresAt: '2099-01-01T00:00:00Z' },
  }
  return { projectId, authorizationId: 'auth-1', expectedVersionHash: proposal.target.versionHash }
}
test('approved path actually returns mapped dashboard data after reservation and audit', async () => {
  const result = await readApprovedPosthogDashboards(await approvedRequest())
  assert.deepEqual(result, { dashboards: [{ id: 1, name: 'Pilot' }] })
  assert.equal(globalThis.__phApproved.fetches, 1)
  assert.deepEqual(globalThis.__phApproved.rpc.map(x => x.name), ['atlas_posthog_reserve_read','atlas_posthog_finish_read'])
  assert.equal(globalThis.__phApproved.rpc[1].args.p_outcome, 'succeeded')
  assert.equal(globalThis.__phApproved.grantReads, 2)
})
test('proposal never exposes the API key and cannot grant execution', async () => {
  const proposal = await prepareApprovedPosthogRead({ projectId })
  assert.ok(!JSON.stringify(proposal).includes('TEST_PRIVATE_KEY'))
  assert.equal(globalThis.__phApproved.fetches, 0)
  assert.equal(globalThis.__phApproved.rpc.length, 0)
})
test('disabled switch, absent login, wrong project and missing config stop before fetch', async () => {
  const request = await approvedRequest()
  for (const setup of [
    () => { process.env.POSTHOG_APPROVED_READ_ENABLED = 'false' },
    () => { globalThis.__phApproved.access = { ok: false } },
    () => { globalThis.__phApproved.access.allowedProjectIds = [] },
    () => { delete process.env.POSTHOG_PERSONAL_API_KEY },
  ]) {
    Object.assign(process.env, { POSTHOG_APPROVED_READ_ENABLED: 'true', POSTHOG_PERSONAL_API_KEY: 'TEST_PRIVATE_KEY' })
    globalThis.__phApproved.access = { ok: true, userId: 'human-1', allowedProjectIds: [projectId] }
    setup()
    await assert.rejects(readApprovedPosthogDashboards(request))
    assert.equal(globalThis.__phApproved.fetches, 0)
    assert.equal(globalThis.__phApproved.rpc.length, 0)
  }
})
test('stale mapping and forged approval fields cannot authorize', async () => {
  const request = await approvedRequest()
  process.env.POSTHOG_PROJECT_ID = '999'
  await assert.rejects(readApprovedPosthogDashboards({ ...request, approved: true }), /posthog_review_stale/)
  assert.equal(globalThis.__phApproved.fetches, 0)
})
test('expired, conditional, revoked or foreign grants cannot reserve or fetch', async () => {
  const request = await approvedRequest()
  const base = globalThis.__phApproved.authorization.state
  for (const change of [
    { status: 'revoked' }, { conditions: [{}] }, { principalId: 'other' }, { projectId: 'other' },
    { expiresAt: '2000-01-01T00:00:00Z' }, { authority: { actionKind: 'mission.activate' } },
  ]) {
    globalThis.__phApproved.authorization.state = { ...base, ...change }
    await assert.rejects(readApprovedPosthogDashboards(request), /posthog_read_not_authorized/)
    assert.equal(globalThis.__phApproved.rpc.length, 0)
    assert.equal(globalThis.__phApproved.fetches, 0)
  }
})
test('quota/schema reservation failure blocks every provider request', async () => {
  const request = await approvedRequest()
  globalThis.__phApproved.reservation = { data: null, error: { message: 'PRIVATE SQL ERROR', code: 'P0001' } }
  await assert.rejects(readApprovedPosthogDashboards(request), /^Error: posthog_read_reservation_failed$/)
  assert.equal(globalThis.__phApproved.fetches, 0)
})
test('provider failure consumes reservation and records safe failure outcome', async () => {
  const request = await approvedRequest()
  globalThis.fetch = async () => { globalThis.__phApproved.fetches++; throw Error('PRIVATE URL') }
  await assert.rejects(readApprovedPosthogDashboards(request), /^Error: posthog_read_failed$/)
  assert.equal(globalThis.__phApproved.rpc[1].args.p_outcome, 'failed')
  assert.ok(!JSON.stringify(globalThis.__phApproved.rpc).includes('TEST_PRIVATE_KEY'))
})
test('audit failure suppresses successful provider result', async () => {
  const request = await approvedRequest()
  globalThis.__phApproved.auditError = { message: 'PRIVATE' }
  await assert.rejects(readApprovedPosthogDashboards(request), /^Error: posthog_read_audit_failed$/)
  assert.equal(globalThis.__phApproved.fetches, 1)
})
test('post-fetch revocation suppresses data and records failure', async () => {
  const request = await approvedRequest()
  globalThis.__phApproved.revokedAfterFetch = true
  await assert.rejects(readApprovedPosthogDashboards(request), /posthog_read_not_authorized/)
  assert.equal(globalThis.__phApproved.rpc[1].args.p_outcome, 'failed')
})

test('known database quota denial becomes a rate-limit response without fetch', async () => {
  const request = await approvedRequest()
  globalThis.__phApproved.reservation = { data: null, error: { message: 'posthog_read_quota_exceeded', code: 'P0001' } }
  await assert.rejects(readApprovedPosthogDashboards(request), /^Error: posthog_read_rate_limited$/)
  assert.equal(globalThis.__phApproved.fetches, 0)
})
