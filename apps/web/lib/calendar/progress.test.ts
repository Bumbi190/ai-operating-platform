import {describe,it,expect} from 'vitest';
import type {CalendarEntry} from './types';
import {calendarProgress,calendarAttention,calendarResponsibility} from './progress';
const entry=(status:string):CalendarEntry=>({id:'job:1',source:{kind:'workflow',projectId:'p',instanceId:'w'},title:'Skapa saga',projectId:'p',status,editable:false,href:null,pendingChange:null,time:{kind:'timed',startUtc:'2026-10-23T10:00:00Z',endUtc:null,timeZone:'Europe/Stockholm'}});
const social=(status:string,jobId:string|null='job'):CalendarEntry=>({...entry(status),source:{kind:'social',projectId:'p',postId:'post',revisionId:'rev',sha256:'a'.repeat(64),jobId}});
describe('source-aware calendar progress',()=>{
 it.each(['queued','claimed','scheduled','waiting','active'])('keeps %s blue',status=>expect(calendarProgress(entry(status)).tone).toBe('waiting'));
 it.each(['failed','blocked','missed'])('makes %s actionable red',status=>expect(calendarProgress(entry(status))).toMatchObject({tone:'error',needsAttention:true}));
 it('requires review of an unknown publication outcome, never green',()=>expect(calendarProgress(social('uncertain'))).toMatchObject({tone:'review',needsAttention:true}));
 it('does not trust published database state as provider confirmation',()=>expect(calendarProgress(social('published'))).toMatchObject({tone:'review',label:'Publicering behöver bekräftas'}));
 it('does not mark a content proposal green or assign it a publisher',()=>{expect(calendarProgress(social('published',null))).toMatchObject({tone:'review'});expect(calendarResponsibility(social('proposal',null))).toBeNull()});
 it('marks a completed workflow green without alerting',()=>expect(calendarProgress(entry('complete'))).toMatchObject({tone:'success',needsAttention:false}));
 it('marks explicitly completed personal work green and identifies the human',()=>{
  const e={...entry('scheduled'),source:{kind:'manual' as const,eventId:'e',version:1},manualEvent:{kind:'work_block',workStatus:'done'}} as CalendarEntry;
  expect(calendarProgress(e).tone).toBe('success');expect(calendarResponsibility(e)).toBe('Du');
 });
 it('planning Atlas work does not claim a running or completed flow',()=>{
  const e={...entry('scheduled'),source:{kind:'manual' as const,eventId:'e',version:1},manualEvent:{kind:'work_block',workStatus:'planned',responsibility:'atlas_planned'}} as CalendarEntry;
  expect(calendarResponsibility(e)).toBe('Atlas – planerat');expect(calendarProgress(e)).toMatchObject({tone:'waiting',label:'Planerat'});
 });
 it('pending time changes need review even when the old work is complete',()=>{const e=entry('complete');e.pendingChange={time:e.time,reviewHref:'/review'};expect(calendarProgress(e).tone).toBe('review')});
 it('cancelled entries stay neutral even with a pending proposal',()=>{const e=entry('cancelled');e.pendingChange={time:e.time,reviewHref:'/review'};expect(calendarProgress(e)).toMatchObject({tone:'neutral',needsAttention:false})});
 it('unrecognized states never imply success',()=>expect(calendarProgress(entry('future_state'))).toMatchObject({tone:'neutral',label:'Status okänd',needsAttention:false}));
 it.each(['__proto__','constructor','toString'])('treats unexpected %s as unknown data',status=>expect(calendarProgress(entry(status))).toMatchObject({tone:'neutral',label:'Status okänd'}));
 it('removes an earlier duplicate alert when the last entry is now complete',()=>expect(calendarAttention([entry('failed'),entry('complete')])).toEqual([]));
 it('deduplicates multi-day attention entries and places errors first',()=>{
  const review=social('needs_review');const error={...entry('failed'),id:'job:2'};
  expect(calendarAttention([review,review,error,{...entry('complete'),id:'job:3'}]).map(e=>e.id)).toEqual(['job:2','job:1']);
 });
});
