import {createHash} from 'node:crypto'
import registry from './cinematic-registry.json'
import type {WebsiteArtifact,WebsiteDraft} from '../types'
import type {PlanContent} from '../planning/types'
import {artifactHash} from '../artifact-hash'
import {escapeHtml} from '../preview-runtime'
export type CinematicBinding={id:'demo-motors-cinematic-v1';sha256:string}
export type CinematicCopy={roadsterCta:string}
export const CINEMATIC_BINDING:CinematicBinding={id:'demo-motors-cinematic-v1',sha256:registry.manifest.sha256}
export const DEFAULT_CINEMATIC_COPY:CinematicCopy={roadsterCta:'Fråga om visningen'}
export function parseCinematicBinding(input:unknown):CinematicBinding{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('CINEMATIC_BINDING_INVALID')
 const v=input as Record<string,unknown>
 if(Object.keys(v).length!==2||v.id!==CINEMATIC_BINDING.id||v.sha256!==CINEMATIC_BINDING.sha256)throw Error('CINEMATIC_BINDING_STALE')
 return {...CINEMATIC_BINDING}
}
export function parseCinematicCopy(input:unknown):CinematicCopy{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('CINEMATIC_COPY_INVALID')
 const v=input as Record<string,unknown>
 if(Object.keys(v).length!==1||typeof v.roadsterCta!=='string'||!v.roadsterCta.trim()||v.roadsterCta!==v.roadsterCta.trim()||v.roadsterCta.length>80||/[<>\x00-\x1f]/.test(v.roadsterCta))throw Error('CINEMATIC_COPY_INVALID')
 return {roadsterCta:v.roadsterCta}
}
export function assertCinematicPlan(content:PlanContent){
 const binding=parseCinematicBinding(content.design.cinematic)
 if(content.design.reference!==binding.id+':'+binding.sha256||content.design.starter||content.design.showroom||content.design.visual||content.features.some(f=>f.mode!=='preview_demo'||f.provider!==null))throw Error('CINEMATIC_PLAN_INVALID')
 if(content.pages.map(p=>p.key+'.html').join('|')!==registry.pages.map(p=>p.path).join('|'))throw Error('CINEMATIC_PLAN_INVALID')
 return binding
}
export function compileCinematicArtifact(binding:unknown,copy:unknown=DEFAULT_CINEMATIC_COPY):WebsiteArtifact{
 const preset={binding:parseCinematicBinding(binding),copy:parseCinematicCopy(copy)}
 const needle='>Fråga om visningen</a>'
 const pages=registry.pages.map(page=>{
  let html=page.html
  if(page.path==='roadster.html'){
   if(html.split(needle).length!==2)throw Error('CINEMATIC_COPY_ANCHOR_INVALID')
   html=html.replace(needle,'>'+escapeHtml(preset.copy.roadsterCta)+'</a>')
  }
  return {key:page.path.slice(0,-5),title:page.path==='index.html'?'Bilhallen':page.path==='roadster.html'?'Roadster':page.path==='visning.html'?'Filmvisning':page.path==='viewer.html'?'Roadster 3D':'Nord R 3D',html}
 })
 const payload={format:'static-website.v1' as const,pages,files:pages.map(p=>({path:p.key+'.html',content:p.html})),assets:registry.manifest.assets.map(a=>({id:a.path,kind:'cinematic-bundle' as const,path:a.path,sha256:a.sha256,bytes:a.bytes})),integrationNeeds:[],cinematicPreset:preset}
 return {...payload,sha256:artifactHash(payload)}
}
export function assertCinematicArtifact(artifact:WebsiteArtifact){
 const expected=compileCinematicArtifact(artifact.cinematicPreset?.binding,artifact.cinematicPreset?.copy)
 if(artifactHash(artifact)!==artifactHash(expected))throw Error('CINEMATIC_ARTIFACT_MISMATCH')
}
export function cinematicReviewDraft(binding:unknown,key:'editorial'|'visual'|'structured'):WebsiteDraft{
 return {format:'static-website.v1',title:'Granskad Demo Motors-visning',pages:[{key:'index',title:'Granska paketet',bodyHtml:'<p>Versionslåst konceptvisning med sju bilar.</p>',css:'',behaviors:[]}],cinematicPreset:{binding:parseCinematicBinding(binding),reviewPage:key==='editorial'?'index':key==='visual'?'roadster':'visning'}}
}
export function cinematicReference(reference:unknown):CinematicBinding|null{
 if(!reference||typeof reference!=='object')return null
 const r=reference as {canonicalDraft?:unknown;sha256?:unknown}
 if(typeof r.canonicalDraft!=='string')return null
 let draft:WebsiteDraft
 try{draft=JSON.parse(r.canonicalDraft)}catch{throw Error('INVALID_DESIGN_REFERENCE')}
 if(!Object.hasOwn(draft,'cinematicPreset'))return null
 if(createHash('sha256').update(r.canonicalDraft).digest('hex')!==r.sha256)throw Error('INVALID_DESIGN_REFERENCE')
 const page=draft.cinematicPreset?.reviewPage
 const key=page==='index'?'editorial':page==='roadster'?'visual':page==='visning'?'structured':null
 if(!key||JSON.stringify(draft)!==JSON.stringify(cinematicReviewDraft(draft.cinematicPreset?.binding,key)))throw Error('INVALID_DESIGN_REFERENCE')
 return parseCinematicBinding(draft.cinematicPreset?.binding)
}
