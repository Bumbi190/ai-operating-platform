import {describe,it,expect} from 'vitest'
import {
 findWeeklyAutomaticWindow,evaluateAutomaticWeeklyPreparation,
 FAMILY_WEEKLY_PROJECT_ID as FAMILY,
 type WeeklyAutoEvidence,
} from './auto-preparation'

const now='2027-01-03T14:10:00Z' // Sunday 15:10, Stockholm
const weekStart='2027-01-04'
const stamp=(hour:string)=>'2027-01-'+hour
const evidence=():WeeklyAutoEvidence=>({
 project:{id:FAMILY},
 plan:{
  weekStart,weekEndExclusive:'2027-01-11',
  existing:[],
  slots:[
   {key:'2027-01-05T17:00:ordinary',localMinute:'2027-01-05T17:00',scheduledAt:'2027-01-05T16:00:00Z',kind:'ordinary',releaseMonth:null},
   {key:'2027-01-08T20:30:ordinary',localMinute:'2027-01-08T20:30',scheduledAt:'2027-01-08T19:30:00Z',kind:'ordinary',releaseMonth:null},
  ],
  missing:[],
 },
 preparation:null,assets:[{id:'safe-owned-photo',description:'Nova and Pling reading together'}],
 profile:{sha256:'a'.repeat(64),profile:{description:'Familje-Stunden äventyr för barn'}},
 sourceReferences:['profile:'+'a'.repeat(64)],missing:[],
})
const evalWith=(part:Partial<WeeklyAutoEvidence>|null=null,opts:Partial<{now:string;projectId:string;ownerOptIn:boolean}>={})=>{
 const base=evidence()
 return evaluateAutomaticWeeklyPreparation({
  now,projectId:FAMILY,ownerOptIn:true,evidence:part===null?base:{...base,...part},
  ...opts,
 })
}

describe('Familje-Stunden automatic weekly preparation — no action authority',()=>{
 it('first review window starts 3 Jan 2027; targets Monday 4 Jan',()=>{
  expect(findWeeklyAutomaticWindow(now)).toEqual({
   status:'scheduled_window',localDate:'2027-01-03',weekStart,
  })
 })
 it('before January (including December Sundays) never prepares anything',()=>{
  expect(findWeeklyAutomaticWindow('2026-12-27T14:00:00Z')).toEqual({
   status:'not_due',reason:'before_start',
  })
  expect(findWeeklyAutomaticWindow('2026-10-28T13:00:00Z')).toMatchObject({status:'not_due'})
 })
 it('only runs Sunday in 15:00 Stockholm hour (not UTC hour)',()=>{
  expect(findWeeklyAutomaticWindow('2027-01-03T13:59:00Z')).toMatchObject({reason:'outside_review_hour'})
  expect(findWeeklyAutomaticWindow('2027-01-03T14:59:59Z')).toMatchObject({status:'scheduled_window'})
  expect(findWeeklyAutomaticWindow('2027-01-03T15:00:00Z')).toMatchObject({reason:'outside_review_hour'})
  expect(findWeeklyAutomaticWindow('2027-01-04T14:10:00Z')).toMatchObject({reason:'wrong_weekday'})
 })
 it('does not shift the Sunday review time during Swedish daylight saving time',()=>{
  expect(findWeeklyAutomaticWindow('2027-07-04T13:10:00Z')).toMatchObject({
   status:'scheduled_window',localDate:'2027-07-04',weekStart:'2027-07-05',
  })
  expect(findWeeklyAutomaticWindow('2027-07-04T14:10:00Z')).toMatchObject({reason:'outside_review_hour'})
 })
 it('rejects malformed or timezone-less clocks instead of assuming UTC',()=>{
  for(const value of ['now','2027-01-03T15:10:00','', '2027-01-03T15:10:00Z-foo']){
   expect(findWeeklyAutomaticWindow(value)).toEqual({status:'not_due',reason:'invalid_clock'})
  }
 })
 it('requires explicit opt-in and a single fixed family project',()=>{
  expect(evalWith(null,{ownerOptIn:false})).toEqual({status:'not_enabled'})
  expect(evalWith(null,{projectId:'another-project'})).toEqual({status:'not_enabled'})
  expect(evalWith(null,{now:'2026-11-01T14:00:00Z'})).toMatchObject({status:'not_due'})
 })
 it('returns four owner-review drafts slots, not permission to publish',()=>{
  const result=evalWith()
  expect(result).toEqual({
   status:'ready_to_prepare_drafts',weekStart,
   slotKeys:['2027-01-05T17:00:ordinary','2027-01-08T20:30:ordinary'],
   captionCount:4,
  })
  expect(JSON.stringify(result)).not.toMatch(/approved|publish|send|dispatch/)
 })
 it('won\'t generate more content if a preparation already exists',()=>{
  expect(evalWith({preparation:{preparationId:'persisted'}})).toEqual({status:'already_prepared',weekStart})
 })
 it('does not invent a new slot in a week that is already full',()=>{
  expect(evalWith({plan:{...evidence().plan,slots:[]}})).toEqual({status:'nothing_to_prepare',weekStart})
 })
 it('allows a partial existing week to fill one remaining pair only',()=>{
  const base=evidence()
  expect(evalWith({plan:{...base.plan,slots:base.plan.slots.slice(0,1)}})).toEqual({
   status:'ready_to_prepare_drafts',weekStart,
   slotKeys:[base.plan.slots[0].key],captionCount:2,
  })
 })
 it('unknown context or foreign project is not treated as empty',()=>{
  const base=evidence()
  expect(evalWith({project:{id:'not-family'}})).toMatchObject({status:'review_required',reasons:['verified_weekly_context_missing']})
  expect(evalWith({plan:{...base.plan,weekStart:'2027-01-11'}})).toMatchObject({status:'review_required',reasons:['verified_weekly_context_missing']})
  expect(evaluateAutomaticWeeklyPreparation({now,projectId:FAMILY,ownerOptIn:true,evidence:null})).toMatchObject({status:'review_required'})
 })
 it('respects every missing-input and account/release blocker',()=>{
  expect(evalWith({missing:['account_unverified:instagram','monthly_catalog_missing:2027-01']})).toEqual({
   status:'review_required',weekStart,reasons:['account_unverified:instagram','monthly_catalog_missing:2027-01'],
  })
  expect(evalWith({assets:[]})).toMatchObject({status:'review_required',reasons:['described_image_missing']})
  expect(evalWith({profile:null})).toMatchObject({status:'review_required'})
  expect(evalWith({sourceReferences:[]})).toMatchObject({status:'review_required',reasons:['source_reference_missing']})
 })
 it('rejects monthly release slots in automatic ordinary content flow',()=>{
  const base=evidence()
  expect(evalWith({plan:{...base.plan,slots:[
   {...base.plan.slots[0],kind:'month_release',releaseMonth:'2027-01'},
  ]}})).toMatchObject({status:'review_required',reasons:['unexpected_monthly_slot']})
 })
 it('returns no authorization to generate paid media, approve or publish',()=>{
  const r=evalWith() as unknown as Record<string,unknown>
  for(const key of ['canPublish','publishAllowed','sendAllowed','approve','createImage','moneyBudget']){
   expect(r).not.toHaveProperty(key)
  }
 })
})
