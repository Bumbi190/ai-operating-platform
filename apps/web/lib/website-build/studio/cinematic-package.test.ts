import {describe,it,expect,vi,beforeEach} from 'vitest'
import {createHash} from 'node:crypto'
import JSZip from 'jszip'
import {parse,type DefaultTreeAdapterMap} from 'parse5'
const access=vi.hoisted(()=>vi.fn())
vi.mock('@/lib/auth/project-access',()=>({resolveProjectAccess:access}))
import {CINEMATIC_PRESET_ID,cinematicPackageManifest,cinematicPackagePages,assertCinematicPresetBinding,cinematicPlanProposal,exportCinematicPackage} from './cinematic-package'
import {validatePlanContent} from '../planning/validation'
import {compileWebsiteArtifact} from '../artifact'
import {GET} from '../../../app/(platform)/build/demo-motors/cinematic/route'
const request=(query:string)=>new Request('https://example.test/build/demo-motors/cinematic'+query)
const sha=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex')
describe('immutable full showroom review package',()=>{
 it('pins seven cars, five pages and the accepted Roadster assets without inventing approval',async()=>{
  const a=await cinematicPackageManifest(),b=await cinematicPackageManifest()
  expect(a).toEqual(b)
  expect(a.catalogIds).toEqual(['concept-04','concept-02','concept-03','concept-05','concept-06','concept-07','concept-08'])
  expect(a.pages.map(p=>p.path)).toEqual(['index.html','roadster.html','viewer.html','nord-r.html','visning.html'])
  expect(a.roadster.modelSha256).toBe('9f81d1357bf061968dab5b3f38957e11f51648751651e4e4b54d9d3cb0d1f77f')
  expect(a.roadster.filmSha256).toBe('b403e13ba6fb651ff1c3175c595b6406b3817f4f85bbd00898dbeaf5f171f3bc')
  const binding={id:CINEMATIC_PRESET_ID,sha256:a.sha256}
  expect(await assertCinematicPresetBinding(binding)).toEqual(a)
  const proposal=cinematicPlanProposal(binding)
  expect(validatePlanContent(proposal)).toEqual(proposal)
  expect(proposal.design.reference).toBe(CINEMATIC_PRESET_ID+':'+a.sha256)
  expect(proposal.design.starter).toBeUndefined()
 })
 it.each([null,{id:CINEMATIC_PRESET_ID,sha256:'bad'},{id:'other',sha256:'a'.repeat(64)},{id:CINEMATIC_PRESET_ID,sha256:'a'.repeat(64),html:'<script>alert(1)</script>'}])('rejects malformed or caller-extended bindings',async value=>{
  await expect(assertCinematicPresetBinding(value)).rejects.toThrow('CINEMATIC_BINDING_INVALID')
 })
 it('rejects a stale valid hash before export',async()=>{
  await expect(exportCinematicPackage({id:CINEMATIC_PRESET_ID,sha256:'0'.repeat(64)})).rejects.toThrow('CINEMATIC_BINDING_STALE')
 })
 it('exports the exact package and resolves every HTML media/navigation dependency locally',async()=>{
  const manifest=await cinematicPackageManifest()
  const zip=await JSZip.loadAsync(await exportCinematicPackage({id:CINEMATIC_PRESET_ID,sha256:manifest.sha256}))
  const saved=JSON.parse(await zip.file('preset-manifest.json')!.async('string'))
  expect(saved).toEqual(manifest)
  for(const entry of [...manifest.pages,...manifest.assets]){
   const bytes=await zip.file(entry.path)!.async('uint8array')
   expect(bytes.length).toBe(entry.bytes);expect(sha(bytes)).toBe(entry.sha256)
  }
  for(const page of await cinematicPackagePages()){
   expect(page.html).not.toMatch(/\/(?:build|bilhandlare)\//)
   expect(page.html).not.toContain('?view=')
   expect(page.html).toContain('Content-Security-Policy')
   const links:string[]=[]
   const walk=(node:DefaultTreeAdapterMap['node'])=>{
    if('tagName' in node)for(const a of node.attrs){
     if(['src','href','poster','data-src','data-viewer','data-scroll','data-portrait','data-wide-poster','data-portrait-poster'].includes(a.name))links.push(a.value)
     if(a.name==='style')for(const match of a.value.matchAll(/url\(["']?([^"')]+)["']?\)/g))links.push(match[1])
    }
    if('childNodes' in node)node.childNodes.forEach(walk)
   }
   walk(parse(page.html))
   for(const link of links){
    if(link.startsWith('#')||link.startsWith('data:')||link.startsWith('mailto:'))continue
    const url=new URL(link,'https://export.test/package/'+page.path)
    expect(url.origin).toBe('https://export.test')
    expect(url.pathname.startsWith('/package/')).toBe(true)
    expect(zip.file(url.pathname.slice('/package/'.length)),link).not.toBeNull()
   }
  }
  const proposal=JSON.parse(await zip.file('plan-proposal.json')!.async('string'))
  expect(proposal.status).toBe('review_only_not_admitted')
  expect(proposal.binding.sha256).toBe(manifest.sha256)
 },30000)
 it('keeps arbitrary video, iframe and script out of the generic compiler',()=>{
  for(const bodyHtml of ['<video src="assets/a.mp4"></video>','<iframe src="viewer.html"></iframe>','<script>alert(1)</script>']){
   expect(()=>compileWebsiteArtifact({format:'static-website.v1',title:'Test',css:'',pages:[{key:'index',title:'Test',bodyHtml,behaviors:[]}]})).toThrow('UNSUPPORTED_ELEMENT')
  }
 })
})
describe('owner review and download',()=>{
 beforeEach(()=>access.mockReset())
 it.each([401,403])('does not disclose a package to unauthorized users (%s)',async status=>{
  access.mockResolvedValue(status===401?{ok:false,response:new Response(null,{status})}:{ok:true,allowedProjectIds:[]})
  expect((await GET(request('?view=build-review'))).status).toBe(status)
  expect((await GET(request('?download=showroom&sha256='+('0'.repeat(64))))).status).toBe(status)
 })
 it('shows the actual scope and requires a current binding to download',async()=>{
  access.mockResolvedValue({ok:true,allowedProjectIds:['owned-project']})
  const response=await GET(request('?view=build-review')),html=await response.text()
  expect(response.headers.get('x-frame-options')).toBe('DENY')
  expect(html).toContain('Sju konceptbilar')
  expect(html).toContain('ännu inte en godkänd byggplan')
  expect(html).toContain((await cinematicPackageManifest()).sha256)
  expect((await GET(request('?download=showroom'))).status).toBe(409)
  expect((await GET(request('?download=showroom&sha256='+('0'.repeat(64))))).status).toBe(409)
 })
})
