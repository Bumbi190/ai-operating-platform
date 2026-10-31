import {describe,it,expect,vi} from 'vitest'
import {enqueueFamilyWeeklyRun,type WeeklyEnqueuePort} from './run-creator'
import {familyWeeklyEnqueuePort} from './run-creator-db'
import {FAMILY_WEEKLY_PROJECT_ID as FAMILY} from './auto-preparation'

const NOW='2027-01-03T14:18:00Z'
const RUN='77777777-7777-4777-8777-777777777777'
const flags={runtimeEnabled:true,enqueueEnabled:true}
const good={status:'queued',projectId:FAMILY,weekStart:'2027-01-04',runId:RUN,publicationAuthority:false}
const mockPort=(value:unknown):WeeklyEnqueuePort=>({enqueueOnce:vi.fn(async()=>value)})

describe('Scheduled Sunday queue creator never creates AI or publish authority',()=>{
 it('blocks all SQL calls with either independent server-only runtime flag OFF',async()=>{
  for(const bad of [
   {runtimeEnabled:false,enqueueEnabled:true},
   {runtimeEnabled:true,enqueueEnabled:false},
   {runtimeEnabled:false,enqueueEnabled:false},
  ]){
   const p=mockPort(good)
   expect(await enqueueFamilyWeeklyRun(p,NOW,bad)).toEqual({status:'disabled',queued:false})
   expect(p.enqueueOnce).not.toHaveBeenCalled()
  }
 })
 it('only Sunday 15:00 local Stockholm starting 2027, despite daylight savings',async()=>{
  const dates=['2026-12-27T14:11:00Z','2027-01-02T14:11:00Z','2027-01-03T13:59:00Z','2027-01-03T15:00:00Z']
  for(const now of dates){
   const port=mockPort(good)
   expect(await enqueueFamilyWeeklyRun(port,now,flags)).toEqual({status:'not_due',queued:false})
   expect(port.enqueueOnce).not.toHaveBeenCalled()
  }
  const p=mockPort({status:'queued',projectId:FAMILY,weekStart:'2027-07-05',
   runId:RUN,publicationAuthority:false})
  expect(await enqueueFamilyWeeklyRun(p,'2027-07-04T13:18:00Z',flags)).toMatchObject({
   status:'queued',weekStart:'2027-07-05',publicationAuthority:false,
  })
 })
 it('accepts only an exact DB RPC receipt for this project, week and a real UUID',async()=>{
  expect(await enqueueFamilyWeeklyRun(mockPort(good),NOW,flags)).toEqual({
   status:'queued',queued:true,weekStart:'2027-01-04',runId:RUN,publicationAuthority:false,
  })
  for(const bad of [
   null,undefined,{status:'queued',projectId:FAMILY,weekStart:'2027-01-04',runId:'fake',publicationAuthority:false},
   {...good,publicationAuthority:true},{...good,projectId:'11111111-1111-4111-8111-111111111111'},
   {...good,weekStart:'2027-01-11'},{...good,approval:true},
   {status:'already_queued',runId:RUN},
  ]){
   expect(await enqueueFamilyWeeklyRun(mockPort(bad),NOW,flags)).toEqual({
    status:'unavailable',queued:false,
   })
  }
 })
 it('a second invocation must not return a second run id',async()=>{
  let n=0
  const p:WeeklyEnqueuePort={
   enqueueOnce:vi.fn(async()=>++n===1?good:{status:'already_queued'}),
  }
  expect((await enqueueFamilyWeeklyRun(p,NOW,flags)).status).toBe('queued')
  expect(await enqueueFamilyWeeklyRun(p,NOW,flags)).toEqual({
   status:'already_queued',queued:false,weekStart:'2027-01-04',
  })
 })
 it('a database error never reports a successful admission',async()=>{
  const p:WeeklyEnqueuePort={
   enqueueOnce:vi.fn(async()=>{throw Error('PRIVATE SQL ERROR')}),
  }
  expect(await enqueueFamilyWeeklyRun(p,NOW,flags)).toEqual({status:'unavailable',queued:false})
 })
 it('the service-role adapter calls ONLY the no-input enqueue RPC',async()=>{
  const calls:Array<{name:string;args:Record<string,unknown>}>=[]
  const db={rpc:vi.fn(async(name:string,args:Record<string,unknown>)=>{
   calls.push({name,args});return {data:good,error:null}
  })}
  const output=await enqueueFamilyWeeklyRun(familyWeeklyEnqueuePort(db as never),NOW,flags)
  expect(output).toMatchObject({status:'queued',queued:true})
  expect(calls).toEqual([{name:'family_weekly_enqueue_once',args:{}}])
 })
 it('runs queue proposal uses nullable unbound idempotency plus durable unique week',async()=>{
  const {readFileSync}=await import('node:fs')
  const {resolve}=await import('node:path')
  const sql=readFileSync(resolve(__dirname,
   '../../../../../docs/sql/20261028_family_weekly_run_creator_proposed.sql'),'utf8')
  expect(sql).toContain('constraint family_weekly_run_plans_one_per_week unique(project_id,week_start)')
  expect(sql).toContain("'family_weekly_editorial_drafts','pending'")
  expect(sql).toContain('0,1,null')
  expect(sql).toContain('r.idempotency_key is null')
  expect(sql).toContain('r.workflow_instance_id is null')
  expect(sql).toContain("e.action='enable'")
  expect(sql).toContain('select p.owner_id into v_owner')
  expect(sql).toContain('c.user_id=v_owner and c.project_id=v_project')
  expect(sql).toContain("p.execution_paused=false")
  expect(sql).toContain("l.state<>'active'")
  expect(sql).toContain('cfg.automation_paused')
  expect(sql).toContain('on public.family_weekly_run_plans')
  expect(sql).not.toContain('cron.schedule(')
  expect(sql).not.toMatch(/grant execute on function public\.family_weekly_enqueue_once\(\)\s*to authenticated/i)
 })
})
