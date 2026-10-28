import {describe,it,expect,vi} from 'vitest'
import {
 deriveWeeklyConsentStatus,readWeeklyOwnerConsent,getVerifiedOwnerWeeklyEnrollment,
 familyWeeklyRuntimeEnabled,type ConsentEvent,type WeeklyConsentReadPort,
} from './enrollment'
import {
 isWeeklyEnrollmentRequest,prepareWeeklyOwnerConsentEvent,
 WEEKLY_OPT_IN_DURATION_DAYS,
} from './enrollment-action'
import {FAMILY_WEEKLY_PROJECT_ID as FAMILY} from './auto-preparation'

const OWNER='77777777-7777-4777-8777-777777777777'
const OTHER='88888888-8888-4888-8888-888888888888'
const NOW='2027-01-03T14:10:00Z'
const event=(patch:Partial<ConsentEvent>={}):ConsentEvent=>({
 event_id:1,project_id:FAMILY,owner_id:OWNER,action:'enable',
 valid_until:'2027-03-20T14:00:00.000Z',
 created_at:'2027-01-02T14:00:00.000Z',
 max_completion_tokens:1800,max_calls_per_week:1,
 can_publish:false,can_schedule:false,...patch,
})
const port=(raw:unknown,projectOwned=true):WeeklyConsentReadPort=>({
 currentProjectOwner:vi.fn(async()=>projectOwned),
 latestEvent:vi.fn(async()=>raw),
})
describe('Append-only owner consent for Family weekly caption drafts',()=>{
 it('is not enabled without a durable event',async()=>{
  expect(deriveWeeklyConsentStatus(null,FAMILY,OWNER,NOW)).toMatchObject({enabled:false,status:'not_configured'})
  expect(await readWeeklyOwnerConsent(port(null),FAMILY,OWNER,NOW)).toMatchObject({enabled:false,status:'not_configured'})
 })
 it("accepts only the current owner's well-shaped event with hard ceilings",()=>{
  expect(deriveWeeklyConsentStatus(event(),FAMILY,OWNER,NOW)).toMatchObject({
   enabled:true,status:'active',canSchedule:false,canPublish:false,eventId:1,
   validUntil:'2027-03-20T14:00:00.000Z',
  })
  for(const patch of [
   {project_id:OTHER},{owner_id:OTHER},
   {max_completion_tokens:2000},{max_calls_per_week:2},
   {can_publish:true},{can_schedule:true},
   {valid_until:'2027-04-15T00:00:00Z'},
   {valid_until:'2027-01-01T00:00:00Z'},
   {event_id:0},{created_at:'not a timestamp'},
  ]){
   expect(deriveWeeklyConsentStatus(event(patch as never),FAMILY,OWNER,NOW)).toMatchObject({
    enabled:false,status:'unavailable',
   })
  }
 })
 it('revocation and expiry terminate authorization without a delete',()=>{
  expect(deriveWeeklyConsentStatus(event({action:'revoke',valid_until:null}),FAMILY,OWNER,NOW))
   .toMatchObject({enabled:false,status:'revoked',canPublish:false})
  expect(deriveWeeklyConsentStatus(event(),FAMILY,OWNER,'2027-03-22T00:00:00Z'))
   .toMatchObject({enabled:false,status:'expired'})
  expect(deriveWeeklyConsentStatus(event({created_at:'2027-01-04T01:00:00Z'}),FAMILY,OWNER,NOW))
   .toMatchObject({enabled:false,status:'unavailable'})
 })
 it('foreign project owners are refused regardless of event source',async()=>{
  expect(await readWeeklyOwnerConsent(port(event(),false),FAMILY,OWNER,NOW)).toMatchObject({enabled:false,status:'unavailable'})
  expect(await readWeeklyOwnerConsent(port(event()),OTHER,OWNER,NOW)).toMatchObject({enabled:false,status:'unavailable'})
  expect(await readWeeklyOwnerConsent(port(event()),FAMILY,OTHER,NOW)).toMatchObject({enabled:false,status:'unavailable'})
 })
 it('database outage always refuses, never silently treats it as not configured',async()=>{
  const failed:WeeklyConsentReadPort={
   currentProjectOwner:async()=>true,
   latestEvent:async()=>{throw Error('private database error')},
  }
  expect(await readWeeklyOwnerConsent(failed,FAMILY,OWNER,NOW))
   .toEqual({enabled:false,status:'unavailable',validUntil:null,lastUpdatedAt:null,eventId:null,
    canSchedule:false,canPublish:false})
 })
 it('the runtime grant is OFF even when an active consent exists',async()=>{
  const p=port(event())
  expect(await getVerifiedOwnerWeeklyEnrollment(p,OWNER,NOW,false)).toBeNull()
  expect(await getVerifiedOwnerWeeklyEnrollment(p,OWNER,NOW,true)).toEqual({
   eventId:1,status:'owner_verified',ownerId:OWNER,projectId:FAMILY,
   permittedOperation:'family_weekly_caption_drafts',
   validThrough:'2027-03-20T14:00:00.000Z',
  })
  expect(await getVerifiedOwnerWeeklyEnrollment(port(event({action:'revoke',valid_until:null})),OWNER,NOW,true)).toBeNull()
 })
 it('runtime flag defaults strictly OFF',()=>{
  const before=process.env.FAMILY_WEEKLY_AUTO_DRAFTS_RUNTIME_ENABLED
  delete process.env.FAMILY_WEEKLY_AUTO_DRAFTS_RUNTIME_ENABLED
  expect(familyWeeklyRuntimeEnabled()).toBe(false)
  process.env.FAMILY_WEEKLY_AUTO_DRAFTS_RUNTIME_ENABLED='1'
  expect(familyWeeklyRuntimeEnabled()).toBe(false)
  if(before===undefined)delete process.env.FAMILY_WEEKLY_AUTO_DRAFTS_RUNTIME_ENABLED
  else process.env.FAMILY_WEEKLY_AUTO_DRAFTS_RUNTIME_ENABLED=before
 })
 it('enabling requires EXACT fields, explicit confirmation, and signed-in owner UUID',()=>{
  const requested={projectId:FAMILY,operation:'enable',confirmed:true}
  expect(isWeeklyEnrollmentRequest(requested)).toBe(true)
  const out=prepareWeeklyOwnerConsentEvent(requested,OWNER,NOW)
  expect(out).toMatchObject({
   project_id:FAMILY,owner_id:OWNER,action:'enable',
   max_completion_tokens:1800,max_calls_per_week:1,
   can_schedule:false,can_publish:false,
  })
  expect(Date.parse(out!.valid_until!)-Date.parse(NOW))
   .toBe(WEEKLY_OPT_IN_DURATION_DAYS*86400000)
  expect(prepareWeeklyOwnerConsentEvent(requested,'bad',NOW)).toBeNull()
  expect(prepareWeeklyOwnerConsentEvent(requested,OWNER,'not-a-date')).toBeNull()
 })
 it.each([
  {projectId:FAMILY,operation:'enable'},
  {projectId:FAMILY,operation:'enable',confirmed:false},
  {projectId:FAMILY,operation:'enable',confirmed:true,maxBudgetSek:10000},
  {projectId:FAMILY,operation:'enable',confirmed:true,ownerId:OTHER},
  {projectId:OTHER,operation:'enable',confirmed:true},
  {projectId:FAMILY,operation:'revoke',confirmed:true},
  {projectId:FAMILY,operation:'revoke',now:'2027-01-01T00:00:00Z'},
 ])('rejects forged/incomplete request fields %j',value=>{
  expect(isWeeklyEnrollmentRequest(value)).toBe(false)
  expect(prepareWeeklyOwnerConsentEvent(value,OWNER,NOW)).toBeNull()
 })
 it('revoke is simple and never exposes any scheduling authority',()=>{
  expect(prepareWeeklyOwnerConsentEvent({projectId:FAMILY,operation:'revoke'},OWNER,NOW))
   .toMatchObject({action:'revoke',valid_until:null,can_schedule:false,can_publish:false})
 })
})
