import {describe,it,expect} from 'vitest'
import {GET,HEAD} from '../../app/assets/[...path]/route'
import {MODEL3D_RUNTIME_ASSET} from './model3d-runtime-asset'
import {BUNDLED_VEHICLE_3D_ASSETS} from './assets/vehicle-3d'

const request=new Request('http://localhost/assets/runtime/asset.js')
const runtime=MODEL3D_RUNTIME_ASSET.path.split('/').slice(1)
const glb=BUNDLED_VEHICLE_3D_ASSETS[0].glb.path.split('/').slice(1)

describe('public immutable Studio assets route',()=>{
 it('serves hashed module with narrowly CORS-readable immutable headers',async()=>{
  const res=await GET(request,{params:{path:runtime}})
  expect(res.status).toBe(200)
  expect(res.headers.get('access-control-allow-origin')).toBe('*')
  expect(res.headers.get('cache-control')).toContain('immutable')
  expect(res.headers.get('content-type')).toContain('javascript')
  expect((await res.arrayBuffer()).byteLength).toBe(MODEL3D_RUNTIME_ASSET.bytes)
 })
 it('serves approved GLB and HEAD has no body',async()=>{
  const res=await GET(request,{params:{path:glb}})
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toBe('model/gltf-binary')
  expect((await res.arrayBuffer()).byteLength).toBe(BUNDLED_VEHICLE_3D_ASSETS[0].glb.bytes)
  const head=await HEAD(request,{params:{path:glb}})
  expect(head.status).toBe(200)
  expect(await head.text()).toBe('')
 })
 it('denies unknown paths and any customer-supplied filenames',async()=>{
  for(const path of [['3d','private.glb'],['other','secret.json'],['3d','../data']]){
   const res=await GET(request,{params:{path}})
   expect(res.status).toBe(404)
   expect(res.headers.get('access-control-allow-origin')).toBeNull()
  }
 })
})
