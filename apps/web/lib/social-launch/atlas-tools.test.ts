import {beforeAll,it,expect,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {testSql,TEST_PRINCIPAL} from '../website-build/test-db'
import {initializeSocialLaunchDb as initializeWorkerDb} from './test-db'
import {handleSocialLaunchTool,SOCIAL_LAUNCH_TOOLS,SOCIAL_LAUNCH_TOOL_NAMES,SOCIAL_LAUNCH_GUIDE} from './atlas-tools'
vi.mock('@/lib/os/settings',()=>({loadSettings:async()=>null}))
let db:ReturnType<typeof initializeWorkerDb>
beforeAll(()=>{db=initializeWorkerDb()})
function fixture(){const projectId=randomUUID(),conversationId=randomUUID(),p={...TEST_PRINCIPAL,allowedProjectIds:[projectId]};testSql("insert into projects(id,owner_id,name,slug) values('"+projectId+"','"+p.userId+"','Familjen','social-"+projectId+"');insert into conversations(id,user_id,project_id) values('"+conversationId+"','"+p.userId+"','"+projectId+"');");return {p,projectId,conversationId}}
it('offers only read/propose tools and clear authority guidance',()=>{
 expect(SOCIAL_LAUNCH_TOOL_NAMES).toEqual(['get_social_launch_plan','propose_social_launch_plan'])
 expect(SOCIAL_LAUNCH_TOOLS.every(t=>t.input_schema.additionalProperties===false)).toBe(true)
 expect(SOCIAL_LAUNCH_GUIDE).toContain('run_media_step');expect(SOCIAL_LAUNCH_GUIDE).toContain('Pinterest')
})
it('proposes in the owned conversation and returns a real review URL without decision or publication',async()=>{
 const f=fixture(),r=await handleSocialLaunchTool('propose_social_launch_plan',{projectId:f.projectId,expectedRevisionId:null,idempotencyKey:randomUUID(),choices:[{channel:'pinterest',purpose:'Familjeaktiviteter',format:'image',cadence:'weekly'}]},f.p,f.conversationId,db) as any
 expect(r.plan.currentRevision.choices[0].channel).toBe('pinterest');expect(r.plan.decision).toBeNull()
 expect(r.workspaceUrl).toBe('/projects/social-'+f.projectId+'/social');expect(r.channels.find((c:any)=>c.channel==='instagram').connection).toBe('unreadable');expect(r.publicationReady).toBe(false)
 const read=await handleSocialLaunchTool('get_social_launch_plan',{projectId:f.projectId},f.p,f.conversationId,db) as any;expect(read.plan.currentRevision.id).toBe(r.plan.currentRevision.id)
})
it('refuses missing/foreign conversation and unowned project, permits another owned chat',async()=>{
 const f=fixture(),other=fixture()
 expect(await handleSocialLaunchTool('get_social_launch_plan',{projectId:f.projectId},f.p,other.conversationId,db)).toHaveProperty('workspaceUrl')
 const foreignUser=randomUUID();testSql("insert into auth.users(id) values('"+foreignUser+"');update conversations set user_id='"+foreignUser+"' where id='"+other.conversationId+"';")
 for(const [principal,conversation] of [[f.p,null],[f.p,other.conversationId],[{...f.p,allowedProjectIds:[]},f.conversationId]] as const){
  expect(await handleSocialLaunchTool('get_social_launch_plan',{projectId:f.projectId},{userId:principal.userId,allowedProjectIds:[...principal.allowedProjectIds]},conversation,db)).toMatchObject({code:'NOT_FOUND'})
 }
})
it('refuses model approval, credentials, scheduling and unknown tools',async()=>{
 const f=fixture()
 for(const extra of [{decision:'approve'},{publish:true},{token:'example-secret'},{conversationId:f.conversationId},{schedule:'tomorrow'}]){
  const r=await handleSocialLaunchTool('propose_social_launch_plan',{projectId:f.projectId,expectedRevisionId:null,idempotencyKey:randomUUID(),choices:[],...extra},f.p,f.conversationId,db)
  expect(r).toMatchObject({code:'INVALID_BODY'});expect(JSON.stringify(r)).not.toContain('example-secret')
 }
 expect(await handleSocialLaunchTool('approve_social_launch_plan',{projectId:f.projectId},f.p,f.conversationId,db)).toMatchObject({code:'INVALID_BODY'})
})
it('reports unavailable SQL truthfully and the route registers both tools in studio and full chat',async()=>{
 const f=fixture(),broken={rpc:async()=>({data:null,error:{code:'XX000',message:'private-secret'}})} as unknown as typeof db
 const r=await handleSocialLaunchTool('get_social_launch_plan',{projectId:f.projectId},f.p,f.conversationId,broken);expect(r).toMatchObject({code:'PLAN_UNAVAILABLE'});expect(JSON.stringify(r)).not.toContain('private-secret')
 const route=readFileSync(resolve(process.cwd(),'app/api/chat/route.ts'),'utf8')
 expect(route).toContain('...SOCIAL_LAUNCH_TOOL_NAMES');expect(route).toContain('...SOCIAL_LAUNCH_TOOLS');expect(route).toContain('handleSocialLaunchTool(name, input, { userId, allowedProjectIds }, ownedConversationId, db)')
})
