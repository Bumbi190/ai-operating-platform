const normalize=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const isId=(v:unknown):v is string=>typeof v==='string'&&uuid.test(v)
const object=(v:unknown):Record<string,unknown>|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null
export const SOCIAL_RECEIPT_TOOLS=['prepare_social_campaign','get_social_campaign','cancel_social_campaign','propose_social_content','get_social_content'] as const
export const isSocialReceiptTool=(name:string)=>SOCIAL_RECEIPT_TOOLS.some(n=>n===name)

/** Existing drafts must remain a source-backed read, including mode=content. */
export function isSocialContentReadIntent(text:string):boolean{
 const t=normalize(text)
 return /\b(?:inlagg\w*|utkast\w*|kampanj\w*)\b/.test(t)
  && /\b(?:har vi|vara|befintlig\w*|sparad\w*|finns|status)\b/.test(t)
  && /\b(?:vilka|vad|visa|las|hamta|hur|finns)\b/.test(t)
}

/** Completion scope is narrower than the existing general tool-access classifier:
 * plans, profiles, workflows, read-only questions and pure copywriting keep their
 * existing response path unless an actual content/campaign tool is later used. */
function contentPreparationRequest(text:string):boolean{
 const t=normalize(text)
 if(/^\s*(?:vad|hur|nar|varfor|vilken|vilket|vilka|ar|har|finns)\b/.test(t))return false
 const social=/\b(?:linkedin|facebook|instagram|pinterest|youtube|sociala?|inlagg\w*)\b/.test(t)
 const content=/\b(?:inlagg\w*|posts?|utkast\w*|publicering\w*|kampanj\w*)\b/.test(t)
 const prepare=/\b(?:planera\w*|forbered\w*|spara\w*|schemalagg\w*|prepare|schedule|save)\b/.test(t)
 const newImages=/\b(?:ta fram|skapa\w*|generera\w*|gor)\b/.test(t)&&/\b(?:bild(?:er|erna)?|images?)\b/.test(t)
 return social&&content&&(prepare||newImages)
}
function continuation(text:string):boolean{
 if(!text.trim()||text.length>180)return false
 const t=normalize(text).replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim()
 const action='(?:fortsatt(?:er vi)?|kan du fortsatta|kor(?: vi| du)?(?: pa)?(?: det| de| sa)?|gor(?: vi| du)?(?: det| sa)|satt(?: du)? det workflowet(?: nu)?)'
 return new RegExp('^(?:(?:okej|ok|ja|jo|bra|perfekt|battre|jattebra)(?: da| sa)?(?: '+action+')?|(?:da |sa )?'+action+'|det blir jattebra|det later bra)$').test(t)
}
/** Only a genuine continuation inherits the most recent substantive user topic. */
export function isSocialPreparationTurn(messages:ReadonlyArray<{role:string;content:unknown}>):boolean{
 const last=messages.at(-1)
 if(last?.role!=='user'||typeof last.content!=='string')return false
 if(contentPreparationRequest(last.content))return true
 if(!continuation(last.content))return false
 for(const m of messages.slice(-7,-1).reverse()){
  if(m.role!=='user'||typeof m.content!=='string')continue
  if(continuation(m.content))continue
  return contentPreparationRequest(m.content)
 }
 return false
}
type Failure={kind:'failure';code:string;writeAttempt?:boolean}
type Saved={kind:'saved';projectId:string;postId:string;revisionId:string;href:string}
type Observed={kind:'observed';projectId:string;total:number;proposal:number;approved:number;rejected:number;needsReview:number;href:string}
type Campaign={kind:'campaign';projectId:string;campaignId:string;status:string;total:number;ready:number;href:string;source:'prepare'|'read'|'cancel'}
export type SocialPreparationReceipt=Failure|Saved|Observed|Campaign
const codes=new Set(['DISABLED','COST_LIMIT','INVALID_BODY','NOT_FOUND','CONFLICT','REVISION_CONFLICT','REVIEW_REQUIRED','PROFILE_REQUIRED','STOPPED','FENCED','CANCELLED','UNCERTAIN','UNAVAILABLE','MEDIA_REQUIRED','LIMIT_REACHED'])
const draftKeys=['channel','format','title','text','linkUrl','mediaIds','mediaBrief','scheduledAt']
const sameDraft=(a:unknown,b:unknown)=>{const x=object(a),y=object(b);return !!x&&!!y&&draftKeys.every(k=>JSON.stringify(x[k])===JSON.stringify(y[k]))}
const statuses=new Set(['queued','working','review_ready','partial','blocked','uncertain','cancelled'])
const itemStates=new Set(['queued','generating','asset_admitted','review_ready','blocked','uncertain','cancelled'])

/** Called only with actual server outcomes. A full-project read is distinct
 * from a write, and an idempotent write's returned revision is CURRENT state,
 * not necessarily the originating revision written by that idempotency key. */
export function socialPreparationReceipt(name:string,rawInput:unknown,rawResult:unknown):SocialPreparationReceipt|null{
 if(!isSocialReceiptTool(name))return null
 const writeAttempt=['propose_social_content','prepare_social_campaign','cancel_social_campaign'].includes(name)
 const failure=(code='UNCONFIRMED'):Failure=>({kind:'failure',code,writeAttempt})
 const input=object(rawInput),result=object(rawResult)
 if(!input||!result)return failure()
 if('error' in result||result.ok===false)return failure(codes.has(String(result.code))?String(result.code):'UNAVAILABLE')
 if(!isId(input.projectId))return failure()
 if(name==='propose_social_content'||name==='get_social_content'){
  const project=object(result.project)
  if(project?.id!==input.projectId||!Array.isArray(result.posts))return failure()
  if(typeof project.slug!=='string'||! /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project.slug))return failure()
  const href='/projects/'+project.slug+'/social#content'
  if(result.workspaceUrl!==href)return failure()
  if(name==='get_social_content'){
   const posts=result.posts.map(object)
   if(posts.some(p=>!p||!isId(p.id)||!['proposal','approved','rejected','needs_review'].includes(String(p.status))))return failure()
   return {kind:'observed',projectId:input.projectId,total:posts.length,
    proposal:posts.filter(p=>p?.status==='proposal').length,approved:posts.filter(p=>p?.status==='approved').length,
    rejected:posts.filter(p=>p?.status==='rejected').length,needsReview:posts.filter(p=>p?.status==='needs_review').length,href}
  }
  if(!isId(input.postId)||!isId(input.planRevisionId))return failure()
  const matches=result.posts.filter(p=>object(p)?.id===input.postId)
  const revision=matches.length===1?object(object(matches[0])?.revision):null
  if(!revision||!isId(revision.id)||revision.planRevisionId!==input.planRevisionId||!sameDraft(input.draft,revision.draft))return failure()
  return {kind:'saved',projectId:input.projectId,postId:input.postId,revisionId:revision.id,href}
 }
 if(!isId(input.campaignId)||result.projectId!==input.projectId||result.id!==input.campaignId||result.publicationAuthority!==false||!statuses.has(String(result.status))||!Array.isArray(result.items)||result.items.length<1||result.items.length>3)return failure()
 const items=result.items.map(object)
 if(items.some(i=>!i||!isId(i.postId)||!itemStates.has(String(i.state))))return failure()
 const ready=items.filter(i=>i?.state==='review_ready'&&isId(i.revisionId)&&isId(i.assetId)).length
 if(items.some(i=>i?.state==='review_ready'&&(!isId(i.revisionId)||!isId(i.assetId)))||result.status==='review_ready'&&ready!==items.length)return failure()
 if(name==='prepare_social_campaign'){
  if(!Array.isArray(input.items)||input.items.length!==items.length)return failure()
  for(let n=0;n<items.length;n++){
   const a=object(input.items[n]),b=object(items[n]?.draft)
   if(!a||!b||!['title','text','imagePrompt','localMinute'].every(k=>a[k]===b[k]))return failure()
  }
 }
 const href=typeof result.workspaceUrl==='string'?result.workspaceUrl:''
 if(!new RegExp('^/projects/[a-z0-9]+(?:-[a-z0-9]+)*/social/campaigns/'+input.campaignId+'$').test(href))return failure()
 return {kind:'campaign',projectId:input.projectId,campaignId:input.campaignId,status:String(result.status),total:items.length,ready,href,source:name==='prepare_social_campaign'?'prepare':name==='cancel_social_campaign'?'cancel':'read'}
}
function campaignSummary(r:Campaign):string{
 const ready=r.ready+' av '+r.total+' utkast har text och bild redo för granskning'
 if(r.status==='queued')return ready+'; bildförberedelsen ligger i kö'
 if(r.status==='working')return ready+'; bildförberedelsen pågår'
 if(r.status==='uncertain')return ready+'; bildförberedelsens status är osäker'
 if(r.status==='blocked')return ready+'; bildförberedelsen är blockerad'
 if(r.status==='cancelled')return ready+'; bildförberedelsen är avbruten'
 return r.status==='review_ready'?ready:ready+'; övriga är inte färdiga'
}
/** Human status is deterministic. Untrusted model-authored claims never enter
 * this response; voice aggregates mixed results rather than hiding failures. */
export function renderSocialPreparation(receipts:SocialPreparationReceipt[],voice:boolean,incomplete=false){
 const current=new Map<string,Saved|Campaign>(),observations=new Map<string,Observed>(),failures:Failure[]=[]
 for(const r of receipts){
  if(r.kind==='failure')failures.push(r)
  else if(r.kind==='observed')observations.set(r.projectId,r)
  else current.set(r.kind==='saved'?'post:'+r.projectId+':'+r.postId:'campaign:'+r.projectId+':'+r.campaignId,r)
 }
 const values=[...current.values()],parts:string[]=[]
 const saved=values.filter((r):r is Saved=>r.kind==='saved')
 if(saved.length)parts.push(voice?saved.length+' innehållsutkast har bekräftats sparade för granskning':
  saved.map(r=>'Sparningen av innehållsutkastet har bekräftats. Aktuell matchande version: post '+r.postId+', revision '+r.revisionId+'.').join('\n'))
 for(const r of values){
  if(r.kind==='campaign')parts.push(campaignSummary(r)+(voice?'':' (kampanj '+r.campaignId+').'))
 }
 const attemptedWrite=saved.length>0||values.some(r=>r.kind==='campaign'&&r.source!=='read')||failures.some(r=>r.writeAttempt)
 const observed=attemptedWrite?[]:[...observations.values()]
 if(!values.length&&observed.length){
  for(const r of observed)parts.push('Läste '+r.total+' befintliga utkast: '+r.proposal+' förslag, '+r.needsReview+' behöver granskas igen, '+r.approved+' godkända och '+r.rejected+' avvisade'+(voice?'':'.'))
 }
 if(!values.length&&!observed.length)parts.push('Ingen ny sparning eller köläggning har bekräftats'+(voice?'':'.'))
 const warnings:string[]=[]
 if(failures.length)warnings.push('Alla begärda ändringar är inte bekräftade'+(voice?'':': '+[...new Set(failures.map(f=>f.code))].join(', ')))
 if(incomplete)warnings.push('Svaret avbröts; inga ofullständiga verktygsanrop kördes och inget försöks automatiskt igen')
 const links=[...new Set([...values,...observed].map(r=>r.href))].map(href=>({id:'projects' as const,href,label:'Öppna granskningen'}))
 const text=voice?parts.join('; ')+'.'+(warnings.length?' '+warnings.join('; ')+'.':''):
  [...parts,...warnings.map(w=>w+'.'),...links.map(l=>'[Öppna granskningen]('+l.href+')')].join('\n\n')
 return {text,links}
}
