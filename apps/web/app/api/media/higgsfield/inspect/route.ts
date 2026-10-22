import {authorize,json,refusal,selectedProject} from '@/lib/media/higgsfield/http'
import {inspectHiggsfield} from '@/lib/media/higgsfield/readiness'
export const dynamic='force-dynamic'
export const maxDuration=30
export async function POST(request:Request) {
 const access=await authorize();if(!access.ok)return access.response
 const projectId=await selectedProject(request,access.allows,true);if(typeof projectId!=='string')return projectId
 try{return json(await inspectHiggsfield(projectId))}catch(e){return refusal(e)}
}
