import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest'
import {FAMILY_WEEKLY_PROJECT_ID as FAMILY} from './auto-preparation'

const state=vi.hoisted(()=>({
 enqueue:vi.fn(async():Promise<unknown>=>({status:'blocked'})),
 dbCreated:vi.fn(()=>({})),
}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:state.dbCreated}))
vi.mock('./run-creator-db',()=>({familyWeeklyEnqueuePort:()=>({
 enqueueOnce:state.enqueue,
})}))
import {GET} from '@/app/api/social-weekly-automation/cron/route'

const SECRET='synthetic_cron_secret_26_chars'
const uri='https://app.omniraos.se/api/social-weekly-automation/cron'
const request=(token:unknown=SECRET,url=uri,headers:Record<string,string>={})=>new Request(url,{
 headers:token===null?headers:{authorization:'Bearer '+String(token),...headers},
})
const sourceVars=['CRON_SECRET','FAMILY_WEEKLY_AUTO_DRAFTS_RUNTIME_ENABLED','FAMILY_WEEKLY_ENQUEUE_ENABLED'] as const
const original=Object.fromEntries(sourceVars.map(k=>[k,process.env[k]]))
describe('Family weekly cron enqueues only after bearer + two OFF-by-default feature gates',()=>{
 beforeEach(()=>{
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2027-01-03T14:13:00Z'))
  process.env.CRON_SECRET=SECRET
  process.env.FAMILY_WEEKLY_AUTO_DRAFTS_RUNTIME_ENABLED='true'
  process.env.FAMILY_WEEKLY_ENQUEUE_ENABLED='true'
  state.enqueue.mockResolvedValue({
   status:'queued',projectId:FAMILY,weekStart:'2027-01-04',
   runId:'77777777-7777-4777-8777-777777777777',
   publicationAuthority:false,
  })
 })
 afterEach(()=>{
  vi.useRealTimers()
  for(const key of sourceVars){
   if(original[key]===undefined)delete process.env[key]
   else process.env[key]=original[key]
  }
 })
 it('rejects missing/wrong/short credential without touching database',async()=>{
  for(const bad of [null,'wrong',SECRET+'extra','']){
   expect((await GET(request(bad))).status).toBe(401)
  }
  expect(state.dbCreated).not.toHaveBeenCalled()
  expect(state.enqueue).not.toHaveBeenCalled()
 })
 it('accepts exact only, and refuses request-supplied week overrides',async()=>{
  expect((await GET(request(SECRET,uri+'?weekStart=2027-01-11'))).status).toBe(400)
  expect((await GET(request(SECRET,uri,{'x-week-start':'2027-01-11'}))).status).toBe(400)
  expect(state.enqueue).not.toHaveBeenCalled()
 })
 it('runtime and enqueue flag are independent: either OFF prevents all DB access',async()=>{
  for(const key of ['FAMILY_WEEKLY_AUTO_DRAFTS_RUNTIME_ENABLED','FAMILY_WEEKLY_ENQUEUE_ENABLED'] as const){
   process.env[key]='false'
   const result=await GET(request())
   expect(result.status).toBe(503)
   expect(await result.json()).toMatchObject({status:'disabled',queued:false})
   process.env[key]='true'
  }
  expect(state.dbCreated).not.toHaveBeenCalled()
 })
 it('exactly authorized Sunday request can create only a pending review run',async()=>{
  const result=await GET(request())
  expect(result.status).toBe(202)
  expect(await result.json()).toEqual({
   status:'queued',queued:true,weekStart:'2027-01-04',
   runId:'77777777-7777-4777-8777-777777777777',publicationAuthority:false,
  })
  expect(state.dbCreated).toHaveBeenCalledTimes(1)
  expect(state.enqueue).toHaveBeenCalledTimes(1)
 })
 it('outside review window does not call queue RPC even with bearer and both flags',async()=>{
  vi.setSystemTime(new Date('2027-01-03T15:05:00Z'))
  const result=await GET(request())
  expect(await result.json()).toEqual({status:'not_due',queued:false})
  expect(state.enqueue).not.toHaveBeenCalled()
 })
 it('an unavailable RPC never reports queued',async()=>{
  state.enqueue.mockRejectedValueOnce(Error('PRIVATE_DB_ERROR'))
  const result=await GET(request())
  expect(result.status).toBe(503)
  expect(await result.json()).toEqual({status:'unavailable',queued:false})
 })
 it('contains no cron registration in vercel.json or SQL proposal',async()=>{
  const {readFileSync}=await import('node:fs')
  const {resolve}=await import('node:path')
  const sql=readFileSync(resolve(__dirname,
   '../../../../../docs/sql/20261028_family_weekly_run_creator_proposed.sql'),'utf8')
  const route=readFileSync(resolve(__dirname,
   '../../../app/api/social-weekly-automation/cron/route.ts'),'utf8')
  const vercel=JSON.parse(readFileSync(resolve(__dirname,
   '../../../vercel.json'),'utf8')) as {crons?:Array<{path:string}>}
  expect((vercel.crons??[]).some(c=>c.path==='/api/social-weekly-automation/cron')).toBe(false)
  expect(sql).not.toContain('cron.schedule(')
  expect(route).not.toMatch(/cron\.schedule\(/)
  expect(route).toContain("process.env.CRON_SECRET")
  expect(route).toContain("familyWeeklyEnqueueEnabled()")
  expect(route).toContain("familyWeeklyRuntimeEnabled()")
 })
})
