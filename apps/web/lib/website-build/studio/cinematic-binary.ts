import {createHash} from 'node:crypto'
import type {WebsiteBinaryAsset} from '../types'
import registry from './cinematic-registry.json'
import {readCinematicAsset} from './cinematic-assets'
import {MODEL3D_RUNTIME_ASSET,readModel3DRuntimeBytes} from '../model3d-runtime-asset'
export function readCinematicBinary(asset:WebsiteBinaryAsset):Uint8Array{
 const expected=registry.manifest.assets.find(a=>a.path===asset.path)
 if(!expected||asset.kind!=='cinematic-bundle'||asset.id!==asset.path||asset.sha256!==expected.sha256||asset.bytes!==expected.bytes)throw Error('CINEMATIC_ASSET_INVALID')
 const bytes=asset.path===MODEL3D_RUNTIME_ASSET.path?readModel3DRuntimeBytes():readCinematicAsset(asset.path.split('/').at(-1)!)?.bytes
 if(!bytes||bytes.length!==expected.bytes||createHash('sha256').update(bytes).digest('hex')!==expected.sha256)throw Error('CINEMATIC_ASSET_INTEGRITY')
 return bytes
}
