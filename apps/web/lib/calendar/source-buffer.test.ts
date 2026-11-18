import {describe,it,expect,vi} from 'vitest';
import {readCalendarBuffer} from './source-buffer';
import type {AdminDb,CalendarActor,CalendarRange} from './types';
vi.mock('server-only',()=>({}));
const actor:CalendarActor={userId:'owner-test',allowedProjectIds:['project-one'],projectScopeAvailable:true};
const range:CalendarRange={fromDate:'2026-11-16',toDateExclusive:'2026-11-23',timeZone:'Europe/Stockholm'};
const row=(overrides:Record<string,unknown>={})=>({
 owner_id:'owner-test',project_id:'project-one',channel_id:'linkedin-page-123',provider_post_id:'post_1234',
 content_text:'Handlarbörsen\nFullständig svensk text',provider_status:'scheduled',
 scheduled_at:'2026-11-18T13:30:00Z',sent_at:null,permalink:null,synced_at:'2026-11-18T07:00:00Z',...overrides,
});
function dbWith(rows:unknown[],error:unknown=null) {
 const query={select:vi.fn(),eq:vi.fn(),in:vi.fn(),order:vi.fn(),limit:vi.fn()};
 query.select.mockReturnValue(query);query.eq.mockReturnValue(query);
 query.in.mockReturnValue(query);query.order.mockReturnValue(query);
 query.limit.mockResolvedValue({data:rows,error});
 const from=vi.fn().mockReturnValue(query);
 return {db:{from} as unknown as AdminDb,query,from};
}
describe('readCalendarBuffer isolation and status',()=>{
 it('only projects a verified matching project and owner, with exact text',async()=>{
  const {db,query}=dbWith([row(),row({project_id:'another',provider_post_id:'post_4567'}),row({owner_id:'other',provider_post_id:'post_9999'})]);
  const result=await readCalendarBuffer(db,actor,range);
  expect(result.entries).toHaveLength(1);
  expect(result.entries[0]).toMatchObject({source:{kind:'buffer',projectId:'project-one',postId:'post_1234'},editable:false,
    status:'scheduled',bufferDetail:{fullText:'Handlarbörsen\nFullständig svensk text',channel:'linkedin'}});
  expect(query.eq).toHaveBeenCalledWith('owner_id','owner-test');
  expect(query.in).toHaveBeenCalledWith('project_id',['project-one']);
 });
 it('returns published only with sent receipt',async()=>{
  const {db}=dbWith([row({provider_status:'sent',sent_at:'2026-11-18T13:34:00Z'})]);
  const result=await readCalendarBuffer(db,actor,range);
  expect(result.entries[0].status).toBe('buffer_published');
  expect(result.entries[0].time).toMatchObject({startUtc:'2026-11-18T13:34:00.000Z'});
 });
 it('returns a closed empty scope without querying',async()=>{
  const {db,from}=dbWith([row()]);
  expect((await readCalendarBuffer(db,{...actor,allowedProjectIds:[]},range)).entries).toEqual([]);
  expect(from).not.toHaveBeenCalled();
 });
 it('fails closed on unavailable projects or provider mirror errors',async()=>{
  const {db}=dbWith([],Error('unavailable'));
  await expect(readCalendarBuffer(db,actor,range)).rejects.toThrow('Buffer mirror unavailable');
  await expect(readCalendarBuffer(db,{...actor,projectScopeAvailable:false},range)).rejects.toThrow('scope unavailable');
 });
});
