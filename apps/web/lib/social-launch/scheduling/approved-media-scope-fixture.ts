import 'server-only'
import type {createAdminClient} from '@/lib/supabase/admin'
import type {ManualCredential} from '../publication/provider'
import type {SocialContentAsset} from '../content/types'
import type {ApprovedScheduleSnapshot} from './types'
import {ScheduleError} from './types'

// TEST ONLY. No network or secret access is implemented here.
// The caller MUST provide a trusted social_schedule_authorize_write result.
// This is a binding probe, NOT a deployable media or credential authority.
type Db=ReturnType<typeof createAdminClient>
type Credential=ManualCredential&{projectId:string;bindingId:string}
type Image={bytes:Uint8Array;width:number;height:number}
type Channel='facebook'|'instagram'
export type MediaScopeFixtureDependencies={
 expectedProjectId:string // must come from the claimed SQL job, not a media request
 mediaDb:Db
 leaseExpiresAt:string
 resolveCredential:(projectId:string,channel:Channel)=>Promise<Credential>
 verifyImage:(db:Db,projectId:string,asset:Pick<SocialContentAsset,'id'|'sha256'>)=>Promise<Image>
 now?:()=>number
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const sha=/^[a-f0-9]{64}$/
function deny():never{throw new ScheduleError('REVIEW_REQUIRED')}

export function createApprovedScheduleMediaScopeFixture(
 approved:ApprovedScheduleSnapshot,deps:MediaScopeFixtureDependencies,
){
 if(process.env.NODE_ENV!=='test')deny()
 const {projectId,item,revision}=approved??{}
 const asset=revision?.media?.[0]
 const binding=revision?.binding
 if(!uuid.test(projectId??'')||projectId!==deps?.expectedProjectId||
    !uuid.test(approved?.approvalId??'')||
    !sha.test(approved?.manifestSha256??'')||
    !item||!revision||!asset||revision.media.length!==1||
    !uuid.test(item.postId)||!uuid.test(item.revisionId)||
    !uuid.test(item.bindingId)||!uuid.test(item.asset?.id??'')||
    !sha.test(item.sha256)||!sha.test(item.asset?.sha256??'')||
    !['facebook','instagram'].includes(item.channel)||
    !/^[0-9]{1,80}$/.test(item.accountId??'')||
    revision.id!==item.revisionId||revision.sha256!==item.sha256||
    revision.planRevisionId!==item.planRevisionId||
    revision.draft?.channel!==item.channel||revision.draft?.format!=='image'||
    revision.draft?.mediaIds?.length!==1||revision.draft.mediaIds[0]!==item.asset.id||
    // The canonical SQL snapshot projects binding.accountId/label but may
    // omit binding.id. social_schedule_item_guard checks item.bindingId against
    // the immutable revision.binding_id before authorize_write returns.
    !binding||binding.accountId!==item.accountId||
    (binding.id!==undefined&&binding.id!==item.bindingId)||
    asset.id!==item.asset.id||asset.sha256!==item.asset.sha256||
    asset.kind!=='image'||asset.mimeType!=='image/jpeg'||
    !uuid.test(asset.id)||!sha.test(asset.sha256)||
    !Number.isFinite(Date.parse(deps.leaseExpiresAt))||
    typeof deps.resolveCredential!=='function'||typeof deps.verifyImage!=='function'||
    !deps.mediaDb)deny()

 // Copy stable values; an untrusted mutation of the input object cannot expand
 // an already constructed scope. The privileged dependencies remain closed over.
 const pinned={projectId,channel:item.channel,accountId:item.accountId,
  bindingId:item.bindingId,assetId:asset.id,assetSha:asset.sha256,
  deadline:Date.parse(deps.leaseExpiresAt)}
 function authorized(){
  const now=deps.now?.()??Date.now()
  if(!Number.isFinite(now)||now>=pinned.deadline)deny()
 }
 const scope={
  resolveCredential:async(requestedProject:string,requestedChannel:Channel):Promise<Credential>=>{
   authorized()
   if(requestedProject!==pinned.projectId||requestedChannel!==pinned.channel)deny()
   let credential:Credential
   try{credential=await deps.resolveCredential(pinned.projectId,pinned.channel)}
   catch{throw new ScheduleError('UNAVAILABLE')}
   authorized()
   if(!credential||credential.projectId!==pinned.projectId||
      credential.channel!==pinned.channel||credential.accountId!==pinned.accountId||
      credential.bindingId!==pinned.bindingId||!credential.token)deny()
   return credential
  },
  verifyImage:async(db:Db,requestedProject:string,requestedAsset:Pick<SocialContentAsset,'id'|'sha256'>):Promise<Image>=>{
   authorized()
   if(db!==deps.mediaDb||requestedProject!==pinned.projectId||
      requestedAsset?.id!==pinned.assetId||
      requestedAsset.sha256!==pinned.assetSha)deny()
   try{
    const result=await deps.verifyImage(deps.mediaDb,pinned.projectId,
      {id:pinned.assetId,sha256:pinned.assetSha})
    authorized()
    return result
   }catch{throw new ScheduleError('UNAVAILABLE')}
  },
 }
 return Object.freeze(scope)
}
