import {setProjectWebsiteBuilder} from '../lib/website-build/planning/store'
import {readConversationWorkspace} from '../lib/website-build/planning/conversation-workspace'
import { createAdminClient,resolveProjectAccess } from './website-build-fixture-db'
import { TEST_AGENT, TEST_CONVERSATION, TEST_PRINCIPAL, TEST_PROJECT, testSql, resetWorkerDb } from '../lib/website-build/test-db'
import {approvedTestBuild} from '../lib/website-build/planning/test-fixture'
import { createBuildSession, readBuildSession, loadBuildSnapshot, setBuildStage, recordBuildInterpretation, parkBuildSession } from '../lib/website-build/store'
import { executeWebsiteBuildRun } from '../lib/website-build/worker'
import { setFixtureTemplate } from './website-build-fixture-provider'
import type { WriterRef } from '../lib/website-build/types'
const db = createAdminClient()
export async function setup() {
  resetWorkerDb()
  const conversationId=crypto.randomUUID();testSql("insert into conversations(id,user_id,project_id) values('"+conversationId+"','"+TEST_PRINCIPAL.userId+"','"+TEST_PROJECT+"');")
  const session = await approvedTestBuild(db, TEST_PRINCIPAL, { projectId: TEST_PROJECT, agentId: TEST_AGENT, conversationId, brief: 'En hemsida för vårt svenska café', idempotencyKey: crypto.randomUUID() })
  return { session,...await conversation(session), userId: TEST_PRINCIPAL.userId, projectSlug: 'test-project', brief: 'En hemsida för vårt svenska café' }
}
export async function snapshot(sessionId:string){if(!/^[0-9a-f-]{36}$/.test(sessionId))throw Error('Invalid fixture session');const projectId=testSql("select project_id from website_build_sessions where id='"+sessionId+"' and created_by='"+TEST_PRINCIPAL.userId+"';");const access=await resolveProjectAccess();if(!access.ok)throw Error('Fixture session unavailable');return readBuildSession(db,access,{projectId,sessionId})}
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
export async function conversation(session:Awaited<ReturnType<typeof snapshot>>){const workspace=await readConversationWorkspace(db,TEST_PRINCIPAL,session.conversationId,session.sessionId);const saved=JSON.parse(testSql("select coalesce(jsonb_agg(to_jsonb(m) order by created_at),'[]') from conversation_messages m where conversation_id='"+session.conversationId+"';"));return {conversationModel:{id:session.conversationId,operatorId:TEST_PRINCIPAL.userId,title:'Webbbygge med Atlas',projectId:TEST_PROJECT,projectName:'Testprojekt',state:'ok',saved,chatBase:'/chat'},plan:workspace.plan}}
export async function setupConversation({missingBuilder=false,historical=false,multiple=false}:{missingBuilder?:boolean;historical?:boolean;multiple?:boolean}={}){
 resetWorkerDb()
 const id=crypto.randomUUID();testSql("insert into conversations(id,user_id,project_id) values('"+id+"','"+TEST_PRINCIPAL.userId+"','"+TEST_PROJECT+"');")
 await setProjectWebsiteBuilder(db,TEST_PRINCIPAL,{projectId:TEST_PROJECT,agentId:missingBuilder?null:TEST_AGENT})
 if(historical)testSql("insert into website_build_sessions(project_id,created_by,agent_id,conversation_id,brief,idempotency_key,status) values('"+TEST_PROJECT+"','"+TEST_PRINCIPAL.userId+"','"+TEST_AGENT+"','"+id+"','Ursprunglig brief för historiskt bygge','"+crypto.randomUUID()+"','paused');")
 if(multiple){
   const first=await approvedTestBuild(db,TEST_PRINCIPAL,{projectId:TEST_PROJECT,agentId:TEST_AGENT,conversationId:id,brief:'Första caféets hemsida',idempotencyKey:crypto.randomUUID()})
   await step(first.sessionId,'commit')
   const second=await approvedTestBuild(db,TEST_PRINCIPAL,{projectId:TEST_PROJECT,agentId:TEST_AGENT,conversationId:id,brief:'Andra caféets hemsida',idempotencyKey:crypto.randomUUID()})
   await step(second.sessionId,'commit')
   return {...await loadConversation(id,first.sessionId),preferredSessionId:first.sessionId}
 }
 return loadConversation(id)
}
export async function loadConversation(id:string,preferredSessionId?:string){
 if(!/^[0-9a-f-]{36}$/.test(id))throw Error('Invalid fixture conversation')
 const workspace=await readConversationWorkspace(db,TEST_PRINCIPAL,id,preferredSessionId)
 const saved=JSON.parse(testSql("select coalesce(jsonb_agg(to_jsonb(m) order by created_at),'[]') from conversation_messages m where conversation_id='"+id+"';"))
 return {session:workspace.session,plan:workspace.plan,brief:workspace.brief,userId:TEST_PRINCIPAL.userId,projectSlug:'test-project',conversationModel:{id,operatorId:TEST_PRINCIPAL.userId,title:'Webbbygge med Atlas',projectId:TEST_PROJECT,projectName:'Testprojekt',state:'ok',saved,chatBase:'/chat'}}
}
