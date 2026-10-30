import {it,expect,vi,beforeEach} from 'vitest';
import {calendarProductionStartApi} from './production-start-api';
import {resolveCalendarAccess} from './access';
import {prepareStoryJob,approveStoryJob,readStoryJobReceipt} from './production-start';
vi.mock('./access',()=>({resolveCalendarAccess:vi.fn()}));
vi.mock('../supabase/admin',()=>({createAdminClient:()=>({admin:true})}));
vi.mock('./production-start',async original=>{const actual=await original<typeof import('./production-start')>();return {...actual,prepareStoryJob:vi.fn(),approveStoryJob:vi.fn(),readStoryJobReceipt:vi.fn()};});
const projectId='10000000-0000-4000-8000-000000000001',instanceId='60000000-0000-4000-8000-000000000001',requestId='40000000-0000-4000-8000-000000000001';
const actor={userId:'owner',allowedProjectIds:[projectId]},sessionDb={session:true};
const request=(body:unknown,origin='https://example.test')=>new Request('https://example.test/api/calendar/production-start',{method:'POST',headers:{origin,host:'example.test','Content-Type':'application/json'},body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();vi.mocked(resolveCalendarAccess).mockResolvedValue({ok:true,actor,sessionDb:sessionDb as never});});
it('requires same origin before touching authority',async()=>{
 expect((await calendarProductionStartApi(request({operation:'approve'},'https://evil.test'))).status).toBe(403);
 expect(resolveCalendarAccess).not.toHaveBeenCalled();expect(approveStoryJob).not.toHaveBeenCalled();
});
it('requires a real session',async()=>{
 vi.mocked(resolveCalendarAccess).mockResolvedValue({ok:false,response:Response.json({ok:false},{status:401})});
 expect((await calendarProductionStartApi(request({operation:'prepare'}))).status).toBe(401);expect(prepareStoryJob).not.toHaveBeenCalled();
});
it.each(['userId','model','maximumSek','target','authorizationId','skipEvidence'])('refuses injected authority field %s',async field=>{
 const response=await calendarProductionStartApi(request({operation:'prepare',projectId,instanceId,requestKey:requestId,[field]:'forged'}));
 expect(response.status).toBe(400);expect(prepareStoryJob).not.toHaveBeenCalled();
});
it('derives actor and uses only the session client to approve',async()=>{
 vi.mocked(approveStoryJob).mockResolvedValue({requestId,runId:'run',status:'pending',replayed:false});
 const response=await calendarProductionStartApi(request({operation:'approve',requestId,reviewedHash:'a'.repeat(64)}));
 expect(response.status).toBe(200);expect(approveStoryJob).toHaveBeenCalledWith({admin:true},sessionDb,actor,{requestId,reviewedHash:'a'.repeat(64)});
 expect(response.headers.get('Cache-Control')).toBe('private, no-store');
});
it('never leaks a backend error or invokes another operation',async()=>{
 vi.mocked(prepareStoryJob).mockRejectedValue(new Error('private database detail'));
 const response=await calendarProductionStartApi(request({operation:'prepare',projectId,instanceId,requestKey:requestId}));
 expect(response.status).toBe(503);expect(await response.json()).toEqual({ok:false,code:'UNAVAILABLE'});expect(approveStoryJob).not.toHaveBeenCalled();
});
it('status is read only and GET is not an approval surface',async()=>{
 vi.mocked(readStoryJobReceipt).mockResolvedValue(null);
 expect((await calendarProductionStartApi(request({operation:'status',requestId}))).status).toBe(200);
 expect((await calendarProductionStartApi(new Request('https://example.test/api/calendar/production-start'))).status).toBe(405);
 expect(approveStoryJob).not.toHaveBeenCalled();
});
