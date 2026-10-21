import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {FAMILY_WEEKLY_PROJECT_ID} from './family-weekly-coverage'

const state=vi.hoisted(()=>({
 owner:'10000000-0000-4000-8000-000000000001',
 slug:'familje-stunden',
 projectReadCount:0,
 selectCalls:[] as string[],
 contentCalls:[] as unknown[],
 scheduleCalls:[] as unknown[],
 projectError:false,
 contentError:false,
 scheduleError:false,
}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({
 from:(table:string)=>{
  state.projectReadCount++
  if(table!=='projects')throw Error('unexpected table')
  return {select:(select:string)=>{
   state.selectCalls.push(select)
   return {eq:(key:string,id:string)=>{
    if(key!=='id'||id!==FAMILY_WEEKLY_PROJECT_ID)throw Error('unexpected tenant')
    return {maybeSingle:async()=>({
     data:state.projectError?null:{id:FAMILY_WEEKLY_PROJECT_ID,
      slug:state.slug,owner_id:state.owner},
     error:state.projectError?{message:'unavailable'}:null,
    })}
   }}
  }}
 },
})}))
vi.mock('@/lib/social-launch/content/store',()=>({
 readSocialContent:async(_db:unknown,p:unknown,input:unknown)=>{
  state.contentCalls.push({p,input})
  if(state.contentError)throw Error('private content unavailable')
  return {project:{id:FAMILY_WEEKLY_PROJECT_ID,name:'Familje-Stunden',slug:'familje-stunden'},
   posts:[],assets:[],hasMoreAssets:false,planApproved:true,
   currentPlanRevisionId:'e745041f-ad3a-493f-bd3b-025525d561b2',
   dispatchEnabled:false,publicationReady:false,
   workspaceUrl:'/projects/familje-stunden/social#content',
   plannedChannels:[
    {channel:'facebook',format:'text',cadence:'manual',purpose:'Text'},
    {channel:'instagram',format:'image',cadence:'manual',purpose:'Image'},
   ],
  }
 }
}))
vi.mock('@/lib/social-launch/scheduling/store',()=>({
 readSchedules:async(_db:unknown,p:unknown,input:unknown)=>{
  state.scheduleCalls.push({p,input})
  if(state.scheduleError)throw Error('private schedule unavailable')
  return {projectId:FAMILY_WEEKLY_PROJECT_ID,batches:[],releaseEvidence:[],
   monthlyRule:{dayOfMonth:1,localTime:'20:30',timeZone:'Europe/Stockholm',
    channels:['facebook','instagram'],enabled:true},
  }
 }
}))
import {familyWeeklyPlanningTickApi} from './family-weekly-cron'

const request=(token?:string,query='',method='GET')=>
 new Request('https://internal.test/api/family-content-weekly-tick'+query,{
  method,headers:token?{authorization:'Bearer '+token}:{},
 })
beforeEach(()=>{
 vi.stubEnv('CRON_SECRET','fixture-secret')
 vi.stubEnv('FAMILY_WEEKLY_PLANNING_CRON_ENABLED','true')
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-20T18:00:00.000Z'))
 Object.assign(state,{owner:'10000000-0000-4000-8000-000000000001',
  slug:'familje-stunden',projectReadCount:0,selectCalls:[],
  contentCalls:[],scheduleCalls:[],projectError:false,
  contentError:false,scheduleError:false})
})
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs()})
describe('Familje-Stunden read-only cron planner (not registered in vercel.json)',()=>{
 it('denies missing or invalid bearer, query override, and non-GET before reads',async()=>{
  for(const token of [undefined,'bad']){
   const response=await familyWeeklyPlanningTickApi(request(token))
   expect(response.status).toBe(401)
   expect(response.headers.get('cache-control')).toBe('private, no-store')
  }
  expect((await familyWeeklyPlanningTickApi(request('fixture-secret','?projectId=other'))).status).toBe(400)
  expect((await familyWeeklyPlanningTickApi(request('fixture-secret','','POST'))).status).toBe(405)
  expect(state.projectReadCount).toBe(0)
  expect(state.contentCalls).toHaveLength(0)
 })
 it('missing CRON_SECRET or disabled flag fail closed without fetching DB',async()=>{
  vi.stubEnv('FAMILY_WEEKLY_PLANNING_CRON_ENABLED','false')
  const disabled=await familyWeeklyPlanningTickApi(request('fixture-secret'))
  expect(disabled.status).toBe(200)
  expect(await disabled.json()).toEqual({mode:'read_only',result:'disabled',calls:0,costCapAiUsd:0})
  vi.stubEnv('CRON_SECRET','')
  expect((await familyWeeklyPlanningTickApi(request('fixture-secret'))).status).toBe(500)
  expect(state.projectReadCount).toBe(0)
 })
 it('single fixed owned project, 2 private reads, no write or provider usage',async()=>{
  const response=await familyWeeklyPlanningTickApi(request('fixture-secret'))
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(await response.json()).toMatchObject({
   mode:'read_only',result:'checked',
   asOf:'2026-10-20T18:00:00.000Z',projectId:FAMILY_WEEKLY_PROJECT_ID,
   daysAhead:14,draftsCreated:0,schedulesChanged:0,publicationsSent:0,aiCalls:0,
   summary:{slots:8,missing:8},
   sourceReady:6,sourceMissing:2,
  })
  expect(state.selectCalls).toEqual(['id,slug,owner_id'])
  expect(state.contentCalls).toHaveLength(1)
  expect(state.scheduleCalls).toHaveLength(1)
  expect(state.contentCalls[0]).toEqual({
   p:{userId:state.owner,allowedProjectIds:[FAMILY_WEEKLY_PROJECT_ID]},
   input:{projectId:FAMILY_WEEKLY_PROJECT_ID},
  })
  expect(state.scheduleCalls[0]).toEqual(state.contentCalls[0])
 })
 it('repeat check is idempotent and never writes a job or approves content',async()=>{
  const first=await (await familyWeeklyPlanningTickApi(request('fixture-secret'))).json()
  const second=await (await familyWeeklyPlanningTickApi(request('fixture-secret'))).json()
  expect(first).toEqual(second)
  expect(state.projectReadCount).toBe(2)
  expect(state.contentCalls).toHaveLength(2)
  expect(state.scheduleCalls).toHaveLength(2)
  const source=(await import('node:fs')).readFileSync(new URL('./family-weekly-cron.ts',import.meta.url),'utf8')
  for(const banned of ['proposeSocialContent','approveSchedule','claimScheduleJob',
   'recordScheduleStep','fetch(','.insert(','.update(','.delete(']){
   expect(source).not.toContain(banned)
  }
 })
 it('wrong project slug or owner is not converted to an authorized principal',async()=>{
  for(const patch of [{slug:'the-prompt'},{owner:'not-a-uuid'},{projectError:true}]){
   Object.assign(state,{slug:'familje-stunden',owner:'10000000-0000-4000-8000-000000000001',projectError:false},patch)
   const response=await familyWeeklyPlanningTickApi(request('fixture-secret'))
   expect(response.status).toBe(503)
   expect(await response.json()).toMatchObject({code:'PROJECT_UNAVAILABLE'})
  }
  expect(state.contentCalls).toHaveLength(0)
 })
 it('private reader failure is a generic error, never a partial invented plan',async()=>{
  state.scheduleError=true
  const response=await familyWeeklyPlanningTickApi(request('fixture-secret'))
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({mode:'read_only',code:'READ_UNAVAILABLE'})
 })
})
