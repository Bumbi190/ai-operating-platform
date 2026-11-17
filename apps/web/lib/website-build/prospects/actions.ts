import 'server-only'
import type {createAdminClient} from '@/lib/supabase/admin'
import type {BuildPrincipal} from '../types'
import {WebsiteBuildError,readBuildSession,readBuildArtifact} from '../store'
import {ensureStudioWorkspace} from '../studio/store'
import {saveWebsitePlanRevision,readWebsitePlan,approveWebsiteMockup,approveWebsitePlan,startApprovedWebsitePlan} from '../planning/store'
import {prospectInputHash,validateImprovements,publicWebsiteUrl} from './validation'
import {readProspect,saveProspect} from './store'
import {captureProspectWebsite} from './capture'
import type {ProspectView,ProspectContent} from './types'
type Db=ReturnType<typeof createAdminClient>

export async function updateProspect(db: Db,p: BuildPrincipal,current: ProspectView,content: ProspectContent,key: string){
  return saveProspect(db,p,{projectId:current.projectId,prospectId:current.prospectId,expectedRevisionId:current.revisionId,content,idempotencyKey:key})
}
export async function registerWebsite(db: Db,p: BuildPrincipal,current: ProspectView,url: unknown,key: string){
  const normalized=publicWebsiteUrl(url)
  if(current.content.website?.url===normalized)return current
  return updateProspect(db,p,current,{...current.content,website:{url:normalized,verifiedAt:new Date().toISOString(),verifiedBy:p.userId,method:'operator'},capture:null,improvements:[],design:null,build:null,demo:null},key)
}
export async function captureWebsite(db: Db,p: BuildPrincipal,current: ProspectView,key: string){
  if(!current.content.website)throw new WebsiteBuildError('WEBSITE_REQUIRED',409)
  const capture=await captureProspectWebsite(current.projectId,current.prospectId,current.content.website.url,async()=>{
    const latest=await readProspect(db,p,current)
    if(latest.revisionId!==current.revisionId)throw new WebsiteBuildError('PROSPECT_STALE',409)
  })
  return updateProspect(db,p,current,{...current.content,capture,improvements:[],design:null,build:null,demo:null},key)
}
export async function setImprovements(db: Db,p: BuildPrincipal,current: ProspectView,value: unknown,key: string){
  const improvements=validateImprovements(value,current.content)
  if(improvements.length!==3)throw new WebsiteBuildError('THREE_IMPROVEMENTS_REQUIRED',409)
  if(JSON.stringify(improvements)===JSON.stringify(current.content.improvements))return current
  return updateProspect(db,p,current,{...current.content,improvements,design:null,build:null,demo:null},key)
}
export async function prepareProspectDesign(db: Db,p: BuildPrincipal,current: ProspectView,key: string){
  const c=current.content
  if(!c.capture||!c.website||c.improvements.length!==3||c.company.inactive)throw new WebsiteBuildError('PROSPECT_EVIDENCE_REQUIRED',409)
  if(c.design){
    const existing=await readWebsitePlan(db,p,c.design)
    if(existing.currentRevision.revisionId===c.design.revisionId&&existing.currentRevision.sha256===c.design.sha256)return current
  }
  const inputSha256=prospectInputHash(c)
  const workspace=await ensureStudioWorkspace(db,p,{kind:'existing',projectId:current.projectId,idempotencyKey:'prospect-'+current.prospectId+'-'+current.revisionId})
  const plan=await saveWebsitePlanRevision(db,p,{projectId:current.projectId,conversationId:workspace.conversationId,expectedRevisionId:null,idempotencyKey:'prospect-design-'+current.revisionId,content:{
    title:c.company.name,purpose:'En begränsad konceptstartsida för '+c.company.name+' utifrån granskade observationer.',audience:'Besökare som söker bilhandel i '+(c.company.city??'företagets kommun'),
    pages:[{key:'index',title:'Startsida',purpose:'Företagsintroduktion, tre tydliga avsnitt och navigation inom konceptet.'}],
    design:{style:'Ljus, välordnad bilhandel med grön accent och tydliga mobilknappar',reference:c.website.url,visual:{palette:{background:'#F4F1EB',foreground:'#172925',accent:'#265C4B'},font:'sans'},prospect:{version:1,inputSha256,city:c.company.city??'Sverige',websiteUrl:c.website.url,sections:c.improvements.map(i=>i.concept)}},
    features:c.improvements.map(i=>({name:i.title,mode:'preview_demo' as const,provider:null})),architecture:'En statisk konceptstartsida. Atlas monterar den valda mockupen med WebBuilders validerade kompilator. Ingen modellkostnad, databasanslutning, bokning, fordonsimport eller kundkontakt i sidan.',
    steps:['Granska underlaget och tre förbättringar','Välj och godkänn företagets mockup','Bygg med versionslåst design','Verifiera mobil och dator','Godkänn eventuell demopublicering separat'],domain:{registrar:'strato',requestedName:null}
  }})
  const r=plan.currentRevision
  return updateProspect(db,p,current,{...c,design:{projectId:current.projectId,planId:r.planId,revisionId:r.revisionId,sha256:r.sha256,conversationId:workspace.conversationId,inputSha256},build:null,demo:null},key)
}
export async function prospectPlan(db: Db,p: BuildPrincipal,current: ProspectView){
  if(!current.content.design)return null
  const plan=await readWebsitePlan(db,p,current.content.design)
  if(plan.currentRevision.revisionId!==current.content.design.revisionId||plan.currentRevision.sha256!==current.content.design.sha256)throw new WebsiteBuildError('PROSPECT_DESIGN_STALE',409)
  return plan
}
export async function startProspectBuild(db: Db,p: BuildPrincipal,current: ProspectView,mockupId: unknown,mockupSha256: unknown,key: string){
  const plan=await prospectPlan(db,p,current),ref=current.content.design
  if(!plan||!ref||typeof mockupId!=='string'||typeof mockupSha256!=='string'||!plan.designReview?.options.some(m=>m.id===mockupId&&m.sha256===mockupSha256))throw new WebsiteBuildError('INVALID_MOCKUP')
  const selected=await approveWebsiteMockup(db,p,{projectId:ref.projectId,planId:ref.planId,revisionId:ref.revisionId,sha256:ref.sha256,mockupId,mockupSha256,idempotencyKey:key+'-mockup'})
  const decision=await approveWebsitePlan(db,p,{projectId:ref.projectId,planId:ref.planId,revisionId:ref.revisionId,sha256:ref.sha256,mockupDecisionId:selected.designReview!.approved!.id,idempotencyKey:key+'-plan'})
  return startApprovedWebsitePlan(db,p,{projectId:ref.projectId,planId:ref.planId,revisionId:ref.revisionId,sha256:ref.sha256,decisionId:decision.id})
}
export async function syncProspectBuild(db: Db,p: BuildPrincipal,current: ProspectView,key: string){
  const plan=await prospectPlan(db,p,current),ref=current.content.design
  if(!plan?.activeSessionId||!plan.designReview?.approved||!ref)throw new WebsiteBuildError('PROSPECT_BUILD_REQUIRED',409)
  const session=await readBuildSession(db,p,{projectId:current.projectId,sessionId:plan.activeSessionId})
  if(session.status!=='ready'||!session.activePreviewRevisionId)throw new WebsiteBuildError('PROSPECT_BUILD_PENDING',409)
  const artifact=await readBuildArtifact(db,p,session,session.activePreviewRevisionId)
  const build={sessionId:session.sessionId,revisionId:session.activePreviewRevisionId,sha256:artifact.sha256,planRevisionId:ref.revisionId,mockupId:plan.designReview.approved.mockupId,mockupSha256:plan.designReview.approved.sha256}
  if(JSON.stringify(build)===JSON.stringify(current.content.build))return current
  return updateProspect(db,p,current,{...current.content,build,demo:null},key)
}
