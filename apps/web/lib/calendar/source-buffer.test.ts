import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {readCalendarBuffer} from './source-buffer';
import type {AdminDb,CalendarActor,CalendarRange} from './types';
vi.mock('server-only',()=>({}));
const actor:CalendarActor={userId:'owner-test',allowedProjectIds:['8f673c09-1c8f-4d78-876e-4c14bf1c89b3'],projectScopeAvailable:true};
const range:CalendarRange={fromDate:'2026-11-16',toDateExclusive:'2026-11-23',timeZone:'Europe/Stockholm'};
const db={} as AdminDb;
const node=(data:Record<string,unknown>={})=>({
  id:'6afcd54c30b9befce2b43473',channelId:'6afccf7eece6dfde5fff4341',
  text:'Handlarbörsen\nFullständig text',status:'scheduled',dueAt:'2026-11-18T13:30:00Z',sentAt:null,externalLink:null,...data,
});
const payload=(entries:unknown[],next=false,cursor:string|null=null)=>({
  data:{posts:{edges:entries.map(node=>({node})),pageInfo:{hasNextPage:next,endCursor:cursor}}},
});
function stubResponse(json:unknown,status=200){
  return vi.fn().mockResolvedValue({ok:status===200,status,json:async()=>json});
}
beforeEach(()=>{vi.stubEnv('BUFFER_API_KEY','only-for-test-12345678901234567890');});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('readCalendarBuffer provider-scoped read only access',()=>{
 it('reads only company LinkedIn posts and preserves Swedish text without mutation',async()=>{
  const fetch=stubResponse(payload([node(),node({id:'wrong1',channelId:'another-channel'})]));vi.stubGlobal('fetch',fetch);
  const result=await readCalendarBuffer(db,actor,range);
  expect(result.entries).toHaveLength(1);
  expect(result.entries[0]).toMatchObject({
    source:{kind:'buffer',projectId:'8f673c09-1c8f-4d78-876e-4c14bf1c89b3',postId:'6afcd54c30b9befce2b43473'},
    status:'scheduled',editable:false,bufferDetail:{fullText:'Handlarbörsen\nFullständig text',channel:'linkedin'},
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url,request]=fetch.mock.calls[0];
  expect(url).toBe('https://api.buffer.com');
  expect(request.method).toBe('POST');
  expect(request.cache).toBe('no-store');
  expect(request.body).not.toContain('only-for-test');
 });
 it('marks sent with explicit receipt only, not dueAt',async()=>{
  vi.stubGlobal('fetch',stubResponse(payload([node({status:'sent',sentAt:'2026-11-18T13:31:00Z'})])));
  const result=await readCalendarBuffer(db,actor,range);
  expect(result.entries[0].status).toBe('buffer_published');
  expect(result.entries[0].time).toMatchObject({startUtc:'2026-11-18T13:31:00.000Z'});
 });
 it('never calls API for unrelated projects',async()=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  const result=await readCalendarBuffer(db,{...actor,allowedProjectIds:['unrelated']},range);
  expect(result.entries).toEqual([]);
  expect(fetch).not.toHaveBeenCalled();
 });
 it('fails closed on missing credentials, provider errors and access errors',async()=>{
  vi.stubEnv('BUFFER_API_KEY','');
  await expect(readCalendarBuffer(db,actor,range)).rejects.toThrow('not configured');
  vi.stubEnv('BUFFER_API_KEY','only-for-test-12345678901234567890');
  vi.stubGlobal('fetch',stubResponse({errors:[{message:'Oops'}]}));
  await expect(readCalendarBuffer(db,actor,range)).rejects.toThrow('response incomplete');
  await expect(readCalendarBuffer(db,{...actor,projectScopeAvailable:false},range)).rejects.toThrow('scope unavailable');
 });
 it('paginates and deduplicates provider ID across pages',async()=>{
  const fetch=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>payload([node()],true,'next')})
    .mockResolvedValueOnce({ok:true,json:async()=>payload([node({status:'sent',sentAt:'2026-11-18T13:31:00Z'})])});
  vi.stubGlobal('fetch',fetch);
  const result=await readCalendarBuffer(db,actor,range);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(result.entries).toHaveLength(1);
  expect(result.entries[0].status).toBe('buffer_published');
 });
});
