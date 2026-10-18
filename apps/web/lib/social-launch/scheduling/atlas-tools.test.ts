
import {beforeAll,afterAll,it,expect,vi} from 'vitest'
import {initializeSchedulingDb} from './test-db'
import {scheduleFixture,setScheduleClock} from './fixtures.test-utils'
import {SOCIAL_SCHEDULE_TOOL_NAMES,handleSocialScheduleTool} from './atlas-tools'
import {testSql} from '../../website-build/test-db'
let db:ReturnType<typeof initializeSchedulingDb>
beforeAll(()=>{db=initializeSchedulingDb()})
afterAll(()=>{setScheduleClock(null);vi.unstubAllEnvs()})
it('exposes preparation and reading but no approval or dispatch tool',()=>{
 expect(SOCIAL_SCHEDULE_TOOL_NAMES).toEqual(['get_social_schedule','propose_social_schedule'])
 expect(SOCIAL_SCHEDULE_TOOL_NAMES).not.toContain('approve_social_schedule')
})
it('requires the actual conversation project and rejects authority override fields',async()=>{
 const f=await scheduleFixture(db),conversationId=testSql("select id from conversations where project_id='"+f.manifest.projectId+"';")
 expect(await handleSocialScheduleTool('get_social_schedule',{projectId:f.manifest.projectId},f.principal,conversationId,db)).toMatchObject({projectId:f.manifest.projectId,batchId:f.batch.batchId})
 for(const input of [{projectId:f.manifest.projectId,approve:true},{projectId:f.manifest.projectId,conversationId}])expect(await handleSocialScheduleTool('get_social_schedule',input,f.principal,conversationId,db)).toMatchObject({code:'INVALID_BODY'})
 expect(await handleSocialScheduleTool('approve_social_schedule',{projectId:f.manifest.projectId},f.principal,conversationId,db)).toMatchObject({code:'INVALID_BODY'})
 const foreign=await scheduleFixture(db),foreignConversation=testSql("select id from conversations where project_id='"+foreign.manifest.projectId+"';")
 expect(await handleSocialScheduleTool('get_social_schedule',{projectId:f.manifest.projectId},f.principal,foreignConversation,db)).toMatchObject({code:'NOT_FOUND'})
 expect(await handleSocialScheduleTool('get_social_schedule',{projectId:f.manifest.projectId},f.principal,null,db)).toMatchObject({code:'NOT_FOUND'})
},20000)
