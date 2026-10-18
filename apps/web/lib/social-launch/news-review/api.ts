import 'server-only'
import {resolveProjectAccess} from '@/lib/auth/project-access'
import {createAdminClient} from '@/lib/supabase/admin'
import {assertSameOrigin} from '@/lib/atlas/executive/http'
import {parsePrepareNewsReview} from './contract'
import {prepareNewsReview} from './store'
import {readNewsReview} from './readiness'
import {NewsReviewError} from './types'
const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}
async function body(request:Request){
 if(Number(request.headers.get('content-length'))>32768)throw new NewsReviewError('INVALID_BODY')
 const reader=request.body?.getReader();if(!reader)throw new NewsReviewError('INVALID_BODY')
 const chunks:Uint8Array[]=[];let length=0
 try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>32768){await reader.cancel();throw new NewsReviewError('INVALID_BODY')}chunks.push(value)}}finally{reader.releaseLock()}
 const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown}catch{throw new NewsReviewError('INVALID_BODY')}
}
export async function newsReviewApi(request:Request):Promise<Response>{
 const a=await resolveProjectAccess();if(!a.ok){Object.entries(headers).forEach(([k,v])=>a.response.headers.set(k,v));return a.response}
 if(!['GET','POST'].includes(request.method))return Response.json({code:'INVALID_BODY'},{status:405,headers})
 if(request.method==='POST'){const denied=assertSameOrigin(request);if(denied){Object.entries(headers).forEach(([k,v])=>denied.headers.set(k,v));return denied}}
 try{
  const db=createAdminClient();let result
  if(request.method==='GET'){
   const u=new URL(request.url),keys=['projectId','postId']
   if([...u.searchParams.keys()].some(k=>!keys.includes(k))||keys.some(k=>u.searchParams.getAll(k).length!==1))throw new NewsReviewError('INVALID_BODY')
   result=await readNewsReview(db,a,{projectId:u.searchParams.get('projectId')!,postId:u.searchParams.get('postId')!},Date.now())
  }else{
   const input=parsePrepareNewsReview(await body(request)),prepared=await prepareNewsReview(db,a,input,Date.now())
   result=await Promise.all(prepared.map(v=>readNewsReview(db,a,{projectId:input.projectId,postId:v.postId!},Date.now())))
  }
  return Response.json(result,{headers})
 }catch(error){
  const e=error instanceof NewsReviewError?error:new NewsReviewError('UNAVAILABLE')
  return Response.json({code:e.code},{status:e.code==='NOT_FOUND'?404:e.code==='INVALID_BODY'?400:e.code==='UNAVAILABLE'?503:e.code==='STOPPED'?423:409,headers})
 }
}