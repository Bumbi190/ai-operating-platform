import {expect,it,vi} from 'vitest';
import {calendarDetailApi} from './detail-api';
import {resolveCalendarAccess} from './access';
import {readCalendarDetail} from './detail';
vi.mock('./access',()=>({resolveCalendarAccess:vi.fn(async()=>({ok:true,actor:{userId:'u',allowedProjectIds:['p']},sessionDb:{}}))}));vi.mock('./detail',()=>({readCalendarDetail:vi.fn(async()=>({title:'Film',content:{kind:'text',text:'Full text'}}))}));vi.mock('../supabase/admin',()=>({createAdminClient:()=>({})}));
it('authenticates exact GET selector, uses no-store and exposes no write operation',async()=>{
 const source={kind:'media',projectId:'p',scriptId:'s'},url='https://test/api/calendar/detail?source='+encodeURIComponent(JSON.stringify(source));
 const r=await calendarDetailApi(new Request(url));expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toContain('no-store');expect(readCalendarDetail).toHaveBeenCalledWith({adminDb:{}},{userId:'u',allowedProjectIds:['p']},source);
 expect((await calendarDetailApi(new Request(url,{method:'POST'}))).status).toBe(405);expect((await calendarDetailApi(new Request(url+'&source=x'))).status).toBe(400);expect((await calendarDetailApi(new Request(url+'&url=https://evil.example'))).status).toBe(400);
 vi.mocked(resolveCalendarAccess).mockResolvedValueOnce({ok:false,response:new Response(null,{status:401})} as any);expect((await calendarDetailApi(new Request(url))).status).toBe(401);
});
