import {beforeEach,describe,it,expect,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
import {createStudioFixture} from './test-fixture'
import {ensureStudioWorkspace,requestStudioWorkspace} from './store'
import {loadStudioView} from './loader'
import {setOperatorProjectRoot,setProjectWebsiteBuilder} from '../planning/store'
import {testSql} from '../test-db'
import type {BuildPrincipal} from '../types'
import type {ChatConversationModel} from '@/lib/os/chat-shared'
const state=vi.hoisted(()=>({db:null as unknown,p:null as BuildPrincipal|null,adminReads:0,historyReads:0,models:new Map<string,ChatConversationModel>()}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>{state.adminReads++;return state.db}}))
vi.mock('@/lib/auth/project-access',()=>({resolveProjectAccess:async()=>state.p?{ok:true,...state.p}:{ok:false,response:Response.json({error:'Unauthorized'},{status:401})}}))
vi.mock('@/lib/os/chat',()=>({loadChatConversation:async(id:string)=>{state.historyReads++;return state.models.get(id)??'not_found'}}))
beforeEach(()=>{state.adminReads=0;state.historyReads=0;state.models.clear();state.p=null})
function fixture(){const f=createStudioFixture();state.db=f.db;state.p=f.owner;return f}
describe('studio project and conversation identity',()=>{
 it('does not read admin data without a session',async()=>{expect(await loadStudioView({})).toBeNull();expect(state.adminReads).toBe(0)})
 it('lists only owned projects and does not create a draft just by opening',async()=>{
  const f=fixture(),view=await loadStudioView({})
  expect(view?.projects.map(p=>p.name)).toEqual(['Andra projektet','Befintligt'])
  expect(view?.selected).toBeNull();expect(view?.conversation).toBeNull();expect(f.countOwnedProjects()).toBe(2)
 })
 it('loads a selected studio conversation with its missing budget and no invented desktop',async()=>{
  const f=fixture(),a=await ensureStudioWorkspace(f.db,f.owner,{kind:'new',name:'Min sida',idempotencyKey:randomUUID()})
  state.p={...f.owner,allowedProjectIds:[...f.owner.allowedProjectIds,a.projectId]}
  state.models.set(a.conversationId,{id:a.conversationId,title:'Min sida',projectId:a.projectId,projectName:'Min sida',operatorId:f.owner.userId,saved:[],state:'ok',chatBase:'/chat'})
  const view=await loadStudioView({projectSlug:a.projectSlug})
  expect(view?.conversation?.id).toBe(a.conversationId)
  expect(view?.selected).toMatchObject({id:a.projectId,budget:{state:'missing',monthlySek:null},workspaceRequest:null})
  expect(view?.session).toBeNull()
  state.models.set(a.conversationId,{...state.models.get(a.conversationId)!,state:'error'})
  expect((await loadStudioView({projectSlug:a.projectSlug}))?.state).toBe('error')
 })
 it('rejects a conversation from another owned project before reading its transcript',async()=>{
  const f=fixture(),a=await ensureStudioWorkspace(f.db,f.owner,{kind:'existing',projectId:f.otherProjectId,idempotencyKey:randomUUID()})
  await expect(loadStudioView({projectSlug:'existing-'+f.projectId,conversationId:a.conversationId})).rejects.toMatchObject({code:'NOT_FOUND'})
  expect(state.historyReads).toBe(0)
 })
 it('rejects a session from another owned project before loading its conversation',async()=>{
  const f=fixture(),a=await ensureStudioWorkspace(f.db,f.owner,{kind:'existing',projectId:f.otherProjectId,idempotencyKey:randomUUID()}),aid=randomUUID(),sid=randomUUID()
  testSql(`insert into agents(id,project_id) values('${aid}','${f.otherProjectId}'); insert into website_build_sessions(id,project_id,created_by,agent_id,conversation_id,brief,idempotency_key,status) values('${sid}','${f.otherProjectId}','${f.owner.userId}','${aid}','${a.conversationId}','Andra sidan','${randomUUID()}','paused');`)
  await expect(loadStudioView({projectSlug:'existing-'+f.projectId,sessionId:sid})).rejects.toMatchObject({code:'NOT_FOUND'})
  expect(state.historyReads).toBe(0)
 })
 it('returns the same refusal for foreign and nonexistent project selections',async()=>{
  const f=fixture()
  for(const projectSlug of ['foreign-'+f.foreignProjectId,'not-a-project']) await expect(loadStudioView({projectSlug})).rejects.toMatchObject({code:'NOT_FOUND',status:404})
 })
})
describe('real requested folder binding',()=>{
 it('keeps an existing root exact and pending, replays once and refuses changed-key payload',async()=>{
  const f=fixture(),i={projectId:f.projectId,targetId:null,mode:'existing_folder' as const,root:{os:'windows' as const,root:'C:\\Projects\\Current',targetId:null},idempotencyKey:randomUUID()}
  const a=await requestStudioWorkspace(f.db,f.owner,i),b=await requestStudioWorkspace(f.db,f.owner,i)
  expect(a).toEqual(b);expect(a.root.root).toBe('C:\\Projects\\Current');expect(a.state).toBe('pending_runner');expect(a).not.toHaveProperty('physicalDirectoryCreated')
  await expect(requestStudioWorkspace(f.db,f.owner,{...i,root:{...i.root,root:'D:\\Other'}})).rejects.toMatchObject({code:'CONFLICT'})
  expect((await loadStudioView({projectSlug:'existing-'+f.projectId}))?.selected?.workspaceRequest?.requestId).toBe(a.requestId)
 })
 it('retains a bound new-project child root when the default parent later changes',async()=>{
  const f=fixture();await setOperatorProjectRoot(f.db,f.owner,{os:'windows',root:'C:\\Projects',targetId:null})
  const binding=await setProjectWebsiteBuilder(f.db,f.owner,{projectId:f.projectId,agentId:null})
  const a=await requestStudioWorkspace(f.db,f.owner,{projectId:f.projectId,targetId:null,mode:'new',root:{os:'windows',root:'C:\\Projects',targetId:null},idempotencyKey:randomUUID()})
  await setOperatorProjectRoot(f.db,f.owner,{os:'windows',root:'D:\\Future',targetId:null})
  const b=await requestStudioWorkspace(f.db,f.owner,{projectId:f.projectId,targetId:null,mode:'new',root:{os:'windows',root:'D:\\Future',targetId:null},idempotencyKey:randomUUID()})
  expect(a.root.root).toBe(binding.location?.root);expect(b.root.root).toBe(a.root.root)
 })
 it('refuses traversal, reserved Windows names, target mismatch and foreign ownership',async()=>{
  const f=fixture(),base={projectId:f.projectId,targetId:null,mode:'existing_git' as const,root:{os:'windows' as const,root:'C:\\Projects',targetId:null},idempotencyKey:randomUUID()}
  for(const root of ['C:\\Projects\\..\\Windows','C:\\Projects\\CON','C:\\Projects\\evil:stream'])await expect(requestStudioWorkspace(f.db,f.owner,{...base,root:{...base.root,root}})).rejects.toMatchObject({status:400})
  await expect(requestStudioWorkspace(f.db,f.owner,{...base,targetId:randomUUID()})).rejects.toMatchObject({status:400})
  await expect(requestStudioWorkspace(f.db,{...f.foreign,allowedProjectIds:[f.projectId]},base)).rejects.toMatchObject({code:'NOT_FOUND'})
 })
})
