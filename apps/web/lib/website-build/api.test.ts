import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { websiteBuildApi } from './api'
import { initializeWorkerDb, resetWorkerDb, testSql, TEST_AGENT, TEST_CONVERSATION, TEST_PRINCIPAL, TEST_PROJECT } from './test-db'
import { createBuildSession } from './store'
import { compileWebsiteArtifact } from './artifact'
const state = vi.hoisted(() => ({ db: null as unknown, authenticated: true }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => state.db }))
vi.mock('@/lib/auth/project-access', () => ({ resolveProjectAccess: async () => state.authenticated ? { ok: true, ...TEST_PRINCIPAL } : { ok: false, response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }) } }))
let db: ReturnType<typeof initializeWorkerDb>
const input = () => ({ projectId: TEST_PROJECT, agentId: TEST_AGENT, conversationId: TEST_CONVERSATION, brief: 'Bygg min hemsida', idempotencyKey: crypto.randomUUID() })
const request = (body?: unknown, projectId = TEST_PROJECT) => new Request('http://localhost/api/website-builds?projectId=' + projectId, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
beforeAll(() => { db = initializeWorkerDb(); state.db = db }, 30_000)
beforeEach(() => { state.authenticated = true; resetWorkerDb() })
describe('website build API authorization and durable results', () => {
  it('unauthenticated_request_is_denied_before_body_or_database', async () => { state.authenticated = false; const response = await websiteBuildApi('create', request(input()), {}); expect(response.status).toBe(401) })
  it('creates_one_real_queued_session_without_waiting_for_model', async () => { const payload = input(); const response = await websiteBuildApi('create', request(payload), {}); expect(response.status).toBe(201); const body = await response.json(); expect(body.status).toBe('queued'); expect(body.revisions).toEqual([]); expect((await websiteBuildApi('create', request(payload), {})).status).toBe(201) })
  it('invalid_input_is_400_and_conflicting_replay_is_409', async () => { expect((await websiteBuildApi('create', request({}), {})).status).toBe(400); const payload = input(); await websiteBuildApi('create', request(payload), {}); expect((await websiteBuildApi('create', request({ ...payload, brief: 'Annan brief' }), {})).status).toBe(409) })
  it('foreign_project_session_agent_or_conversation_is_denied', async () => {
    const own = await createBuildSession(db, TEST_PRINCIPAL, input())
    expect((await websiteBuildApi('get', request(undefined, '10000000-0000-4000-8000-000000000002'), { sessionId: own.sessionId })).status).toBe(404)
    expect((await websiteBuildApi('get', request(), { sessionId: crypto.randomUUID() })).status).toBe(404)
    expect((await websiteBuildApi('create', request({ ...input(), agentId: '40000000-0000-4000-8000-000000000002' }), {})).status).toBe(404)
    expect((await websiteBuildApi('create', request({ ...input(), conversationId: crypto.randomUUID() }), {})).status).toBe(404)
  })
  it('feedback_returns_persisted_receipt_and_replay_does_not_duplicate', async () => {
    const own = await createBuildSession(db, TEST_PRINCIPAL, input()), payload = { projectId: TEST_PROJECT, text: 'Gör rubriken större', inputSource: 'text', viewedRevisionId: null, idempotencyKey: 'same-feedback' }
    const first = await (await websiteBuildApi('feedback', request(payload), { sessionId: own.sessionId })).json()
    const second = await (await websiteBuildApi('feedback', request(payload), { sessionId: own.sessionId })).json()
    expect(first.id).toBe(second.id); expect(first.status).toBe('received')
    expect(testSql(`select count(*) from website_build_feedback where session_id='${own.sessionId}';`)).toBe('1')
  })
  it('unknown_artifact_is_404_and_export_is_private_verified_utf8', async () => {
    const own = await createBuildSession(db, TEST_PRINCIPAL, input())
    expect((await websiteBuildApi('artifact', request(), { sessionId: own.sessionId, revisionId: crypto.randomUUID() })).status).toBe(404)
    const artifact = compileWebsiteArtifact({ format: 'static-website.v1', title: 'Test', pages: [{ key: 'index', title: 'Hem', bodyHtml: '<h1>Vår idé</h1>', css: '', behaviors: [] }] })
    testSql(`update runs set status='running',claim_id=gen_random_uuid(),lease_until=now()+interval '5 minutes' where id=(select current_run_id from website_build_sessions where id='${own.sessionId}');`)
    const writer = JSON.parse(testSql(`select jsonb_build_object('projectId',s.project_id,'sessionId',s.id,'runId',r.id,'claimId',r.claim_id,'generation',s.generation) from website_build_sessions s join runs r on r.id=s.current_run_id where s.id='${own.sessionId}';`))
    const revision = JSON.parse(testSql(`select website_build_commit_revision('${JSON.stringify(writer)}','${JSON.stringify(artifact).replaceAll("'", "''")}');`))
    const response = await websiteBuildApi('export', request(), { sessionId: own.sessionId, revisionId: revision.id })
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store'); expect(response.headers.get('content-type')).toBe('application/zip'); expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(100)
  })
  it('rejects_oversized_body_and_unknown_control', async () => {
    expect((await websiteBuildApi('create', request({ blob: 'a'.repeat(70_000) }), {})).status).toBe(413)
    const own = await createBuildSession(db, TEST_PRINCIPAL, input())
    expect((await websiteBuildApi('control', request({ projectId: TEST_PROJECT, action: 'deploy', idempotencyKey: 'x' }), { sessionId: own.sessionId })).status).toBe(400)
  })
})
