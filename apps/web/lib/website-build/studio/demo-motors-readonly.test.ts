import {describe,it,expect,vi} from 'vitest'
import {MODEL3D_RUNTIME_ASSET} from '../model3d-runtime-asset'
import {vehicle3DAsset} from '../assets/vehicle-3d'
import {demoMotorsReadOnlyHtml} from './demo-motors-readonly'

describe('authorized read-only Demo Motors showroom',()=>{
 it('uses the same governed 3D GLB, poster and runtime as the starter',()=>{
  const html=demoMotorsReadOnlyHtml()
  const vehicle=vehicle3DAsset('vehicle3d:demo-motors-concept-v1')!
  expect(html).toContain('FIKTIV DEMO')
  expect(html).toContain('Fri 3D-konceptvy')
  expect(html).toContain('360° fallback')
  expect(html).toContain('data-vehicle-3d="vehicle3d:demo-motors-concept-v1"')
  for(const path of [vehicle.glb.path,vehicle.poster.path,MODEL3D_RUNTIME_ASSET.path]){
   expect(html).toContain('"'+path+'"')
   expect(html).not.toContain('"/'+path+'"')
  }
  expect(html).not.toContain('https://')
  expect(html).not.toContain('skicka riktiga')
 })
 it('stays a vetted script-only demo with no customer network endpoints',()=>{
  const html=demoMotorsReadOnlyHtml()
  expect(html).toContain('default-src')
  expect(html).toContain('connect-src &#39;self&#39;')
  expect(html).toContain('form-action &#39;none&#39;')
  expect(html).toContain('object-src &#39;none&#39;')
  expect(html).not.toContain('service_role')
 })
})
