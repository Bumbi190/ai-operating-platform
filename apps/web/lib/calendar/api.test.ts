import {beforeAll,afterAll,beforeEach,it,expect,vi} from 'vitest';
import {initializeCalendarDb,USER_EMPTY,PROJECT_B} from './test-db';
import {fixtureCreate,fixtureRange} from './fixtures.test-utils';
import {resolveCalendarAccess} from './access';
import {calendarApi} from './api';
vi.mock('./access',()=>({resolveCalendarAccess:vi.fn()}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({})}));
let fixture:ReturnType<typeof initializeCalendarDb>;
beforeAll(()=>{fixture=initializeCalendarDb()},30000);afterAll(()=>fixture?.close());
beforeEach(()=>{vi.mocked(resolveCalendarAccess).mockResolvedValue({ok:true,actor:{userId:USER_EMPTY,allowedProjectIds:[]},sessionDb:fixture.forUser(USER_EMPTY)})});
const request=(body:unknown,origin='https://calendar.test')=>new Request('https://calendar.test/api/calendar',{method:'POST',headers:{origin,host:'calendar.test','content-type':'application/json'},body:JSON.stringify(body)});
it('returns an uncached 401 without a user session',async()=>{
 vi.mocked(resolveCalendarAccess).mockResolvedValue({ok:false,response:Response.json({ok:false,code:'UNAUTHORIZED'},{status:401})});
 const response=await calendarApi(new Request('https://calendar.test/api/calendar?fromDate=2026-10-19&toDateExclusive=2026-10-26'));
 expect(response.status).toBe(401);expect(response.headers.get('Cache-Control')).toContain('no-store');
});
it('requires the same origin for writes',async()=>{
 expect((await calendarApi(request(fixtureCreate(),'https://other.test'))).status).toBe(403);
});
it('returns success only after the actual meeting was saved and can be reloaded',async()=>{
 const input=fixtureCreate(),response=await calendarApi(request(input));
 expect(response.status).toBe(200);const receipt=await response.json();expect(receipt.ok).toBe(true);
 const loaded=await calendarApi(new Request('https://calendar.test/api/calendar?fromDate='+fixtureRange.fromDate+'&toDateExclusive='+fixtureRange.toDateExclusive));
 const model=await loaded.json();expect(model.entries.some((e:{id:string})=>e.id==='manual:'+input.eventId)).toBe(true);
 expect(loaded.headers.get('Cache-Control')).toContain('private');
});
it('rejects ownership, unknown fields and foreign project filters',async()=>{
 expect((await calendarApi(request({...fixtureCreate(),ownerUserId:USER_EMPTY}))).status).toBe(400);
 expect((await calendarApi(new Request('https://calendar.test/api/calendar?fromDate=2026-10-19&toDateExclusive=2026-10-26&projectId='+PROJECT_B))).status).toBe(404);
 expect((await calendarApi(new Request('https://calendar.test/api/calendar?fromDate=2026-10-19&toDateExclusive=2026-10-26&ownerUserId='+USER_EMPTY))).status).toBe(400);
});
it('enforces the actual streamed 32KiB limit without trusting content-length',async()=>{
 const stream=new ReadableStream<Uint8Array>({start(c){c.enqueue(new TextEncoder().encode(' '.repeat(33000)));c.close()}});
 const req=new Request('https://calendar.test/api/calendar',{method:'POST',headers:{origin:'https://calendar.test',host:'calendar.test','content-type':'application/json','content-length':'1'},body:stream,duplex:'half'} as RequestInit);
 expect((await calendarApi(req)).status).toBe(413);
});
it('reports storage failure without a success receipt',async()=>{
 vi.mocked(resolveCalendarAccess).mockResolvedValue({ok:true,actor:{userId:USER_EMPTY,allowedProjectIds:[]},sessionDb:{rpc:async()=>({data:null,error:{message:'offline'}})} as never});
 const response=await calendarApi(request(fixtureCreate()));expect(response.status).toBe(503);expect((await response.json()).ok).toBe(false);
});
