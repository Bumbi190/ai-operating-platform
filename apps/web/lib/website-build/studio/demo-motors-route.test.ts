import {beforeEach,describe,expect,it,vi} from 'vitest'
const access=vi.hoisted(()=>vi.fn())
vi.mock('@/lib/auth/project-access',()=>({resolveProjectAccess:access}))
import {GET as documentGet} from '../../../app/(platform)/build/demo-motors/index.html/route'
import {GET as assetGet} from '../../../app/(platform)/build/demo-motors/assets/[...path]/route'
import {GET as shortcutGet} from '../../../app/(platform)/build/demo-motors/route'
import {MODEL3D_RUNTIME_ASSET} from '../model3d-runtime-asset'
import {vehicle3DAsset} from '../assets/vehicle-3d'

const req=new Request('https://studio.example/build/demo-motors')
const parts=MODEL3D_RUNTIME_ASSET.path.split('/').slice(1)
describe('read-only showroom route access and file integrity',()=>{
 beforeEach(()=>access.mockReset())
 it('refuses unauthenticated HTML and static JS',async()=>{
  access.mockResolvedValue({ok:false,response:new Response('Unauthorized',{status:401})})
  expect((await documentGet()).status).toBe(401)
  expect((await assetGet(req,{params:{path:parts}})).status).toBe(401)
 })
 it('refuses HTML and static JS without an owned project',async()=>{
  access.mockResolvedValue({ok:true,userId:'fixture',allowedProjectIds:[]})
  expect((await documentGet()).status).toBe(403)
  expect((await assetGet(req,{params:{path:parts}})).status).toBe(403)
 })
 it('serves a fictional protected HTML page with validated relative 3D references',async()=>{
  access.mockResolvedValue({ok:true,userId:'fixture',allowedProjectIds:['test-project']})
  const shortcut=await shortcutGet(req)
  expect(shortcut.status).toBe(307)
  expect(shortcut.headers.get('location')).toBe('https://studio.example/build/demo-motors/cinematic')
  const response=await documentGet()
  const html=await response.text()
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(response.headers.get('x-frame-options')).toBe('DENY')
  expect(html).toContain('FIKTIV DEMO')
  expect(html).toContain('Fri 3D-konceptvy')
  expect(html).toContain('src="'+MODEL3D_RUNTIME_ASSET.path+'"')
  expect(html).not.toContain('src="/assets/runtime/')
 })
 it('serves only pinned immutable bytes behind auth; unknown and traversal paths refused',async()=>{
  access.mockResolvedValue({ok:true,userId:'fixture',allowedProjectIds:['test-project']})
  const moduleResponse=await assetGet(req,{params:{path:parts}})
  expect(moduleResponse.status).toBe(200)
  expect(moduleResponse.headers.get('content-type')).toContain('javascript')
  expect(moduleResponse.headers.get('cache-control')).toBe('private, no-store')
  expect((await moduleResponse.arrayBuffer()).byteLength).toBe(MODEL3D_RUNTIME_ASSET.bytes)
  const manifest=vehicle3DAsset('vehicle3d:demo-motors-concept-v1')!
  for(const source of [manifest.glb,manifest.poster]){
   const file=await assetGet(req,{params:{path:source.path.split('/').slice(1)}})
   expect(file.status).toBe(200)
   expect((await file.arrayBuffer()).byteLength).toBe(source.bytes)
  }
  expect((await assetGet(req,{params:{path:['runtime','nonexistent.js']}})).status).toBe(404)
  expect((await assetGet(req,{params:{path:['3d','../secret.glb']}})).status).toBe(404)
 })
})
