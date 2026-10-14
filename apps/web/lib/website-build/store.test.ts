import { describe, it, expect } from 'vitest'
import { appendBuildFeedback, createBuildSession, readBuildSession, requestBuildControl, WebsiteBuildError } from './store'

const projectId = '10000000-0000-4000-8000-000000000001'
const userId = '20000000-0000-4000-8000-000000000001'
const sessionId = '30000000-0000-4000-8000-000000000001'
const principal = { userId, allowedProjectIds: [projectId] }
function database(result: unknown = {}) {
  const calls: { name: string; args: unknown }[] = []
  const db = { rpc: async (name: string, args: unknown) => { calls.push({ name, args }); return { data: result, error: null } } }
  return { db: db as any, calls }
}
describe('website build store boundaries', () => {
  it('rejects_foreign_project_before_database', async () => {
    const { db, calls } = database()
    await expect(readBuildSession(db, { userId, allowedProjectIds: [] }, { projectId, sessionId })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(calls).toHaveLength(0)
  })
  it('validates_feedback_boundaries_without_truncating', async () => {
    const { db, calls } = database()
    await expect(appendBuildFeedback(db, principal, { projectId, sessionId }, { idempotencyKey: 'key', text: 'a'.repeat(4001), inputSource: 'text', viewedRevisionId: null })).rejects.toBeInstanceOf(WebsiteBuildError)
    expect(calls).toHaveLength(0)
  })
  it('passes_explicit_author_project_and_viewed_revision_to_transaction', async () => {
    const result = { id: sessionId, sequence: 1, authorId: userId, text: 'Ändra rubriken', inputSource: 'voice', viewedRevisionId: sessionId, status: 'received', interpretation: null, appliedRevisionId: null, createdAt: '2026-10-14T07:00:00Z' }
    const { db, calls } = database(result)
    const input = { idempotencyKey: 'feedback-1', text: 'Ändra rubriken', inputSource: 'voice' as const, viewedRevisionId: sessionId }
    expect(await appendBuildFeedback(db, principal, { projectId, sessionId }, input)).toEqual(result)
    expect(calls).toEqual([{ name: 'website_build_append_feedback', args: { p_principal: principal, p_ref: { projectId, sessionId }, p_input: input } }])
  })
  it('rejects_empty_brief_or_invalid_identifiers', async () => {
    const { db, calls } = database()
    await expect(createBuildSession(db, principal, { projectId, agentId: sessionId, conversationId: sessionId, brief: ' ', idempotencyKey: 'create-1' })).rejects.toBeInstanceOf(WebsiteBuildError)
    await expect(readBuildSession(db, principal, { projectId, sessionId: '../other' })).rejects.toBeInstanceOf(WebsiteBuildError)
    expect(calls).toHaveLength(0)
  })
  it('rejects_unknown_controls', async () => {
    const { db } = database()
    await expect(requestBuildControl(db, principal, { projectId, sessionId }, 'deploy' as any, 'key')).rejects.toBeInstanceOf(WebsiteBuildError)
  })
  it('surfaces_database_conflicts_and_never_fabricates_success', async () => {
    const db = { rpc: async () => ({ data: null, error: { code: '23505', message: 'IDEMPOTENCY_CONFLICT' } }) } as any
    await expect(appendBuildFeedback(db, principal, { projectId, sessionId }, { idempotencyKey: 'key', text: 'Ändra rubriken', inputSource: 'text', viewedRevisionId: null })).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
  })
})
