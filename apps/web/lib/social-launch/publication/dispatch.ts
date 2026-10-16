import 'server-only'
import {createHash,randomBytes} from 'node:crypto'
import type {createAdminClient} from '@/lib/supabase/admin'
import {contentId} from '../content/validate'
import {SocialContentError} from '../content/types'
import {readSocialContent} from '../content/store'
import {resolveFacebookCredential,resolveInstagramCredential} from '@/lib/media/social-credentials'
import {publicationRead,publicationPrepare,publicationStep,publicationAssert} from './store'
import {manualBlockers,parsePublicationRequest} from './validate'
import {verifyPublicationImage} from './media'
import {MetaManualProvider,ManualProviderError,type ManualCredential} from './provider'
import {PublicationError,type PublicationPrincipal,type PublicationRequest,type PublicationView,type PublicationRecord,type PublicationPost,type PublicationAction,type PublicationStep} from './types'
type Db=ReturnType<typeof createAdminClient>
type Resolved=ManualCredential&{projectId:string;bindingId:string}
export type DispatchDependencies={provider?:MetaManualProvider;resolveCredential?:(projectId:string,channel:'facebook'|'instagram')=>Promise<Resolved>;verifyImage?:typeof verifyPublicationImage;now?:()=>number}
type Context={post:PublicationPost;record:PublicationRecord|null}
async function resolveManualCredential(projectId:string,channel:'facebook'|'instagram'):Promise<Resolved>{
 if(channel==='facebook'){
  const r=await resolveFacebookCredential(projectId);if(!r.ok)throw new PublicationError(r.refusal==='provider_unavailable'?'UNAVAILABLE':'REVIEW_REQUIRED')
  return {projectId:r.credential.projectId,bindingId:r.credential.bindingId,channel,accountId:r.credential.pageId,token:r.credential.pageToken,apiBase:'https://graph.facebook.com/v21.0'}
 }
 const r=await resolveInstagramCredential(projectId);if(!r.ok)throw new PublicationError(r.refusal==='provider_unavailable'?'UNAVAILABLE':'REVIEW_REQUIRED')
 return {projectId:r.credential.projectId,bindingId:r.credential.bindingId,channel,accountId:r.credential.accountId,token:r.credential.token,apiBase:r.credential.apiBase}
}
async function context(db:Db,p:PublicationPrincipal,input:{projectId:string;postId:string;conversationId?:string|null}):Promise<Context>{
 try{contentId(input.projectId);contentId(input.postId)}catch{throw new PublicationError('INVALID_BODY')}
 const [content,entry]=await Promise.all([readSocialContent(db,p,{projectId:input.projectId,...(input.conversationId?{conversationId:input.conversationId}:{})}),publicationRead(db,p,{projectId:input.projectId,postId:input.postId})]).catch(e=>{if(e instanceof SocialContentError)throw new PublicationError(e.code==='NOT_FOUND'?'NOT_FOUND':e.code==='STOPPED'?'STOPPED':e.code==='INVALID_BODY'?'INVALID_BODY':'UNAVAILABLE');throw e})
 const post=content.posts.find(post=>post.id===input.postId);if(!post)throw new PublicationError('NOT_FOUND')
 return {post,record:entry.publication}
}
function original(r:PublicationRecord):PublicationRequest{return {projectId:r.projectId,postId:r.postId,revisionId:r.revisionId,sha256:r.sha256,decisionId:r.decisionId,bindingId:r.bindingId,idempotencyKey:'continue-'+r.id,confirmed:true}}
function proposed(projectId:string,post:PublicationPost):PublicationRequest{
 if(!post.decision||!post.revision.binding)throw new PublicationError('REVIEW_REQUIRED')
 return {projectId,postId:post.id,revisionId:post.revision.id,sha256:post.revision.sha256,decisionId:post.decision.id,bindingId:post.revision.binding.id,idempotencyKey:'readiness',confirmed:true}
}
function matches(r:PublicationRecord,q:PublicationRequest){return r.projectId===q.projectId&&r.postId===q.postId&&r.revisionId===q.revisionId&&r.sha256===q.sha256&&r.decisionId===q.decisionId&&r.bindingId===q.bindingId}
function view(projectId:string,c:Context,r:PublicationRecord|null=c.record,extra:string[]=[]):PublicationView{
 const blockers=[...manualBlockers(c.post),...extra]
 if(r&&r.revisionId!==c.post.revision.id)blockers.push('existing_request_changed')
 if(r&&r.state!=='requested')blockers.push('already_requested')
 return {projectId,postId:c.post.id,publication:r,canRequest:blockers.length===0&&(!r||r.state==='requested'),blockers:[...new Set(blockers)],target:{channel:c.post.revision.draft.channel,accountLabel:c.post.revision.binding?.label??null}}
}
export async function publicationPreview(db:Db,p:PublicationPrincipal,input:{projectId:string;postId:string;conversationId?:string|null}):Promise<PublicationView>{
 const c=await context(db,p,input),v=view(input.projectId,c)
 if(v.canRequest){try{await publicationAssert(db,p,proposed(input.projectId,c.post))}catch(e){if(!(e instanceof PublicationError)||e.code==='UNAVAILABLE')throw e;v.canRequest=false;v.blockers.push(e.code==='STOPPED'?'stopped':e.code==='UNSUPPORTED'?'format_not_supported':'review_required')}}
 return v
}
async function credential(c:Context,r:PublicationRecord|null,projectId:string,deps:DispatchDependencies):Promise<Resolved>{
 const channel=c.post.revision.draft.channel
 if(channel!=='facebook'&&channel!=='instagram')throw new PublicationError('UNSUPPORTED')
 const v=await (deps.resolveCredential??resolveManualCredential)(projectId,channel),binding=c.post.revision.binding
 if(!binding||v.projectId!==projectId||v.channel!==channel||v.bindingId!==binding.id||v.accountId!==binding.accountId||r&&(v.bindingId!==r.bindingId||v.accountId!==r.accountId))throw new PublicationError('REVIEW_REQUIRED')
 return v
}
function step(db:Db,p:PublicationPrincipal,r:PublicationRecord,action:PublicationAction,extra:Partial<PublicationStep>={}){return publicationStep(db,p,{projectId:r.projectId,postId:r.postId,publicationId:r.id,expectedVersion:r.version,action,...extra})}
async function recover(db:Db,p:PublicationPrincipal,r:PublicationRecord,error:unknown){
 const code=error instanceof ManualProviderError?error.code:'receipt_unavailable'
 const result=await step(db,p,r,error instanceof ManualProviderError&&error.outcome==='rejected'?'fail':'uncertain',{failureCode:code});return result.record
}
async function progressInstagram(db:Db,p:PublicationPrincipal,c:Context,r:PublicationRecord,cred:Resolved,deps:DispatchDependencies):Promise<PublicationRecord>{
 const provider=deps.provider??new MetaManualProvider()
 if(!r.containerId)return r
 const status=await provider.status(cred,r.containerId)
 if(status==='PUBLISHED')return (await step(db,p,r,'confirm_published')).record
 if(status==='ERROR'||status==='EXPIRED')return r.state==='processing'?(await step(db,p,r,'fail',{failureCode:'provider_denied'})).record:r
 if(status!=='FINISHED')return r
 if(r.state!=='processing')return r.state==='publishing'?(await step(db,p,r,'uncertain',{failureCode:'receipt_unavailable'})).record:r
 await (deps.verifyImage??verifyPublicationImage)(db,r.projectId,c.post.revision.media[0])
 const admitted=await step(db,p,r,'claim_publish');r=admitted.record;if(!admitted.changed)return r
 try{const providerId=await provider.publish(cred,r.containerId!),permalink=await provider.permalink(cred,providerId);return (await step(db,p,r,'complete',{providerId,permalink})).record}
 catch(e){return recover(db,p,r,e)}
}
export async function dispatchPublication(db:Db,p:PublicationPrincipal,input:PublicationRequest,deps:DispatchDependencies={}):Promise<PublicationView>{
 const q=parsePublicationRequest(input),c=await context(db,p,q)
 if(c.record){if(!matches(c.record,q))throw new PublicationError('CONFLICT');if(c.record.state!=='requested')return view(q.projectId,c)}
 await publicationAssert(db,p,q)
 if(manualBlockers(c.post).length)throw new PublicationError('REVIEW_REQUIRED')
 const draft=c.post.revision.draft
 if(draft.format==='image')await (deps.verifyImage??verifyPublicationImage)(db,q.projectId,c.post.revision.media[0])
 const cred=await credential(c,c.record,q.projectId,deps),provider=deps.provider??new MetaManualProvider()
 let r=await publicationPrepare(db,p,q);if(r.state!=='requested')return view(q.projectId,c,r)
 const capability=draft.format==='image'?randomBytes(32).toString('base64url'):null
 const admitted=await step(db,p,r,'claim_create',capability?{capabilityHash:createHash('sha256').update(capability).digest('hex')}:{})
 r=admitted.record;if(!admitted.changed)return view(q.projectId,c,r)
 const imageUrl=capability?'https://app.omniraos.se/api/social-publication-media?'+new URLSearchParams({publicationId:r.id,key:capability}):null
 if(r.channel==='facebook'){
  try{const receipt=await provider.facebook(cred,{text:draft.text,linkUrl:draft.linkUrl,imageUrl});r=(await step(db,p,r,'complete',receipt)).record}
  catch(e){r=await recover(db,p,r,e)}
  return view(q.projectId,c,r)
 }
 try{const containerId=await provider.createImage(cred,imageUrl!,draft.text),saved=await step(db,p,r,'container_ready',{containerId});r=saved.record;if(!saved.changed)return view(q.projectId,c,r)}
 catch(e){return view(q.projectId,c,await recover(db,p,r,e))}
 r=await progressInstagram(db,p,c,r,cred,deps);return view(q.projectId,c,r)
}
export async function checkPublication(db:Db,p:PublicationPrincipal,input:{projectId:string;postId:string;publicationId:string},deps:DispatchDependencies={}):Promise<PublicationView>{
 try{contentId(input.publicationId)}catch{throw new PublicationError('INVALID_BODY')}
 const c=await context(db,p,input);let r=c.record
 if(!r||r.id!==input.publicationId)throw new PublicationError('NOT_FOUND')
 if(['published','failed','requested'].includes(r.state))return view(input.projectId,c,r)
 if(['creating','publishing'].includes(r.state)&&(deps.now?.()??Date.now())-Date.parse(r.updatedAt)<120000)return view(input.projectId,c,r)
 if(r.channel==='facebook'||!r.containerId){if(r.state==='creating'||r.state==='publishing')r=(await step(db,p,r,'uncertain',{failureCode:'receipt_unavailable'})).record;return view(input.projectId,c,r)}
 if(r.state==='processing')await publicationAssert(db,p,original(r))
 const cred=await credential(c,r,input.projectId,deps)
 r=await progressInstagram(db,p,c,r,cred,deps);return view(input.projectId,c,r)
}
