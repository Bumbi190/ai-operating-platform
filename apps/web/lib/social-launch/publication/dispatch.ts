import 'server-only'
import {assertExecutionDispatchAllowed} from '@/lib/governance/execution-dispatch'
import {projectScope} from '@/lib/governance/execution-stop'
import {executeApprovedPublication} from './executor'
import type {createAdminClient} from '@/lib/supabase/admin'
import {contentId} from '../content/validate'
import {SocialContentError} from '../content/types'
import {readSocialContent} from '../content/store'
import {resolvePublicationCredential} from './credentials'
import {publicationRead,publicationPrepare,publicationStep,publicationAssert} from './store'
import {manualBlockers,parsePublicationRequest} from './validate'
import {verifyPublicationImage} from './media'
import {MetaManualProvider,type ManualCredential} from './provider'
import {PublicationError,type PublicationPrincipal,type PublicationRequest,type PublicationView,type PublicationRecord,type PublicationPost,type PublicationAction,type PublicationStep} from './types'
type Db=ReturnType<typeof createAdminClient>
type Resolved=ManualCredential&{projectId:string;bindingId:string}
export type DispatchDependencies={provider?:MetaManualProvider;resolveCredential?:(projectId:string,channel:'facebook'|'instagram')=>Promise<Resolved>;verifyImage?:typeof verifyPublicationImage;now?:()=>number}
type Context={post:PublicationPost;record:PublicationRecord|null}
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
 const v=await (deps.resolveCredential??resolvePublicationCredential)(projectId,channel),binding=c.post.revision.binding
 if(!binding||v.projectId!==projectId||v.channel!==channel||v.bindingId!==binding.id||v.accountId!==binding.accountId||r&&(v.bindingId!==r.bindingId||v.accountId!==r.accountId))throw new PublicationError('REVIEW_REQUIRED')
 return v
}
function step(db:Db,p:PublicationPrincipal,r:PublicationRecord,action:PublicationAction,extra:Partial<PublicationStep>={}){return publicationStep(db,p,{projectId:r.projectId,postId:r.postId,publicationId:r.id,expectedVersion:r.version,action,...extra})}
async function executeManual(db:Db,p:PublicationPrincipal,c:Context,r:PublicationRecord|null,cred:Resolved,deps:DispatchDependencies,q:PublicationRequest){
 return executeApprovedPublication({db,snapshot:{projectId:q.projectId,postId:q.postId,revision:c.post.revision},record:r,credential:cred,journal:{prepare:()=>publicationPrepare(db,p,q),step:(record,action,extra)=>step(db,p,record,action,extra)},authorizeWrite:async()=>{await publicationAssert(db,p,q);await assertExecutionDispatchAllowed({context:'OPERATOR_EXECUTION',scope:projectScope({projectId:q.projectId})},{system:cred.channel,operation:'publish'})}},{provider:deps.provider??new MetaManualProvider(),verifyImage:deps.verifyImage??verifyPublicationImage,now:deps.now??(()=>Date.now()),signal:AbortSignal.timeout(55000)})
}
export async function dispatchPublication(db:Db,p:PublicationPrincipal,input:PublicationRequest,deps:DispatchDependencies={}):Promise<PublicationView>{
 const q=parsePublicationRequest(input),c=await context(db,p,q)
 if(c.record){if(!matches(c.record,q))throw new PublicationError('CONFLICT');if(c.record.state!=='requested')return view(q.projectId,c)}
 await publicationAssert(db,p,q)
 if(manualBlockers(c.post).length)throw new PublicationError('REVIEW_REQUIRED')
 const cred=await credential(c,c.record,q.projectId,deps)
 const r=await executeManual(db,p,c,c.record,cred,deps,q);return view(q.projectId,c,r)
}
export async function checkPublication(db:Db,p:PublicationPrincipal,input:{projectId:string;postId:string;publicationId:string},deps:DispatchDependencies={}):Promise<PublicationView>{
 try{contentId(input.publicationId)}catch{throw new PublicationError('INVALID_BODY')}
 const c=await context(db,p,input);let r=c.record
 if(!r||r.id!==input.publicationId)throw new PublicationError('NOT_FOUND')
 if(r.authoritySource==='scheduled')return view(input.projectId,c,r)
 if(['published','failed','requested'].includes(r.state))return view(input.projectId,c,r)
 if(['creating','publishing'].includes(r.state)&&(deps.now?.()??Date.now())-Date.parse(r.updatedAt)<120000)return view(input.projectId,c,r)
 if(r.channel==='facebook'||!r.containerId){if(r.state==='creating'||r.state==='publishing')r=(await step(db,p,r,'uncertain',{failureCode:'receipt_unavailable'})).record;return view(input.projectId,c,r)}
 if(r.state==='processing')await publicationAssert(db,p,original(r))
 const cred=await credential(c,r,input.projectId,deps)
 r=await executeManual(db,p,c,r,cred,deps,original(r));return view(input.projectId,c,r)
}
