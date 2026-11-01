// Public immutable bundles ONLY: never place uploaded or customer-owned media here.
// This allowlist exists for opaque-origin Studio preview modules and assets.
import {createHash} from 'node:crypto'
import {BUNDLED_VEHICLE_3D_ASSETS,readBundledVehicle3DAssetBytes} from './assets/vehicle-3d'
import {MODEL3D_RUNTIME_ASSET,readModel3DRuntimeBytes} from './model3d-runtime-asset'

type Asset={path:string;sha256:string;bytes:number;contentType:string;read:()=>Uint8Array}
const sources:Asset[]=[
 {path:MODEL3D_RUNTIME_ASSET.path,sha256:MODEL3D_RUNTIME_ASSET.sha256,
  bytes:MODEL3D_RUNTIME_ASSET.bytes,contentType:'text/javascript; charset=utf-8',
  read:readModel3DRuntimeBytes},
 ...BUNDLED_VEHICLE_3D_ASSETS.flatMap(v=>[
  {path:v.glb.path,sha256:v.glb.sha256,bytes:v.glb.bytes,
   contentType:'model/gltf-binary',read:()=>readBundledVehicle3DAssetBytes(v.id,'glb')},
  {path:v.poster.path,sha256:v.poster.sha256,bytes:v.poster.bytes,
   contentType:'image/webp',read:()=>readBundledVehicle3DAssetBytes(v.id,'poster')}
 ])
]
const allowlist=new Map(sources.map(asset=>[asset.path,asset]))
export function readPublicWebsitePreviewAsset(parts:unknown):
 {bytes:Uint8Array;contentType:string}|null{
 if(!Array.isArray(parts)||parts.length!==2||
    !parts.every(p=>typeof p==='string'&&/^[a-z0-9.-]+$/.test(p)))return null
 const path='assets/'+parts.join('/')
 const asset=allowlist.get(path)
 if(!asset)return null
 const bytes=asset.read()
 if(bytes.byteLength!==asset.bytes||
  createHash('sha256').update(bytes).digest('hex')!==asset.sha256)
  throw Error('PUBLIC_PREVIEW_ASSET_INTEGRITY_FAILED')
 return {bytes,contentType:asset.contentType}
}
