import {beforeEach,describe,it,expect,vi} from 'vitest'
const h=vi.hoisted(()=>({
 operator:vi.fn(),access:vi.fn(),begin:vi.fn(),finish:vi.fn(),status:vi.fn(),inspect:vi.fn(),disconnect:vi.fn(),
 project:'a8a1b1f6-c222-4893-9399-b1fb3bc2fa52',actor:'10000000-0000-4000-8000-000000000001'
}))
vi.mock('../auth/platform-operator',()=>({resolvePlatformOperator:h.operator}))
vi.mock('../auth/project-access',()=>({resolveProjectAccess:h.access,assertProjectAllowed:(p:string,ids:string[])=>ids.includes(p)}))
vi.mock('../media/higgsfield/oauth',()=>({createHiggsfieldOAuthService:()=>({begin:h.begin,finish:h.finish})}))
vi.mock('../media/higgsfield/readiness',()=>({readHiggsfieldConnectionStatus:h.status,inspectHiggsfield:h.inspect,disconnectHiggsfield:h.disconnect}))
import {POST as start} from '../../app/api/media/higgsfield/oauth/start/route'
import {GET as callback} from '../../app/api/media/higgsfield/oauth/callback/route'
import {GET as status} from '../../app/api/media/higgsfield/status/route'
import {POST as inspect} from '../../app/api/media/higgsfield/inspect/route'
import {POST as disconnect} from '../../app/api/media/higgsfield/disconnect/route'
const base='https://omnira.example'
function post(body:unknown={project_id:h.project},origin=base){return new Request(base+'/api/test',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)})}
beforeEach(()=>{
 vi.clearAllMocks()
 vi.stubEnv('HIGGSFIELD_MCP_ENABLED','true');vi.stubEnv('HIGGSFIELD_OAUTH_REDIRECT_URI',base+'/api/media/higgsfield/oauth/callback')
 vi.stubEnv('MEDIA_PROVIDER_OAUTH_ENCRYPTION_KEY',Buffer.alloc(32,1).toString('base64'))
 h.operator.mockResolvedValue({ok:true,userId:h.actor,actor:h.actor})
 h.access.mockResolvedValue({ok:true,userId:h.actor,allowedProjectIds:[h.project]})
 h.begin.mockResolvedValue({authorizationUrl:'https://clerk.higgsfield.ai/oauth/authorize'})
 h.finish.mockResolvedValue({code:'connected',projectId:h.project})
 h.status.mockResolvedValue({status:'disconnected',identityVerified:false,generationEnabled:false})
 h.inspect.mockResolvedValue({status:'connected',creditBalance:0,quoteCredits:4,identityVerified:true,generationEnabled:false,observedAt:'2026-10-22T08:00:00Z'})
 h.disconnect.mockResolvedValue(undefined)
})
describe('Higgsfield routes real handlers',()=>{
 it.each([start,inspect,disconnect])('rejects unauthenticated before side effects',async route=>{
  h.operator.mockResolvedValue({ok:false,reason:'unauthenticated'})
  expect((await route(post())).status).toBe(401);expect(h.begin).not.toHaveBeenCalled();expect(h.inspect).not.toHaveBeenCalled();expect(h.disconnect).not.toHaveBeenCalled()
 })
 it.each([start,inspect,disconnect])('requires operator and project ownership',async route=>{
  h.access.mockResolvedValue({ok:true,userId:h.actor,allowedProjectIds:[]})
  expect((await route(post())).status).toBe(403);expect(h.begin).not.toHaveBeenCalled()
 })
 it.each([start,inspect,disconnect])('rejects cross-origin and extra arguments',async route=>{
  expect((await route(post({},'https://evil.example'))).status).toBe(403)
  expect((await route(post({project_id:h.project,model:'paid-video',medias:['https://evil.example']}))).status).toBe(400)
 })
 it('returns only consent URL from start',async()=>{
  const r=await start(post());expect(r.status).toBe(200)
  expect(await r.json()).toEqual({ok:true,authorization_url:'https://clerk.higgsfield.ai/oauth/authorize'})
  expect(r.headers.get('cache-control')).toBe('no-store')
 })
 it('redacts provider errors',async()=>{
  h.begin.mockRejectedValue(Error('private-refresh-token'))
  const r=await start(post());expect(r.status).toBe(503);expect(await r.text()).not.toContain('private-refresh-token')
 })
 it('reads status and valid zero balance',async()=>{
  const r=await status(new Request(base+'/api/test?project_id='+h.project))
  expect((await r.json()).status).toBe('disconnected')
  const result=await (await inspect(post())).json();expect(result.creditBalance).toBe(0)
 })
 it('redirects callback to configured origin regardless of request host',async()=>{
  const r=await callback(new Request('https://evil.example/api/callback?state='+'a'.repeat(43)+'&code=secret&iss=https%3A%2F%2Fclerk.higgsfield.ai'))
  expect(r.status).toBe(303);const u=new URL(r.headers.get('location')!)
  expect(u.origin).toBe(base);expect(u.searchParams.get('higgsfield')).toBe('connected');expect(u.searchParams.has('code')).toBe(false)
  expect(r.headers.get('referrer-policy')).toBe('no-referrer')
 })
 it('does not initialize OAuth for malformed shape or disabled provider',async()=>{
  expect((await start(post({project_id:'invalid'}))).status).toBe(400)
  vi.stubEnv('HIGGSFIELD_MCP_ENABLED','false')
  expect((await start(post())).status).toBe(503);expect(h.begin).not.toHaveBeenCalled()
 })
 it('requires session on callback before inspecting state',async()=>{
  h.operator.mockResolvedValue({ok:false,reason:'unauthenticated'})
  expect((await callback(new Request(base+'/api/callback?state=secret'))).status).toBe(401)
  expect(h.finish).not.toHaveBeenCalled()
 })
})
