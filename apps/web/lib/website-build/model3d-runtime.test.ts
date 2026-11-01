import {describe,it,expect} from 'vitest'
import {model3DControlPolicy,resolveModel3DAsset,type Model3DRuntimeBehavior} from './model3d-runtime'

const behavior:Model3DRuntimeBehavior={kind:'model3d',triggerId:'viewer',targetIds:['fallback'],assetId:'vehicle3d:demo-motors-concept-v1'}
const config={vehicle3dAssets:{
 [behavior.assetId]:{
  glb:'assets/3d/a8e79963c6b370c32611aca2514caa8213368666ee34a305ef6be45dd38aa0cb.glb',
  poster:'assets/3d/2b90c29009b92c32c403cf1eabdf79e07efb6e6c59b122308939d53b42c1a091.webp',
  truthClass:'fictional_concept' as const
 }
}}

describe('model3d runtime policy',()=>{
 it('resolves only the governed relative asset pair',()=>{
  expect(resolveModel3DAsset(config,behavior)).toEqual(config.vehicle3dAssets[behavior.assetId])
 })
 it.each(['https://bad.example/car.glb','//bad.example/car.glb','../car.glb','data:model/gltf-binary;base64,AAAA'])('rejects unsafe GLB path %s',glb=>{
  const bad={vehicle3dAssets:{[behavior.assetId]:{...config.vehicle3dAssets[behavior.assetId],glb}}}
  expect(()=>resolveModel3DAsset(bad,behavior)).toThrow('INVALID_MODEL3D_RUNTIME_ASSET')
 })
 it('uses bounded controls and disables decorative motion for reduced-motion users',()=>{
  const normal=model3DControlPolicy(false)
  const reduced=model3DControlPolicy(true)
  expect(normal.autoRotate).toBe(false)
  expect(normal.enablePan).toBe(false)
  expect(normal.minDistanceFactor).toBeGreaterThan(0)
  expect(normal.maxDistanceFactor).toBeGreaterThan(normal.minDistanceFactor)
  expect(reduced.autoRotate).toBe(false)
  expect(reduced.enableDamping).toBe(false)
  expect(normal.enableDamping).toBe(true)
 })
})
