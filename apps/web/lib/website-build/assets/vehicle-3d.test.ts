import {describe,it,expect} from 'vitest'
import {assertVehicle3DAssetManifest,vehicle3DAsset} from './vehicle-3d'

const demo={
 id:'vehicle3d:demo-motors-concept-v1',
 truthClass:'fictional_concept',
 approved:true,
 glb:{sha256:'a8e79963c6b370c32611aca2514caa8213368666ee34a305ef6be45dd38aa0cb',path:'assets/3d/a8e79963c6b370c32611aca2514caa8213368666ee34a305ef6be45dd38aa0cb.glb',bytes:64132},
 poster:{sha256:'2b90c29009b92c32c403cf1eabdf79e07efb6e6c59b122308939d53b42c1a091',path:'assets/3d/2b90c29009b92c32c403cf1eabdf79e07efb6e6c59b122308939d53b42c1a091.webp',bytes:80194},
 source:{type:'blender_concept',sha256:'31dbc9e2653e27df224999f3487289bad86e37bb33e190ba566a8c8ae5c174ba',ref:'showroom.blend'}
} as const

const real={
 ...demo,
 id:'vehicle3d:verified-real-car-v1',
 truthClass:'real_vehicle_verified',
 source:{...demo.source,type:'verified_vendor_model'},
 vehicle:{make:'Example',model:'GT',modelYear:2026,trim:'Performance',exteriorColor:'Graphite',wheels:'20 inch turbine'},
 evidence:{
  referenceViews:[
   {kind:'front_three_quarter',ref:'front.jpg'},
   {kind:'side',ref:'side.jpg'},
   {kind:'rear_three_quarter',ref:'rear.jpg'},
   {kind:'opposite_side_front',ref:'opposite.jpg'}
  ],
  reviewer:{id:'owner-review',status:'approved',approvedAt:'2026-11-01T17:30:00+01:00'}
 }
} as const

describe('governed vehicle 3D assets',()=>{
 it('accepts the fictional Demo Motors GLB and exposes the approved bundled record',()=>{
  expect(()=>assertVehicle3DAssetManifest(demo)).not.toThrow()
  const found=vehicle3DAsset(demo.id)
  expect(found?.truthClass).toBe('fictional_concept')
  expect(found?.glb.sha256).toBe(demo.glb.sha256)
  expect(found?.poster.sha256).toBe(demo.poster.sha256)
 })
 it('accepts a fully evidenced real vehicle manifest',()=>expect(()=>assertVehicle3DAssetManifest(real)).not.toThrow())
 it('refuses fictional assets relabelled as real without vehicle evidence',()=>{
  expect(()=>assertVehicle3DAssetManifest({...demo,truthClass:'real_vehicle_verified'})).toThrow('INVALID_REAL_VEHICLE_EVIDENCE')
 })
 it('refuses incomplete real vehicle evidence and AI-only geometry',()=>{
  expect(()=>assertVehicle3DAssetManifest({...real,evidence:{...real.evidence,referenceViews:real.evidence.referenceViews.slice(0,3)}})).toThrow('INVALID_REAL_VEHICLE_EVIDENCE')
  expect(()=>assertVehicle3DAssetManifest({...real,source:{...real.source,type:'ai_inferred'}})).toThrow('INVALID_REAL_VEHICLE_SOURCE')
 })
 it('refuses invalid hashes, traversal paths and unapproved assets',()=>{
  expect(()=>assertVehicle3DAssetManifest({...demo,glb:{...demo.glb,sha256:'bad'}})).toThrow('INVALID_VEHICLE_3D_HASH')
  expect(()=>assertVehicle3DAssetManifest({...demo,glb:{...demo.glb,path:'../car.glb'}})).toThrow('INVALID_VEHICLE_3D_PATH')
  expect(()=>assertVehicle3DAssetManifest({...demo,approved:false})).toThrow('UNAPPROVED_VEHICLE_3D_ASSET')
 })
})
