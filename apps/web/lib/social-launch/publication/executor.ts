import 'server-only'
import {createHash,randomBytes} from 'node:crypto'
import type {createAdminClient} from '@/lib/supabase/admin'
import type {SocialContentRevision} from '../content/types'
import type {ManualCredential} from './provider'
import {MetaManualProvider,ManualProviderError} from './provider'
import type {PublicationRecord,PublicationAction,PublicationStep} from './types'
import {verifyPublicationImage} from './media'
export type ApprovedPublicationSnapshot={projectId:string;postId:string;revision:SocialContentRevision}
export type PublicationJournal={prepare:()=>Promise<PublicationRecord>;step:(record:PublicationRecord,action:PublicationAction,extra?:Partial<PublicationStep>)=>Promise<{changed:boolean;record:PublicationRecord}>}
export class PublicationBudgetError extends Error{constructor(){super('budget_exhausted')}}
export async function executeApprovedPublication(ctx:{db:ReturnType<typeof createAdminClient>;snapshot:ApprovedPublicationSnapshot;record:PublicationRecord|null;credential:ManualCredential;journal:PublicationJournal;authorizeWrite:()=>Promise<void>},deps:{provider:MetaManualProvider;verifyImage:typeof verifyPublicationImage;now:()=>number;signal:AbortSignal}):Promise<PublicationRecord>{
 const provider=deps.provider.withSignal(deps.signal),draft=ctx.snapshot.revision.draft
 let r=ctx.record
 function budget(){if(deps.signal.aborted)throw new PublicationBudgetError()}
 async function step(action:PublicationAction,extra:Partial<PublicationStep>={}){
  const result=await ctx.journal.step(r!,action,extra);r=result.record;return result.changed
 }
 async function recover(error:unknown){
  const code=error instanceof ManualProviderError?error.code:'receipt_unavailable'
  await step(error instanceof ManualProviderError&&error.outcome==='rejected'?'fail':'uncertain',{failureCode:code})
  return r!
 }
 async function verifyImage(){budget();await deps.verifyImage(ctx.db,ctx.snapshot.projectId,ctx.snapshot.revision.media[0]);budget()}
 async function authorize(){budget();await ctx.authorizeWrite();budget()}
 if(r&&['published','failed'].includes(r.state))return r
 if(r?.state==='uncertain'&&(r.channel==='facebook'||!r.containerId))return r
 if(r&&['creating','publishing'].includes(r.state)){
  if(deps.now()-Date.parse(r.updatedAt)<120000)return r
  await step('uncertain',{failureCode:'receipt_unavailable'});return r!
 }
 if(!r||r.state==='requested'){
  if(draft.format==='image')await verifyImage()
  await authorize()
  r=await ctx.journal.prepare()
  if(r.state!=='requested')return r
  const capability=draft.format==='image'?randomBytes(32).toString('base64url'):null
  if(!await step('claim_create',capability?{capabilityHash:createHash('sha256').update(capability).digest('hex')}:{}))return r!
  const imageUrl=capability?'https://app.omniraos.se/api/social-publication-media?'+new URLSearchParams({publicationId:r!.id,key:capability}):null
  await authorize()
  if(ctx.credential.channel==='facebook'){
   try{const receipt=await provider.facebook(ctx.credential,{text:draft.text,linkUrl:draft.linkUrl,imageUrl});await step('complete',receipt);return r!}catch(e){return recover(e)}
  }
  try{const containerId=await provider.createImage(ctx.credential,imageUrl!,draft.text);if(!await step('container_ready',{containerId}))return r!}catch(e){return recover(e)}
 }
 if(!r||r.channel!=='instagram'||!r.containerId)return r!
 budget()
 const status=await provider.status(ctx.credential,r.containerId)
 if(status==='PUBLISHED'){await step('confirm_published');return r!}
 if(status==='ERROR'||status==='EXPIRED'){if(r.state==='processing')await step('fail',{failureCode:'provider_denied'});return r!}
 if(status!=='FINISHED'||r.state!=='processing')return r
 await verifyImage()
 await authorize()
 if(!await step('claim_publish'))return r!
 await authorize()
 try{
  const providerId=await provider.publish(ctx.credential,r!.containerId!),permalink=await provider.permalink(ctx.credential,providerId)
  await step('complete',{providerId,permalink});return r!
 }catch(e){return recover(e)}
}
