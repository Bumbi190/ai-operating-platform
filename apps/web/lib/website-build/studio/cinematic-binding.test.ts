import {describe,it,expect} from 'vitest'
import {createHash} from 'node:crypto'
import JSZip from 'jszip'
import registry from './cinematic-registry.json'
import {CINEMATIC_BINDING,compileCinematicArtifact,cinematicReviewDraft,cinematicReference,parseCinematicCopy} from './cinematic-binding'
import {cinematicPackageManifest,cinematicPackagePages,cinematicPlanProposal} from './cinematic-package'
import {assertWebsiteArtifact,compileWebsiteArtifact,exportWebsiteZip} from '../artifact'
import {artifactHash} from '../artifact-hash'
import {validatePlanContent} from '../planning/validation'
import {createWebsiteMockups,validateMockupReference} from '../planning/mockups'
import {assertApprovedWebsiteScope} from '../planning/design-reference'
import {assembleProjectExport} from '../project-export'
const hash=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex')
const rehash=(a:any)=>{const {sha256,...payload}=a;return {...payload,sha256:artifactHash(payload)}}
describe('source-pinned cinematic Studio package',()=>{
 it('matches all current source pages and media byte-for-byte',async()=>{
  expect(await cinematicPackageManifest()).toEqual(registry.manifest)
  expect(await cinematicPackagePages()).toEqual(registry.pages)
 })
 it('preserves binding through plan validation and all three review entries',()=>{
  const plan=validatePlanContent(cinematicPlanProposal(CINEMATIC_BINDING))
  expect(plan.design.cinematic).toEqual(CINEMATIC_BINDING)
  const options=createWebsiteMockups(plan)
  expect(options.map(o=>o.title)).toEqual(['Bilhallen','Roadster','Filmvisningen'])
  for(const option of options){
   expect(cinematicReference(option)).toEqual(CINEMATIC_BINDING)
   expect(validateMockupReference(option)).toEqual(option.draft)
   assertApprovedWebsiteScope(compileCinematicArtifact(CINEMATIC_BINDING),{...option,mockupId:'test-review',approvedPages:plan.pages})
  }
 })
 it('compiles exact five-page package and changes only the escaped Roadster label',()=>{
  const before=compileCinematicArtifact(CINEMATIC_BINDING),after=compileCinematicArtifact(CINEMATIC_BINDING,{roadsterCta:'Boka & fråga'})
  assertWebsiteArtifact(before);assertWebsiteArtifact(after)
  expect(before.pages).toHaveLength(5);expect(before.assets).toHaveLength(registry.manifest.assets.length)
  expect(after.sha256).not.toBe(before.sha256)
  expect(after.assets).toEqual(before.assets)
  expect(after.pages.filter(p=>p.key!=='roadster')).toEqual(before.pages.filter(p=>p.key!=='roadster'))
  expect(after.pages.find(p=>p.key==='roadster')!.html).toBe(before.pages.find(p=>p.key==='roadster')!.html.replace('>Fråga om visningen</a>','>Boka &amp; fråga</a>'))
 })
 it.each(['html','asset','metadata','binding'])('rejects rehashed tampering: %s',kind=>{
  const a=structuredClone(compileCinematicArtifact(CINEMATIC_BINDING))
  if(kind==='html'){a.pages[0].html+='<script>alert(1)</script>';a.files[0].content=a.pages[0].html}
  if(kind==='asset')a.assets![0].sha256='0'.repeat(64)
  if(kind==='metadata')a.integrationNeeds=['form_delivery']
  if(kind==='binding')a.cinematicPreset!.binding.sha256='0'.repeat(64)
  expect(()=>assertWebsiteArtifact(rehash(a))).toThrow()
 })
 it('does not let generic HTML enter the trusted path or accept a stale plan',()=>{
  expect(()=>compileWebsiteArtifact(cinematicReviewDraft(CINEMATIC_BINDING,'visual'))).toThrow()
  const plan=cinematicPlanProposal(CINEMATIC_BINDING);plan.design.cinematic={...CINEMATIC_BINDING,sha256:'0'.repeat(64)}
  expect(()=>validatePlanContent(plan)).toThrow()
  for(const input of [{roadsterCta:'<script>'},{roadsterCta:'ok',html:'x'},{roadsterCta:''},{roadsterCta:'x'.repeat(81)}])expect(()=>parseCinematicCopy(input)).toThrow()
  const draft=cinematicReviewDraft(CINEMATIC_BINDING,'visual');draft.pages[0].bodyHtml='<iframe src="x"></iframe>'
  const canonicalDraft=JSON.stringify(draft)
  expect(()=>cinematicReference({canonicalDraft,sha256:hash(canonicalDraft)})).toThrow()
 })
 it('packs every declared media byte in normal ZIP and project delivery',async()=>{
  const artifact=compileCinematicArtifact(CINEMATIC_BINDING)
  const zip=await JSZip.loadAsync(await exportWebsiteZip(artifact))
  const project=await JSZip.loadAsync(await assembleProjectExport({projectId:'demo',projectName:'Demo',folderName:'demo',sessionId:'session',revisionId:'revision',revisionNumber:2,brief:'Test',location:null,planRevision:null,artifact}))
  for(const asset of artifact.assets!){
   const bytes=await zip.file(asset.path)!.async('uint8array')
   expect(bytes.length).toBe(asset.bytes);expect(hash(bytes)).toBe(asset.sha256)
   for(const prefix of ['demo/dist/','demo/previews/v2/'])expect(hash(await project.file(prefix+asset.path)!.async('uint8array'))).toBe(asset.sha256)
  }
 },60000)
})
