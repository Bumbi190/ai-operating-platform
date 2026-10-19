import 'server-only'
import type {SocialContentPrincipal,SocialContentPost,SocialContentView} from '../content/types'
import type {SocialLaunchView} from '../types'
import {readSocialContent} from '../content/store'
import {parseSocialContent} from '../content/validate'
import {readSocialLaunchPlan} from '../store'
import {authorizeNewsProject,type ReviewDb} from './verify'
import {canonicalNewsJson,digest} from './contract'
import {checkFreshRelevantNews,FRESH_NEWS_MAX_HOURS} from '@/lib/media/news-freshness'

type Code='INVALID_BODY'|'NOT_FOUND'|'STOPPED'|'UNAVAILABLE'|'REVISION_CONFLICT'|'PLAN_REQUIRED'|'PLAN_CHANGED'|'UNSUPPORTED_DRAFT'|'BRIEF_MISMATCH'|'SOURCE_EXPIRED'|'SOURCE_NOT_ELIGIBLE'
export class FilmPreparationError extends Error{
 constructor(public readonly code:Code){super(code)}
}
type Ref={projectId:string;postId:string;revisionId:string;sha256:string}
export type FilmBrief={
 kind:'the-prompt-film-brief-v1'
 source:{title:string;summary:string;url:string;key:string;publishedAt:string}
 editorial:{language:'en';hook:string;script:string;creativeVersion:'the-prompt-illustrated-smooth-v1';compositionId:'ThePromptIllustratedNews';voice:'victoria'}
 scenes:[{brief:string},{brief:string},{brief:string}]
}
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const SHA=/^[a-f0-9]{64}$/
function fail(code:Code):never{throw new FilmPreparationError(code)}
function fields(value:unknown,keys:string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||
  Object.keys(value).some(k=>!keys.includes(k)))fail('INVALID_BODY')
 return value as Record<string,unknown>
}
function text(value:unknown,max:number):string{
 if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))fail('INVALID_BODY')
 return value
}
function id(value:unknown):string{if(typeof value!=='string'||!UUID.test(value))fail('INVALID_BODY');return value}
function checksum(value:unknown):string{if(typeof value!=='string'||!SHA.test(value))fail('INVALID_BODY');return value}
function parseRef(value:unknown):Ref{
 const x=fields(value,['projectId','postId','revisionId','sha256'])
 return{projectId:id(x.projectId),postId:id(x.postId),revisionId:id(x.revisionId),sha256:checksum(x.sha256)}
}
function parseBrief(value:unknown):FilmBrief{
 const x=fields(value,['kind','source','editorial','scenes'])
 if(x.kind!=='the-prompt-film-brief-v1')fail('INVALID_BODY')
 const s=fields(x.source,['title','summary','url','key','publishedAt'])
 const e=fields(x.editorial,['language','hook','script','creativeVersion','compositionId','voice'])
 if(e.language!=='en'||e.creativeVersion!=='the-prompt-illustrated-smooth-v1'||e.compositionId!=='ThePromptIllustratedNews'||e.voice!=='victoria')fail('INVALID_BODY')
 const publishedAt=text(s.publishedAt,24)
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(publishedAt)||!Number.isFinite(Date.parse(publishedAt))||new Date(publishedAt).toISOString()!==publishedAt)fail('INVALID_BODY')
 const url=text(s.url,2048)
 try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash||u.pathname==='/')fail('INVALID_BODY')}catch{fail('INVALID_BODY')}
 if(!Array.isArray(x.scenes)||x.scenes.length!==3)fail('INVALID_BODY')
 const scenes=x.scenes.map(scene=>({brief:text(fields(scene,['brief']).brief,2000)}))
 if(new Set(scenes.map(s=>s.brief.trim())).size!==3)fail('INVALID_BODY')
 // Project validated data into fresh objects before any asynchronous read.
 return{kind:'the-prompt-film-brief-v1',
  source:{title:text(s.title,500),summary:text(s.summary,5000),url,key:text(s.key,100),publishedAt},
  editorial:{language:'en',hook:text(e.hook,160),script:text(e.script,5000),creativeVersion:'the-prompt-illustrated-smooth-v1',compositionId:'ThePromptIllustratedNews',voice:'victoria'},
  scenes:scenes as FilmBrief['scenes']}
}
function fresh(brief:FilmBrief,now:number){
 if(!Number.isFinite(now))fail('INVALID_BODY')
 const s=brief.source,r=checkFreshRelevantNews({title:s.title,summary:s.summary,url:s.url,source:s.key,sourceLabel:s.key,publishedAt:new Date(s.publishedAt)},now)
 if(!r.eligible)fail(r.reason==='stale'||r.reason==='future_date'?'SOURCE_EXPIRED':'SOURCE_NOT_ELIGIBLE')
}
function selected(content:SocialContentView,plan:SocialLaunchView,x:Ref,brief:FilmBrief){
 if(content?.project?.id!==x.projectId||plan?.project?.id!==x.projectId||!Array.isArray(content.posts))fail('UNAVAILABLE')
 const matches=content.posts.filter(p=>p.id===x.postId)
 if(matches.length!==1)fail(matches.length===0?'NOT_FOUND':'UNAVAILABLE')
 const post:SocialContentPost=matches[0],revision=post.revision
 if(!revision||revision.id!==x.revisionId||revision.sha256!==x.sha256)fail('REVISION_CONFLICT')
 const current=plan.currentRevision,decision=plan.decision
 if(!current||!decision||decision.decision!=='approve'||decision.revisionId!==current.id||decision.sha256!==current.sha256)fail('PLAN_REQUIRED')
 id(current.id);checksum(current.sha256);id(decision.id)
 if(!content.planApproved||content.currentPlanRevisionId!==current.id||revision.planRevisionId!==current.id)fail('PLAN_CHANGED')
 const draft=parseSocialContent(revision.draft,false)
 if(draft.format!=='video'||!['youtube','facebook','instagram'].includes(draft.channel)||
  !Array.isArray(current.choices)||!current.choices.some(c=>c.channel===draft.channel&&c.format==='video'))fail('UNSUPPORTED_DRAFT')
 if(draft.text!==brief.editorial.script||draft.linkUrl!==brief.source.url)fail('BRIEF_MISMATCH')
 return{post:{id:x.postId,revisionId:revision.id,sha256:revision.sha256},
  plan:{revisionId:current.id,sha256:current.sha256,decisionId:decision.id},
  draft:{...draft,mediaIds:[...draft.mediaIds]}}
}

/**
 * Read-only proposal, never a persisted job, verified source, quote, or grant.
 * Even an unchanged fingerprint must be revalidated by any later writer.
 */
export async function prepareFilm(db:ReviewDb,p:SocialContentPrincipal,input:unknown,rawBrief:unknown,clock:()=>number=Date.now){
 try{
  const x=parseRef(input),brief=parseBrief(rawBrief)
  await authorizeNewsProject(db,p,x.projectId)
  fresh(brief,clock())
  const read=async()=>selected(await readSocialContent(db,p,{projectId:x.projectId}),
   await readSocialLaunchPlan(db,p,{projectId:x.projectId}),x,brief)
  const first=await read(),last=await read()
  if(canonicalNewsJson(first.plan)!==canonicalNewsJson(last.plan))fail('PLAN_CHANGED')
  if(canonicalNewsJson(first)!==canonicalNewsJson(last))fail('REVISION_CONFLICT')
  await authorizeNewsProject(db,p,x.projectId)
  const checkedAt=clock();fresh(brief,checkedAt)
  const identity={kind:'the-prompt-film-preparation-v1' as const,projectId:x.projectId,...last,candidate:brief}
  return{...identity,dryRun:true as const,persisted:false as const,jobId:null,
   preparationSha256:digest(canonicalNewsJson(identity)),checkedAt:new Date(checkedAt).toISOString(),
   sourceVerification:'operator_supplied_not_verified' as const,
   sourceExpiresAt:new Date(Date.parse(brief.source.publishedAt)+FRESH_NEWS_MAX_HOURS*3600000).toISOString(),
   canGenerate:false as const,canPublish:false as const,
   blockers:['SOURCE_REVERIFICATION_REQUIRED','CANONICAL_NEWS_SCRIPT_PREPARATION_REQUIRED','GENERATION_BUDGET_REQUIRED',
    'IMAGE_VOICE_USAGE_EVIDENCE_REQUIRED','GENERATED_MEDIA_REQUIRED','RENDER_QA_AND_REVIEW_REQUIRED']}
 }catch(error){
  if(error instanceof FilmPreparationError)throw error
  const code=(error as {code?:unknown})?.code
  if(code==='NOT_FOUND'||code==='STOPPED'||code==='INVALID_BODY'||code==='REVISION_CONFLICT')fail(code)
  fail('UNAVAILABLE')
 }
}
