import {authorize,json,refusal,selectedProject} from '@/lib/media/higgsfield/http'
import {readHiggsfieldConnectionStatus} from '@/lib/media/higgsfield/readiness'
export const dynamic='force-dynamic'
export async function GET(request:Request) {
 const access=await authorize();if(!access.ok)return access.response
 const projectId=await selectedProject(request,access.allows,false);if(typeof projectId!=='string')return projectId
 try{return json(await readHiggsfieldConnectionStatus(projectId))}catch(e){return refusal(e)}
}
