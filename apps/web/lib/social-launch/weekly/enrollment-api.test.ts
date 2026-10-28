import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {FAMILY_WEEKLY_PROJECT_ID as FAMILY} from './auto-preparation'

const state=vi.hoisted(()=>{
 const owner='77777777-7777-4777-8777-777777777777'
 return {
  owner,
  access:vi.fn(async()=>({ok:true,userId:owner,allowedProjectIds:[] as string[]})),
  operator:vi.fn(async()=>({ok:true,userId:owner})),
  sameOrigin:vi.fn(()=>null as Response|null),
  insert:vi.fn(async(_row:unknown)=>({error:null as unknown})),
  noticeList:vi.fn(async(_limit:number)=>({data:[] as unknown[],error:null as unknown})),
  noticeFilters:[] as Array<{key:string;value:string}>,
  read:vi.fn(async()=>({enabled:true,status:'active',canSchedule:false,
   canPublish:false,validUntil:'2027-01-25T00:00:00Z',lastUpdatedAt:'2026-10-28T12:00:00Z'})),
 }
})
state.access.mockImplementation(async()=>({ok:true,userId:state.owner,allowedProjectIds:[FAMILY]}))
vi.mock('@/lib/auth/project-access',()=>({resolveProjectAccess:state.access}))
vi.mock('@/lib/auth/platform-operator',()=>({resolvePlatformOperator:state.operator}))
vi.mock('@/lib/atlas/executive/http',()=>({assertSameOrigin:state.sameOrigin}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({})}))
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({
 from:(name:string)=>{
  if(name==='family_weekly_auto_consent_events')return {insert:state.insert}
  if(name==='family_weekly_review_notices'){
   type Query={select:(x:string)=>Query;eq:(k:string,v:string)=>Query;
    order:(k:string,o:{ascending:boolean})=>Query;limit:(n:number)=>ReturnType<typeof state.noticeList>}
   const query:Query={
    select:()=>query,
    eq:(key,value)=>{state.noticeFilters.push({key,value});return query},
    order:()=>query,
    limit:state.noticeList,
   }
   return query
  }
  throw Error('FORBIDDEN_TABLE')
 }
})}))
vi.mock('./enrollment-store',()=>({weeklyConsentReadPort:()=>({})}))
vi.mock('./enrollment',async(load)=>{
 const actual=await load<typeof import('./enrollment')>()
 return {...actual,readWeeklyOwnerConsent:state.read}
})

const url='https://app.omniraos.se/api/social-weekly-automation'
const post=(value:unknown)=>new Request(url,{
 method:'POST',headers:{'content-type':'application/json','origin':'https://app.omniraos.se'},
 body:JSON.stringify(value),
})
const enable={projectId:FAMILY,operation:'enable',confirmed:true}
const request=(method='GET')=>new Request(url,{method})

describe('Owner UI enrollment route never dispatches background work',()=>{
 const original=process.env.FAMILY_WEEKLY_OWNER_ENROLLMENT_UI_ENABLED
 beforeEach(()=>{
  vi.clearAllMocks()
  state.noticeFilters.length=0
  state.noticeList.mockResolvedValue({data:[],error:null})
  state.access.mockResolvedValue({ok:true,userId:state.owner,allowedProjectIds:[FAMILY]})
  state.operator.mockResolvedValue({ok:true,userId:state.owner})
  state.sameOrigin.mockReturnValue(null)
  state.insert.mockResolvedValue({error:null})
  process.env.FAMILY_WEEKLY_OWNER_ENROLLMENT_UI_ENABLED='true'
 })
 afterEach(()=>{
  if(original===undefined)delete process.env.FAMILY_WEEKLY_OWNER_ENROLLMENT_UI_ENABLED
  else process.env.FAMILY_WEEKLY_OWNER_ENROLLMENT_UI_ENABLED=original
 })
 it('defaults fully OFF when feature flag absent; no query or write',async()=>{
  const {familyWeeklyOwnerEnrollmentApi}=await import('./enrollment-api')
  delete process.env.FAMILY_WEEKLY_OWNER_ENROLLMENT_UI_ENABLED
  const got=await familyWeeklyOwnerEnrollmentApi(request())
  expect(await got.json()).toMatchObject({available:false,enabled:false,canPublish:false})
  const denied=await familyWeeklyOwnerEnrollmentApi(post(enable))
  expect(denied.status).toBe(403)
  expect(state.insert).not.toHaveBeenCalled()
  expect(state.read).not.toHaveBeenCalled()
 })
 it('GET only reads bounded owner consent; no mutations or admin actions',async()=>{
  const {familyWeeklyOwnerEnrollmentApi}=await import('./enrollment-api')
  const got=await familyWeeklyOwnerEnrollmentApi(request())
  expect(got.status).toBe(200)
  expect(await got.json()).toMatchObject({available:true,enabled:true,canSchedule:false,canPublish:false,
   reviewNoticesAvailable:true,reviewNotices:[]})
  expect(state.noticeFilters).toContainEqual({key:'project_id',value:FAMILY})
  expect(state.noticeFilters).toContainEqual({key:'owner_id',value:state.owner})
  expect(state.read).toHaveBeenCalledTimes(1)
  expect(state.insert).not.toHaveBeenCalled()
 })
 it('lists only scoped, verified owner notices from session RLS',async()=>{
  const {familyWeeklyOwnerEnrollmentApi}=await import('./enrollment-api')
  state.noticeList.mockResolvedValueOnce({data:[{
   project_id:FAMILY,owner_id:state.owner,
   preparation_id:'99999999-9999-4999-8999-999999999999',
   week_start:'2027-01-04',draft_count:4,
   created_at:'2027-01-03T15:15:00Z',
   state:'awaiting_review',can_schedule:false,can_publish:false,
  }],error:null})
  const result=await familyWeeklyOwnerEnrollmentApi(request())
  expect(result.status).toBe(200)
  const body=await result.json()
  expect(body.reviewNoticesAvailable).toBe(true)
  expect(body.reviewNotices).toHaveLength(1)
  expect(body.reviewNotices[0].workspaceUrl).toBe('https://app.omniraos.se/projects/familje-stunden/social#content')
  expect(state.noticeList).toHaveBeenCalledWith(5)
  expect(state.insert).not.toHaveBeenCalled()
 })
 it('requires explicit confirmation for owner enable, session RLS handles insert',async()=>{
  const {familyWeeklyOwnerEnrollmentApi}=await import('./enrollment-api')
  const got=await familyWeeklyOwnerEnrollmentApi(post(enable))
  expect(got.status).toBe(200)
  expect(state.insert).toHaveBeenCalledTimes(1)
  expect(state.insert.mock.calls[0][0]).toMatchObject({
   project_id:FAMILY,owner_id:state.owner,action:'enable',
   can_publish:false,can_schedule:false,max_calls_per_week:1,max_completion_tokens:1800,
  })
  expect(state.operator).toHaveBeenCalledTimes(1)
 })
 it('allows a separately clicked REVOKE with null expiry; no send/write to other tables',async()=>{
  const {familyWeeklyOwnerEnrollmentApi}=await import('./enrollment-api')
  const got=await familyWeeklyOwnerEnrollmentApi(post({projectId:FAMILY,operation:'revoke'}))
  expect(got.status).toBe(200)
  expect(state.insert).toHaveBeenCalledTimes(1)
  expect(state.insert.mock.calls[0][0]).toMatchObject({action:'revoke',valid_until:null})
 })
 it('denies unrelated project accounts before all DB mutations',async()=>{
  const {familyWeeklyOwnerEnrollmentApi}=await import('./enrollment-api')
  state.access.mockResolvedValueOnce({ok:true,userId:state.owner,allowedProjectIds:[]})
  const got=await familyWeeklyOwnerEnrollmentApi(post(enable))
  expect(got.status).toBe(404)
  expect(state.insert).not.toHaveBeenCalled()
 })
 it('blocks a non-operator even when he owns a project',async()=>{
  const {familyWeeklyOwnerEnrollmentApi}=await import('./enrollment-api')
  state.operator.mockResolvedValueOnce({ok:false,reason:'not_platform_operator'} as never)
  const got=await familyWeeklyOwnerEnrollmentApi(post(enable))
  expect(got.status).toBe(403)
  expect(state.insert).not.toHaveBeenCalled()
 })
 it('requires same-origin and validates exact input fields',async()=>{
  const {familyWeeklyOwnerEnrollmentApi}=await import('./enrollment-api')
  state.sameOrigin.mockReturnValueOnce(Response.json({code:'CROSS_ORIGIN'},{status:403}))
  expect((await familyWeeklyOwnerEnrollmentApi(post(enable))).status).toBe(403)
  for(const raw of [
   {...enable,confirmed:false},
   {...enable,ownerId:state.owner},
   {...enable,maxBudgetSek:999999},
   {projectId:FAMILY,operation:'publish',confirmed:true},
  ])expect((await familyWeeklyOwnerEnrollmentApi(post(raw))).status).toBe(400)
  expect(state.insert).not.toHaveBeenCalled()
 })
 it('database failure remains 503 and does not report success',async()=>{
  const {familyWeeklyOwnerEnrollmentApi}=await import('./enrollment-api')
  state.insert.mockResolvedValueOnce({error:{message:'private db details'}})
  const got=await familyWeeklyOwnerEnrollmentApi(post(enable))
  expect(got.status).toBe(503)
  expect(JSON.stringify(await got.json())).not.toContain('private db')
 })
})
