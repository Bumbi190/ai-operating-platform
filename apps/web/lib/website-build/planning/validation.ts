import 'server-only'
import { createHash } from 'node:crypto'
import { WebsiteBuildError } from '../store'
import type { PlanContent, IntegrationProvider } from './types'
export const PLAN_LIMITS={contentBytes:32768,briefChars:8000,pages:8} as const
const providers:IntegrationProvider[]=['terminal','vercel','supabase','strato','form_delivery']
function fail(code='INVALID_PLAN'):never{throw new WebsiteBuildError(code)}
function object(v:unknown,keys:string[]):Record<string,unknown>{
 if(!v||typeof v!=='object'||Array.isArray(v))fail()
 const o=v as Record<string,unknown>
 if(Object.keys(o).some(k=>!keys.includes(k))||keys.some(k=>!(k in o)))fail()
 return o
}
function text(v:unknown):string{if(typeof v!=='string'||!v.trim())fail();return v.trim()}
function list(v:unknown,max:number):unknown[]{if(!Array.isArray(v)||v.length>max)fail();return v}
function domain(v:unknown):string|null{
 if(v===null)return null
 const name=text(v)
 if(name.length>253||/[\/\\:@?#%\s]/.test(name))fail()
 let hostname:string
 try{hostname=new URL('https://'+name).hostname}catch{fail()}
 if(!hostname!.includes('.')||hostname!.split('.').some(x=>!x||x.length>63||!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(x)))fail()
 return hostname!
}
export function validatePlanContent(input:unknown):PlanContent{
 const raw=JSON.stringify(input)
 if(!raw||Buffer.byteLength(raw,'utf8')>PLAN_LIMITS.contentBytes)fail('PLAN_TOO_LARGE')
 if(/\b(?:sb_secret_[A-Za-z0-9_-]{12,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|sbp_[A-Za-z0-9_-]{20,})\b/.test(raw))fail('PLAN_CONTAINS_SECRET')
 const o=object(input,['title','purpose','audience','pages','design','features','architecture','steps','domain'])
 const d=object(o.design,['style','reference']),dm=object(o.domain,['registrar','requestedName'])
 if(dm.registrar!=='strato')fail()
 const pages=list(o.pages,8).map(v=>{const p=object(v,['key','title','purpose']);const key=text(p.key);if(!/^[a-z][a-z0-9-]{0,49}$/.test(key))fail();return {key,title:text(p.title),purpose:text(p.purpose)}})
 if(!pages.length||!pages.some(page=>page.key==='index'||page.key==='home')||new Set(pages.map(p=>p.key)).size!==pages.length)fail()
 const features=list(o.features,24).map(v=>{const f=object(v,['name','mode','provider']);if(f.mode!=='preview_demo'&&f.mode!=='live_required')fail();if(f.provider!==null&&!providers.includes(f.provider as IntegrationProvider))fail();return {name:text(f.name),mode:f.mode as 'preview_demo'|'live_required',provider:f.provider as IntegrationProvider|null}})
 const content:PlanContent={title:text(o.title),purpose:text(o.purpose),audience:text(o.audience),pages,design:{style:text(d.style),reference:d.reference===null?null:text(d.reference)},features,architecture:text(o.architecture),steps:list(o.steps,12).map(text),domain:{registrar:'strato',requestedName:domain(dm.requestedName)}}
 if(compileStaticBrief(content).length>PLAN_LIMITS.briefChars)fail('PLAN_TOO_LARGE')
 return content
}
export function hashPlanContent(content:PlanContent):string{return createHash('sha256').update(JSON.stringify(validatePlanContent(content))).digest('hex')}
export function compileStaticBrief(p:PlanContent):string{
 return ['Godkänd plan: '+p.title,'Syfte: '+p.purpose,'Målgrupp: '+p.audience,'Sidor:',...p.pages.map(x=>x.key+' — '+x.title+': '+x.purpose),'Design: '+p.design.style,p.design.reference?'Referens: '+p.design.reference:'','Funktioner:',...p.features.map(x=>x.name+' — DEMO i statisk preview'+(x.mode==='live_required'?' (riktig funktion kräver '+(x.provider??'extern anslutning')+')':'')),'Arkitektur: '+p.architecture,'Arbetsordning:',...p.steps,'Domän: Strato först'+(p.domain.requestedName?' — '+p.domain.requestedName:''),'Bygg en statisk preview enligt planen. Externa funktioner får inte visas som anslutna eller publicerade.'].filter(Boolean).join('\n')
}
