import {beforeEach,it,expect,vi} from 'vitest';
import {calendarProductionPreviewApi} from './production-preview-api';
import {resolveCalendarAccess} from './access';
import {readCalendarProductionPreview} from './production-preview';
vi.mock('./access',()=>({resolveCalendarAccess:vi.fn()}));
vi.mock('../supabase/admin',()=>({createAdminClient:vi.fn(()=>({}))}));
vi.mock('./production-preview',()=>({readCalendarProductionPreview:vi.fn()}));
const access=vi.mocked(resolveCalendarAccess),read=vi.mocked(readCalendarProductionPreview);
const query='projectId=10000000-0000-4000-8000-000000000001&instanceId=60000000-0000-4000-8000-000000000001';
const request=(suffix=query)=>new Request('https://example.test/api/calendar/production-preview?'+suffix);
beforeEach(()=>{vi.resetAllMocks();access.mockResolvedValue({ok:true,actor:{userId:'owner',allowedProjectIds:[]},sessionDb:{} as never});});
it('requires a session and does not read a preview on logout',async()=>{
 access.mockResolvedValue({ok:false,response:Response.json({ok:false,code:'UNAUTHORIZED'},{status:401})});
 const response=await calendarProductionPreviewApi(request());expect(response.status).toBe(401);expect(read).not.toHaveBeenCalled();
 expect(response.headers.get('Cache-Control')).toBe('private, no-store');
});
it.each([query+'&instanceId=duplicate',query+'&actionKind=publish','projectId=bad',query+'&skipEvidence=true'])('rejects malformed or expanded input %s',async input=>{
 expect((await calendarProductionPreviewApi(request(input))).status).toBe(400);expect(read).not.toHaveBeenCalled();
});
it('rejects writes',async()=>{expect((await calendarProductionPreviewApi(new Request(request(),{method:'POST'}))).status).toBe(405);expect(read).not.toHaveBeenCalled();});
it('returns no private backend error text',async()=>{
 read.mockRejectedValue(new Error('secret backend details'));
 const response=await calendarProductionPreviewApi(request());expect(response.status).toBe(503);
 expect(await response.json()).toEqual({ok:false,code:'UNAVAILABLE'});
});
it('returns the scoped preview without caching it',async()=>{
 read.mockResolvedValue({planningOnly:true,canStart:false} as never);
 const response=await calendarProductionPreviewApi(request());expect(response.status).toBe(200);
 expect(response.headers.get('Cache-Control')).toBe('private, no-store');
 expect(await response.json()).toEqual({ok:true,preview:{planningOnly:true,canStart:false}});
});
