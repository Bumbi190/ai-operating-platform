import {isSocialPreparationIntent} from './preparation-intent'

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const isId=(v:unknown):v is string=>typeof v==='string'&&uuid.test(v)
const object=(v:unknown):Record<string,unknown>|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null
export const SOCIAL_RECEIPT_TOOLS=['prepare_social_campaign','get_social_campaign','cancel_social_campaign','propose_social_content','get_social_content'] as const
export const isSocialReceiptTool=(name:string)=>SOCIAL_RECEIPT_TOOLS.some(n=>n===name)

/** Only a short continuation inherits recent explicit preparation intent. A new topic does not. */
export function isSocialPreparationTurn(messages:ReadonlyArray<{role:string;content:unknown}>):boolean{
 const last=messages.at(-1)
 if(last?.role!=='user'||typeof last.content!=='string')return false
 if(isSocialPreparationIntent(last.content))return true
 if(last.content.length>180||!/^(?:okej|ok|ja|jo|bra|perfekt|fortsätt|kör|gör|sätt|det blir|det låter|vi kör|kan du fortsätta)\b/i.test(last.content.trim()))return false
 return messages.slice(-7,-1).some(m=>m.role==='user'&&typeof m.content==='string'&&isSocialPreparationIntent(m.content))
}
type Failure={kind:'failure';code:string}
type Saved={kind:'saved';projectId:string;postId:string;revisionId:string;href:string}
type Campaign={kind:'campaign';projectId:string;campaignId:string;status:string;total:number;ready:number;href:string;source:'prepare'|'read'|'cancel'}
export type SocialPreparationReceipt=Failure|Saved|Campaign
const failure=(code='UNCONFIRMED'):Failure=>({kind:'failure',code})
const codes=new Set(['DISABLED','COST_LIMIT','INVALID_BODY','NOT_FOUND','CONFLICT','REVISION_CONFLICT','REVIEW_REQUIRED','PROFILE_REQUIRED','STOPPED','FENCED','CANCELLED','UNCERTAIN','UNAVAILABLE','MEDIA_REQUIRED','LIMIT_REACHED'])
const draftKeys=['channel','format','title','text','linkUrl','mediaIds','mediaBrief','scheduledAt']
const sameDraft=(a:unknown,b:unknown)=>{const x=object(a),y=object(b);return !!x&&!!y&&draftKeys.every(k=>JSON.stringify(x[k])===JSON.stringify(y[k]))}
const statuses=new Set(['queued','working','review_ready','partial','blocked','uncertain','cancelled'])
const itemStates=new Set(['queued','generating','asset_admitted','review_ready','blocked','uncertain','cancelled'])

/** Called only with actual server tool outcomes. Full-project reads and sibling posts are not write receipts. */
export function socialPreparationReceipt(name:string,rawInput:unknown,rawResult:unknown):SocialPreparationReceipt|null{
 if(!isSocialReceiptTool(name))return null
 const input=object(rawInput),result=object(rawResult)
 if(!input||!result)return failure()
 if('error' in result||result.ok===false)return failure(codes.has(String(result.code))?String(result.code):'UNAVAILABLE')
 if(name==='get_social_content')return null
 if(!isId(input.projectId))return failure()
 if(name==='propose_social_content'){
  const project=object(result.project)
  if(project?.id!==input.projectId||!isId(input.postId)||!isId(input.planRevisionId)||!Array.isArray(result.posts))return failure()
  const matches=result.posts.filter(p=>object(p)?.id===input.postId)
  const revision=matches.length===1?object(object(matches[0])?.revision):null
  if(!revision||!isId(revision.id)||revision.planRevisionId!==input.planRevisionId||!sameDraft(input.draft,revision.draft))return failure()
  if(typeof project.slug!=='string'||! /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project.slug))return failure()
  const href='/projects/'+project.slug+'/social#content'
  if(result.workspaceUrl!==href)return failure()
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

/** Human status is deterministic; model-authored UUIDs, URLs and success claims never enter this response. */
export function renderSocialPreparation(receipts:SocialPreparationReceipt[],voice:boolean,incomplete=false){
 const current=new Map<string,Saved|Campaign>(),failures:Failure[]=[]
 for(const r of receipts){
  if(r.kind==='failure')failures.push(r)
  else current.set(r.kind==='saved'?'post:'+r.projectId+':'+r.postId:'campaign:'+r.projectId+':'+r.campaignId,r)
 }
 const values=[...current.values()],parts:string[]=[]
 const saved=values.filter((r):r is Saved=>r.kind==='saved')
 if(saved.length)parts.push(voice?saved.length+' innehållsutkast har bekräftats sparade för granskning.':saved.map(r=>'Sparat innehållsutkast för granskning: post '+r.postId+', revision '+r.revisionId+'.').join('\n'))
 for(const r of values){
  if(r.kind!=='campaign')continue
  const label=r.status==='queued'?'Bildförberedelsen ligger i kö; utkasten är ännu inte färdiga':
   r.status==='working'?'Bildförberedelsen pågår':
   r.status==='uncertain'?'Bildförberedelsens status är osäker; ingen automatisk omgenerering görs':
   r.status==='blocked'?'Bildförberedelsen är blockerad':
   r.status==='cancelled'?'Bildförberedelsen är avbruten':
   r.ready===r.total?r.ready+' av '+r.total+' utkast har text och bild redo för granskning':
   r.ready+' av '+r.total+' utkast har text och bild redo; övriga är inte färdiga'
  parts.push(label+(voice?'.':' (kampanj '+r.campaignId+').'))
 }
 if(!values.length)parts.push('Ingen ny sparning eller köläggning har bekräftats.')
 if(failures.length)parts.push('Alla begärda ändringar är inte bekräftade'+(voice?'.':': '+[...new Set(failures.map(f=>f.code))].join(', ')+'.'))
 if(incomplete)parts.push('Svaret avbröts; inga ofullständiga verktygsanrop kördes och inget försöks automatiskt igen.')
 const links=[...new Set(values.map(r=>r.href))].map(href=>({id:'projects' as const,href,label:'Öppna granskningen'}))
 if(!voice)parts.push(...links.map(l=>'[Öppna granskningen]('+l.href+')'))
 // Speech stays short; failures/interruption take priority over additional success detail.
 const text=voice?[parts[0],incomplete?parts.find(p=>p.startsWith('Svaret avbröts')):failures.length?parts.find(p=>p.startsWith('Alla begärda')):undefined].filter(Boolean).join(' '):parts.join('\n\n')
 return {text,links}
}
