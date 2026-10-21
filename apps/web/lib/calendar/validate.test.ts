import {describe,it,expect} from 'vitest';
import {parseCalendarMutation,parseCalendarRange} from './validate';
const id='11111111-1111-4111-8111-111111111111';
const draft=()=>({kind:'private',title:'  Oscar  ',description:'',location:'',projectId:null,taskId:null,time:{kind:'timed',startUtc:'2026-10-22T12:00:00.000Z',endUtc:'2026-10-22T13:00:00.000Z',timeZone:'Europe/Stockholm'},workStatus:null});
const create=()=>({operation:'create',eventId:id,idempotencyKey:id,draft:draft()});
describe('calendar validation',()=>{
 it('normalizes the title and preserves an explicit point',()=>{
  const body=create();body.draft.time.endUtc=null as unknown as string;
  const parsed=parseCalendarMutation(body);
  expect(parsed.operation==='create'&&parsed.draft.title).toBe('Oscar');
  expect(parsed.operation==='create'&&parsed.draft.time).toEqual(body.draft.time);
 });
 it('accepts a 31-day interval and rejects longer, reversed or invalid dates',()=>{
  expect(parseCalendarRange({fromDate:'2026-10-01',toDateExclusive:'2026-11-01',timeZone:'Europe/Stockholm'}).fromDate).toBe('2026-10-01');
  for(const r of [
   {fromDate:'2026-10-01',toDateExclusive:'2026-11-02'},
   {fromDate:'2026-10-02',toDateExclusive:'2026-10-01'},
   {fromDate:'2026-02-30',toDateExclusive:'2026-03-02'},
  ]) expect(()=>parseCalendarRange({...r,timeZone:'Europe/Stockholm'})).toThrow();
 });
 it.each([
  {title:' '},{title:'x'.repeat(151)},{description:'x'.repeat(5001)},
  {location:'x'.repeat(501)},{title:'bad\u0000title'},{ownerUserId:id},
  {kind:'private',workStatus:'planned'},{kind:'work_block',workStatus:null},
  {projectId:'bad'},{taskId:id},{description:12}
 ])('rejects invalid draft fields %j',patch=>{
  const body=create();Object.assign(body.draft,patch);
  expect(()=>parseCalendarMutation(body)).toThrow();
 });
 it('rejects client ownership, unknown fields and malformed IDs',()=>{
  for(const patch of [{ownerUserId:id},{unexpected:true},{eventId:'bad'},{idempotencyKey:''}])
   expect(()=>parseCalendarMutation({...create(),...patch})).toThrow();
 });
 it.each(['2026-10-22T12:00:00.000Z','2026-10-22T11:00:00.000Z'])('rejects nonpositive duration %s',end=>{
  const body=create();body.draft.time.endUtc=end;
  expect(()=>parseCalendarMutation(body)).toThrow();
 });
 it('requires an exact UTC instant and a supported zone',()=>{
  for(const patch of [{startUtc:'2026-02-30T12:00:00.000Z'},{startUtc:'2026-10-22T14:00:00+02:00'},{timeZone:'UTC'},{ownerUserId:id}]){
   const body=create();Object.assign(body.draft.time,patch);
   expect(()=>parseCalendarMutation(body)).toThrow();
  }
 });
 it('validates all-day dates without converting to UTC',()=>{
  const body={...create(),draft:{...draft(),time:{kind:'all_day',startDate:'2026-10-25',endDateExclusive:'2026-10-26',timeZone:'Europe/Stockholm'}}};
  expect(parseCalendarMutation(body)).toEqual({...body,draft:{...body.draft,title:'Oscar'}});
  body.draft.time.endDateExclusive='2026-10-25';expect(()=>parseCalendarMutation(body)).toThrow();
 });
 it('requires the version for updates, cancellation and restoration',()=>{
  for(const operation of ['update','cancel','restore']){
   const body={...create(),operation,expectedVersion:1};
   if(operation!=='update')delete (body as Record<string,unknown>).draft;
   expect(parseCalendarMutation(body).operation).toBe(operation);
   expect(()=>parseCalendarMutation({...body,expectedVersion:0})).toThrow();
   expect(()=>parseCalendarMutation({...body,expectedVersion:undefined})).toThrow();
  }
 });
 it('accepts planned, ongoing and completed work with a project',()=>{
  for(const workStatus of ['planned','in_progress','done']){
   const body={...create(),draft:{...draft(),kind:'work_block',projectId:id,workStatus}};
   expect(parseCalendarMutation(body).operation).toBe('create');
  }
 });
});
