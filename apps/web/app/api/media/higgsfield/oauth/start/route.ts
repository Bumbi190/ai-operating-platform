import {authorize,json,refusal,selectedProject} from '@/lib/media/higgsfield/http'
import {requireHiggsfieldConfig} from '@/lib/media/higgsfield/config'
import {createHiggsfieldOAuthService} from '@/lib/media/higgsfield/oauth'
export const dynamic='force-dynamic'
export const maxDuration=30
export async function POST(request:Request) {
 const access=await authorize();if(!access.ok)return access.response
 const projectId=await selectedProject(request,access.allows,true);if(typeof projectId!=='string')return projectId
 try{
  requireHiggsfieldConfig()
  const r=await createHiggsfieldOAuthService(undefined,undefined,async id=>access.allows(id)).begin({projectId,actorId:access.actorId})
  return json({ok:true,authorization_url:r.authorizationUrl})
 }catch(e){return refusal(e)}
}
