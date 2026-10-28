import {describe,it,expect,vi} from 'vitest'
import {recordWeeklyReviewNotice,validateReviewNoticeForOwner} from './review-notice-store'
import {readRecentWeeklyReviewNotices} from './review-notice-read'
import {buildWeeklyReviewNotice} from './review-pipeline'
import {FAMILY_WEEKLY_PROJECT_ID as FAMILY} from './auto-preparation'

const owner='77777777-7777-4777-8777-777777777777'
const other='88888888-8888-4888-8888-888888888888'
const prep='99999999-9999-4999-8999-999999999999'
const saved={
 preparationId:prep,status:'editorial_review_required',publicationAuthority:false,
 posts:[{},{}],workspaceUrl:'https://app.omniraos.se/projects/familje-stunden/social#content',
}
const notice=()=>buildWeeklyReviewNotice(saved,'2027-01-04',2)!
const row=()=>({
 project_id:FAMILY,owner_id:owner,preparation_id:prep,week_start:'2027-01-04',
 draft_count:2,state:'awaiting_review',
 can_schedule:false,can_publish:false,created_at:'2027-01-03T16:05:00Z',
})
describe('Family owner-only persisted weekly review notification',()=>{
 it('accepts only the verified editorial receipt with fixed project & review URL',()=>{
  expect(validateReviewNoticeForOwner(notice(),owner)).toEqual({
   project_id:FAMILY,owner_id:owner,preparation_id:prep,
   week_start:'2027-01-04',draft_count:2,state:'awaiting_review',
   can_schedule:false,can_publish:false,
  })
 })
 it('does not persist forged URL, project, count, message, receipt or owner ID',async()=>{
  const real=notice()
  for(const bad of [
   {...real,workspaceUrl:'https://evil.example/'},
   {...real,projectId:other},
   {...real,preparationId:'bad'},
   {...real,count:5},
   {...real,message:'Send everything now'},
  ]){
   expect(validateReviewNoticeForOwner(bad,owner)).toBeNull()
  }
  expect(validateReviewNoticeForOwner(real,'bad')).toBeNull()
 })
 it('never inserts for a non-owner and emits no delivery',async()=>{
  const port={
   currentProjectOwner:vi.fn(async()=>false),
   insertOnce:vi.fn(async()=>{}),
  }
  expect(await recordWeeklyReviewNotice(port,owner,notice())).toBe('blocked')
  expect(port.insertOnce).not.toHaveBeenCalled()
 })
 it('writes exactly once through the restricted port, not an email sender',async()=>{
  const port={
   currentProjectOwner:vi.fn(async()=>true),
   insertOnce:vi.fn(async(_record:unknown)=>{}),
  }
  expect(await recordWeeklyReviewNotice(port,owner,notice())).toBe('recorded')
  expect(port.insertOnce).toHaveBeenCalledTimes(1)
  expect(port.insertOnce.mock.calls[0][0]).toMatchObject({
   project_id:FAMILY,owner_id:owner,preparation_id:prep,
   state:'awaiting_review',can_publish:false,
  })
 })
 it('a failed insert is a blocked notice; it must not restart AI',async()=>{
  const port={
   currentProjectOwner:vi.fn(async()=>true),
   insertOnce:vi.fn(async(_record:unknown)=>{throw Error('Database unavailable')}),
  }
  expect(await recordWeeklyReviewNotice(port,owner,notice())).toBe('blocked')
  expect(port.insertOnce).toHaveBeenCalledTimes(1)
 })
 it('only returned owner+project rows are rendered; no raw body is surfaced',async()=>{
  const x=await readRecentWeeklyReviewNotices({
   list:async()=>[row()],
  },owner,FAMILY)
  expect(x).toMatchObject({
   available:true,notices:[{weekStart:'2027-01-04',draftCount:2,preparationId:prep}],
  })
  expect(x.notices[0].workspaceUrl).toBe('https://app.omniraos.se/projects/familje-stunden/social#content')
  expect(JSON.stringify(x)).not.toContain('email')
 })
 it('fails closed for another project or owner and malformed rows',async()=>{
  const p={list:vi.fn(async()=>[row()])}
  expect(await readRecentWeeklyReviewNotices(p,owner,other)).toEqual({available:false,notices:[]})
  expect(await readRecentWeeklyReviewNotices(p,'bad',FAMILY)).toEqual({available:false,notices:[]})
  expect(p.list).not.toHaveBeenCalled()
  for(const altered of [
   {project_id:other},{owner_id:other},{preparation_id:'bad'},{draft_count:3},
   {can_publish:true},{state:'published'},{created_at:'not valid'},
  ]){
   const got=await readRecentWeeklyReviewNotices({list:async()=>[{...row(),...altered}]},owner,FAMILY)
   expect(got).toEqual({available:false,notices:[]})
  }
 })
 it('never claims an outage is an empty inbox',async()=>{
  const result=await readRecentWeeklyReviewNotices({list:async()=>{throw Error('fail')}},owner,FAMILY)
  expect(result).toEqual({available:false,notices:[]})
 })
 it('server database migration requires source verification and no outbound grants',async()=>{
  const {readFileSync}=await import('node:fs')
  const {resolve}=await import('node:path')
  const m=readFileSync(resolve(__dirname,
   '../../../supabase/migrations/20261028094000_family_weekly_review_notices.sql'),'utf8')
  expect(m).toContain('references public.social_weekly_preparations(id)')
  expect(m).toContain('p.created_by=new.owner_id')
  expect(m).toContain("p.result->>'status'='editorial_review_required'")
  expect(m).toContain("p.result->'publicationAuthority'='false'::jsonb")
  expect(m).toContain('not null unique references public.social_weekly_preparations(id)')
  expect(m).toContain('alter table public.family_weekly_review_notices enable row level security')
  expect(m).toContain('grant select on public.family_weekly_review_notices to authenticated,service_role')
  expect(m).toContain('grant insert on public.family_weekly_review_notices to service_role')
  expect(m).not.toMatch(/grant (?:delete|update) on public.family_weekly_review_notices/i)
  expect(m).not.toMatch(/security definer/i)
 })
})
