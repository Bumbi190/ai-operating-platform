import {beforeEach,describe,it,expect,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
import {createStudioFixture} from '@/lib/website-build/studio/test-fixture'
import type {BuildPrincipal} from '@/lib/website-build/types'
import {lifecycleApi} from './api'
const state=vi.hoisted(()=>({db:null as unknown,p:null as BuildPrincipal|null,projectId:'',adminReads:0}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>{state.adminReads++;return state.db}}))
vi.mock('@/lib/auth/project-access',()=>({resolveProjectAccess:async()=>state.p?{ok:true,...state.p}:{ok:false,response:Response.json({error:'Unauthorized'},{status:401})}}))
beforeEach(()=>{const f=createStudioFixture();state.db=f.db;state.p=f.owner;state.projectId=f.projectId;state.adminReads=0})
const req=(body?:unknown,origin='http://localhost')=>new Request('http://localhost/api/projects/by-id/'+state.projectId+'/lifecycle',body===undefined?{}:{method:'POST',headers:{host:'localhost',origin,'content-type':'application/json'},body:JSON.stringify(body)})
describe('lifecycle HTTP boundary',()=>{
 it('authenticates before privileged reads or body parsing',async()=>{
  state.p=null;const response=await lifecycleApi('change',req({broken:true}),state.projectId)
  expect(response.status).toBe(401);expect(state.adminReads).toBe(0);expect(response.headers.get('cache-control')).toBe('private, no-store')
 })
 it('reads and changes only the path project with private responses',async()=>{
  const r=await lifecycleApi('get',req(),state.projectId);expect(r.status).toBe(200);expect(await r.json()).toMatchObject({projectId:state.projectId,state:'active',version:0})
  const changed=await lifecycleApi('change',req({action:'archive',expectedVersion:0,idempotencyKey:randomUUID()}),state.projectId)
  expect(changed.status).toBe(200);expect(changed.headers.get('cache-control')).toBe('private, no-store');expect(await changed.json()).toMatchObject({state:'archived',executionPaused:true})
 })
 it('refuses injected path authority, cross origin and oversized bodies before admin access',async()=>{
  const body={action:'trash',expectedVersion:0,idempotencyKey:randomUUID()}
  expect((await lifecycleApi('change',req({...body,projectId:randomUUID()}),state.projectId)).status).toBe(400)
  expect((await lifecycleApi('change',req(body,'https://evil.example'),state.projectId)).status).toBe(403)
  expect((await lifecycleApi('change',req({x:'x'.repeat(65537)}),state.projectId)).status).toBe(413)
  expect(state.adminReads).toBe(0)
 })
 it('returns the same 404 for an observed foreign or nonexistent project',async()=>{
  const f=createStudioFixture();state.p={...f.foreign,allowedProjectIds:[state.projectId]}
  const a=await lifecycleApi('get',req(),state.projectId),b=await lifecycleApi('get',req(),randomUUID())
  expect(a.status).toBe(404);expect(b.status).toBe(404);expect(await a.json()).toEqual(await b.json())
 })
})
