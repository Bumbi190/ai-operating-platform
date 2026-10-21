import 'server-only'
import {createHash} from 'node:crypto'
import {resolveProjectAccess} from '@/lib/auth/project-access'
import {resolvePlatformOperator} from '@/lib/auth/platform-operator'
import {createAdminClient} from '@/lib/supabase/admin'
import {assertSameOrigin} from '@/lib/atlas/executive/http'
import {contentFields,contentId} from '../content/validate'
import {SocialContentError} from '../content/types'
import {publicationPreview,dispatchPublication,checkPublication} from './dispatch'
import {publicationMediaLookup} from './store'
import {verifyPublicationImage} from './media'
import {PublicationError,type PublicationRequest} from './types'
const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}
export async function boundedPublicationBody(request:Request):Promise<unknown>{
 const max=32768
 if(Number(request.headers.get('content-length'))>max)throw new PublicationError('INVALID_BODY')
 const reader=request.body?.getReader();if(!reader)throw new PublicationError('INVALID_BODY')
 const chunks:Uint8Array[]=[];let length=0
 try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>max){await reader.cancel();throw new PublicationError('INVALID_BODY')}chunks.push(value)}}finally{reader.releaseLock()}
 const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown}catch{throw new PublicationError('INVALID_BODY')}
}
export async function socialPublicationsApi(request:Request):Promise<Response>{
 try{
  const a=await resolveProjectAccess();if(!a.ok){Object.entries(headers).forEach(([k,v])=>a.response.headers.set(k,v));return a.response}
  if(!['GET','POST'].includes(request.method))return Response.json({code:'INVALID_BODY'},{status:405,headers})
  if(request.method==='POST'){const denied=assertSameOrigin(request);if(denied){Object.entries(headers).forEach(([k,v])=>denied.headers.set(k,v));return denied}}
  const operator=await resolvePlatformOperator(),isOperator=operator.ok&&operator.userId===a.userId,db=createAdminClient()
  let result
  if(request.method==='GET'){
   const u=new URL(request.url),keys=['projectId','postId']
   if([...u.searchParams.keys()].some(k=>!keys.includes(k))||keys.some(k=>u.searchParams.getAll(k).length!==1))throw new PublicationError('INVALID_BODY')
   result=await publicationPreview(db,a,{projectId:u.searchParams.get('projectId')!,postId:u.searchParams.get('postId')!})
   if(!isOperator){result.canRequest=false;result.blockers.push('operator_required')}
  }else{
   if(!isOperator)return Response.json({code:'OPERATOR_REQUIRED'},{status:403,headers})
   const value=await boundedPublicationBody(request)
   try{contentFields(value,['operation','projectId','postId','revisionId','sha256','decisionId','bindingId','idempotencyKey','confirmed','publicationId'])}catch{throw new PublicationError('INVALID_BODY')}
   const {operation,...input}=value
   if(operation==='publish')result=await dispatchPublication(db,a,input as PublicationRequest)
   else if(operation==='check'){
    try{contentFields(input,['projectId','postId','publicationId']);contentId(input.projectId);contentId(input.postId);contentId(input.publicationId)}catch{throw new PublicationError('INVALID_BODY')}
    result=await checkPublication(db,a,input as {projectId:string;postId:string;publicationId:string})
   }else throw new PublicationError('INVALID_BODY')
  }
  return Response.json(result,{headers})
 }catch(error){
  const e=error instanceof PublicationError?error:error instanceof SocialContentError?new PublicationError(error.code==='NOT_FOUND'?'NOT_FOUND':error.code==='INVALID_BODY'?'INVALID_BODY':'UNAVAILABLE'):new PublicationError('UNAVAILABLE')
  return Response.json({code:e.code},{status:e.status,headers})
 }
}
export async function socialPublicationMedia(request:Request):Promise<Response>{
 const missing=()=>new Response(null,{status:404,headers})
 try{
  if(request.method!=='GET')return missing()
  const u=new URL(request.url),keys=['publicationId','key']
  if([...u.searchParams.keys()].some(k=>!keys.includes(k))||keys.some(k=>u.searchParams.getAll(k).length!==1))return missing()
  const publicationId=u.searchParams.get('publicationId')!,key=u.searchParams.get('key')!
  contentId(publicationId);if(!/^[A-Za-z0-9_-]{43}$/.test(key))return missing()
  const lookup={publicationId,keyHash:createHash('sha256').update(key).digest('hex')},db=createAdminClient(),asset=await publicationMediaLookup(db,lookup)
  if(!asset)return missing()
  const {bytes}=await verifyPublicationImage(db,asset.projectId,{id:asset.assetId,sha256:asset.sha256})
  // A stop or expiry during storage I/O must also revoke this response.
  if(!await publicationMediaLookup(db,lookup))return missing()
  let offset=0
  const stream=new ReadableStream<Uint8Array>({pull(controller){if(offset>=bytes.byteLength){controller.close();return}const end=Math.min(offset+65536,bytes.byteLength);controller.enqueue(bytes.subarray(offset,end));offset=end}})
  return new Response(stream,{headers:{...headers,'content-type':'image/jpeg'}})
 }catch{return missing()}
}
