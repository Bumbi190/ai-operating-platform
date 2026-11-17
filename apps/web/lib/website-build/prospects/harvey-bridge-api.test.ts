import {beforeEach,describe,expect,it,vi} from 'vitest'
const flags=vi.hoisted(()=>({enabled:vi.fn(()=>true),local:vi.fn(()=>true),bridge:vi.fn(()=>true),
  access:vi.fn(),body:vi.fn(),origin:vi.fn(()=>null as Response|null),begin:vi.fn(),finish:vi.fn(),receipt:vi.fn(()=> 'local-receipt')}))
vi.mock('@/lib/auth/project-access',()=>({resolveProjectAccess:flags.access}))
vi.mock('@/lib/atlas/executive/http',()=>({assertSameOrigin:flags.origin}))
vi.mock('@/lib/website-build/api',async importOriginal=>({...await importOriginal() as any,readWebsiteBuildBody:flags.body}))
vi.mock('@/lib/website-build/prospects/api',()=>({prospectsEnabled:flags.enabled}))
vi.mock('@/lib/website-build/prospects/capture',()=>({localCaptureAvailable:flags.local}))
vi.mock('@/lib/website-build/prospects/harvey-bridge',()=>({
 harveyBridgeConfigured:flags.bridge,EdforsProjectId:'a8d240af-e58e-446d-b293-6cae1fd6daa8',
 beginHarveyBridge:flags.begin,finishHarveyBridge:flags.finish,
}))
vi.mock('@/lib/website-build/prospects/search-receipt',()=>({issueSearchReceipt:flags.receipt}))
import {POST} from './harvey-bridge-api'
const projectId='a8d240af-e58e-446d-b293-6cae1fd6daa8'
const userId='5ffa2946-cd6e-4e18-b4a3-bc28c9909dad'
const body={action:'start',projectId}
const req=()=>new Request('http://localhost:56994/api/website-build/prospects/harvey-bridge',{method:'POST',headers:{origin:'http://localhost:56994','content-type':'application/json'},body:JSON.stringify(body)})
beforeEach(()=>{
 vi.clearAllMocks();flags.enabled.mockReturnValue(true);flags.local.mockReturnValue(true);flags.bridge.mockReturnValue(true);flags.origin.mockReturnValue(null)
 flags.access.mockResolvedValue({ok:true,userId,allowedProjectIds:[projectId]})
 flags.begin.mockReturnValue({url:'https://ai-operating-platform-5kwwm9s0c-bumbi190s-projects.vercel.app/api/bridge'})
 flags.body.mockResolvedValue(body)
 flags.finish.mockResolvedValue({source:'scb',orgnr:'5566391735'})
 flags.receipt.mockReturnValue('local-receipt')
})
describe('WebBuilder Harvey bridge API – local-only and owner-bound',()=>{
 it('refuses all operations if feature, local data isolation or origin configuration is absent',async()=>{
  for(const flag of [flags.enabled,flags.local,flags.bridge]){
   flag.mockReturnValue(false)
   const r=await POST(req());expect(r.status).toBe(404)
   expect(flags.access).not.toHaveBeenCalled()
   flag.mockReturnValue(true)
  }
 })
 it('refuses absent session without reading a browser body',async()=>{
  flags.access.mockResolvedValue({ok:false,response:Response.json({error:'Unauthorized'},{status:401})})
  const r=await POST(req());expect(r.status).toBe(401);expect(flags.body).not.toHaveBeenCalled()
 })
 it('refuses cross-origin requests before parsing data',async()=>{
  flags.origin.mockReturnValue(Response.json({error:'Denied'},{status:403}))
  expect((await POST(req())).status).toBe(403)
  expect(flags.body).not.toHaveBeenCalled()
 })
 it('refuses foreign projects or injected fields',async()=>{
  flags.access.mockResolvedValue({ok:true,userId,allowedProjectIds:[]})
  expect((await POST(req())).status).toBe(404)
  flags.access.mockResolvedValue({ok:true,userId,allowedProjectIds:[projectId]})
  flags.body.mockResolvedValue({...body,foreignAuthorization:'true'})
  expect((await POST(req())).status).toBe(400)
  expect(flags.begin).not.toHaveBeenCalled()
 })
 it('creates only a URL: no company data, token, SCB secret or database writer',async()=>{
  const r=await POST(req())
  expect(r.status).toBe(200)
  expect(await r.json()).toEqual({url:'https://ai-operating-platform-5kwwm9s0c-bumbi190s-projects.vercel.app/api/bridge'})
  expect(flags.begin).toHaveBeenCalledWith(userId,projectId)
  expect(flags.finish).not.toHaveBeenCalled()
 })
 it('imports a validated package and issues existing local HMAC, without source mutations',async()=>{
  flags.body.mockResolvedValue({action:'consume',projectId,package:{token:'dummy'}})
  const r=await POST(req())
  expect(r.status).toBe(200)
  expect(await r.json()).toEqual({candidates:[{company:{source:'scb',orgnr:'5566391735'},receipt:'local-receipt'}],source:'harvey-signed-scb'})
  expect(flags.finish).toHaveBeenCalledWith({token:'dummy'},{userId,projectId})
  expect(flags.receipt).toHaveBeenCalledTimes(1)
 })
})
