import 'server-only'
import {resolveProjectAccess} from '@/lib/auth/project-access'
import {createAdminClient} from '@/lib/supabase/admin'
import {assertSameOrigin} from '@/lib/atlas/executive/http'
import {contentFields} from '../content/validate'
import {readSocialProfile,saveSocialProfile} from './store'
import {SocialProfileError,type SocialProfileSave} from './types'
const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}
async function boundedBody(request:Request):Promise<unknown>{
 const max=32768;if(Number(request.headers.get('content-length'))>max)throw new SocialProfileError('INVALID_BODY')
 const reader=request.body?.getReader();if(!reader)throw new SocialProfileError('INVALID_BODY')
 const chunks:Uint8Array[]=[];let length=0
 try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>max){await reader.cancel();throw new SocialProfileError('INVALID_BODY')}chunks.push(value)}}finally{reader.releaseLock()}
 const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown}catch{throw new SocialProfileError('INVALID_BODY')}
}
export async function socialProfileApi(request:Request):Promise<Response>{
 const a=await resolveProjectAccess();if(!a.ok){Object.entries(headers).forEach(([k,v])=>a.response.headers.set(k,v));return a.response}
 if(!['GET','POST'].includes(request.method))return Response.json({code:'INVALID_BODY'},{status:405,headers})
 if(request.method==='POST'){const denied=assertSameOrigin(request);if(denied){Object.entries(headers).forEach(([k,v])=>denied.headers.set(k,v));return denied}}
 try{
  const db=createAdminClient();let result
  if(request.method==='GET'){const u=new URL(request.url);if([...u.searchParams.keys()].some(k=>k!=='projectId')||u.searchParams.getAll('projectId').length!==1)throw new SocialProfileError('INVALID_BODY');result=await readSocialProfile(db,a,{projectId:u.searchParams.get('projectId')!})}
  else{
   const value=await boundedBody(request)
   try{contentFields(value,['operation','projectId','expectedRevisionId','idempotencyKey','profile'])}catch{throw new SocialProfileError('INVALID_BODY')}
   const {operation,...input}=value;if(operation!=='save')throw new SocialProfileError('INVALID_BODY')
   result=await saveSocialProfile(db,a,input as SocialProfileSave)
  }
  return Response.json(result,{headers})
 }catch(error){const e=error instanceof SocialProfileError?error:new SocialProfileError('UNAVAILABLE');return Response.json({code:e.code},{status:e.status,headers})}
}
