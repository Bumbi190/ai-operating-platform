import {describe,it,expect} from 'vitest'
import {findCalendarPost,calendarPostIntent} from './post-lookup'
import type {CalendarWeekModel} from './types'
const postId='40000000-0000-4000-8000-000000000009', projectId='40000000-0000-4000-8000-000000000007'
const row={id:'social:'+postId,title:'Handlarbörsen: en stängd marknadsplats för bilhandlare',projectId,channel:'linkedin',status:'proposal',
 source:{kind:'social',postId,projectId,revisionId:'r'},time:{kind:'timed',startUtc:'2026-11-11T12:00:00.000Z'}}
const model={entries:[row],availability:{social:true},truncated:{social:false},projects:[{id:projectId,name:'Handlarbörsen'}],range:{fromDate:'2026-11-11',toDateExclusive:'2026-11-12'}} as unknown as CalendarWeekModel
describe('voice and text calendar post lookup',()=>{
 it('matches the spoken title and Stockholm clock to one openable row',()=>{
  expect(findCalendarPost(model,{title:'Handlarbörsen en stängd mar-marknadsplats för bilhandlare',project:'Handlarbörsen',localTime:'13:00',channel:'LinkedIn'})).toMatchObject({ok:true,post:{postId,href:'/calendar?week=2026-11-09&post='+postId}})
  expect(findCalendarPost(model,{postId,localTime:'12:00'})).toMatchObject({ok:false,code:'NOT_FOUND'})
  expect(findCalendarPost(model,{postId,channel:'instagram'})).toMatchObject({ok:false,code:'NOT_FOUND'})
 })
 it('does not select between two matching posts or use incomplete results',()=>{
  expect(findCalendarPost({...model,entries:[...model.entries,...model.entries]},{})).toMatchObject({ok:false,code:'AMBIGUOUS'})
  expect(findCalendarPost({...model,truncated:{...model.truncated,social:true}},{})).toMatchObject({ok:false,code:'INCOMPLETE_CALENDAR'})
 })
 it('retains editorial intent across the real follow-up, without diverting a new analytics query',()=>{
  const first='Byt bilden till inlägget på LinkedIn, du ser inlägget i kalendern.'
  expect(calendarPostIntent(first,[],true)).toBe(true)
  expect(calendarPostIntent('Handlarbörsen, en stängd marknadsplats för bilhandlare. Onsdag den elfte klockan 13:00.',[first],true)).toBe(true)
  expect(calendarPostIntent('Vad ser du på skärmen?',[first],true)).toBe(true)
  expect(calendarPostIntent('Visa statistik om Handlarbörsen',[first],true)).toBe(false)
 })
})
