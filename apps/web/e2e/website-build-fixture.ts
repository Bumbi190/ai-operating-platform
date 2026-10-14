import { createAdminClient } from './website-build-fixture-db'
import { TEST_AGENT, TEST_CONVERSATION, TEST_PRINCIPAL, TEST_PROJECT, testSql, resetWorkerDb } from '../lib/website-build/test-db'
import { createBuildSession, readBuildSession, loadBuildSnapshot, setBuildStage, recordBuildInterpretation, parkBuildSession } from '../lib/website-build/store'
import { executeWebsiteBuildRun } from '../lib/website-build/worker'
import { setFixtureTemplate } from './website-build-fixture-provider'
import type { WriterRef } from '../lib/website-build/types'
const db = createAdminClient()
export async function setup() {
  resetWorkerDb()
  const session = await createBuildSession(db, TEST_PRINCIPAL, { projectId: TEST_PROJECT, agentId: TEST_AGENT, conversationId: TEST_CONVERSATION, brief: 'En hemsida för vårt svenska café', idempotencyKey: crypto.randomUUID() })
  return { session, userId: TEST_PRINCIPAL.userId, projectSlug: 'test-project', brief: 'En hemsida för vårt svenska café' }
}
export async function snapshot(sessionId: string) { return readBuildSession(db, TEST_PRINCIPAL, { projectId: TEST_PROJECT, sessionId }) }
function writer(sessionId: string): WriterRef {
  testSql(`update runs set status='running', claim_id=coalesce(claim_id,gen_random_uuid()),lease_until=now()+interval '5 minutes' where id=(select current_run_id from website_build_sessions where id='${sessionId}');`)
  return JSON.parse(testSql(`select jsonb_build_object('projectId',s.project_id,'sessionId',s.id,'runId',r.id,'claimId',r.claim_id,'generation',s.generation) from website_build_sessions s join runs r on r.id=s.current_run_id where s.id='${sessionId}';`))
}
/** Browser fixture drives actual store/RPC boundaries, no paid or live provider. */
export async function step(sessionId: string, action: string) {
  if (!/^[0-9a-f-]{36}$/.test(sessionId)) throw Error('Invalid fixture id')
  const w = writer(sessionId)
  if (action === 'pause') { await parkBuildSession(db, w); return snapshot(sessionId) }
  if (action === 'fail') { testSql(`update runs set status='failed' where id='${w.runId}';`); return snapshot(sessionId) }
  const input = await loadBuildSnapshot(db, w)
  if (action === 'ack') {
    await setBuildStage(db, w, 'interpreting')
    await recordBuildInterpretation(db, w, { items: input.feedback.map(item => ({ feedbackId: item.id, summary: 'Jag ändrar hemsidan: ' + item.text, disposition: 'apply', changeKey: 'title', supersedesFeedbackIds: [] })) })
    await setBuildStage(db, w, 'building'); return snapshot(sessionId)
  }
  const run = JSON.parse(testSql(`select to_jsonb(r) from runs r where id='${w.runId}';`))
  setFixtureTemplate(action === 'tabs' ? 'tabs' : action === 'forms' ? 'forms' : 'default')
  try { await executeWebsiteBuildRun(db, run, w.claimId) } finally { setFixtureTemplate('default') }
  testSql(`update runs set status='done' where id='${w.runId}';`)
  return snapshot(sessionId)
}
