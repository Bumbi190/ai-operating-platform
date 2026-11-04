import {beforeEach,describe,it,expect,vi} from 'vitest'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import JSZip from 'jszip'
import {parse} from 'parse5'
const access=vi.hoisted(()=>vi.fn())
vi.mock('@/lib/auth/project-access',()=>({resolveProjectAccess:access}))
import {ROADSTER_PRESET,ROADSTER_CONTROLS,readRoadsterAsset,isRoadsterViewerAsset} from './roadster-assets'
import {roadsterHtml,exportRoadsterPreset} from './roadster-preset'
import {cinematicAssetResponse} from './cinematic-assets'
import {GET as htmlGet} from '../../../app/(platform)/build/demo-motors/cinematic/route'
import {GET as assetGet} from '../../../app/(platform)/build/demo-motors/cinematic/assets/[name]/route'
import {GET as modelGet} from '../../../app/(platform)/build/demo-motors/assets/[...path]/route'
import {GET as pilotGet} from '../../../app/bilhandlare/[[...path]]/route'
const request=(query:string)=>new Request('https://example.test/build/demo-motors/cinematic'+query)
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex')
describe('approved portable Roadster preset',()=>{
 it('pins the complete approved film, fixed windshield model and darker viewer by actual bytes',()=>{
  expect(ROADSTER_PRESET.files.film.sha256).toBe('b403e13ba6fb651ff1c3175c595b6406b3817f4f85bbd00898dbeaf5f171f3bc')
  expect(ROADSTER_PRESET.files.model.sha256).toBe('9f81d1357bf061968dab5b3f38957e11f51648751651e4e4b54d9d3cb0d1f77f')
  expect(ROADSTER_PRESET.files.viewerRuntime.sha256).toBe('e84a430421555ea19ed69c3fc34258f6591c36012da03da20cdc297193e5dcf5')
  for(const file of Object.values(ROADSTER_PRESET.files)){
   const asset=readRoadsterAsset(file.name)!
   expect(asset.bytes.length).toBe(file.bytes);expect(digest(asset.bytes)).toBe(file.sha256)
  }
  expect(digest(readRoadsterAsset(ROADSTER_CONTROLS.name)!.bytes)).toBe(ROADSTER_CONTROLS.sha256)
  const glb=readRoadsterAsset(ROADSTER_PRESET.files.model.name)!.bytes
  const model=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString('utf8'))
  for(const resource of [...(model.buffers??[]),...(model.images??[])])expect(resource.uri).toBeUndefined()
  expect(model.extensionsRequired??[]).not.toContain('KHR_draco_mesh_compression')
  const thrusters=model.nodes.filter((node:{name?:string})=>node.name?.startsWith('Roadster rear thruster '))
  expect(thrusters).toHaveLength(4)
  expect(new Set(thrusters.map((node:{translation:number[]})=>node.translation[2])).size).toBe(4)
  expect(thrusters.every((node:{translation:number[]})=>node.translation[0]<-.45)).toBe(true)
  expect(model.extras.roadsterThrusters.sourceModelSha256).toBe('41ea20c154977eeeb5fc3b8aca8e3548a7809b1ba961ba5c0663ae76f9e01b03')
  const original=readFileSync(resolve(__dirname,'cinematic-assets/roadster-v1-model.glb'))
  const originalJsonLength=original.readUInt32LE(12)
  const originalModel=JSON.parse(original.subarray(20,20+originalJsonLength).toString('utf8'))
  expect(model.meshes.slice(0,originalModel.meshes.length)).toEqual(originalModel.meshes)
  expect(model.materials.slice(0,originalModel.materials.length)).toEqual(originalModel.materials)
  const originalBinary=original.subarray(28+originalJsonLength,28+originalJsonLength+originalModel.buffers[0].byteLength)
  expect(glb.subarray(28+glb.readUInt32LE(12),28+glb.readUInt32LE(12)+originalBinary.length).equals(originalBinary)).toBe(true)
  // Keep recessed back walls outside the body's minimum X; no red body through the mouths.
  expect(thrusters.every((node:{translation:number[];scale:number[]})=>node.translation[0]+.009*node.scale[0]<-.5)).toBe(true)



  expect(readRoadsterAsset('../roadster-v1.json')).toBeNull()
  expect(readRoadsterAsset('roadster-v1-film.mp4')).toBeNull()
  expect(isRoadsterViewerAsset(['3d',ROADSTER_PRESET.files.model.name])).toBe(true)
  expect(isRoadsterViewerAsset(['3d','..',ROADSTER_PRESET.files.model.name])).toBe(false)
 })
 it('limits mounts to authored locations and retains a strict non-networked page',()=>{
  expect(()=>roadsterHtml(false,'https://evil.test' as never)).toThrow('ROADSTER_MOUNT')
  for(const mount of ['studio','pilot','export'] as const){
   const html=roadsterHtml(false,mount)
   expect(html).not.toContain('__ROADSTER_');expect(html).not.toContain('<iframe')
   expect(html).not.toContain('<video')
   expect(html).toContain("connect-src 'none'");expect(html).toContain("form-action 'none'")
   expect(html).toContain('integrity="sha256-')
   expect(html).toContain('id="timeline"')
   const errors:unknown[]=[]
   parse(html,{onParseError:e=>errors.push(e)})
   expect(errors).toEqual([])
   expect(roadsterHtml(true,mount)).not.toContain('__ROADSTER_')
  }
 })
 it('exports all dependent files with exact hashes and relative links',async()=>{
  const zip=await JSZip.loadAsync(await exportRoadsterPreset())
  for(const file of Object.values(ROADSTER_PRESET.files)){
   expect(digest(await zip.file('assets/'+file.name)!.async('uint8array'))).toBe(file.sha256)
  }
  for(const key of ['model','cover'] as const){
   const file=ROADSTER_PRESET.files[key]
   expect(digest(await zip.file('assets/3d/'+file.name)!.async('uint8array'))).toBe(file.sha256)
  }
  const html=await zip.file('index.html')!.async('string'),viewer=await zip.file('viewer.html')!.async('string')
  expect(html+viewer).not.toContain('/bilhandlare/')
  expect(html+viewer).not.toContain('/build/')
  expect(html).toContain('"viewer":"viewer.html"')
  expect(zip.file('manifest.json')).not.toBeNull()
  expect(zip.file('README.txt')).not.toBeNull()
 })
 it('serves the last frame bytes via a bounded range and rejects multi-ranges',async()=>{
  const file=ROADSTER_PRESET.files.film
  const response=cinematicAssetResponse(new Request('https://example.test',{headers:{range:'bytes=-128'}}),file.name)
  expect(response.status).toBe(206)
  expect(Buffer.from(await response.arrayBuffer())).toEqual(readRoadsterAsset(file.name)!.bytes.subarray(-128))
  expect(cinematicAssetResponse(new Request('https://example.test',{headers:{range:'bytes=0-1,5-6'}}),file.name).status).toBe(416)
 })
})
describe('Roadster owner and fictional pilot boundaries',()=>{
 beforeEach(()=>access.mockReset())
 it.each([401,403])('gates viewer, export, controls and model at %s',async status=>{
  access.mockResolvedValue(status===401?{ok:false,response:new Response(null,{status})}:{ok:true,allowedProjectIds:[]})
  for(const query of ['?view=roadster','?view=roadster-3d','?download=roadster'])
   expect((await htmlGet(request(query))).status).toBe(status)
  expect((await assetGet(request(''),{params:{name:ROADSTER_CONTROLS.name}})).status).toBe(status)
  expect((await modelGet(request(''),{params:{path:['3d',ROADSTER_PRESET.files.model.name]}})).status).toBe(status)
 })
 it('serves owner preview and complete download without project mutations',async()=>{
  access.mockResolvedValue({ok:true,allowedProjectIds:['owned-project']})
  const page=await htmlGet(request('?view=roadster'))
  expect(await page.text()).toContain('Hämta visningspaket')
  const frame=await htmlGet(request('?view=roadster-3d'))
  expect(frame.headers.get('x-frame-options')).toBe('SAMEORIGIN')
  const download=await htmlGet(request('?download=roadster'))
  expect(download.status).toBe(200);expect(download.headers.get('content-type')).toBe('application/zip')
  expect((await JSZip.loadAsync(await download.arrayBuffer())).file('viewer.html')).not.toBeNull()
 })
 it('exposes only the approved fictional preset through the existing public pilot',async()=>{
  const page=await pilotGet(new Request('https://example.test/bilhandlare/bilhall?view=roadster'),{params:{path:['bilhall']}})
  expect(page.status).toBe(200);expect(await page.text()).not.toContain('Hämta visningspaket')
  const model=await pilotGet(new Request('https://example.test'),{params:{path:['assets','3d',ROADSTER_PRESET.files.model.name]}})
  expect(model.status).toBe(200);expect(digest(Buffer.from(await model.arrayBuffer()))).toBe(ROADSTER_PRESET.files.model.sha256)
  const unknown=await pilotGet(new Request('https://example.test'),{params:{path:['assets','3d','customer-upload.glb']}})
  expect(unknown.status).toBe(404)
  expect(access).not.toHaveBeenCalled()
 })
})
