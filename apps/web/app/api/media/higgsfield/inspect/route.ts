import {authorize,json,refusal,selectedProject} from '@/lib/media/higgsfield/http'
import {HiggsfieldError} from '@/lib/media/higgsfield/types'
import {inspectHiggsfield} from '@/lib/media/higgsfield/readiness'
export const dynamic='force-dynamic'
export const maxDuration=30
export async function POST(request:Request) {
 const access=await authorize();if(!access.ok)return access.response
 const projectId=await selectedProject(request,access.allows,true);if(typeof projectId!=='string')return projectId
 try{return json(await inspectHiggsfield(projectId))}
 catch(e){
  // Operator-only read path. Log only closed codes for diagnosis: never log SDK
  // exceptions, OAuth tokens, vendor payloads, user or project identifiers.
  console.warn('[higgsfield-inspect] read_failed',{
   code:e instanceof HiggsfieldError?e.code:'provider_unavailable',
   stage:e instanceof HiggsfieldError?e.stage??'unknown':'unknown',
  })
  return refusal(e)
 }
}
