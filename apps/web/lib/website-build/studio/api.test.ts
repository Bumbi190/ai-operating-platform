import {beforeEach,describe,it,expect,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
import {createStudioFixture} from './test-fixture'
import {studioApi} from './api'
import type {BuildPrincipal} from '../types'
const state=vi.hoisted(()=>({db:null as unknown,p:null as BuildPrincipal|null,adminReads:0}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>{state.adminReads++;return state.db}}))
vi.mock('@/lib/auth/project-access',()=>({resolveProjectAccess:async()=>state.p?{ok:true,...state.p}:{ok:false,response:Response.json({error:'Unauthorized'},{status:401})}}))
vi.mock('@/lib/os/chat',()=>({loadChatConversation:async()=>null}))
beforeEach(()=>{const f=createStudioFixture();state.db=f.db;state.p=f.owner;state.adminReads=0})
const req=(body?:unknown,query='',origin='http://localhost')=>new Request('http://localhost/api/website-build/studio'+query,body===undefined?{headers:{host:'localhost'}}:{method:'POST',headers:{host:'localhost',origin,'content-type':'application/json'},body:JSON.stringify(body)})
describe('studio HTTP boundary',()=>{
 it('authenticates before parsing or reading privileged data',async()=>{
  state.p=null;const r=await studioApi('ensure',req({ownerId:'forged'}))
  expect(r.status).toBe(401);expect(state.adminReads).toBe(0);expect(r.headers.get('cache-control')).toBe('private, no-store')
 })
 it('creates a private real owner workspace and recovers a repeated response',async()=>{
  const body={kind:'new',name:'Min sida',idempotencyKey:randomUUID()},a=await studioApi('ensure',req(body)),b=await studioApi('ensure',req(body))
  expect(a.status).toBe(201);expect(await a.json()).toEqual(await b.json());expect(a.headers.get('cache-control')).toBe('private, no-store')
 })
 it('refuses cross-origin creation, oversized bodies and injected authority',async()=>{
  expect((await studioApi('ensure',req({kind:'new',name:'Test',idempotencyKey:randomUUID()},'', 'https://evil.example'))).status).toBe(403)
  expect((await studioApi('ensure',req({x:'x'.repeat(65537)}))).status).toBe(413)
  expect((await studioApi('ensure',req({kind:'new',name:'Test',idempotencyKey:randomUUID(),approvedBy:'forged'}))).status).toBe(400)
 })
 it('rejects unknown or duplicate query selections and malformed child ids',async()=>{
  for(const query of ['?project=first&project=second','?project=first&ownerId=bad','?conversation=../bad']) expect((await studioApi('get',req(undefined,query))).status).toBe(400)
 })
 it('does not grant observed projects mutation authority',async()=>{
  state.p={...state.p!,allowedProjectIds:[]}
  expect((await studioApi('ensure',req({kind:'existing',projectId:randomUUID(),idempotencyKey:randomUUID()}))).status).toBe(404)
  expect((await studioApi('ensure',req({kind:'new',name:'Observer draft',idempotencyKey:randomUUID()}))).status).toBe(404)
 })
 it('reports unreadable project inventory without exposing database details as an empty draft',async()=>{
  state.db={from:()=>({select:()=>({eq:async()=>({data:null,error:{message:'private-fixture-path'}})})})}
  const r=await studioApi('get',req())
  expect(r.status).toBe(503);expect(await r.text()).not.toContain('private-fixture-path')
 })
})
