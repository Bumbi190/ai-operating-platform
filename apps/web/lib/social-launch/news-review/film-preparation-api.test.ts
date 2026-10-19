import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import {fixture,project} from './film-preparation-fixture'
import brief from '../../../../../docs/the-prompt-film-brief-20261019.json'
const boundary=vi.hoisted(()=>({access:vi.fn(),admin:vi.fn()}))
vi.mock('@/lib/auth/project-access',()=>({resolveProjectAccess:boundary.access}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:boundary.admin}))
import {POST} from '../../../app/api/media/film-preparation/route'
let f:ReturnType<typeof fixture>
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-19T07:00:00Z'));f=fixture()
 f.content.posts[0].revision.draft.text=brief.editorial.script;f.content.posts[0].revision.draft.linkUrl=brief.source.url
 boundary.access.mockReset().mockResolvedValue({ok:true,...f.p});boundary.admin.mockReset().mockReturnValue(f.db)})
afterEach(()=>vi.useRealTimers())
function request(input:unknown=f.input,origin:string|null='https://omnira.test',method='POST'){
 return new Request('https://omnira.test/api/media/film-preparation',{method,headers:{host:'omnira.test','content-type':'application/json',...(origin?{origin}:{})},...(method==='POST'?{body:typeof input==='string'?input:JSON.stringify(input)}:{})})}
async function check(status:number,code:string,r:Response){expect(r.status).toBe(status);expect(await r.json()).toEqual({code});expect(r.headers.get('cache-control')).toBe('private, no-store')}
it('runs the real adapter/stores and selects only the committed pilot brief',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch').mockRejectedValue(Error('No providers'))
 try{const r=await POST(request());expect(r.status).toBe(200);const v=await r.json()
 expect(v).toMatchObject({projectId:project,post:{id:f.input.postId,revisionId:f.input.revisionId,sha256:f.input.sha256},candidate:brief,persisted:false,jobId:null,canGenerate:false,canPublish:false,sourceVerification:'operator_supplied_not_verified'})
 expect(v.blockers).toHaveLength(6);expect(r.headers.get('x-content-type-options')).toBe('nosniff');expect(r.headers.get('referrer-policy')).toBe('no-referrer')
 expect(fetch).not.toHaveBeenCalled();expect(f.calls.every(c=>['from:projects','rpc:social_content_active','rpc:social_content_read','rpc:social_launch_plan_read'].includes(c))).toBe(true)
 }finally{fetch.mockRestore()}
})
it('uses normal authentication and never reaches admin data for a signed-out caller',async()=>{boundary.access.mockResolvedValue({ok:false,response:Response.json({code:'UNAUTHORIZED'},{status:401})});await check(401,'UNAUTHORIZED',await POST(request()));expect(boundary.admin).not.toHaveBeenCalled()})
it.each([null,'https://foreign.test'])('rejects missing or foreign origin %s',async origin=>{expect((await POST(request(f.input,origin))).status).toBe(403);expect(boundary.admin).not.toHaveBeenCalled()})
it('fails closed if authentication throws, without leaking details',async()=>{boundary.access.mockRejectedValue(Error('private auth detail'));await check(503,'UNAVAILABLE',await POST(request()))})
it('rejects a foreign project before creating the content client',async()=>{await check(404,'NOT_FOUND',await POST(request({...f.input,projectId:'99999999-9999-4999-8999-999999999999'})));expect(boundary.admin).not.toHaveBeenCalled()})
it('does not trust the allowed-project list as ownership proof',async()=>{f.owners[0].owner_id='other';await check(404,'NOT_FOUND',await POST(request()));expect(f.calls).toEqual(['from:projects'])})
it('rejects an owner without project access',async()=>{boundary.access.mockResolvedValue({ok:true,userId:f.p.userId,allowedProjectIds:[]});await check(404,'NOT_FOUND',await POST(request()));expect(f.calls).toEqual([])})
it.each(['brief','rightsVerified','budget','now','apply','userId'])('rejects caller supplied %s',async key=>{await check(400,'INVALID_BODY',await POST(request({...f.input,[key]:true})));expect(boundary.admin).not.toHaveBeenCalled()})
it.each(['{}','null','bad json','x'.repeat(9000)])('rejects invalid/oversized input %#',async input=>{await check(400,'INVALID_BODY',await POST(request(input)));expect(boundary.admin).not.toHaveBeenCalled()})
it('rejects unsupported methods',async()=>{await check(405,'INVALID_BODY',await POST(request(undefined,null,'GET')))})
it('refuses a changed revision',async()=>{f.content.posts[0].revision.id='55555555-5555-4555-8555-555555555555';await check(409,'REVISION_CONFLICT',await POST(request()))})
it('refuses a changed plan during the real double read',async()=>{f.onPlan(n=>{if(n===2){f.plan.currentRevision.id='55555555-5555-4555-8555-555555555555';f.plan.decision.revisionId=f.plan.currentRevision.id}});await check(409,'PLAN_CHANGED',await POST(request()))})
it('refuses an unreviewed manuscript rather than choosing a new brief',async()=>{f.content.posts[0].revision.draft.text+=' Changed.';await check(409,'BRIEF_MISMATCH',await POST(request()))})
it('honors an active stop',async()=>{f.stop();await check(423,'STOPPED',await POST(request()))})
it('refuses the pilot once the original source has expired',async()=>{vi.setSystemTime(new Date('2026-10-20T16:49:35.514Z'));await check(409,'SOURCE_EXPIRED',await POST(request()));expect(f.calls).not.toContain('rpc:social_content_read')})
