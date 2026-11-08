import {readFileSync} from 'node:fs'
import bundledSources from './demo-vehicle-3d-v1.json'

export type Vehicle3DTruthClass='fictional_concept'|'real_vehicle_verified'
export type Vehicle3DSourceType='blender_concept'|'licensed_cad_oem'|'photogrammetry'|'verified_vendor_model'|'ai_inferred'
export type Vehicle3DReferenceKind='front_three_quarter'|'side'|'rear_three_quarter'|'opposite_side_front'

export type Vehicle3DAssetManifest={
 id:string
 truthClass:Vehicle3DTruthClass
 approved:true
 glb:{sha256:string;path:string;bytes:number}
 poster:{sha256:string;path:string;bytes:number}
 source:{type:Vehicle3DSourceType;sha256:string;ref:string}
 vehicle?:{make:string;model:string;modelYear:number;trim:string;exteriorColor:string;wheels:string}
 evidence?:{
  referenceViews:{kind:Vehicle3DReferenceKind;ref:string}[]
  reviewer:{id:string;status:'approved';approvedAt:string}
 }
}

const SHA=/^[a-f0-9]{64}$/
const ID=/^vehicle3d:[a-z0-9][a-z0-9-]{2,80}$/
const GLB_PATH=/^assets\/3d\/[a-f0-9]{64}\.glb$/
const POSTER_PATH=/^assets\/3d\/[a-f0-9]{64}\.(?:webp|png|jpe?g)$/
const SOURCE_TYPES=new Set<Vehicle3DSourceType>(['blender_concept','licensed_cad_oem','photogrammetry','verified_vendor_model','ai_inferred'])
const REQUIRED_VIEWS=new Set<Vehicle3DReferenceKind>(['front_three_quarter','side','rear_three_quarter','opposite_side_front'])

function record(value:unknown):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('INVALID_VEHICLE_3D_MANIFEST')
 return value as Record<string,unknown>
}
function nonEmpty(value:unknown,max=200):value is string{return typeof value==='string'&&!!value.trim()&&value.length<=max}
function validFile(value:unknown,kind:'glb'|'poster'){
 const item=record(value)
 if(!SHA.test(String(item.sha256??'')))throw Error('INVALID_VEHICLE_3D_HASH')
 const path=String(item.path??'')
 if(!(kind==='glb'?GLB_PATH:POSTER_PATH).test(path))throw Error('INVALID_VEHICLE_3D_PATH')
 if(!Number.isInteger(item.bytes)||Number(item.bytes)<=0||Number(item.bytes)>100_000_000)throw Error('INVALID_VEHICLE_3D_BYTES')
}
function validSource(value:unknown){
 const source=record(value)
 if(!SOURCE_TYPES.has(source.type as Vehicle3DSourceType)||!SHA.test(String(source.sha256??''))||!nonEmpty(source.ref,500))throw Error('INVALID_VEHICLE_3D_SOURCE')
}
function validateRealEvidence(item:Record<string,unknown>){
 if(!item.vehicle||typeof item.vehicle!=='object'||Array.isArray(item.vehicle)||!item.evidence||typeof item.evidence!=='object'||Array.isArray(item.evidence))throw Error('INVALID_REAL_VEHICLE_EVIDENCE')
 const vehicle=record(item.vehicle)
 for(const key of ['make','model','trim','exteriorColor','wheels'] as const)if(!nonEmpty(vehicle[key],120))throw Error('INVALID_REAL_VEHICLE_EVIDENCE')
 if(!Number.isInteger(vehicle.modelYear)||Number(vehicle.modelYear)<1900||Number(vehicle.modelYear)>2200)throw Error('INVALID_REAL_VEHICLE_EVIDENCE')
 const evidence=record(item.evidence)
 if(!Array.isArray(evidence.referenceViews)||evidence.referenceViews.length<4)throw Error('INVALID_REAL_VEHICLE_EVIDENCE')
 const seen=new Set<Vehicle3DReferenceKind>()
 for(const raw of evidence.referenceViews){
  const view=record(raw),kind=view.kind as Vehicle3DReferenceKind
  if(!REQUIRED_VIEWS.has(kind)||!nonEmpty(view.ref,500))throw Error('INVALID_REAL_VEHICLE_EVIDENCE')
  seen.add(kind)
 }
 if([...REQUIRED_VIEWS].some(kind=>!seen.has(kind)))throw Error('INVALID_REAL_VEHICLE_EVIDENCE')
 const reviewer=record(evidence.reviewer)
 if(!nonEmpty(reviewer.id,120)||reviewer.status!=='approved'||!nonEmpty(reviewer.approvedAt,80))throw Error('INVALID_REAL_VEHICLE_EVIDENCE')
 if(Number.isNaN(Date.parse(reviewer.approvedAt as string)))throw Error('INVALID_REAL_VEHICLE_EVIDENCE')
 const source=record(item.source)
 if(source.type==='ai_inferred'||source.type==='blender_concept')throw Error('INVALID_REAL_VEHICLE_SOURCE')
}

export function assertVehicle3DAssetManifest(value:unknown):asserts value is Vehicle3DAssetManifest{
 const item=record(value)
 if(!ID.test(String(item.id??'')))throw Error('INVALID_VEHICLE_3D_ID')
 if(item.truthClass!=='fictional_concept'&&item.truthClass!=='real_vehicle_verified')throw Error('INVALID_VEHICLE_3D_TRUTH_CLASS')
 if(item.approved!==true)throw Error('UNAPPROVED_VEHICLE_3D_ASSET')
 validFile(item.glb,'glb')
 validFile(item.poster,'poster')
 validSource(item.source)
 if(item.truthClass==='real_vehicle_verified')validateRealEvidence(item)
}

const bundled=(bundledSources as unknown[]).map(source=>{
 assertVehicle3DAssetManifest(source)
 return Object.freeze(source)
}) as readonly Vehicle3DAssetManifest[]

export const BUNDLED_VEHICLE_3D_ASSETS=Object.freeze(bundled)
export function vehicle3DAsset(id:string):Vehicle3DAssetManifest|undefined{
 return ID.test(id)?BUNDLED_VEHICLE_3D_ASSETS.find(item=>item.id===id):undefined
}

const BUNDLED_BINARY_SOURCES:Record<string,{glb:URL;poster:URL}>={
 'vehicle3d:demo-motors-concept-v1':{
  glb:new URL('../../../e2e/website-catalog/assets/premium/3d/demo-motors-concept.glb',import.meta.url),
  poster:new URL('../../../e2e/website-catalog/assets/premium/3d/demo-motors-poster.webp',import.meta.url)
 }
}
export function readBundledVehicle3DAssetBytes(id:string,kind:'glb'|'poster'):Uint8Array{
 const entry=BUNDLED_BINARY_SOURCES[id]
 if(!entry||!vehicle3DAsset(id))throw Error('UNKNOWN_BUNDLED_VEHICLE_3D_ASSET')
 return readFileSync(entry[kind])
}
