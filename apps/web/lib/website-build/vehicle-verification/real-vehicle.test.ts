import {describe,expect,it} from 'vitest'
import type {Vehicle3DAssetManifest,Vehicle3DReferenceKind} from '../assets/vehicle-3d'
import {evaluateRealVehicleEvidence} from './real-vehicle'

const hash='a'.repeat(64)
const identity={
 make:'Example',model:'GT',modelYear:2026,trim:'Performance',
 exteriorColor:'Graphite',wheels:'20 inch turbine'
}
const kinds:Vehicle3DReferenceKind[]=[
 'front_three_quarter','side','rear_three_quarter','opposite_side_front'
]
const manifest:Vehicle3DAssetManifest={
 id:'vehicle3d:verified-example',truthClass:'real_vehicle_verified',approved:true,
 glb:{sha256:hash,path:`assets/3d/${hash}.glb`,bytes:64132},
 poster:{sha256:hash,path:`assets/3d/${hash}.webp`,bytes:80194},
 source:{type:'verified_vendor_model',sha256:hash,ref:'licensed-source.glb'},
 vehicle:identity,
 evidence:{
  referenceViews:kinds.map(kind=>({kind,ref:`refs/${kind}.jpg`})),
  reviewer:{id:'owner-1',status:'approved',approvedAt:'2026-11-01T18:00:00Z'}
 }
}
const evidence={
 assetId:manifest.id,glbSha256:hash,
 referenceViews:kinds.map(kind=>({
  kind,ref:`refs/${kind}.jpg`,vehicle:{...identity}
 })),
 comparisons:kinds.map(kind=>({
  kind,referenceRef:`refs/${kind}.jpg`,
  renderRef:`renders/${kind}.webp`,
  matches:{shape:true,color:true,trim:true,wheels:true}
 }))
}
const review={
 reviewerId:'owner-1',decision:'approved',approvedAt:'2026-11-01T18:00:00Z',
 assetId:manifest.id,glbSha256:hash,
 checkedViews:[...kinds]
}
const refuse=(m:unknown,e:unknown,r:unknown)=>expect(evaluateRealVehicleEvidence(m,e,r).status).toBe('Refused')

describe('real vehicle visual evidence gate',()=>{
 it('accepts a structurally complete, human-reviewed four-angle match',()=>{
  expect(evaluateRealVehicleEvidence(manifest,evidence,review)).toMatchObject({
   status:'Verified',assetId:manifest.id,glbSha256:hash
  })
 })
 it('refuses fictional source and AI-only inferred geometry',()=>{
  refuse({...manifest,truthClass:'fictional_concept'},evidence,review)
  refuse({...manifest,source:{...manifest.source,type:'ai_inferred'}},evidence,review)
  refuse({...manifest,source:{...manifest.source,type:'blender_concept'}},evidence,review)
 })
 it('refuses missing required view and incomplete comparison render',()=>{
  refuse(manifest,{...evidence,referenceViews:evidence.referenceViews.slice(0,3)},review)
  refuse(manifest,{...evidence,comparisons:evidence.comparisons.slice(0,3)},review)
 })
 it.each(['exteriorColor','trim','wheels'] as const)('refuses mismatched %s',property=>{
  const modified={...evidence,referenceViews:evidence.referenceViews.map((v,i)=>
   i===0?{...v,vehicle:{...v.vehicle,[property]:'WRONG'}}:v)}
  refuse(manifest,modified,review)
 })
 it('refuses visual mismatches even when textual metadata matches',()=>{
  const failed={...evidence,comparisons:evidence.comparisons.map((c,i)=>
   i===0?{...c,matches:{...c.matches,shape:false}}:c)}
  refuse(manifest,failed,review)
 })
 it('refuses missing/unapproved reviewer or review bound to a different model',()=>{
  refuse(manifest,evidence,null)
  refuse(manifest,evidence,{...review,decision:'rejected'})
  refuse(manifest,evidence,{...review,glbSha256:'b'.repeat(64)})
  refuse(manifest,evidence,{...review,checkedViews:kinds.slice(1)})
 })
 it('refuses forged or changed source references',()=>{
  refuse(manifest,{...evidence,glbSha256:'b'.repeat(64)},review)
  const altered={...evidence,comparisons:evidence.comparisons.map((c,i)=>
   i===0?{...c,referenceRef:'refs/another.jpg'}:c)}
  refuse(manifest,altered,review)
 })
})
