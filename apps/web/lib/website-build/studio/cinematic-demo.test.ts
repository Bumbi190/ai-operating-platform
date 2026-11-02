import {beforeEach,describe,it,expect,vi} from 'vitest'
import {createHash} from 'node:crypto'
const access=vi.hoisted(()=>vi.fn())
vi.mock('@/lib/auth/project-access',()=>({resolveProjectAccess:access}))
import {demoMotorsReadOnlyHtml} from './demo-motors-readonly'
import {createCinematicDemoHtml} from './cinematic-demo'
import {cinematicAssetNames,cinematicAssetResponse,verifyCinematicBytes} from './cinematic-assets'
import {GET as htmlGet} from '../../../app/(platform)/build/demo-motors/cinematic/route'
import {GET as assetGet} from '../../../app/(platform)/build/demo-motors/cinematic/assets/[name]/route'
const request=(range?:string)=>new Request('https://example.test/build/demo-motors/cinematic/assets/test',{
 headers:range?{range}:{}
})
describe('authored fictional cinematic variant',()=>{
 it('replaces the authored hero while preserving the working catalog and guarded CSP',()=>{
  const original=demoMotorsReadOnlyHtml(),html=createCinematicDemoHtml(original)
  expect(html).toContain('id="cinema-scene"')
  expect(html).toContain('id="cinema-motion"')
  expect(html).toContain('FIKTIV DEMO')
  expect(html).toContain('id="fuel"')
  expect(html).toContain('id="concept-08"')
  expect(html).toContain('id="concept-01-interest"')
  expect(html).toContain('id="__atlas_runtime"')
  expect(html).toContain("media-src 'self'")
  expect(html).toContain("form-action 'none'")
  expect(html).not.toContain('autoplay')
  expect(html).not.toContain('src="https://')
  expect((html.match(/id="cinema-scene"/g)??[]).length).toBe(1)
 })
 it('refuses a document that is not the approved compiled showroom',()=>{
  expect(()=>createCinematicDemoHtml('<html><body><main></main></body></html>')).toThrow('CINEMATIC_BASE')
 })
 it('verifies byte count and actual SHA, refusing a corrupted media payload',()=>{
  const bytes=Buffer.from('independent fixture')
  const descriptor={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}
  expect(()=>verifyCinematicBytes(bytes,descriptor)).not.toThrow()
  expect(()=>verifyCinematicBytes(Buffer.from('independent fixturE'),descriptor)).toThrow('CINEMATIC_INTEGRITY')
  expect(()=>verifyCinematicBytes(bytes.subarray(1),descriptor)).toThrow('CINEMATIC_INTEGRITY')
 })
 it('serves only the three pinned local assets and rejects path traversal',async()=>{
  const names=cinematicAssetNames()
  for(const name of Object.values(names)){
   const response=cinematicAssetResponse(request(),name)
   expect(response.status).toBe(200)
   expect(response.headers.get('cache-control')).toBe('private, no-store')
   expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0)
  }
  expect(cinematicAssetResponse(request(),'../manifest.json').status).toBe(404)
  expect(cinematicAssetResponse(request(),'manifest.json').status).toBe(404)
  expect(cinematicAssetResponse(request(),'unknown.mp4').status).toBe(404)
 })
 it('supports video byte ranges needed for seeking',async()=>{
  const name=cinematicAssetNames().video
  const full=Buffer.from(await cinematicAssetResponse(request(),name).arrayBuffer())
  const first=cinematicAssetResponse(request('bytes=0-63'),name)
  expect(first.status).toBe(206)
  expect(first.headers.get('content-range')).toBe('bytes 0-63/'+full.length)
  expect(first.headers.get('content-length')).toBe('64')
  expect(Buffer.from(await first.arrayBuffer())).toEqual(full.subarray(0,64))
  const suffix=cinematicAssetResponse(request('bytes=-32'),name)
  expect(Buffer.from(await suffix.arrayBuffer())).toEqual(full.subarray(-32))
  const rest=cinematicAssetResponse(request('bytes=100-'),name)
  expect(Buffer.from(await rest.arrayBuffer()).equals(full.subarray(100))).toBe(true)
 })
 it.each(['bytes=999999999-','bytes=50-20','bytes=-0','bytes=0-10,20-30','nonsense'])(
  'rejects an invalid byte range %s without disclosing media bytes',async range=>{
   const response=cinematicAssetResponse(request(range),cinematicAssetNames().video)
   expect(response.status).toBe(416)
   expect((await response.arrayBuffer()).byteLength).toBe(0)
  })
})
describe('cinematic HTML and media share the owner gate',()=>{
 beforeEach(()=>access.mockReset())
 it.each([401,403])('refuses protected HTML and asset with status %s',async status=>{
  access.mockImplementation(async()=>status===401
   ?{ok:false,response:new Response(null,{status:401})}
   :{ok:true,userId:'fixture',allowedProjectIds:[]})
  expect((await htmlGet()).status).toBe(status)
  expect((await assetGet(request(),{params:{name:cinematicAssetNames().video}})).status).toBe(status)
 })
 it('serves the authored page and ranged video only to an owner',async()=>{
  access.mockResolvedValue({ok:true,userId:'fixture',allowedProjectIds:['owned-project']})
  const html=await htmlGet()
  expect(html.status).toBe(200)
  expect(html.headers.get('cache-control')).toBe('private, no-store')
  expect(html.headers.get('x-frame-options')).toBe('DENY')
  expect(await html.text()).toContain('cinema-scene')
  const video=await assetGet(request('bytes=0-31'),{params:{name:cinematicAssetNames().video}})
  expect(video.status).toBe(206)
 })
})
