import 'server-only'
import {resolveProjectAccess} from '@/lib/auth/project-access'
import {assertSameOrigin} from '@/lib/atlas/executive/http'
import {createAdminClient} from '@/lib/supabase/admin'
import {readCampaign,cancelCampaign} from './store'
import {CampaignError} from './types'
import {campaignObject,campaignId} from './validate'
const headers={'cache-control':'private, no-store'}
async function readBody(request:Request):Promise<unknown>{
 if(Number(request.headers.get('content-length'))>4096||!request.body)throw new CampaignError('INVALID_BODY')
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let total=0
 try{for(;;){const part=await reader.read();if(part.done)break;total+=part.value.length;if(total>4096){await reader.cancel();throw new CampaignError('INVALID_BODY')}chunks.push(part.value)}}finally{reader.releaseLock()}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw new CampaignError('INVALID_BODY')}
}
export async function campaignApi(request:Request):Promise<Response>{
 const access=await resolveProjectAccess();if(!access.ok){access.response.headers.set('cache-control',headers['cache-control']);return access.response}
 if(!['GET','POST'].includes(request.method))return Response.json({code:'INVALID_BODY'},{status:405,headers})
 if(request.method==='POST'){const denied=assertSameOrigin(request);if(denied){denied.headers.set('cache-control',headers['cache-control']);return denied}}
 try{
  let input:unknown
  if(request.method==='GET'){
   const params=new URL(request.url).searchParams
   if([...params.keys()].some(k=>!['projectId','campaignId'].includes(k))||params.getAll('projectId').length!==1||params.getAll('campaignId').length!==1)throw new CampaignError('INVALID_BODY')
   input={projectId:params.get('projectId'),campaignId:params.get('campaignId')}
  }else input=await readBody(request)
  campaignObject(input,['projectId','campaignId']);campaignId(input.projectId);campaignId(input.campaignId)
  const ref=input as {projectId:string;campaignId:string},db=createAdminClient()
  return Response.json(request.method==='GET'?await readCampaign(db,access,ref):await cancelCampaign(db,access,ref),{headers})
 }catch(error){
  const code=error instanceof CampaignError?error.code:'UNAVAILABLE'
  return Response.json({code},{status:code==='NOT_FOUND'?404:code==='INVALID_BODY'?400:503,headers})
 }
}
