import 'server-only'
import {createHash} from 'node:crypto'
import {resolveProjectAccess} from '@/lib/auth/project-access'
import {createAdminClient} from '@/lib/supabase/admin'
import {assertSameOrigin} from '@/lib/atlas/executive/http'
import {SocialContentError,type SocialContentProposal,type SocialContentDecision} from './types'
import {contentFields,contentId} from './validate'
import {readSocialContent,proposeSocialContent,decideSocialContent} from './store'
const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}
function failure(error:unknown){const e=error instanceof SocialContentError?error:new SocialContentError('UNAVAILABLE');return Response.json({code:e.code},{status:e.status,headers})}
async function access(){const a=await resolveProjectAccess();if(!a.ok)Object.entries(headers).forEach(([k,v])=>a.response.headers.set(k,v));return a}
async function body(request:Request){
 const max=32768;if(Number(request.headers.get('content-length'))>max)throw new SocialContentError('INVALID_BODY')
 const reader=request.body?.getReader();if(!reader)throw new SocialContentError('INVALID_BODY')
 const chunks:Uint8Array[]=[];let length=0
 try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>max){await reader.cancel();throw new SocialContentError('INVALID_BODY')}chunks.push(value)}}finally{reader.releaseLock()}
 const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown}catch{throw new SocialContentError('INVALID_BODY')}
}
export async function socialContentApi(request:Request):Promise<Response>{
 const a=await access();if(!a.ok)return a.response
 if(!['GET','POST'].includes(request.method))return Response.json({code:'INVALID_BODY'},{status:405,headers})
 if(request.method==='POST'){const denied=assertSameOrigin(request);if(denied){Object.entries(headers).forEach(([k,v])=>denied.headers.set(k,v));return denied}}
 try{
  const db=createAdminClient();let result
  if(request.method==='GET'){
   const u=new URL(request.url);if([...u.searchParams.keys()].some(k=>k!=='projectId')||u.searchParams.getAll('projectId').length!==1)throw new SocialContentError('INVALID_BODY')
   result=await readSocialContent(db,a,{projectId:u.searchParams.get('projectId')!})
  }else{
   const v=await body(request);contentFields(v,['operation','projectId','postId','planRevisionId','expectedRevisionId','idempotencyKey','draft','revisionId','sha256','decision'])
   const {operation,...input}=v
   if(operation==='propose')result=await proposeSocialContent(db,a,input as SocialContentProposal)
   else if(operation==='decide')result=await decideSocialContent(db,a,input as SocialContentDecision)
   else throw new SocialContentError('INVALID_BODY')
  }
  return Response.json(result,{headers})
 }catch(e){return failure(e)}
}
export async function socialContentMedia(request:Request):Promise<Response>{
 const a=await access();if(!a.ok)return a.response
 try{
  if(request.method!=='GET')throw new SocialContentError('INVALID_BODY')
  const u=new URL(request.url),keys=['projectId','assetId','sha256']
  if([...u.searchParams.keys()].some(k=>!keys.includes(k))||keys.some(k=>u.searchParams.getAll(k).length!==1))throw new SocialContentError('INVALID_BODY')
  const projectId=u.searchParams.get('projectId')!,assetId=u.searchParams.get('assetId')!,sha256=u.searchParams.get('sha256')!;contentId(projectId);contentId(assetId)
  if(!/^[a-f0-9]{64}$/.test(sha256))throw new SocialContentError('INVALID_BODY')
  if(!a.allowedProjectIds.includes(projectId))throw new SocialContentError('NOT_FOUND')
  const db=createAdminClient(),{data:asset,error}=await db.from('assets').select('id,project_id,status,kind,mime_type,byte_size,checksum_sha256,storage_bucket,storage_path').eq('id',assetId).eq('project_id',projectId).maybeSingle()
  if(error)throw new SocialContentError('UNAVAILABLE')
  if(!asset||asset.status!=='active'||asset.checksum_sha256!==sha256||!['image','video'].includes(asset.kind)||!['image/png','image/jpeg','image/webp','image/gif','image/avif','video/mp4','video/webm'].includes(asset.mime_type))throw new SocialContentError('NOT_FOUND')
  if(!Number.isSafeInteger(Number(asset.byte_size))||Number(asset.byte_size)<1||Number(asset.byte_size)>50*1024*1024)throw new SocialContentError('UNAVAILABLE')
  const downloaded=await db.storage.from(asset.storage_bucket).download(asset.storage_path)
  if(downloaded.error||!downloaded.data||downloaded.data.size!==Number(asset.byte_size))throw new SocialContentError('UNAVAILABLE')
  const bytes=await downloaded.data.arrayBuffer()
  if(createHash('sha256').update(Buffer.from(bytes)).digest('hex')!==sha256)throw new SocialContentError('UNAVAILABLE')
  const verified=new Uint8Array(bytes);let offset=0
  const stream=new ReadableStream<Uint8Array>({pull(controller){if(offset>=verified.byteLength){controller.close();return}const end=Math.min(offset+65536,verified.byteLength);controller.enqueue(verified.subarray(offset,end));offset=end}})
  return new Response(stream,{headers:{...headers,'content-type':asset.mime_type}})
 }catch(e){return failure(e)}
}
