import 'server-only'
import {createHash} from 'node:crypto'
import {setTimeout as delay} from 'node:timers/promises'
export type LinkedInImageIntent={projectId:string;postId:string;revisionId:string;contentSha256:string;bindingId:string;organizationUrn:string;text:string;title:string;imageSha256:string}
type Verified=LinkedInImageIntent&{deliveryAuthorized:true;accessToken:string;apiVersion:string}
/**
 * SERVER boundary contract, deliberately not wired to any route, tool or schedule.
 * Future activation MUST supply fresh canonical exact-revision + destination +
 * delivery authority, and a durable once-only create latch. A boolean in chat is
 * not an implementation of this contract. Preparation cannot construct it.
 */
export interface LinkedInPublicationAuthority{
 assertCurrent(intent:LinkedInImageIntent):Promise<Verified>
 beginCreate(intent:LinkedInImageIntent):Promise<boolean>
 recordImage(imageUrn:string):Promise<void>
}
type Image={bytes:Uint8Array;mimeType:'image/png'|'image/jpeg';width:number;height:number}
type Receipt={status:'blocked';reason:string;imageUrn?:string}|{status:'published';imageUrn:string;postUrn:string}|{status:'uncertain';imageUrn:string;reason:string}
const API='https://api.linkedin.com/rest'
const keys=['projectId','postId','revisionId','contentSha256','bindingId','organizationUrn','text','title','imageSha256'] as const
async function json(response:Response):Promise<Record<string,unknown>>{
 if(!response.ok||!response.body||Number(response.headers.get('content-length'))>65536)throw Error('provider_refused')
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0
 try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>65536){await reader.cancel();throw Error('provider_response_limit')}chunks.push(part.value)}}finally{reader.releaseLock()}
 return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string,unknown>
}
/** Transport seam only; live durable authority/account/schedule integration is separate. */
export async function publishReviewedLinkedInImage(intent:LinkedInImageIntent,image:Image,authority:LinkedInPublicationAuthority,deps:{fetcher?:typeof fetch}={}):Promise<Receipt>{
 if(process.env.SOCIAL_LINKEDIN_PUBLISHER!=='1')return {status:'blocked',reason:'disabled'}
 const fetcher=deps.fetcher??fetch,signal=AbortSignal.timeout(30000)
 let imageUrn:string|undefined,createStarted=false
 try{
  if(!intent||Object.keys(intent).length!==keys.length||keys.some(k=>typeof intent[k]!=='string')||!/^urn:li:organization:[1-9]\d*$/.test(intent.organizationUrn)
   ||!intent.text.trim()||intent.text.length>3000||!intent.title.trim()||intent.title.length>150
   ||!/^([a-f0-9]{64})$/.test(intent.contentSha256)||!/^([a-f0-9]{64})$/.test(intent.imageSha256)
   ||image.bytes.length<8||image.bytes.length>20*1024*1024||!['image/png','image/jpeg'].includes(image.mimeType)
   ||!Number.isInteger(image.width)||!Number.isInteger(image.height)||image.width<1||image.height<1||image.width*image.height>=36152320
   ||createHash('sha256').update(image.bytes).digest('hex')!==intent.imageSha256)throw Error('review_required')
  async function headers():Promise<Record<string,string>>{
   signal.throwIfAborted()
   const current=await authority.assertCurrent(intent)
   if(keys.some(k=>current[k]!==intent[k])||current.deliveryAuthorized!==true||!current.accessToken||!/^\d{4}(0[1-9]|1[0-2])$/.test(current.apiVersion))throw Error('authority_changed')
   signal.throwIfAborted()
   return {Authorization:'Bearer '+current.accessToken,'Linkedin-Version':current.apiVersion,'X-Restli-Protocol-Version':'2.0.0'}
  }
  const initialized=await json(await fetcher(API+'/images?action=initializeUpload',{method:'POST',redirect:'error',signal,headers:{...await headers(),'Content-Type':'application/json'},body:JSON.stringify({initializeUploadRequest:{owner:intent.organizationUrn}})}))
  const value=initialized.value as {image?:unknown;uploadUrl?:unknown;uploadUrlExpiresAt?:unknown}|undefined
  if(typeof value?.image!=='string'||!/^urn:li:image:[A-Za-z0-9_-]+$/.test(value.image)||typeof value.uploadUrl!=='string'||typeof value.uploadUrlExpiresAt!=='number'||value.uploadUrlExpiresAt<=Date.now())throw Error('image_unavailable')
  imageUrn=value.image
  const upload=new URL(value.uploadUrl)
  if(upload.origin!=='https://www.linkedin.com'||upload.username||upload.password||upload.hash||!upload.pathname.startsWith('/dms-uploads/'))throw Error('upload_origin_refused')
  await authority.recordImage(imageUrn)
  const uploaded=await fetcher(upload.toString(),{method:'PUT',redirect:'error',signal,headers:{...await headers(),'Content-Type':image.mimeType},body:new Uint8Array(image.bytes).buffer})
  if(!uploaded.ok)throw Error('image_upload_refused')
  let available=false
  for(let attempt=0;attempt<4;attempt++){
   const state=await json(await fetcher(API+'/images/'+encodeURIComponent(imageUrn),{redirect:'error',signal,headers:await headers()}))
   if(state.id!==imageUrn||state.owner!==intent.organizationUrn)throw Error('image_identity_changed')
   if(state.status==='AVAILABLE'){available=true;break}
   if(!['WAITING_UPLOAD','PROCESSING'].includes(state.status as string))throw Error('image_processing_failed')
   if(attempt<3)await delay(500,undefined,{signal})
  }
  if(!available)throw Error('image_not_ready')
  const finalHeaders=await headers()
  // This callback must atomically consume current delivery authority, not merely read it.
  if(!await authority.beginCreate(intent))return {status:'blocked',reason:'create_already_started',imageUrn}
  createStarted=true;signal.throwIfAborted()
  const response=await fetcher(API+'/posts',{method:'POST',redirect:'error',signal,headers:{...finalHeaders,'Content-Type':'application/json'},body:JSON.stringify({
   author:intent.organizationUrn,commentary:intent.text,visibility:'PUBLIC',
   distribution:{feedDistribution:'MAIN_FEED',targetEntities:[],thirdPartyDistributionChannels:[]},
   content:{media:{id:imageUrn,title:intent.title}},lifecycleState:'PUBLISHED',isReshareDisabledByAuthor:false,
  })})
  const postUrn=response.headers.get('x-restli-id')
  if(response.status===201&&postUrn&&/^urn:li:(share|ugcPost):\d+$/.test(postUrn))return {status:'published',imageUrn,postUrn}
  if(response.status>=400&&response.status<500)return {status:'blocked',reason:'provider_refused',imageUrn}
  return {status:'uncertain',imageUrn,reason:'post_create_outcome_unknown'}
 }catch{
  return createStarted&&imageUrn?{status:'uncertain',imageUrn,reason:'post_create_outcome_unknown'}:{status:'blocked',reason:'authority_or_image_unavailable',...(imageUrn?{imageUrn}:{})}
 }
}
