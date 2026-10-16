import 'server-only'
import {resolveProjectAccess} from '@/lib/auth/project-access'
import {createAdminClient} from '@/lib/supabase/admin'
import {assertSameOrigin} from '@/lib/atlas/executive/http'
import {SocialLaunchError,socialLaunchFields,readSocialLaunchPlan,proposeSocialLaunchPlan,decideSocialLaunchPlan,type SocialLaunchProposal,type SocialLaunchDecisionInput} from './store'
import {loadSocialLaunchPage} from './loader'
const headers={'cache-control':'private, no-store'}
async function body(request:Request){
 const limit=16384
 if(Number(request.headers.get('content-length'))>limit)throw new SocialLaunchError('INVALID_BODY')
 const reader=request.body?.getReader();if(!reader)throw new SocialLaunchError('INVALID_BODY')
 const chunks:Uint8Array[]=[];let size=0
 try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new SocialLaunchError('INVALID_BODY')}chunks.push(value)}}finally{reader.releaseLock()}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown}catch{throw new SocialLaunchError('INVALID_BODY')}
}
export async function socialLaunchApi(request:Request):Promise<Response>{
 const access=await resolveProjectAccess()
 if(!access.ok){access.response.headers.set('cache-control',headers['cache-control']);return access.response}
 if(!['GET','POST'].includes(request.method))return Response.json({code:'INVALID_BODY'},{status:405,headers})
 if(request.method==='POST'){const denied=assertSameOrigin(request);if(denied){denied.headers.set('cache-control',headers['cache-control']);return denied}}
 try{
  const db=createAdminClient();let plan
  if(request.method==='GET'){
   const url=new URL(request.url);if([...url.searchParams.keys()].some(k=>k!=='projectId')||url.searchParams.getAll('projectId').length!==1)throw new SocialLaunchError('INVALID_BODY')
   plan=await readSocialLaunchPlan(db,access,{projectId:url.searchParams.get('projectId')!})
  }else{
   const value=await body(request);socialLaunchFields(value,['operation','projectId','expectedRevisionId','idempotencyKey','choices','revisionId','sha256','decision'])
   const {operation,...input}=value
   if(operation==='propose')plan=await proposeSocialLaunchPlan(db,access,input as SocialLaunchProposal)
   else if(operation==='decide')plan=await decideSocialLaunchPlan(db,access,input as SocialLaunchDecisionInput)
   else throw new SocialLaunchError('INVALID_BODY')
  }
  return Response.json(await loadSocialLaunchPage(plan),{headers})
 }catch(error){const known=error instanceof SocialLaunchError;return Response.json({code:known?error.code:'PLAN_UNAVAILABLE'},{status:known?error.status:503,headers})}
}
