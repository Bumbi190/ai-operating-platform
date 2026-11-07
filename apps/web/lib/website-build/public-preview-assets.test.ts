import {describe,it,expect} from 'vitest'
import {createHash} from 'node:crypto'
import {BUNDLED_VEHICLE_3D_ASSETS} from './assets/vehicle-3d'
import {MODEL3D_RUNTIME_ASSET} from './model3d-runtime-asset'
import {readPublicWebsitePreviewAsset} from './public-preview-assets'

describe('public Studio 3D asset allowlist',()=>{
 it('serves only the exact bundled immutable GLB, poster and JS bytes',()=>{
  const sources=[
   {path:MODEL3D_RUNTIME_ASSET.path,sha:MODEL3D_RUNTIME_ASSET.sha256},
   ...BUNDLED_VEHICLE_3D_ASSETS.flatMap(asset=>[
    {path:asset.glb.path,sha:asset.glb.sha256},
    {path:asset.poster.path,sha:asset.poster.sha256}
   ])
  ]
  for(const source of sources){
   const file=readPublicWebsitePreviewAsset(source.path.split('/').slice(1))
   expect(file).not.toBeNull()
   expect(createHash('sha256').update(file!.bytes).digest('hex')).toBe(source.sha)
  }
 })
 it.each([
  ['3d','unknown.glb'],['runtime','random.js'],['3d','../secret'],
  ['private','data.json'],['3d','thing.webp'],['3d','wrong.exe']
 ])('refuses unapproved path %j/%j',(directory,file)=>{
  expect(readPublicWebsitePreviewAsset([directory,file])).toBeNull()
 })
 it('refuses extra or missing segments and nonstring input',()=>{
  for(const invalid of [null,undefined,[],['3d'],['3d','a.glb','extra'],[{},'a.glb']]){
   expect(readPublicWebsitePreviewAsset(invalid)).toBeNull()
  }
 })
})
